import { Injectable, NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Recipe } from '../recipe/schemas/recipe.schema';
import { RecipeInteraction } from './schemas/recipe-interaction.schema';

@Injectable()
export class RecipeInteractionService {
  constructor(
    @InjectModel(Recipe.name) private recipeModel: Model<Recipe>,
    @InjectModel(RecipeInteraction.name)
    private interactionModel: Model<RecipeInteraction>,
  ) {}

  async toggleSave(userId: string, recipeId: string) {
    const uid = new Types.ObjectId(userId);
    const rid = new Types.ObjectId(recipeId);

    const recipeExists = await this.recipeModel.exists({ _id: rid });
    if (!recipeExists) throw new NotFoundException('Recipe not found');

    const now = new Date();
    const previous = await this.interactionModel.findOneAndUpdate(
      { userId: uid, recipeId: rid },
      [
        {
          $set: {
            userId: { $ifNull: ['$userId', uid] },
            recipeId: { $ifNull: ['$recipeId', rid] },
            isSaved: { $not: [{ $ifNull: ['$isSaved', false] }] },
          },
        },
        { $set: { savedAt: { $cond: ['$isSaved', now, null] } } },
      ],
      { upsert: true, returnDocument: 'before', updatePipeline: true },
    );

    const wasSaved = previous?.isSaved ?? false;
    await this.recipeModel.findByIdAndUpdate(rid, {
      $inc: { savedCount: wasSaved ? -1 : 1 },
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Recipe save status updated successfully',
      isSaved: !wasSaved,
    };
  }

  async toggleLove(userId: string, recipeId: string) {
    const uid = new Types.ObjectId(userId);
    const rid = new Types.ObjectId(recipeId);

    const recipeExists = await this.recipeModel.exists({ _id: rid });
    if (!recipeExists) throw new NotFoundException('Recipe not found');

    const now = new Date();
    const previous = await this.interactionModel.findOneAndUpdate(
      { userId: uid, recipeId: rid },
      [
        {
          $set: {
            userId: { $ifNull: ['$userId', uid] },
            recipeId: { $ifNull: ['$recipeId', rid] },
            isLoved: { $not: [{ $ifNull: ['$isLoved', false] }] },
          },
        },
        { $set: { lovedAt: { $cond: ['$isLoved', now, null] } } },
      ],
      { upsert: true, returnDocument: 'before', updatePipeline: true },
    );

    const wasLoved = previous?.isLoved ?? false;
    await this.recipeModel.findByIdAndUpdate(rid, {
      $inc: { lovedCount: wasLoved ? -1 : 1 },
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Recipe love status updated successfully',
      isLoved: !wasLoved,
    };
  }

  // ── Single recipe stats (kept for the detail page) ────────────────────────
  async getInteractionStatus(userId: string, recipeId: string) {
    const doc = await this.interactionModel
      .findOne(
        {
          userId: new Types.ObjectId(userId),
          recipeId: new Types.ObjectId(recipeId),
        },
        { isSaved: 1, isLoved: 1 },
      )
      .lean();
    return { isSaved: doc?.isSaved ?? false, isLoved: doc?.isLoved ?? false };
  }

  // ── NEW: Batch stats — one DB query for an entire page of recipes ─────────
  // Returns a map of recipeId → { isSaved, isLoved }
  // Any recipe the user hasn't interacted with defaults to false/false.
  async getBatchInteractionStatus(
    userId: string,
    recipeIds: string[],
  ): Promise<Record<string, { isSaved: boolean; isLoved: boolean }>> {
    if (!recipeIds.length) return {};

    const objectIds = recipeIds.map((id) => new Types.ObjectId(id));

    const docs = await this.interactionModel
      .find(
        {
          userId: new Types.ObjectId(userId),
          recipeId: { $in: objectIds },
        },
        { recipeId: 1, isSaved: 1, isLoved: 1 },
      )
      .lean();

    // Build a map, then fill in defaults for any recipe not in the result
    const map: Record<string, { isSaved: boolean; isLoved: boolean }> = {};

    for (const id of recipeIds) {
      map[id] = { isSaved: false, isLoved: false };
    }
    for (const doc of docs) {
      map[doc.recipeId.toString()] = {
        isSaved: doc.isSaved ?? false,
        isLoved: doc.isLoved ?? false,
      };
    }

    return map;
  }

  async getSavedRecipes(userId: string) {
    const uid = new Types.ObjectId(userId);
    const data = await this.interactionModel
      .find({ userId: uid, isSaved: true })
      .sort({ savedAt: -1 })
      .populate({
        path: 'recipeId',
        populate: {
          path: 'authorId',
          select: 'fullName username email profile_url',
        },
      })
      .lean();
    return {
      success: true,
      statusCode: 200,
      message: 'Saved recipes retrieved successfully',
      data,
    };
  }

  async getLovedRecipes(userId: string) {
    const uid = new Types.ObjectId(userId);
    const data = await this.interactionModel
      .find({ userId: uid, isLoved: true })
      .sort({ lovedAt: -1 })
      .populate({
        path: 'recipeId',
        populate: {
          path: 'authorId',
          select: 'fullName username email profile_url',
        },
      })
      .lean();
    return {
      success: true,
      statusCode: 200,
      message: 'Loved recipes retrieved successfully',
      data,
    };
  }
}
