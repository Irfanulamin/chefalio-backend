import { Injectable } from '@nestjs/common';
import { Model, PipelineStage, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { RecipeInteraction } from './schemas/recipe-interaction.schema';
import { resolvePeriod } from '../common/period-window';

/**
 * Read-only engagement dashboards: a chef's saves/loves over a period, and
 * the admin totals.
 *
 * Split out of RecipeInteractionService, which owns the save/love toggles.
 * Toggling is a write path with its own concerns; this is aggregation. The
 * period window comes from `resolvePeriod` so it matches the earnings
 * dashboard exactly.
 */
@Injectable()
export class EngagementAnalyticsService {
  constructor(
    @InjectModel(RecipeInteraction.name)
    private interactionModel: Model<RecipeInteraction>,
  ) {}

  async getChefAnalytics(chefId: string, period: string = 'lifetime') {
    const chefObjectId = new Types.ObjectId(chefId);

    // Same window definition the earnings dashboard uses — it used to be a
    // second copy of this switch statement in CookbookPurchaseService.
    const dateFrom = resolvePeriod(period).from;

    const lovedCond = dateFrom
      ? {
          $and: [{ $eq: ['$isLoved', true] }, { $gte: ['$lovedAt', dateFrom] }],
        }
      : '$isLoved';

    const savedCond = dateFrom
      ? {
          $and: [{ $eq: ['$isSaved', true] }, { $gte: ['$savedAt', dateFrom] }],
        }
      : '$isSaved';

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
          lovedCount: { $sum: { $cond: [lovedCond, 1, 0] } },
          savedCount: { $sum: { $cond: [savedCond, 1, 0] } },
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
