import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  Req,
  UploadedFiles,
  ParseFilePipeBuilder,
  HttpStatus,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { RecipeService } from './recipe.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Role, Roles } from 'src/auth/roles.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UpdateRecipeDto } from './dto/update-recipe.dto';

@Controller('recipes')
export class RecipeController {
  constructor(private readonly recipeService: RecipeService) {}

  @Post('create')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @UseInterceptors(FilesInterceptor('images', 3))
  async createRecipe(
    @Req() req,
    @Body() dto: CreateRecipeDto,
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: '.(jpg|jpeg|png)',
        })
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024,
          message: 'Each image must be under 5MB',
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    images: Express.Multer.File[],
  ) {
    if (typeof dto.instructions === 'string') {
      dto.instructions = JSON.parse(dto.instructions);
    }
    return this.recipeService.createRecipe(req.user.sub, dto, images);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.User)
  @Get('all')
  async getAllRecipes(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string,
    @Query('tags') tags: string,
    @Query('difficulty') difficulty: string,
    @Query('author') author: string,
  ) {
    return this.recipeService.getAllRecipes(
      page,
      limit,
      search,
      tags,
      difficulty,
      author,
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Delete(':id')
  async deleteRecipe(@Param('id') id: string) {
    return this.recipeService.deleteRecipe(id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @Patch('/update/:id')
  @UseInterceptors(FilesInterceptor('images'))
  async updateRecipe(
    @Param('id') id: string,
    @Body() dto: UpdateRecipeDto,
    @Req() req,
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: '.(jpg|jpeg|png)',
        })
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024,
          message: 'Each image must be under 5MB',
        })
        .build({
          fileIsRequired: false,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    images: Express.Multer.File[],
  ) {
    return this.recipeService.updateRecipe(id, dto, req.user.sub, images || []);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @Delete('delete/:id')
  async deleteRecipeByChef(@Param('id') id: string, @Req() req) {
    const recipe = await this.recipeService.getRecipeById(id);
    if (recipe.data.author.userId.toString() !== req.user.sub) {
      throw new BadRequestException('You are not the author of this recipe');
    }
    return this.recipeService.deleteRecipe(id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @Get('my-recipes')
  async getMyRecipes(@Req() req) {
    return this.recipeService.getRecipesByAuthor(req.user.sub);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('dashboard/analytics')
  async getDashboardAnalytics() {
    return this.recipeService.getDashboardAnalytics();
  }

  @UseGuards(AuthGuard)
  @Get(':id')
  async getRecipeById(@Param('id') id: string) {
    return this.recipeService.getRecipeById(id);
  }
}
