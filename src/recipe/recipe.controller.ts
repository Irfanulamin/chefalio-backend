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
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { RecipeService } from './recipe.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@Controller('recipes')
export class RecipeController {
  constructor(private readonly recipeService: RecipeService) {}

  @Post('create')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @UseInterceptors(FilesInterceptor('images', 3))
  async createRecipe(
    @Req() req: Request & { user: { sub: string } },
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
    return this.recipeService.createRecipe(req.user.sub, dto, images);
  }

  @UseGuards(AuthGuard)
  @Get('all')
  async getAllRecipes(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
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
  @Roles(Role.Chef)
  @Get('my-recipes')
  async getMyRecipes(@Req() req: Request & { user: { sub: string } }) {
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
  async getRecipeById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.recipeService.getRecipeById(id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef, Role.Admin)
  async deleteRecipe(
    @Param('id', ParseObjectIdPipe) id: string,
    @Req()
    req: Request & { user: { sub: string; role: string } },
  ) {
    return this.recipeService.deleteRecipe(id, req.user.sub, req.user.role);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @Patch('/update/:id')
  @UseInterceptors(FilesInterceptor('images'))
  async updateRecipe(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateRecipeDto,
    @Req() req: Request & { user: { sub: string } },
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
}
