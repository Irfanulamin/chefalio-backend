import { Injectable } from '@nestjs/common';
import { Model, PipelineStage, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Recipe } from 'src/recipe/schemas/recipe.schema';
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

    const existing = await this.interactionModel.findOne({
      userId: uid,
      recipeId: rid,
    });

    if (!existing) {
      await this.interactionModel.create({
        userId: uid,
        recipeId: rid,
        isSaved: true,
        savedAt: new Date(),
      });
      await this.recipeModel.findByIdAndUpdate(rid, {
        $inc: { savedCount: 1 },
      });
      return {
        success: true,
        statusCode: 200,
        message: 'Recipe saved successfully',
        isSaved: true,
      };
    }

    const newState = !existing.isSaved;
    await existing.updateOne({
      isSaved: newState,
      savedAt: newState ? new Date() : null,
    });
    await this.recipeModel.findByIdAndUpdate(rid, {
      $inc: { savedCount: newState ? 1 : -1 },
    });
    return {
      success: true,
      statusCode: 200,
      message: 'Recipe save status updated successfully',
      isSaved: newState,
    };
  }

  async toggleLove(userId: string, recipeId: string) {
    const uid = new Types.ObjectId(userId);
    const rid = new Types.ObjectId(recipeId);

    const existing = await this.interactionModel.findOne({
      userId: uid,
      recipeId: rid,
    });

    if (!existing) {
      await this.interactionModel.create({
        userId: uid,
        recipeId: rid,
        isLoved: true,
        lovedAt: new Date(),
      });
      await this.recipeModel.findByIdAndUpdate(rid, {
        $inc: { lovedCount: 1 },
      });
      return {
        success: true,
        statusCode: 200,
        message: 'Recipe loved successfully',
        isLoved: true,
      };
    }

    const newState = !existing.isLoved;
    await existing.updateOne({
      isLoved: newState,
      lovedAt: newState ? new Date() : null,
    });
    await this.recipeModel.findByIdAndUpdate(rid, {
      $inc: { lovedCount: newState ? 1 : -1 },
    });
    return {
      success: true,
      statusCode: 200,
      message: 'Recipe love status updated successfully',
      isLoved: newState,
    };
  }

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

  async getSavedRecipes(userId: string) {
    const uid = new Types.ObjectId(userId);
    const data = await this.interactionModel
      .find({ userId: uid, isSaved: true })
      .sort({ savedAt: -1 })
      .populate('recipeId')
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
      .populate('recipeId')
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
      // Step 1: only look at recipes by this chef
      {
        $lookup: {
          from: 'recipes',
          localField: 'recipeId',
          foreignField: '_id',
          as: 'recipe',
        },
      },
      { $unwind: '$recipe' },
      {
        $match: { 'recipe.author.userId': chefObjectId },
      },
      // Step 2: group per recipe
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
      // Step 3: score + sort in DB, not in JS
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
      { $unset: 'uniqueUsers' }, // drop the raw array before returning
      { $sort: { engagementScore: -1 } },
      { $limit: 10 }, // only return top 10, paginate if needed
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
      // One lookup shared across all three facets
      {
        $lookup: {
          from: 'recipes',
          localField: '_id',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                title: 1,
                'author.fullName': 1,
                images: { $slice: ['$images', 1] },
              },
            },
          ],
          as: 'recipe',
        },
      },
      { $unwind: { path: '$recipe', preserveNullAndEmptyArrays: false } },
      // Fan out into 3 sorted top-3 lists in one shot
      {
        $facet: {
          topEngaged: [{ $sort: { engagementScore: -1 } }, { $limit: 3 }],
          topLoved: [{ $sort: { totalLoves: -1 } }, { $limit: 3 }],
          topSaved: [{ $sort: { totalSaves: -1 } }, { $limit: 3 }],
        },
      },
    ];

    const [result] = await this.interactionModel.aggregate(pipeline);
    return {
      success: true,
      statusCode: 200,
      message: 'Admin stats retrieved successfully',
      ...result,
    };
  }
}
