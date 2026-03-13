import { Controller, Post, Body, Req } from '@nestjs/common';
import { CookbookPurchaseService } from './cookbook-purchase.service';
import { CreateCookbookPurchaseDto } from './dto/create-cookbook-purchase.dto';

@Controller('cookbook-purchase')
export class CookbookPurchaseController {
  constructor(
    private readonly cookbookPurchaseService: CookbookPurchaseService,
  ) {}

  @Post('cookbook')
  async purchaseCookbook(@Req() req: any, dto: CreateCookbookPurchaseDto) {
    const userId = req.user.sub;

    return this.cookbookPurchaseService.createCheckoutSession(userId, dto);
  }
}
