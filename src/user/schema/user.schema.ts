import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  fullName!: string;

  @Prop({ required: true, unique: true })
  username!: string;

  @Prop({ required: true, unique: true })
  email!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ default: 'user', enum: ['user', 'chef', 'admin'] })
  role!: 'user' | 'chef' | 'admin';

  @Prop({
    required: true,
    default: 'https://i.ibb.co.com/XWqvgyv/Minimalist-Avatar-Illustration.jpg',
  })
  profile_url!: string;

  @Prop({ default: true, required: true })
  isActive!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
