import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EmailVerificationTokenDocument =
  HydratedDocument<EmailVerificationToken>;

@Schema({ timestamps: false, versionKey: false })
export class EmailVerificationToken {
  @Prop({ required: true })
  token!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user!: Types.ObjectId;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const EmailVerificationTokenSchema = SchemaFactory.createForClass(
  EmailVerificationToken,
);
EmailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
