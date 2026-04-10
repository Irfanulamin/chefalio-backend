import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Req,
  Body,
} from '@nestjs/common';
import { RecipeInteractionService } from './recipe-interaction.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@Controller('recipe-interaction')
export class RecipeInteractionController {
  constructor(
    private readonly recipeInteractionService: RecipeInteractionService,
  ) {}

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @Post('/save/:recipeId')
  toggleSave(
    @Param('recipeId', ParseObjectIdPipe) recipeId: string,
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.recipeInteractionService.toggleSave(req.user.sub, recipeId);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @Post('/love/:recipeId')
  toggleLove(
    @Param('recipeId', ParseObjectIdPipe) recipeId: string,
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.recipeInteractionService.toggleLove(req.user.sub, recipeId);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @Get('/saved')
  getSavedRecipes(@Req() req: Request & { user: { sub: string } }) {
    return this.recipeInteractionService.getSavedRecipes(req.user.sub);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @Get('/loved')
  getLovedRecipes(@Req() req: Request & { user: { sub: string } }) {
    return this.recipeInteractionService.getLovedRecipes(req.user.sub);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @Get('/analytics/chef')
  getChefAnalytics(@Req() req: Request & { user: { sub: string } }) {
    return this.recipeInteractionService.getChefAnalytics(req.user.sub);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('/analytics/admin')
  getAdminAnalytics() {
    return this.recipeInteractionService.getAdminStats();
  }

  // ── Kept for the single recipe detail page ────────────────────────────────
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
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

  // ── NEW: One request for the whole page of recipes ────────────────────────
  // POST /recipe-interaction/stats/batch
  // Body: { recipeIds: string[] }
  // Returns: { [recipeId]: { isSaved: boolean, isLoved: boolean } }
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @Post('/stats/batch')
  getBatchStats(
    @Body() body: { recipeIds: string[] },
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.recipeInteractionService.getBatchInteractionStatus(
      req.user.sub,
      body.recipeIds ?? [],
    );
  }
}
