import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export type NotificationType = 'new_recipe' | 'new_cookbook' | 'discount';

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true, enum: ['new_recipe', 'new_cookbook', 'discount'] })
  type!: NotificationType;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  message!: string;

  @Prop()
  actorName?: string;

  @Prop()
  actorAvatar?: string;

  @Prop({ type: Types.ObjectId })
  targetId?: Types.ObjectId;

  @Prop()
  thumbnail?: string;

  @Prop({ type: Number })
  discount?: number;

  /** The chef this notification is about — set on `new_recipe` and
     `new_cookbook`, absent on `discount` (a platform-wide sale, not tied
     to one chef). Absence means "everyone sees it"; presence means "only
     that chef's followers do" — see NotificationService.getRecent. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  chefId?: Types.ObjectId;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
