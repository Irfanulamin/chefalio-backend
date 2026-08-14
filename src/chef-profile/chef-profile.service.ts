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

  /** Same id-or-username resolution as ChefService.resolveChef — a 24-char
     hex string is treated as an id, anything else is looked up by
     username. Without this, `/chef-profile/danielhumm` queried
     `{ chefId: "danielhumm" }` against a field that only ever holds real
     ObjectIds, so it silently matched nothing and every chef's bio read
     as "hasn't written one yet" once profile links switched to usernames. */
  private async resolveChefId(identifier: string): Promise<string> {
    if (/^[0-9a-fA-F]{24}$/.test(identifier)) return identifier;

    const chef = await this.userModel
      .findOne({ username: identifier, role: 'chef', isActive: true })
      .select('_id');
    if (!chef) throw new NotFoundException('Chef not found');
    return String(chef._id);
  }

  async getChefProfile(identifier: string) {
    const chefId = await this.resolveChefId(identifier);

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
