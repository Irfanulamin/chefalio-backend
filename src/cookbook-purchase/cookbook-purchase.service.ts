import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCookbookPurchaseDto } from './dto/create-cookbook-purchase.dto';
import { UpdateCookbookPurchaseDto } from './dto/update-cookbook-purchase.dto';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Cookbook } from 'src/cookbook/schemas/cookbook.schema';
import { CookbookPurchase } from './schemas/cookbook-purchase.schemas';
import { MailService } from 'src/services/mail.service';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CookbookPurchaseService {
  private stripe: Stripe;

  constructor(
    @InjectModel(Cookbook.name)
    private cookbookModel: Model<Cookbook>,

    @InjectModel(CookbookPurchase.name)
    private purchaseModel: Model<CookbookPurchase>,

    private readonly mailService: MailService,

    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-02-25.clover',
    });
  }

  async createCheckoutSession(userId: string, dto: CreateCookbookPurchaseDto) {
    const cookbook = await this.cookbookModel.findById(dto.cookbookId);

    if (!cookbook) {
      throw new NotFoundException('Cookbook not found');
    }

    if (cookbook.author.userId.toString() === userId) {
      throw new ForbiddenException('You cannot purchase your own cookbook');
    }

    if (cookbook.stockCount <= 0) {
      throw new ForbiddenException('Cookbook is out of stock');
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',

      line_items: [
        {
          price_data: {
            currency: 'usd',

            product_data: {
              name: cookbook.title,
              images: [cookbook.cookbook_image],
            },

            unit_amount: cookbook.price * 100,
          },
          quantity: 1,
        },
      ],

      success_url: `${process.env.FRONTEND_URL}/payment-success`,
      cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,

      metadata: {
        cookbookId: dto.cookbookId,
        buyerId: userId,
        receiptEmail: dto.receiptEmail,
      },
    });

    const purchase = await this.purchaseModel.create({
      cookbookId: new Types.ObjectId(dto.cookbookId),
      buyerId: new Types.ObjectId(userId),
      chefId: new Types.ObjectId(cookbook.author.userId),
      cookbookTitle: cookbook.title,
      cookbookImage: cookbook.cookbook_image,
      price: cookbook.price,
      stripeSessionId: session.id,
      paymentStatus: 'pending',
      billingAddress: dto.billingAddress,
      receiptEmail: dto.receiptEmail,
    });

    return {
      success: true,
      message: 'Checkout session created successfully',
      data: session.url,
    };
  }

  async getUserPurchases(userId: string) {
    const query = { buyerId: new Types.ObjectId(userId) };
    const data = await this.purchaseModel.find(query).sort({ createdAt: -1 });
    return {
      success: true,
      message: 'Purchases retrieved successfully',
      data: data,
    };
  }

  async getChefOrders(chefId: string) {
    const data = await this.purchaseModel
      .find({ chefId: new Types.ObjectId(chefId) })
      .sort({ createdAt: -1 });
    return { success: true, message: 'Orders retrieved', data };
  }

  async updatePaymentStatus(
    chefId: string,
    purchaseId: string,
    paymentStatus: string,
  ) {
    const purchase = await this.purchaseModel.findById(purchaseId);

    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }

    const cookbook = await this.cookbookModel.findById(purchase.cookbookId);

    if (!cookbook) {
      throw new NotFoundException('Cookbook not found');
    }

    if (cookbook.author.userId.toString() !== chefId) {
      throw new ForbiddenException(
        'You can only update orders for your own cookbooks',
      );
    }

    purchase.paymentStatus = paymentStatus;
    await purchase.save();

    return {
      success: true,
      message: 'Payment status updated successfully',
      data: purchase,
    };
  }

  async confirmPayment(session: Stripe.Checkout.Session): Promise<void> {
    const purchase = await this.purchaseModel.findOneAndUpdate(
      { stripeSessionId: session.id },
      { paymentStatus: 'paid' },
      { new: true },
    );
    if (!purchase) return;
    const cookbook = await this.cookbookModel.findById(purchase.cookbookId);

    await this.cookbookModel.findOneAndUpdate(
      { _id: purchase.cookbookId, stockCount: { $gt: 0 } },
      { $inc: { stockCount: -1 } },
    );

    await this.mailService.sendPurchaseReceipt(purchase.receiptEmail, {
      cookbookTitle: purchase.cookbookTitle,
      cookbookImage: purchase.cookbookImage,
      price: purchase.price,
      purchaseDate: new Date(),
    });
  }
}
