import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ChefService } from './chef.service';
import { AuthGuard } from '../auth/auth.guard';

type AuthRequest = Request & { user: { sub: string } };

@Controller('chefs')
@UseGuards(AuthGuard)
export class ChefController {
  constructor(private readonly chefService: ChefService) {}

  // GET /chefs
  @Get()
  getAllChefs(
    @Req() req: AuthRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
    @Query('search') search: string = '',
  ) {
    return this.chefService.getAllChefs(page, limit, search, req.user.sub);
  }

  // GET /chefs/count
  @Get('count')
  getChefCount() {
    return this.chefService.getChefCount();
  }

  // GET /chefs/:id — `:id` accepts either a Mongo ObjectId or a username,
  // so a profile URL can read `/chefs/gordon-ramsay` instead of a raw
  // database id. See ChefService.resolveChef for the detection.
  @Get(':id')
  getChefById(@Param('id') id: string) {
    return this.chefService.getChefById(id);
  }

  // GET /chefs/:id/recipes
  @Get(':id/recipes')
  getChefRecipes(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
  ) {
    return this.chefService.getChefRecipes(id, page, limit);
  }

  // GET /chefs/:id/cookbooks
  @Get(':id/cookbooks')
  getChefCookbooks(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
  ) {
    return this.chefService.getChefCookbooks(id, page, limit);
  }

  // GET /chefs/:id/related — chefs to discover: not the one you're looking
  // at, not you, not anyone you already follow, ranked by follower count.
  @Get(':id/related')
  getRelatedChefs(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number,
  ) {
    return this.chefService.getRelatedChefs(id, limit, req.user.sub);
  }
}
