import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChefService } from './chef.service';
import { AuthGuard } from '../auth/auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@Controller('chefs')
@UseGuards(AuthGuard)
export class ChefController {
  constructor(private readonly chefService: ChefService) {}

  // GET /chefs
  @Get()
  getAllChefs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
    @Query('search') search: string = '',
  ) {
    return this.chefService.getAllChefs(page, limit, search);
  }

  // GET /chefs/count
  @Get('count')
  getChefCount() {
    return this.chefService.getChefCount();
  }

  // GET /chefs/:id
  @Get(':id')
  getChefById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.chefService.getChefById(id);
  }

  // GET /chefs/:id/recipes
  @Get(':id/recipes')
  getChefRecipes(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
  ) {
    return this.chefService.getChefRecipes(id, page, limit);
  }

  // GET /chefs/:id/cookbooks
  @Get(':id/cookbooks')
  getChefCookbooks(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
  ) {
    return this.chefService.getChefCookbooks(id, page, limit);
  }

  // GET /chefs/:id/related
  @Get(':id/related')
  getRelatedChefs(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number,
  ) {
    return this.chefService.getRelatedChefs(id, limit);
  }
}
