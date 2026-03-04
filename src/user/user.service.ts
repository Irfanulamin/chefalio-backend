import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { RegisterUserDto } from 'src/auth/dto/registerUser.dto';
import { User } from './schema/user.schema';
import { Model, mongo } from 'mongoose';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}
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
  ) {
    const filter: any = {};

    if (role) {
      filter.role = role;
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
        code: 404,
        message: 'No users found',
        data: [],
        pagination: { total: 0, page, limit, pages: 0 },
      };
    }

    return {
      success: true,
      code: 200,
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
}
