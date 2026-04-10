import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RecipeDocument = Recipe & Document;

@Schema({ timestamps: true })
export class Recipe {
  @Prop({ required: true, index: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId!: Types.ObjectId;

  @Prop({ type: [String], required: true, index: true })
  ingredients!: string[];

  @Prop({
    type: [String],
    index: true,
    set: (tags: string[]) => tags.map((t) => t.toLowerCase().trim()),
  })
  tags!: string[];

  @Prop({
    type: [
      {
        step: Number,
        instruction: String,
      },
    ],
    required: true,
  })
  instructions!: {
    step: number;
    instruction: string;
  }[];

  @Prop({ index: true, enum: ['beginner', 'intermediate', 'advance'] })
  difficulty!: 'beginner' | 'intermediate' | 'advance';

  @Prop({
    type: [String],
    required: true,
    validate: [
      (v: string[]) => v.length === 3,
      'Recipe must contain exactly 3 images',
    ],
  })
  images!: string[];

  @Prop({ default: 0 })
  lovedCount!: number;

  @Prop({ default: 0 })
  savedCount!: number;
}

export const RecipeSchema = SchemaFactory.createForClass(Recipe);

// DELETE these from both schemas:
RecipeSchema.index({
  title: 'text',
  description: 'text',
  ingredients: 'text',
  tags: 'text',
});

// ADD these instead for regex performance on the fields you search:
RecipeSchema.index({ title: 1 });
