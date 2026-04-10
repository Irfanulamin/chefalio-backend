import { Module } from '@nestjs/common';
import { RecipeInteractionService } from './recipe-interaction.service';
import { RecipeInteractionController } from './recipe-interaction.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RecipeInteraction,
  RecipeInteractionSchema,
} from './schemas/recipe-interaction.schema';
import { Recipe, RecipeSchema } from '../recipe/schemas/recipe.schema';
import { User, UserSchema } from '../user/schema/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RecipeInteraction.name, schema: RecipeInteractionSchema },
      { name: Recipe.name, schema: RecipeSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [RecipeInteractionController],
  providers: [RecipeInteractionService],
})
export class RecipeInteractionModule {}
