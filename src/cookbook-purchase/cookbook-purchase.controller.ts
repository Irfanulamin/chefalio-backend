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
  Logger,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CookbookPurchaseService } from './cookbook-purchase.service';
import { CreateCookbookPurchaseDto } from './dto/create-cookbook-purchase.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { UpdateCookbookPurchaseDto } from './dto/update-cookbook-purchase.dto';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@Controller('cookbook-purchase')
export class CookbookPurchaseController {
  private readonly logger = new Logger(CookbookPurchaseController.name);
  private stripe: Stripe;
  constructor(
    private readonly cookbookPurchaseService: CookbookPurchaseService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'));
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(AuthGuard)
  @Post('payment')
  async purchaseCookbook(
    @Req() req: Request & { user: { sub: string } },
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
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `Webhook signature verification failed: ${errorMessage}`,
      );
    }

    if (event.type === 'checkout.session.completed') {
      try {
        await this.cookbookPurchaseService.confirmPayment(event.data.object);
      } catch (err) {
        this.logger.error('confirmPayment failed', err);
      }
    }

    return { received: true };
  }

  @UseGuards(AuthGuard)
  @Get('history')
  async getMyPurchases(@Req() req: Request & { user: { sub: string } }) {
    const userId = req.user.sub;
    return this.cookbookPurchaseService.getUserPurchases(userId);
  }

  @Get('orders')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  async getChefOrders(@Req() req: Request & { user: { sub: string } }) {
    const chefId = req.user.sub;
    return this.cookbookPurchaseService.getChefOrders(chefId);
  }

  @Get('dashboard/chef')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  async getChefDashboardEarnings(
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.cookbookPurchaseService.getChefDashboardEarnings(req.user.sub);
  }

  @Get('analytics/chef')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  async getChefEarningsAnalytics(
    @Req() req: Request & { user: { sub: string } },
    @Query('period') period?: string,
  ) {
    return this.cookbookPurchaseService.getChefEarningsAnalytics(
      req.user.sub,
      period,
    );
  }

  @Get('admin/orders')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async getAllOrdersAdmin(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search: string = '',
    @Query('status') status: string = '',
  ) {
    return this.cookbookPurchaseService.getAllOrdersAdmin(page, limit, search, status);
  }

  @Get('analytics/admin')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async getAdminEarningsAnalytics() {
    return this.cookbookPurchaseService.getAdminEarningsAnalytics();
  }

  @Get('analytics/admin/top-chefs')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async getAdminTopChefs() {
    return this.cookbookPurchaseService.getAdminTopChefs();
  }

  @Patch('update-payment-status/:purchaseId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  async updatePaymentStatus(
    @Req() req: Request & { user: { sub: string } },
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
