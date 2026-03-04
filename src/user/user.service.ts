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
}
