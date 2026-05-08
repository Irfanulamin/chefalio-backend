import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { RegisterUserDto } from '../auth/dto/registerUser.dto';
import { User } from './schema/user.schema';
import { Model, mongo, UpdateQuery } from 'mongoose';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import bcrypt from 'bcrypt';
import { AdminUpdateUserDto } from './dto/AdminUpdateUser.dto';
import { CreateUserDto } from './dto/CreateUser.dto';
import { Types } from 'mongoose';
import { CloudinaryService } from '../services/cloudinary.service';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async createUser(registerUserDto: RegisterUserDto) {
    try {
      return await this.userModel.create(registerUserDto);
    } catch (err: any) {
      if (err instanceof mongo.MongoServerError && err.code === 11000) {
        throw new ConflictException(
          'Registration failed. Please try different credentials.',
        );
      }
      throw err;
    }
  }

  async findByEmailOrUsername(login: string) {
    return this.userModel.findOne({
      $or: [{ email: login }, { username: login }],
    });
  }

  async userDetails(userId: string) {
    const userDetails = await this.userModel
      .findById(userId)
      .select('-password -__v -_id -createdAt -updatedAt -isActive');
    return userDetails;
  }

  async getAllUsers(
    page: number = 1,
    limit: number = 10,
    role?: 'user' | 'chef' | 'admin',
    search: string = '',
    isActive?: boolean,
  ) {
    const filter: Record<string, any> = {};

    if (role) {
      filter.role = role;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await this.userModel.countDocuments(filter);

    const data = await this.userModel
      .find(filter)
      .select('-password -__v -createdAt -updatedAt')
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      success: true,
      statusCode: 200,
      message: `${
        role ? role.charAt(0).toUpperCase() + role.slice(1) : 'All users'
      } retrieved successfully`,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async updateOwnProfile(
    userId: string,
    dto: UpdateUserDto,
    image?: Express.Multer.File,
  ) {
    if (!dto && !image) {
      throw new BadRequestException('No data provided for update');
    }

    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: UpdateQuery<User> | undefined = { ...dto };

    if (image) {
      const uploadedImageUrl = await this.cloudinaryService.uploadImage(image);
      updateData.profile_url = uploadedImageUrl;
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, updateData, { new: true })
      .select('-password -__v -createdAt -updatedAt');

    return {
      success: true,
      statusCode: 200,
      message: 'Profile updated successfully',
      data: updatedUser,
    };
  }

  async updateUserByAdmin(userId: string, dto: AdminUpdateUserDto) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: UpdateQuery<User> | undefined = { ...dto };

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, updateData, { new: true })
      .select('-password -__v -createdAt -updatedAt');

    return {
      success: true,
      statusCode: 200,
      message: 'User updated successfully',
      data: updatedUser,
    };
  }

  async createUserByAdmin(dto: CreateUserDto) {
    try {
      const hash = await bcrypt.hash(dto.password, 10);
      const createdUser = await this.userModel.create({
        ...dto,
        password: hash,
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...userWithoutPassword } = createdUser.toObject();
      return {
        success: true,
        statusCode: 201,
        message: 'User created successfully',
        data: userWithoutPassword,
      };
    } catch (err: any) {
      if (err instanceof mongo.MongoServerError && err.code === 11000) {
        throw new ConflictException(
          'Registration failed. Please try different credentials.',
        );
      }
      throw err;
    }
  }

  async getUserById(userId: Types.ObjectId | string) {
    return this.userModel
      .findById(userId)
      .select('-password -__v -createdAt -updatedAt');
  }

  async findOrCreateOAuthUser(data: {
    provider: 'google';
    providerId: string;
    email: string;
    fullName: string;
    profile_url?: string;
  }) {
    const idField = 'googleId';

    let user = await this.userModel.findOne({ [idField]: data.providerId });
    if (user) return user;

    user = await this.userModel.findOne({ email: data.email });
    if (user) {
      return this.userModel.findByIdAndUpdate(
        user._id,
        { [idField]: data.providerId },
        { new: true },
      ) as any;
    }

    const base = data.fullName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20) || 'user';

    let username = base;
    let attempt = 0;
    while (await this.userModel.exists({ username })) {
      attempt++;
      username = `${base}_${attempt}`;
    }

    return this.userModel.create({
      fullName: data.fullName,
      username,
      email: data.email,
      [idField]: data.providerId,
      authProvider: data.provider,
      profile_url:
        data.profile_url ||
        'https://i.ibb.co.com/XWqvgyv/Minimalist-Avatar-Illustration.jpg',
    });
  }

  async deleteUser(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.profile_url) {
      const publicId = this.cloudinaryService.getCloudinaryPublicId(user.profile_url);
      if (publicId) await this.cloudinaryService.deleteImage(publicId);
    }
    await this.userModel.findByIdAndDelete(userId);
    return { success: true, message: 'User deleted successfully' };
  }

  async getUserAnalytics() {
    const [roleCounts, activeCounts, recentJoined] = await Promise.all([
      this.userModel.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      this.userModel.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      this.userModel.aggregate([
        {
          $group: {
            _id: {
              role: '$role',
              date: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': -1 } },
        { $limit: 30 },
      ]),
    ]);
    const byRole = Object.fromEntries(roleCounts.map((r) => [r._id, r.count]));
    const byActive = Object.fromEntries(
      activeCounts.map((r) => [r._id, r.count]),
    );
    return {
      success: true,
      statusCode: 200,
      data: {
        totalUsers: roleCounts.reduce((s, r) => s + r.count, 0),
        totalAdmins: byRole['admin'] ?? 0,
        totalChefs: byRole['chef'] ?? 0,
        totalMembers: byRole['user'] ?? 0,
        activeAdmins: byActive['admin'] ?? 0,
        activeChefs: byActive['chef'] ?? 0,
        activeMembers: byActive['user'] ?? 0,
        recentJoinedByRole: recentJoined.map((i) => ({
          date: i._id.date,
          role: i._id.role,
          count: i.count,
        })),
      },
    };
  }
}
