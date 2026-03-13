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

    await this.purchaseModel.create({
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

  async getChefEarningsAnalytics(chefId: string) {
    const CHEF_PROFIT_RATE = 0.8;

    const [totals, salesByDate] = await Promise.all([
      this.purchaseModel.aggregate([
        {
          $match: {
            chefId: new Types.ObjectId(chefId),
            paymentStatus: 'paid',
          },
        },
        {
          $group: {
            _id: null,
            totalEarned: { $sum: '$price' },
            totalOrders: { $sum: 1 },
          },
        },
      ]),

      this.purchaseModel.aggregate([
        {
          $match: {
            chefId: new Types.ObjectId(chefId),
            paymentStatus: 'paid',
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            amount: { $sum: '$price' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', amount: 1, orders: 1 } },
      ]),
    ]);

    const totalEarned = totals[0]?.totalEarned ?? 0;
    const totalOrders = totals[0]?.totalOrders ?? 0;
    const totalProfit = parseFloat((totalEarned * CHEF_PROFIT_RATE).toFixed(2));

    return {
      success: true,
      statusCode: 200,
      message: 'Chef earnings analytics retrieved successfully',
      data: {
        totalEarned: parseFloat(totalEarned.toFixed(2)),
        totalProfit,
        profitRate: `${CHEF_PROFIT_RATE * 100}%`,
        totalOrders,
        salesGraph: salesByDate,
      },
    };
  }

  async getAdminEarningsAnalytics() {
    const ADMIN_PROFIT_RATE = 0.2;

    const [totals, salesByDate, top3MostSoldCookbooks] = await Promise.all([
      this.purchaseModel.aggregate([
        { $match: { paymentStatus: 'paid' } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            totalOrders: { $sum: 1 },
          },
        },
      ]),

      this.purchaseModel.aggregate([
        { $match: { paymentStatus: 'paid' } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            amount: { $sum: '$price' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', amount: 1, orders: 1 } },
      ]),

      this.purchaseModel.aggregate([
        { $match: { paymentStatus: 'paid' } },
        {
          $group: {
            _id: '$cookbookId',
            cookbookTitle: { $first: '$cookbookTitle' },
            cookbookImage: { $first: '$cookbookImage' },
            totalSold: { $sum: 1 },
            totalRevenue: { $sum: '$price' },
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 3 },
        {
          $project: {
            _id: 0,
            cookbookId: '$_id',
            cookbookTitle: 1,
            cookbookImage: 1,
            totalSold: 1,
            totalRevenue: 1,
          },
        },
      ]),
    ]);

    const totalRevenue = totals[0]?.totalRevenue ?? 0;
    const totalOrders = totals[0]?.totalOrders ?? 0;
    const totalProfit = parseFloat(
      (totalRevenue * ADMIN_PROFIT_RATE).toFixed(2),
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Admin earnings analytics retrieved successfully',
      data: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalProfit,
        profitRate: `${ADMIN_PROFIT_RATE * 100}%`,
        totalOrders,
        salesGraph: salesByDate,
        top3MostSoldCookbooks,
      },
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
