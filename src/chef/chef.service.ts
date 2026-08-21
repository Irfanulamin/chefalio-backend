import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../user/schema/user.schema';
import { Recipe } from '../recipe/schemas/recipe.schema';
import { Cookbook } from '../cookbook/schemas/cookbook.schema';
import { ChefProfile } from '../chef-profile/schemas/chef-profile.schema';
import { FollowService } from '../follow/follow.service';
import { publicChefFilter } from '../common/demo-visibility';
import { paginated } from '../common/api-response';

@Injectable()
export class ChefService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Recipe.name) private recipeModel: Model<Recipe>,
    @InjectModel(Cookbook.name) private cookbookModel: Model<Cookbook>,
    @InjectModel(ChefProfile.name) private chefProfileModel: Model<ChefProfile>,
    private readonly followService: FollowService,
  ) {}

  // GET /chefs — all chefs (paginated + optional search)
  async getAllChefs(
    page: number,
    limit: number,
    search: string = '',
    viewerId?: string,
  ) {
    const filter: Record<string, any> = publicChefFilter();

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    const viewerObjectId = viewerId ? new Types.ObjectId(viewerId) : null;

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
          $lookup: {
            from: 'follows',
            localField: '_id',
            foreignField: 'chefId',
            as: '_followers',
          },
        },
        {
          $addFields: {
            recipeCount: { $size: '$_recipes' },
            cookbookCount: { $size: '$_cookbooks' },
            followerCount: { $size: '$_followers' },
            isFollowing: viewerObjectId
              ? { $in: [viewerObjectId, '$_followers.followerId'] }
              : false,
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
            _followers: 0,
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
    // Same rule as getAllChefs, not a second copy of it — this number is the
    // headline above that very list, so counting anyone the list hides makes
    // the page contradict itself.
    const total = await this.userModel.countDocuments(publicChefFilter());
    return {
      success: true,
      statusCode: 200,
      message: 'Chef count retrieved successfully',
      data: { total },
    };
  }

  /**
   * Resolves the `:id` route param to an active chef document — it's
   * either a raw Mongo ObjectId (old links, direct API callers) or a
   * username (what the frontend now links to, so a profile URL reads
   * `/chefs/gordon-ramsay` instead of a database id). A 24-char hex string
   * is treated as an id; anything else is looked up by username.
   */
  private async resolveChef(identifier: string) {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
    const chef = await this.userModel
      .findOne({
        ...(isObjectId ? { _id: identifier } : { username: identifier }),
        role: 'chef',
        isActive: true,
      })
      .select('-password -__v -createdAt -updatedAt -isActive');

    if (!chef) throw new NotFoundException('Chef not found');
    return chef;
  }

  // GET /chefs/:id — single chef profile with extended profile data
  async getChefById(id: string) {
    const chef = await this.resolveChef(id);

    const profile = await this.chefProfileModel
      .findOne({ chefId: chef._id })
      .select('-__v -createdAt -updatedAt');

    return {
      success: true,
      statusCode: 200,
      message: 'Chef retrieved successfully',
      data: { ...chef.toObject(), profile: profile?.toObject() ?? null },
    };
  }

  // GET /chefs/:id/recipes — recipes by a specific chef
  async getChefRecipes(id: string, page: number, limit: number) {
    const chef = await this.resolveChef(id);
    const chefId = chef._id;

    const [recipes, total] = await Promise.all([
      this.recipeModel
        .find({ authorId: chefId })
        .populate('authorId', 'fullName username email profile_url')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 }),
      this.recipeModel.countDocuments({ authorId: chefId }),
    ]);

    return paginated(
      recipes,
      'Chef recipes retrieved successfully',
      total,
      page,
      limit,
    );
  }

  // GET /chefs/:id/cookbooks — cookbooks by a specific chef
  async getChefCookbooks(id: string, page: number, limit: number) {
    const chef = await this.resolveChef(id);
    const chefId = chef._id;

    const [cookbooks, total] = await Promise.all([
      this.cookbookModel
        .find({ authorId: chefId, stockCount: { $gt: 0 } })
        .populate('authorId', 'fullName username email profile_url')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .select('-__v -updatedAt -createdAt'),
      this.cookbookModel.countDocuments({
        authorId: chefId,
        stockCount: { $gt: 0 },
      }),
    ]);

    return paginated(
      cookbooks,
      'Chef cookbooks retrieved successfully',
      total,
      page,
      limit,
    );
  }

  /**
   * GET /chefs/:id/related — chefs to *discover*, not a random four.
   *
   * Three exclusions and a ranking make this a recommendation rather than
   * "whoever else exists": never the chef whose page you're on, never
   * yourself (you can land here as a chef browsing another chef's
   * profile), and never someone you already follow — showing an already-
   * followed chef under "Other chefs" has nothing left to offer. What's
   * left is ranked by follower count, so the chefs most worth discovering
   * surface first instead of whoever signed up most recently.
   */
  async getRelatedChefs(id: string, limit: number = 4, viewerId?: string) {
    const chef = await this.resolveChef(id);
    const chefId = chef._id;

    const excludeIds = [chefId];
    if (viewerId) excludeIds.push(new Types.ObjectId(viewerId));
    if (viewerId) {
      const followed = await this.followService.getFollowedChefIds(viewerId);
      excludeIds.push(...followed);
    }

    const related = await this.userModel.aggregate([
      {
        $match: {
          role: 'chef',
          isActive: true,
          _id: { $nin: excludeIds },
        },
      },
      {
        $lookup: {
          from: 'follows',
          localField: '_id',
          foreignField: 'chefId',
          as: '_followers',
        },
      },
      { $addFields: { followerCount: { $size: '$_followers' } } },
      { $sort: { followerCount: -1, createdAt: -1 } },
      { $limit: limit },
      {
        $project: {
          password: 0,
          __v: 0,
          createdAt: 0,
          updatedAt: 0,
          isActive: 0,
          _followers: 0,
        },
      },
    ]);

    return {
      success: true,
      statusCode: 200,
      message: 'Related chefs retrieved successfully',
      data: related,
    };
  }
}
