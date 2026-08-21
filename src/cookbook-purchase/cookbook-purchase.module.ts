import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CookbookPurchaseService } from './cookbook-purchase.service';
import { CookbookPurchaseController } from './cookbook-purchase.controller';
import { Cookbook, CookbookSchema } from '../cookbook/schemas/cookbook.schema';
import {
  CookbookPurchase,
  CookbookPurchaseSchema,
} from './schemas/cookbook-purchase.schemas';
import { MailService } from '../services/mail.service';
import { StripeGateway } from './stripe.gateway';
import { EarningsAnalyticsService } from './earnings-analytics.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    // Declared rather than leaned on. ConfigModule is registered globally in
    // AppModule, so this import is redundant at runtime — but without it the
    // module cannot be compiled on its own, which means StripeGateway and
    // MailService cannot be wired up in a test without booting the whole app.
    ConfigModule,
    MongooseModule.forFeature([
      { name: CookbookPurchase.name, schema: CookbookPurchaseSchema },
      { name: Cookbook.name, schema: CookbookSchema },
    ]),
  ],
  controllers: [CookbookPurchaseController],
  providers: [
    CookbookPurchaseService,
    EarningsAnalyticsService,
    MailService,
    StripeGateway,
  ],
  exports: [CookbookPurchaseService],
})
export class CookbookPurchaseModule {}
