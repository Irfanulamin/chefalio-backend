import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';
import { Document, Types } from 'mongoose';

export type RecipeDocument = Recipe & Document;

@Schema({ timestamps: true })
export class Recipe {
  @Prop({ required: true, index: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({
    type: {
      fullName: { type: String, required: true, index: true },
      username: { type: String, required: true },
      email: { type: String, required: true },
      userId: { type: Types.ObjectId, required: true },
    },
    required: true,
  })
  author: {
    userId: Types.ObjectId;
    fullName: string;
    username: string;
    email: string;
  };

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  ingredients: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags: string[];

  @Prop({
    type: [
      {
        step: Number,
        instruction: String,
      },
    ],
    required: true,
  })
  instructions: {
    step: number;
    instruction: string;
  }[];

  @Prop({ index: true, enum: ['beginner', 'intermediate', 'advance'] })
  difficulty: 'beginner' | 'intermediate' | 'advance';

  @Prop({
    type: [String],
    required: true,
    validate: [
      (v: string[]) => v.length === 3,
      'Recipe must contain exactly 3 images',
    ],
  })
  images: string[];

  @Prop({ default: 0 })
  lovedCount: number;

  @Prop({ default: 0 })
  savedCount: number;
}

export const RecipeSchema = SchemaFactory.createForClass(Recipe);

RecipeSchema.index({
  title: 'text',
  'author.fullName': 'text',
  ingredients: 'text',
  tags: 'text',
});
