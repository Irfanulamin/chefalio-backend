import { Module } from '@nestjs/common';
import { RecipeInteractionService } from './recipe-interaction.service';
import { RecipeInteractionController } from './recipe-interaction.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RecipeInteraction,
  RecipeInteractionSchema,
} from './schemas/recipe-interaction.schema';
import { Recipe, RecipeSchema } from 'src/recipe/schemas/recipe.schema';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RecipeInteraction.name, schema: RecipeInteractionSchema },
      { name: Recipe.name, schema: RecipeSchema },
    ]),
  ],
  controllers: [RecipeInteractionController],
  providers: [RecipeInteractionService],
})
export class RecipeInteractionModule {}
