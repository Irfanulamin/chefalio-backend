import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from '../user/schema/user.schema';
import { Model, Types } from 'mongoose';
import { CloudinaryService } from '../services/cloudinary.service';
import { Recipe } from './schemas/recipe.schema';
import { UpdateRecipeDto } from './dto/update-recipe.dto';

@Injectable()
export class RecipeService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Recipe.name) private recipeModel: Model<Recipe>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async createRecipe(
    userId: string,
    dto: CreateRecipeDto,
    images: Express.Multer.File[],
  ) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!images || images.length !== 3) {
      throw new BadRequestException('Exactly 3 images are required');
    }

    const imageUrls = await Promise.all(
      images.map((file) =>
        this.cloudinaryService.uploadImage(file, 'recipe_images'),
      ),
    );

    const recipe = await this.recipeModel.create({
      ...dto,
      images: imageUrls,
      authorId: user._id,
    });

    return {
      success: true,
      statusCode: 201,
      message: 'Recipe created successfully',
      data: recipe,
    };
  }

  async getAllRecipes(
    page: number,
    limit: number,
    search: string,
    tags: string,
    difficulty: string,
    author: string,
  ) {
    const filter: Record<string, any> = {};

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { tags: searchRegex },
        { ingredients: searchRegex },
      ];
    }

    if (tags) {
      const tagsArray = tags.split(',').map((t) => t.trim().toLowerCase());
      filter.tags = { $in: tagsArray };
    }

    if (difficulty) filter.difficulty = difficulty;

    if (author) {
      const authorUser = await this.userModel
        .findOne({ username: { $regex: author, $options: 'i' } })
        .select('_id');
      if (!authorUser) {
        return {
          success: true,
          statusCode: 200,
          message: 'Recipes retrieved successfully',
          data: {
            recipes: [],
            pagination: {
              total: 0,
              page,
              limit,
              totalPages: 0,
            },
          },
        };
      }
      filter.authorId = authorUser._id;
    }

    const [recipes, total] = await Promise.all([
      this.recipeModel
        .find(filter)
        .populate('authorId', 'fullName username email profile_url')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 }),
      this.recipeModel.countDocuments(filter),
    ]);

    return {
      success: true,
      statusCode: 200,
      message: 'Recipes retrieved successfully',
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

  async getRecipeById(id: string) {
    const recipe = await this.recipeModel
      .findById(id)
      .populate('authorId', 'fullName username email profile_url');
    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }
    return {
      success: true,
      statusCode: 200,
      message: 'Recipe retrieved successfully',
      data: recipe,
    };
  }

  async deleteRecipe(id: string, userId: string, role: string) {
    const recipe = await this.recipeModel.findById(id);

    if (!recipe) throw new NotFoundException('Recipe not found');

    if (role !== 'admin' && recipe.authorId.toString() !== userId) {
      throw new ForbiddenException('You do not own this recipe');
    }

    await this.recipeModel.findByIdAndDelete(id);
    return { success: true, message: 'Recipe deleted successfully' };
  }

  async updateRecipe(
    id: string,
    updateRecipeDto: UpdateRecipeDto,
    userId: string,
    images?: Express.Multer.File[],
  ) {
    const recipe = await this.recipeModel.findById(id);
    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }
    if (recipe.authorId.toString() !== userId) {
      throw new BadRequestException('You are not the author of this recipe');
    }

    // STEP 1: Validate removeImages belong to this recipe (no mutations yet)
    if (updateRecipeDto.removeImages?.length) {
      const invalidImages = updateRecipeDto.removeImages.filter(
        (imgUrl) => !recipe.images.includes(imgUrl),
      );
      if (invalidImages.length > 0) {
        throw new BadRequestException(
          `The following images do not belong to this recipe: ${invalidImages.join(', ')}`,
        );
      }
    }

    // STEP 2: Validate final image count BEFORE touching anything
    const remainingImages =
      recipe.images.length - (updateRecipeDto.removeImages?.length || 0);
    const finalImageCount = remainingImages + (images?.length || 0);

    if (finalImageCount !== 3) {
      const needed = 3 - remainingImages;
      throw new BadRequestException(
        `Recipe must have exactly 3 images. ` +
          `After removal you will have ${remainingImages} image(s), ` +
          `so you must upload exactly ${needed < 0 ? 0 : needed} new image(s). ` +
          `You uploaded ${images?.length || 0}.`,
      );
    }

    // STEP 3: All validation passed — now delete from Cloudinary (once)
    if (updateRecipeDto.removeImages?.length) {
      for (const imgUrl of updateRecipeDto.removeImages) {
        const publicId = this.cloudinaryService.getCloudinaryPublicId(imgUrl);
        if (publicId) await this.cloudinaryService.deleteImage(publicId);
      }
      recipe.images = recipe.images.filter(
        (i) => !(updateRecipeDto.removeImages ?? []).includes(i),
      );
    }

    // STEP 4: Upload new images
    if (images?.length) {
      const imageUrls = await Promise.all(
        images.map((file) =>
          this.cloudinaryService.uploadImage(file, 'recipe_images'),
        ),
      );
      recipe.images.push(...imageUrls);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { removeImages: _removed, ...fieldsToUpdate } = updateRecipeDto;
    const updated = await this.recipeModel
      .findByIdAndUpdate(
        id,
        {
          ...fieldsToUpdate,
          images: recipe.images,
        },
        { new: true },
      )
      .populate('authorId', 'fullName username email profile_url');

    return {
      success: true,
      statusCode: 200,
      message: 'Recipe updated successfully',
      data: updated,
    };
  }

  async getRecipesByAuthor(userId: string) {
    const recipes = await this.recipeModel
      .find({ authorId: new Types.ObjectId(userId) })
      .populate('authorId', 'fullName username email profile_url')
      .sort({ createdAt: -1 });
    return {
      success: true,
      statusCode: 200,
      message: 'Recipes retrieved successfully',
      data: recipes,
    };
  }

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
}
