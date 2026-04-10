import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ResetTokenDocument = HydratedDocument<ResetToken>;

@Schema({ timestamps: false, versionKey: false })
export class ResetToken {
  @Prop({ required: true })
  token!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user!: Types.ObjectId;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const ResetTokenSchema = SchemaFactory.createForClass(ResetToken);
ResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
