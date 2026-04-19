import { Test, TestingModule } from '@nestjs/testing';
import { ChefService } from './chef.service';

describe('ChefService', () => {
  let service: ChefService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChefService],
    }).compile();

    service = module.get<ChefService>(ChefService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
