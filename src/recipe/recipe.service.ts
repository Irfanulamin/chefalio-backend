import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from '../user/schema/user.schema';
import { Model, Types } from 'mongoose';
import { CloudinaryService } from '../services/cloudinary.service';
import { Recipe } from './schemas/recipe.schema';
import { hideDemoAuthors } from '../common/demo-visibility';
import { paginated } from '../common/api-response';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class RecipeService {
  private readonly logger = new Logger(RecipeService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Recipe.name) private recipeModel: Model<Recipe>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly notificationService: NotificationService,
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

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const todayCount = await this.recipeModel.countDocuments({
      authorId: new Types.ObjectId(userId),
      createdAt: { $gte: startOfDay },
    });
    if (todayCount >= 3) {
      throw new ForbiddenException(
        'Daily limit reached: chefs may create at most 3 recipes per day',
      );
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

    this.notificationService
      .create({
        type: 'new_recipe',
        title: 'New Recipe',
        message: `${user.fullName} just shared a new recipe: "${dto.title}"`,
        actorName: user.fullName,
        actorAvatar: user.profile_url,
        targetId: recipe._id as Types.ObjectId,
        thumbnail: imageUrls[0],
        chefId: user._id as Types.ObjectId,
      })
      .catch((err) => this.logger.warn('Notification dispatch failed', err));

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
    sort: string = 'newest',
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
        .select('_id isDemo');
      if (!authorUser || authorUser.isDemo) {
        return paginated([], 'Recipes retrieved successfully', 0, page, limit);
      }
      filter.authorId = authorUser._id;
    } else {
      // No author asked for, so this is the public catalogue: hide the
      // seeded demo accounts' recipes. Looked up here rather than above so
      // an author-filtered search doesn't pay for a query it never uses.
      Object.assign(filter, await hideDemoAuthors(this.userModel));
    }

    const sortOrder: Record<string, any> =
      sort === 'trending'
        ? { lovedCount: -1, savedCount: -1 }
        : sort === 'popular'
          ? { savedCount: -1, lovedCount: -1 }
          : { createdAt: -1 };

    const [recipes, total] = await Promise.all([
      this.recipeModel
        .find(filter)
        .populate('authorId', 'fullName username email profile_url')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort(sortOrder),
      this.recipeModel.countDocuments(filter),
    ]);

    return paginated(
      recipes,
      'Recipes retrieved successfully',
      total,
      page,
      limit,
    );
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

    for (const imgUrl of recipe.images) {
      const publicId = this.cloudinaryService.getCloudinaryPublicId(imgUrl);
      if (publicId) await this.cloudinaryService.deleteImage(publicId);
    }

    await this.recipeModel.findByIdAndDelete(id);

    /* The recipe's images have just been removed from Cloudinary, so any
       notification still advertising it now renders a dead thumbnail
       alongside a link to a page that 404s. Awaited so the tray is
       consistent by the time the client refetches, but never allowed to
       fail the delete — the recipe is already gone either way. */
    await this.notificationService
      .deleteByTarget(recipe._id as Types.ObjectId)
      .catch((err) =>
        this.logger.warn(
          'Notification cleanup failed after recipe delete',
          err,
        ),
      );

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
}
