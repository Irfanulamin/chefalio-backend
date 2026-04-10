import { Injectable } from '@nestjs/common';
import { Model, PipelineStage, Types } from 'mongoose';
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
    if (!recipeExists) {
      return { success: false, statusCode: 404, message: 'Recipe not found' };
    }

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
    if (!recipeExists) {
      return { success: false, statusCode: 404, message: 'Recipe not found' };
    }

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

  async getChefAnalytics(chefId: string) {
    const chefObjectId = new Types.ObjectId(chefId);
    const pipeline: PipelineStage[] = [
      {
        $lookup: {
          from: 'recipes',
          localField: 'recipeId',
          foreignField: '_id',
          as: 'recipe',
        },
      },
      { $unwind: '$recipe' },
      { $match: { 'recipe.authorId': chefObjectId } },
      {
        $group: {
          _id: '$recipeId',
          title: { $first: '$recipe.title' },
          thumbnail: { $first: { $arrayElemAt: ['$recipe.images', 0] } },
          lovedCount: { $sum: { $cond: ['$isLoved', 1, 0] } },
          savedCount: { $sum: { $cond: ['$isSaved', 1, 0] } },
          uniqueUsers: { $addToSet: '$userId' },
        },
      },
      {
        $addFields: {
          uniqueUsersCount: { $size: '$uniqueUsers' },
          engagementScore: {
            $add: [
              { $multiply: ['$lovedCount', 2] },
              { $multiply: ['$savedCount', 1.5] },
            ],
          },
        },
      },
      { $unset: 'uniqueUsers' },
      { $sort: { engagementScore: -1 } },
      { $limit: 10 },
    ];

    const results = await this.interactionModel.aggregate(pipeline);
    return {
      success: true,
      statusCode: 200,
      message: 'Chef analytics retrieved successfully',
      totalReturned: results.length,
      recipes: results,
    };
  }

  async getAdminStats() {
    const pipeline: PipelineStage[] = [
      {
        $group: {
          _id: '$recipeId',
          totalLoves: { $sum: { $cond: ['$isLoved', 1, 0] } },
          totalSaves: { $sum: { $cond: ['$isSaved', 1, 0] } },
        },
      },
      {
        $addFields: {
          engagementScore: {
            $add: [
              { $multiply: ['$totalLoves', 2] },
              { $multiply: ['$totalSaves', 1.5] },
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'recipes',
          localField: '_id',
          foreignField: '_id',
          pipeline: [
            { $project: { title: 1, images: { $slice: ['$images', 1] } } },
          ],
          as: 'recipe',
        },
      },
      { $unwind: { path: '$recipe', preserveNullAndEmptyArrays: false } },
      {
        $facet: {
          topEngaged: [{ $sort: { engagementScore: -1 } }, { $limit: 3 }],
          topLoved: [{ $sort: { totalLoves: -1 } }, { $limit: 3 }],
          topSaved: [{ $sort: { totalSaves: -1 } }, { $limit: 3 }],
        },
      },
    ];

    const [result] = await this.interactionModel.aggregate(pipeline);
    if (!result) {
      return {
        success: true,
        statusCode: 200,
        message: 'Admin stats retrieved successfully',
        topEngaged: [],
        topLoved: [],
        topSaved: [],
      };
    }
    return {
      success: true,
      statusCode: 200,
      message: 'Admin stats retrieved successfully',
      ...result,
    };
  }
}
