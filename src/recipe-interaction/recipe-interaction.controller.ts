import { Controller, Get, Post, Param, UseGuards, Req } from '@nestjs/common';
import { RecipeInteractionService } from './recipe-interaction.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Role, Roles } from 'src/auth/roles.decorator';

@Controller('recipe-interaction')
export class RecipeInteractionController {
  constructor(
    private readonly recipeInteractionService: RecipeInteractionService,
  ) {}

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @Post('save/:recipeId')
  toggleSave(@Param('recipeId') recipeId: string, @Req() req) {
    return this.recipeInteractionService.toggleSave(req.user.sub, recipeId);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @Post('love/:recipeId')
  toggleLove(@Param('recipeId') recipeId: string, @Req() req) {
    return this.recipeInteractionService.toggleLove(req.user.sub, recipeId);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @Get('saved')
  getSavedRecipes(@Req() req) {
    return this.recipeInteractionService.getSavedRecipes(req.user.sub);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @Get('loved')
  getLovedRecipes(@Req() req) {
    return this.recipeInteractionService.getLovedRecipes(req.user.sub);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @Get('stats/:recipeId')
  getRecipeStats(@Param('recipeId') recipeId: string, @Req() req) {
    return this.recipeInteractionService.getInteractionStatus(
      req.user.sub,
      recipeId,
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @Get('analytics/chef')
  getChefAnalytics(@Req() req) {
    return this.recipeInteractionService.getChefAnalytics(req.user.sub);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('analytics/admin')
  getAdminAnalytics() {
    return this.recipeInteractionService.getAdminStats();
  }
}
