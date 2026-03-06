import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { RegisterUserDto } from 'src/auth/dto/registerUser.dto';
import { User } from './schema/user.schema';
import { Model, mongo, Mongoose } from 'mongoose';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import bcrypt from 'bcrypt';
import { AdminUpdateUserDto } from './dto/AdminUpdateUser.dto';
import { CreateUserDto } from './dto/CreateUser.dto';
import { Types } from 'mongoose';
import { CloudinaryService } from 'src/services/cloudinary.service';

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
        throw new ConflictException('Username or email already exists');
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
      .select('-password -__v -_id -createdAt -updatedAt');
    return userDetails;
  }

  async getAllUsers(
    page: number = 1,
    limit: number = 10,
    role?: 'user' | 'chef' | 'admin',
    search: string = '',
    isActive?: boolean,
  ) {
    const filter: any = {};

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

    if (!data.length) {
      return {
        success: false,
        statusCode: 404,
        message: 'No users found',
        data: [],
        pagination: { total: 0, page, limit, pages: 0 },
      };
    }

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

    const updateData: any = { ...dto };

    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }

    // Upload only if image exists
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

    const updateData: any = { ...dto };

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
      const { password, ...userWithoutPassword } = createdUser.toObject();
      return {
        success: true,
        statusCode: 201,
        message: 'User created successfully',
        data: userWithoutPassword,
      };
    } catch (err: any) {
      if (err instanceof mongo.MongoServerError && err.code === 11000) {
        throw new ConflictException('Username or email already exists');
      }
      throw err;
    }
  }

  async getUserById(userId: Types.ObjectId | string) {
    return this.userModel.findById(userId);
  }

  async getUserAnalytics() {
    const totalUsers = await this.userModel.countDocuments();
    const totalAdmins = await this.userModel.countDocuments({ role: 'admin' });
    const totalChefs = await this.userModel.countDocuments({ role: 'chef' });
    const totalMembers = await this.userModel.countDocuments({ role: 'user' });
    const activeUsers = await this.userModel.countDocuments({ isActive: true });
    const activeChefs = await this.userModel.countDocuments({
      role: 'chef',
      isActive: true,
    });
    const activeMembers = await this.userModel.countDocuments({
      role: 'user',
      isActive: true,
    });
    const activeAdmins = await this.userModel.countDocuments({
      role: 'admin',
      isActive: true,
    });
    const recentJoinedByRole = await this.userModel.aggregate([
      {
        $group: {
          _id: {
            role: '$role',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': -1 } },
      { $limit: 30 },
    ]);

    const data = {
      totalUsers,
      totalAdmins,
      totalChefs,
      totalMembers,
      activeUsers,
      activeChefs,
      activeMembers,
      activeAdmins,
      recentJoinedByRole: recentJoinedByRole.map((item) => ({
        date: item._id.date,
        role: item._id.role,
        count: item.count,
      })),
    };
    return {
      success: true,
      statusCode: 200,
      message: 'User analytics retrieved successfully',
      data,
    };
  }
}
