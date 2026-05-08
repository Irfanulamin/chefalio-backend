import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../user/schema/user.schema';
import { Recipe } from '../recipe/schemas/recipe.schema';
import { Cookbook } from '../cookbook/schemas/cookbook.schema';

@Injectable()
export class ChefService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Recipe.name) private recipeModel: Model<Recipe>,
    @InjectModel(Cookbook.name) private cookbookModel: Model<Cookbook>,
  ) {}

  // GET /chefs — all chefs (paginated + optional search)
  async getAllChefs(page: number, limit: number, search: string = '') {
    const filter: Record<string, any> = { role: 'chef', isActive: true };

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.userModel.aggregate([
        { $match: filter },
        { $sort: { createdAt: 1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: 'recipes',
            localField: '_id',
            foreignField: 'authorId',
            as: '_recipes',
          },
        },
        {
          $lookup: {
            from: 'cookbooks',
            localField: '_id',
            foreignField: 'authorId',
            as: '_cookbooks',
          },
        },
        {
          $addFields: {
            recipeCount: { $size: '$_recipes' },
            cookbookCount: { $size: '$_cookbooks' },
          },
        },
        {
          $project: {
            password: 0,
            __v: 0,
            createdAt: 0,
            updatedAt: 0,
            isActive: 0,
            _recipes: 0,
            _cookbooks: 0,
          },
        },
      ]),
      this.userModel.countDocuments(filter),
    ]);

    return {
      success: true,
      statusCode: 200,
      message: 'Chefs retrieved successfully',
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // GET /chefs/count — total number of active chefs
  async getChefCount() {
    const total = await this.userModel.countDocuments({
      role: 'chef',
      isActive: true,
    });
    return {
      success: true,
      statusCode: 200,
      message: 'Chef count retrieved successfully',
      data: { total },
    };
  }

  // GET /chefs/:id — single chef profile
  async getChefById(id: string) {
    const chef = await this.userModel
      .findOne({ _id: id, role: 'chef', isActive: true })
      .select('-password -__v -createdAt -updatedAt -isActive');

    if (!chef) {
      throw new NotFoundException('Chef not found');
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Chef retrieved successfully',
      data: chef,
    };
  }

  // GET /chefs/:id/recipes — recipes by a specific chef
  async getChefRecipes(chefId: string, page: number, limit: number) {
    const chef = await this.userModel.findOne({
      _id: chefId,
      role: 'chef',
      isActive: true,
    });
    if (!chef) throw new NotFoundException('Chef not found');

    const [recipes, total] = await Promise.all([
      this.recipeModel
        .find({ authorId: new Types.ObjectId(chefId) })
        .populate('authorId', 'fullName username email profile_url')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 }),
      this.recipeModel.countDocuments({ authorId: new Types.ObjectId(chefId) }),
    ]);

    return {
      success: true,
      statusCode: 200,
      message: 'Chef recipes retrieved successfully',
      data: {
        recipes,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  // GET /chefs/:id/cookbooks — cookbooks by a specific chef
  async getChefCookbooks(chefId: string, page: number, limit: number) {
    const chef = await this.userModel.findOne({
      _id: chefId,
      role: 'chef',
      isActive: true,
    });
    if (!chef) throw new NotFoundException('Chef not found');

    const [cookbooks, total] = await Promise.all([
      this.cookbookModel
        .find({ authorId: new Types.ObjectId(chefId), stockCount: { $gt: 0 } })
        .populate('authorId', 'fullName username email profile_url')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .select('-__v -updatedAt -createdAt'),
      this.cookbookModel.countDocuments({
        authorId: new Types.ObjectId(chefId),
        stockCount: { $gt: 0 },
      }),
    ]);

    return {
      success: true,
      statusCode: 200,
      message: 'Chef cookbooks retrieved successfully',
      data: {
        cookbooks,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  // GET /chefs/:id/related — other chefs, excluding the current one
  async getRelatedChefs(chefId: string, limit: number = 4) {
    const chef = await this.userModel.findOne({
      _id: chefId,
      role: 'chef',
      isActive: true,
    });
    if (!chef) throw new NotFoundException('Chef not found');

    const related = await this.userModel
      .find({
        role: 'chef',
        isActive: true,
        _id: { $ne: new Types.ObjectId(chefId) },
      })
      .select('-password -__v -createdAt -updatedAt -isActive')
      .limit(limit)
      .sort({ createdAt: -1 });

    return {
      success: true,
      statusCode: 200,
      message: 'Related chefs retrieved successfully',
      data: related,
    };
  }
}
