import { Injectable } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Recipe } from './schemas/recipe.schema';

/**
 * Read-only recipe dashboards: the admin overview, a chef's own recipe
 * breakdown, and the admin upload trend.
 *
 * These were the back third of RecipeService, which otherwise owns creation,
 * the three-image rule, Cloudinary cleanup and the daily publish cap. They
 * touch one model and write nothing, so keeping them next to code that
 * deletes images from a CDN bought nothing.
 */
@Injectable()
export class RecipeAnalyticsService {
  constructor(@InjectModel(Recipe.name) private recipeModel: Model<Recipe>) {}

  async getDashboardAnalytics() {
    const [
      totalRecipes,
      recipesPerDifficulty,
      topTags,
      top3MostUploadedAuthors,
    ] = await Promise.all([
      this.recipeModel.countDocuments(),

      this.recipeModel.aggregate([
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
      ]),

      this.recipeModel.aggregate([
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),

      this.recipeModel.aggregate([
        {
          $group: {
            _id: '$authorId',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 3 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'authorInfo',
          },
        },
        { $unwind: '$authorInfo' },
        {
          $project: {
            userId: '$_id',
            fullName: '$authorInfo.fullName',
            username: '$authorInfo.username',
            count: 1,
          },
        },
      ]),
    ]);

    return {
      success: true,
      statusCode: 200,
      message: 'Dashboard analytics retrieved successfully',
      data: {
        totalRecipes,
        recipesPerDifficulty: recipesPerDifficulty.map(({ _id, count }) => ({
          difficulty: _id,
          count,
        })),
        topTags: topTags.map(({ _id, count }) => ({ tag: _id, count })),
        top3MostUploadedAuthors,
      },
    };
  }

  async getChefRecipeAnalytics(chefId: string) {
    const chefObjectId = new Types.ObjectId(chefId);

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    const [
      difficultyBreakdown,
      topTags,
      uploadTrend,
      topRecipes,
      totals,
      recentRecipes,
    ] = await Promise.all([
      this.recipeModel.aggregate([
        { $match: { authorId: chefObjectId } },
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
        { $project: { _id: 0, difficulty: '$_id', count: 1 } },
        { $sort: { count: -1 } },
      ]),

      this.recipeModel.aggregate([
        { $match: { authorId: chefObjectId } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
        { $project: { _id: 0, tag: '$_id', count: 1 } },
      ]),

      this.recipeModel.aggregate([
        {
          $match: {
            authorId: chefObjectId,
            createdAt: { $gte: fourteenDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]),

      this.recipeModel.aggregate([
        { $match: { authorId: chefObjectId } },
        {
          $project: {
            title: 1,
            image: { $arrayElemAt: ['$images', 0] },
            lovedCount: 1,
            savedCount: 1,
            engagementScore: {
              $add: [
                { $multiply: ['$lovedCount', 2] },
                { $multiply: ['$savedCount', 1.5] },
              ],
            },
          },
        },
        { $sort: { engagementScore: -1 } },
        { $limit: 5 },
      ]),

      /*
       * Headline totals, computed in the database.
       *
       * The chef dashboard used to get these by calling
       * GET /recipes/my-recipes, pulling down every recipe the chef has
       * ever written — descriptions, full ingredient arrays, every
       * instruction step, three image URLs each — and then doing
       * `recipes.length` and two `reduce`s over it in the browser. That is
       * an unbounded response body to produce three integers, and it grows
       * with the chef's success.
       */
      this.recipeModel.aggregate([
        { $match: { authorId: chefObjectId } },
        {
          $group: {
            _id: null,
            totalRecipes: { $sum: 1 },
            totalLoves: { $sum: '$lovedCount' },
            totalSaves: { $sum: '$savedCount' },
          },
        },
      ]),

      // The four cards at the bottom of the dashboard — the only recipe
      // *documents* it actually renders.
      this.recipeModel
        .find({ authorId: chefObjectId })
        .sort({ createdAt: -1 })
        .limit(4)
        .select('title images difficulty lovedCount')
        .lean(),
    ]);

    return {
      success: true,
      statusCode: 200,
      message: 'Chef recipe analytics retrieved successfully',
      data: {
        totalRecipes: (totals[0]?.totalRecipes as number) ?? 0,
        totalLoves: (totals[0]?.totalLoves as number) ?? 0,
        totalSaves: (totals[0]?.totalSaves as number) ?? 0,
        recentRecipes: recentRecipes.map((r) => ({
          _id: String(r._id),
          title: r.title,
          image: r.images?.[0] ?? '',
          difficulty: r.difficulty,
          lovedCount: r.lovedCount,
        })),
        myDifficultyBreakdown: difficultyBreakdown,
        myTopTags: topTags,
        uploadTrend,
        topRecipes: topRecipes.map((r) => ({
          _id: String(r._id),
          title: r.title as string,
          image: r.image as string,
          lovedCount: r.lovedCount as number,
          savedCount: r.savedCount as number,
          engagementScore: parseFloat((r.engagementScore as number).toFixed(1)),
        })),
      },
    };
  }

  async getAdminUploadTrend() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trend = await this.recipeModel.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } },
    ]);

    return {
      success: true,
      statusCode: 200,
      data: trend,
    };
  }
}
