import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CookbookDocument = Cookbook & Document;

@Schema({ timestamps: true })
export class Cookbook {
  @Prop({ required: true, index: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
  })
  cookbook_image!: string;

  @Prop({ type: Number, required: true, min: 0, default: 0, index: true })
  price!: number;

  @Prop({ required: true, min: 0 })
  stockCount!: number;
}

export const CookbookSchema = SchemaFactory.createForClass(Cookbook);

CookbookSchema.index({ title: 'text', description: 'text' });

CookbookSchema.index({ title: 1 });
