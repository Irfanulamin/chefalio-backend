import { Test, TestingModule } from '@nestjs/testing';
import { RecipeInteractionController } from './recipe-interaction.controller';
import { RecipeInteractionService } from './recipe-interaction.service';

describe('RecipeInteractionController', () => {
  let controller: RecipeInteractionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecipeInteractionController],
      providers: [RecipeInteractionService],
    }).compile();

    controller = module.get<RecipeInteractionController>(
      RecipeInteractionController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
