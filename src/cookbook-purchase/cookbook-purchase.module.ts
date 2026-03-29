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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CookbookPurchase.name, schema: CookbookPurchaseSchema },
      { name: Cookbook.name, schema: CookbookSchema },
    ]),
  ],
  controllers: [CookbookPurchaseController],
  providers: [CookbookPurchaseService, MailService],
  exports: [CookbookPurchaseService],
})
export class CookbookPurchaseModule {}
