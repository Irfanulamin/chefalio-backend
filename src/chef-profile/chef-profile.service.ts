import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChefProfile } from './schemas/chef-profile.schema';
import { UpsertChefProfileDto } from './dto/upsert-chef-profile.dto';
import { User } from '../user/schema/user.schema';

@Injectable()
export class ChefProfileService {
  constructor(
    @InjectModel(ChefProfile.name) private chefProfileModel: Model<ChefProfile>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async getChefProfile(chefId: string) {
    const profile = await this.chefProfileModel
      .findOne({ chefId })
      .select('-__v -createdAt -updatedAt');

    return {
      success: true,
      statusCode: 200,
      message: 'Chef profile retrieved successfully',
      data: profile ?? null,
    };
  }

  async upsertChefProfile(chefId: string, dto: UpsertChefProfileDto) {
    const chef = await this.userModel.findOne({
      _id: chefId,
      role: 'chef',
      isActive: true,
    });
    if (!chef) throw new NotFoundException('Chef not found');

    const profile = await this.chefProfileModel.findOneAndUpdate(
      { chefId },
      { $set: dto },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Chef profile updated successfully',
      data: profile,
    };
  }
}
