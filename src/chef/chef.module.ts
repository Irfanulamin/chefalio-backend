import { Module } from '@nestjs/common';
import { ChefService } from './chef.service';
import { ChefController } from './chef.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/schema/user.schema';
import { Cookbook, CookbookSchema } from '../cookbook/schemas/cookbook.schema';
import { Recipe, RecipeSchema } from '../recipe/schemas/recipe.schema';
import { ChefProfile, ChefProfileSchema } from '../chef-profile/schemas/chef-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Cookbook.name, schema: CookbookSchema },
      { name: Recipe.name, schema: RecipeSchema },
      { name: ChefProfile.name, schema: ChefProfileSchema },
    ]),
  ],
  controllers: [ChefController],
  providers: [ChefService],
})
export class ChefModule {}
