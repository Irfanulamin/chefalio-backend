import { Test, TestingModule } from '@nestjs/testing';
import { RecipeInteractionService } from './recipe-interaction.service';

describe('RecipeInteractionService', () => {
  let service: RecipeInteractionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecipeInteractionService],
    }).compile();

    service = module.get<RecipeInteractionService>(RecipeInteractionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
