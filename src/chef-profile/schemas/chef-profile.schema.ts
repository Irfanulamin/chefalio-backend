import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChefProfileDocument = HydratedDocument<ChefProfile>;

@Schema({ _id: false })
class Achievement {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ min: 1900, max: new Date().getFullYear() + 1 })
  year?: number;
}

const AchievementSchema = SchemaFactory.createForClass(Achievement);

@Schema({ timestamps: true })
export class ChefProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  chefId: Types.ObjectId;

  @Prop({ maxlength: 1000 })
  bio?: string;

  @Prop({ type: [String], default: [] })
  genres: string[];

  @Prop({ type: [AchievementSchema], default: [] })
  achievements: Achievement[];
}

export const ChefProfileSchema = SchemaFactory.createForClass(ChefProfile);
