import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FollowDocument = Follow & Document;

@Schema({ timestamps: true })
export class Follow {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  followerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  chefId!: Types.ObjectId;
}

export const FollowSchema = SchemaFactory.createForClass(Follow);

// One follow per (follower, chef) pair — following twice is a no-op, not a
// second row, and this is what makes the toggle idempotent under a
// double-click or a retried request.
FollowSchema.index({ followerId: 1, chefId: 1 }, { unique: true });
