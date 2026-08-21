import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Req,
  Body,
  Query,
} from '@nestjs/common';
import { RecipeInteractionService } from './recipe-interaction.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { BatchStatsDto } from './dto/batch-stats.dto';
import { Throttle } from '@nestjs/throttler';
import { EngagementAnalyticsService } from './engagement-analytics.service';

@Controller('recipe-interaction')
export class RecipeInteractionController {
  constructor(
    private readonly recipeInteractionService: RecipeInteractionService,
    private readonly analytics: EngagementAnalyticsService,
  ) {}

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User, Role.Chef)
  @Post('/save/:recipeId')
  toggleSave(
    @Param('recipeId', ParseObjectIdPipe) recipeId: string,
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.recipeInteractionService.toggleSave(req.user.sub, recipeId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User, Role.Chef)
  @Post('/love/:recipeId')
  toggleLove(
    @Param('recipeId', ParseObjectIdPipe) recipeId: string,
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.recipeInteractionService.toggleLove(req.user.sub, recipeId);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User, Role.Chef)
  @Get('/saved')
  getSavedRecipes(@Req() req: Request & { user: { sub: string } }) {
    return this.recipeInteractionService.getSavedRecipes(req.user.sub);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User, Role.Chef)
  @Get('/loved')
  getLovedRecipes(@Req() req: Request & { user: { sub: string } }) {
    return this.recipeInteractionService.getLovedRecipes(req.user.sub);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @Get('/analytics/chef')
  getChefAnalytics(
    @Req() req: Request & { user: { sub: string } },
    @Query('period') period?: string,
  ) {
    return this.analytics.getChefAnalytics(req.user.sub, period);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('/analytics/admin')
  getAdminAnalytics() {
    return this.analytics.getAdminStats();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User, Role.Chef)
  @Get('/stats/:recipeId')
  getRecipeStats(
    @Param('recipeId', ParseObjectIdPipe) recipeId: string,
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.recipeInteractionService.getInteractionStatus(
      req.user.sub,
      recipeId,
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User, Role.Chef)
  @Post('/stats/batch')
  getBatchStats(
    @Body() dto: BatchStatsDto,
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.recipeInteractionService.getBatchInteractionStatus(
      req.user.sub,
      dto.recipeIds,
    );
  }
}
