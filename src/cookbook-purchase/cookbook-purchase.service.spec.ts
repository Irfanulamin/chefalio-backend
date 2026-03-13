import { Test, TestingModule } from '@nestjs/testing';
import { CookbookPurchaseService } from './cookbook-purchase.service';

describe('CookbookPurchaseService', () => {
  let service: CookbookPurchaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CookbookPurchaseService],
    }).compile();

    service = module.get<CookbookPurchaseService>(CookbookPurchaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
