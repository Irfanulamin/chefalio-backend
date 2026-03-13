import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  UseGuards,
  Patch,
  Param,
} from '@nestjs/common';
import { CookbookPurchaseService } from './cookbook-purchase.service';
import { CreateCookbookPurchaseDto } from './dto/create-cookbook-purchase.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Role, Roles } from 'src/auth/roles.decorator';
import { UpdateCookbookPurchaseDto } from './dto/update-cookbook-purchase.dto';

@UseGuards(AuthGuard)
@Controller('cookbook-purchase')
export class CookbookPurchaseController {
  constructor(
    private readonly cookbookPurchaseService: CookbookPurchaseService,
  ) {}

  @Post('payment')
  async purchaseCookbook(
    @Req() req: any,
    @Body() dto: CreateCookbookPurchaseDto,
  ) {
    const userId = req.user.sub;

    return this.cookbookPurchaseService.createCheckoutSession(userId, dto);
  }

  @Get('my-purchases')
  async getMyPurchases(@Req() req: any) {
    const userId = req.user.sub;
    return this.cookbookPurchaseService.getUserPurchases(userId);
  }

  @Get('orders')
  @UseGuards(RolesGuard)
  @Roles(Role.Chef)
  async getChefOrders(@Req() req: any) {
    const chefId = req.user.sub;
    return this.cookbookPurchaseService.getChefOrders(chefId);
  }

  @Patch('update-payment-status/:purchaseId')
  @UseGuards(RolesGuard)
  @Roles(Role.Chef)
  async updatePaymentStatus(
    @Req() req: any,
    @Body() dto: UpdateCookbookPurchaseDto,
    @Param('purchaseId') purchaseId: string,
  ) {
    const chefId = req.user.sub;
    return this.cookbookPurchaseService.updatePaymentStatus(
      chefId,
      purchaseId,
      dto.paymentStatus,
    );
  }
}
