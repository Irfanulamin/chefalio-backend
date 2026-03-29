import { Test, TestingModule } from '@nestjs/testing';
import { CookbookPurchaseController } from './cookbook-purchase.controller';
import { CookbookPurchaseService } from './cookbook-purchase.service';

describe('CookbookPurchaseController', () => {
  let controller: CookbookPurchaseController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CookbookPurchaseController],
      providers: [CookbookPurchaseService],
    }).compile();

    controller = module.get<CookbookPurchaseController>(
      CookbookPurchaseController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
