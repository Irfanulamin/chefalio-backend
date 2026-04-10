import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RecipeInteractionDocument = RecipeInteraction & Document;

@Schema({ timestamps: true })
export class RecipeInteraction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Recipe', required: true, index: true })
  recipeId!: Types.ObjectId;

  @Prop({ default: false })
  isSaved!: boolean;

  @Prop({ default: false })
  isLoved!: boolean;

  @Prop({ type: Date, default: null })
  savedAt!: Date | null;

  @Prop({ type: Date, default: null })
  lovedAt!: Date | null;
}

export const RecipeInteractionSchema =
  SchemaFactory.createForClass(RecipeInteraction);

// Compound unique index — one doc per user+recipe pair
RecipeInteractionSchema.index({ userId: 1, recipeId: 1 }, { unique: true });
