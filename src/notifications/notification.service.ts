import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationType } from './schemas/notification.schema';
import { NotificationGateway } from './notification.gateway';
import { User } from '../user/schema/user.schema';

export interface CreateNotificationDto {
  type: NotificationType;
  title: string;
  message: string;
  actorName?: string;
  actorAvatar?: string;
  targetId?: Types.ObjectId;
  thumbnail?: string;
  discount?: number;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,

    @InjectModel(User.name)
    private readonly userModel: Model<User>,

    private readonly gateway: NotificationGateway,
  ) {}

  async create(dto: CreateNotificationDto) {
    const notification = await this.notificationModel.create(dto);
    this.gateway.broadcast(notification);
    return notification;
  }

  async getRecent() {
    return this.notificationModel
      .find()
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
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
