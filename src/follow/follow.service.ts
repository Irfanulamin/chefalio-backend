import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Follow } from './schemas/follow.schema';
import { User } from '../user/schema/user.schema';

@Injectable()
export class FollowService {
  constructor(
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  private async assertChef(chefId: string) {
    const chef = await this.userModel
      .findOne({ _id: chefId, role: 'chef', isActive: true })
      .select('_id');
    if (!chef) throw new NotFoundException('Chef not found');
    return chef;
  }

  async follow(followerId: string, chefId: string) {
    if (followerId === chefId) {
      throw new BadRequestException('You cannot follow yourself');
    }
    await this.assertChef(chefId);

    // Upsert rather than create-then-catch-duplicate: pressing "Follow"
    // twice in a row (a slow tap, a retried request) lands on the same row
    // instead of racing a unique-index error the client would have to
    // swallow.
    await this.followModel.updateOne(
      { followerId: new Types.ObjectId(followerId), chefId: new Types.ObjectId(chefId) },
      { $setOnInsert: { followerId, chefId } },
      { upsert: true },
    );

    return this.getStatus(followerId, chefId);
  }

  async unfollow(followerId: string, chefId: string) {
    await this.followModel.deleteOne({
      followerId: new Types.ObjectId(followerId),
      chefId: new Types.ObjectId(chefId),
    });
    return this.getStatus(followerId, chefId);
  }

  async getStatus(followerId: string, chefId: string) {
    const [isFollowing, followerCount] = await Promise.all([
      this.followModel.exists({
        followerId: new Types.ObjectId(followerId),
        chefId: new Types.ObjectId(chefId),
      }),
      this.followModel.countDocuments({ chefId: new Types.ObjectId(chefId) }),
    ]);

    return {
      success: true,
      statusCode: 200,
      data: { isFollowing: Boolean(isFollowing), followerCount },
    };
  }

  /** Chef ids the given user follows — the notification feed's filter and
     the frontend's "is this a followed chef's push" check both read from
     this rather than re-deriving it per notification. */
  async getFollowedChefIds(followerId: string): Promise<Types.ObjectId[]> {
    const rows = await this.followModel
      .find({ followerId: new Types.ObjectId(followerId) })
      .select('chefId')
      .lean();
    return rows.map((r) => r.chefId);
  }

  async getMyFollowing(followerId: string) {
    const chefIds = await this.getFollowedChefIds(followerId);
    return {
      success: true,
      statusCode: 200,
      data: chefIds.map((id) => id.toString()),
    };
  }
}
