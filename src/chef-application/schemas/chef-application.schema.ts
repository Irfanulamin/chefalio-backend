import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChefApplicationDocument = ChefApplication & Document;

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';
export type KycType = 'passport' | 'nid' | 'driving_license';

@Schema({ timestamps: true })
export class ChefApplication {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId!: Types.ObjectId;

  @Prop({
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  })
  status!: ApplicationStatus;

  @Prop({ required: true }) fullName!: string;
  @Prop({ required: true }) bio!: string;
  @Prop({ required: true }) specialty!: string;
  @Prop({ required: true }) yearsOfExperience!: number;

  @Prop({ required: true, enum: ['passport', 'nid', 'driving_license'] })
  kycType!: KycType;

  @Prop({ required: true }) kycDocumentUrl!: string;

  @Prop({ required: true }) referenceUrl!: string;
  @Prop() youtubeUrl?: string;

  @Prop({ type: [String], default: [] }) achievements!: string[];

  @Prop() instagramUrl?: string;
  @Prop() facebookUrl?: string;
  @Prop() twitterUrl?: string;

  @Prop() rejectionNote?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' }) reviewedBy?: Types.ObjectId;
  @Prop({ type: Date }) reviewedAt?: Date;
}

export const ChefApplicationSchema = SchemaFactory.createForClass(ChefApplication);
