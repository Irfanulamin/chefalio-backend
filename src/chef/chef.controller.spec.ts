import { Test, TestingModule } from '@nestjs/testing';
import { ChefController } from './chef.controller';
import { ChefService } from './chef.service';

describe('ChefController', () => {
  let controller: ChefController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChefController],
      providers: [ChefService],
    }).compile();

    controller = module.get<ChefController>(ChefController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
