import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  UseGuards,
  Patch,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { CookbookPurchaseService } from './cookbook-purchase.service';
import { CreateCookbookPurchaseDto } from './dto/create-cookbook-purchase.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Role, Roles } from 'src/auth/roles.decorator';
import { UpdateCookbookPurchaseDto } from './dto/update-cookbook-purchase.dto';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ParseObjectIdPipe } from 'src/common/pipes/parse-object-id.pipe';

@Controller('cookbook-purchase')
export class CookbookPurchaseController {
  private stripe: Stripe;
  constructor(
    private readonly cookbookPurchaseService: CookbookPurchaseService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'));
  }

  @UseGuards(AuthGuard)
  @Post('payment')
  async purchaseCookbook(
    @Req() req: any,
    @Body() dto: CreateCookbookPurchaseDto,
  ) {
    const userId = req.user.sub;

    return this.cookbookPurchaseService.createCheckoutSession(userId, dto);
  }

  @Post('webhook')
  async handleStripeWebhook(@Req() req: RawBodyRequest<Request>) {
    const sig = req.headers['stripe-signature'] as string;
    if (!req.rawBody) return { received: false };

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        this.config.getOrThrow('STRIPE_WEBHOOK_SECRET'),
      );
    } catch (err) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${err.message}`,
      );
    }

    if (event.type === 'checkout.session.completed') {
      try {
        await this.cookbookPurchaseService.confirmPayment(event.data.object);
      } catch (err) {
        // log but still return 200 so Stripe doesn't retry
        console.error('confirmPayment failed:', err);
      }
    }
    return { received: true };
  }

  @UseGuards(AuthGuard)
  @Get('my-purchases')
  async getMyPurchases(@Req() req: any) {
    const userId = req.user.sub;
    return this.cookbookPurchaseService.getUserPurchases(userId);
  }

  @Get('orders')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  async getChefOrders(@Req() req: any) {
    const chefId = req.user.sub;
    return this.cookbookPurchaseService.getChefOrders(chefId);
  }

  @Get('analytics/chef')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  async getChefEarningsAnalytics(@Req() req: any) {
    return this.cookbookPurchaseService.getChefEarningsAnalytics(req.user.sub);
  }

  @Get('analytics/admin')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async getAdminEarningsAnalytics() {
    return this.cookbookPurchaseService.getAdminEarningsAnalytics();
  }

  @Patch('update-payment-status/:purchaseId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  async updatePaymentStatus(
    @Req() req: any,
    @Body() dto: UpdateCookbookPurchaseDto,
    @Param('purchaseId', ParseObjectIdPipe) purchaseId: string,
  ) {
    const chefId = req.user.sub;
    return await this.cookbookPurchaseService.updatePaymentStatus(
      chefId,
      purchaseId,
      dto.paymentStatus,
    );
  }
}
