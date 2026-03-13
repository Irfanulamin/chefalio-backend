import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/user/schema/user.schema';
import { Model, Types } from 'mongoose';
import { CloudinaryService } from 'src/services/cloudinary.service';
import { Recipe } from './schemas/recipe.schema';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { Role } from 'src/auth/roles.decorator';

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
      author: {
        userId: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
      },
    });

    return {
      success: true,
      statusCode: 201,
      message: 'Recipe created successfully',
      data: recipe,
    };
  }

  async getAllRecipes(
    page: number = 1,
    limit: number = 10,
    search: string = '',
    tags: string = '',
    difficulty: string = '',
    author: string = '',
  ) {
    const filter: any = {};

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (tags) {
      const tagsArray = tags.split(',').map((tag) => tag.trim());
      filter.tags = { $in: tagsArray };
    }

    if (difficulty) {
      filter.difficulty = difficulty;
    }

    if (author) {
      filter['author.username'] = author;
    }

    const recipes = await this.recipeModel
      .find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await this.recipeModel.countDocuments(filter);

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
    const recipe = await this.recipeModel.findById(id);
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

    if (role !== 'admin' && recipe.author.userId.toString() !== userId) {
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
    if (recipe.author.userId.toString() !== userId) {
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
        const publicId =
          await this.cloudinaryService.getCloudinaryPublicId(imgUrl);
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

    // STEP 5: Persist everything
    const updated = await this.recipeModel.findByIdAndUpdate(
      id,
      {
        ...updateRecipeDto,
        images: recipe.images,
      },
      { new: true },
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Recipe updated successfully',
      data: updated,
    };
  }

  async syncAuthorFullName(userId: string, newFullName: string) {
    await this.recipeModel.updateMany(
      { 'author.userId': new Types.ObjectId(userId) },
      { $set: { 'author.fullName': newFullName } },
    );
  }

  async getRecipesByAuthor(userId: string) {
    const recipes = await this.recipeModel
      .find({ 'author.userId': new Types.ObjectId(userId) })
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
            _id: '$author.userId',
            fullName: { $first: '$author.fullName' },
            username: { $first: '$author.username' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 3 },
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
        top3MostUploadedAuthors: top3MostUploadedAuthors.map(
          ({ _id, fullName, username, count }) => ({
            userId: _id,
            fullName,
            username,
            count,
          }),
        ),
      },
    };
  }
}
