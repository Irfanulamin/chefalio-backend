import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

@Schema({ timestamps: false, versionKey: false })
export class ResetToken extends Document {
  @Prop({ required: true })
  token: string;

  @Prop({ type: mongoose.Types.ObjectId, ref: 'User', required: true })
  user: mongoose.Types.ObjectId;

  @Prop({ required: true })
  expiresAt: Date;
}

export const ResetTokenSchema = SchemaFactory.createForClass(ResetToken);
