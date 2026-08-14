import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Notification, NotificationType } from './schemas/notification.schema';
import { NotificationGateway } from './notification.gateway';
import { User } from '../user/schema/user.schema';
import { FollowService } from '../follow/follow.service';

export interface CreateNotificationDto {
  type: NotificationType;
  title: string;
  message: string;
  actorName?: string;
  actorAvatar?: string;
  targetId?: Types.ObjectId;
  thumbnail?: string;
  discount?: number;
  /** Set on `new_recipe`/`new_cookbook` so the feed can be scoped to that
     chef's followers. Omit for platform-wide notices (a global discount). */
  chefId?: Types.ObjectId;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,

    @InjectModel(User.name)
    private readonly userModel: Model<User>,

    /* The raw connection rather than the Recipe and Cookbook models.
       Injecting those models would mean importing their modules, and both
       already import this one — a dependency cycle Nest resolves only with
       `forwardRef`. Reading two collections by name needs no such knot. */
    @InjectConnection()
    private readonly connection: Connection,

    private readonly gateway: NotificationGateway,
    private readonly followService: FollowService,
  ) {}

  private readonly logger = new Logger(NotificationService.name);

  /** Of the given ids, the subset that still exists in `collection`. */
  private async existingIds(
    collection: string,
    ids: Types.ObjectId[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();

    const docs = await this.connection
      .collection(collection)
      .find({ _id: { $in: ids } }, { projection: { _id: 1 } })
      .toArray();

    return new Set(docs.map((d) => String(d._id)));
  }

  async create(dto: CreateNotificationDto) {
    const notification = await this.notificationModel.create(dto);
    this.gateway.broadcast(notification);
    return notification;
  }

  /**
   * Drops every notification pointing at something that no longer exists.
   *
   * Notifications carry a denormalised copy of their subject — the title
   * in the message, the cover as `thumbnail` — so deleting a recipe used
   * to leave an advert for it in the tray forever, with a thumbnail URL
   * that 404s because the same delete removed the image from Cloudinary.
   *
   * `deleteMany` rather than `deleteOne`: a target can accumulate more
   * than one notification over its life, and leaving the extras behind
   * would reproduce the bug at a lower rate.
   */
  async deleteByTarget(targetId: Types.ObjectId | string): Promise<number> {
    const id =
      typeof targetId === 'string' ? new Types.ObjectId(targetId) : targetId;

    const { deletedCount } = await this.notificationModel.deleteMany({
      targetId: id,
    });

    if (deletedCount > 0) {
      this.gateway.broadcastRemoval(id.toString());
    }

    return deletedCount;
  }

  /**
   * The tray, with dead entries filtered out and swept up.
   *
   * `deleteByTarget` keeps things clean from here on, but it cannot help
   * with what is already stored: every recipe and cookbook deleted before
   * that existed left its notification behind, and those are what surface
   * as "No cookbook at this address" when someone follows the link.
   *
   * So existence is verified at read time rather than trusted. That also
   * covers the cases a delete hook can never catch — a document dropped by
   * a migration, a direct database edit, a failed cleanup.
   *
   * The sweep is opportunistic: rows found dead are deleted in the
   * background so the collection converges instead of accumulating, but
   * the response never waits on it and a failed sweep only means the next
   * read filters them again.
   */
  /**
   * The tray is scoped to what this user actually wants to hear about:
   * a `new_recipe`/`new_cookbook` notification only surfaces if they
   * follow the chef it's about. `discount` has no `chefId` and always
   * shows — it's the platform announcing a sale, not a chef's activity.
   */
  async getRecent(userId: string) {
    const followedChefIds = await this.followService.getFollowedChefIds(userId);

    const notifications = await this.notificationModel
      .find({
        $or: [
          { chefId: { $exists: false } },
          { chefId: null },
          { chefId: { $in: followedChefIds } },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const recipeIds: Types.ObjectId[] = [];
    const cookbookIds: Types.ObjectId[] = [];

    for (const n of notifications) {
      if (!n.targetId) continue;
      if (n.type === 'new_recipe') recipeIds.push(n.targetId);
      else if (n.type === 'new_cookbook') cookbookIds.push(n.targetId);
    }

    const [liveRecipes, liveCookbooks] = await Promise.all([
      this.existingIds('recipes', recipeIds),
      this.existingIds('cookbooks', cookbookIds),
    ]);

    const orphaned: Types.ObjectId[] = [];

    const alive = notifications.filter((n) => {
      // A discount is about the catalogue, not one document — nothing to check.
      if (!n.targetId) return true;

      const live =
        n.type === 'new_recipe'
          ? liveRecipes
          : n.type === 'new_cookbook'
            ? liveCookbooks
            : null;

      if (!live) return true;
      if (live.has(String(n.targetId))) return true;

      orphaned.push(n._id as Types.ObjectId);
      return false;
    });

    if (orphaned.length > 0) {
      void this.notificationModel
        .deleteMany({ _id: { $in: orphaned } })
        .then(() =>
          this.logger.log(
            `Swept ${orphaned.length} notification(s) whose target no longer exists`,
          ),
        )
        .catch((err) => this.logger.warn('Notification sweep failed', err));
    }

    return alive;
  }

  async getUserLastReadAt(userId: string): Promise<Date | null> {
    const user = await this.userModel
      .findById(userId)
      .select('notificationLastReadAt')
      .lean();
    return (user as any)?.notificationLastReadAt ?? null;
  }

  async markAllRead(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      notificationLastReadAt: new Date(),
    });
  }
}
