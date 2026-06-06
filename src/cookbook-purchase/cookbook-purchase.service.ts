import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateCookbookPurchaseDto } from './dto/create-cookbook-purchase.dto';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Cookbook } from '../cookbook/schemas/cookbook.schema';
import { CookbookPurchase } from './schemas/cookbook-purchase.schemas';
import { MailService } from '../services/mail.service';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CookbookPurchaseService {
  private readonly logger = new Logger(CookbookPurchaseService.name);
  private readonly CHEF_PROFIT_RATE = 0.8;
  private readonly ADMIN_PROFIT_RATE = 0.2;
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

  private startOfUTCDay(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  async createCheckoutSession(userId: string, dto: CreateCookbookPurchaseDto) {
    const cookbook = await this.cookbookModel.findById(dto.cookbookId);

    if (!cookbook) {
      throw new NotFoundException('Cookbook not found');
    }

    if (cookbook.authorId.toString() === userId) {
      throw new ForbiddenException('You cannot purchase your own cookbook');
    }

    if (cookbook.stockCount <= 0) {
      throw new ForbiddenException('Cookbook is out of stock');
    }

    const todayPurchases = await this.purchaseModel.countDocuments({
      buyerId: new Types.ObjectId(userId),
      createdAt: { $gte: this.startOfUTCDay() },
    });
    if (todayPurchases >= 5) {
      throw new ForbiddenException(
        'Daily limit reached: you may purchase at most 5 cookbooks per day',
      );
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: dto.receiptEmail,

      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: cookbook.title,
              images: [cookbook.cookbook_image],
            },
            unit_amount: Math.round(cookbook.price * 100),
          },
          quantity: 1,
        },
      ],

      success_url: `${process.env.ALLOWED_ORIGIN}/payment-success`,
      cancel_url: `${process.env.ALLOWED_ORIGIN}/payment-cancel`,

      metadata: {
        cookbookId: dto.cookbookId,
        buyerId: userId,
        receiptEmail: dto.receiptEmail,
        billingAddress: JSON.stringify(dto.billingAddress ?? {}),
      },
    });

    return {
      success: true,
      message: 'Checkout session created successfully',
      redirectUrl: session.url,
    };
  }

  async getAllOrdersAdmin(
    page: number,
    limit: number,
    search: string,
    status: string,
  ) {
    const filter: Record<string, any> = {};
    if (status) filter.paymentStatus = status;
    if (search) {
      filter.$or = [
        { cookbookTitle: { $regex: search, $options: 'i' } },
        { receiptEmail: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.purchaseModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-__v')
        .lean(),
      this.purchaseModel.countDocuments(filter),
    ]);

    return {
      success: true,
      message: 'All orders retrieved',
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUserPurchases(userId: string) {
    const query = { buyerId: new Types.ObjectId(userId) };
    const data = await this.purchaseModel
      .find(query)
      .sort({ createdAt: -1 })
      .select('-__v -updatedAt');
    return {
      success: true,
      message: 'Purchases retrieved successfully',
      data: data,
    };
  }

  async getChefOrders(chefId: string) {
    const data = await this.purchaseModel
      .find({ chefId: new Types.ObjectId(chefId) })
      .sort({ createdAt: -1 })
      .select('-__v -updatedAt');
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

    if (cookbook.authorId.toString() !== chefId) {
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

  async getChefEarningsAnalytics(
    chefId: string,
    period: string = 'lifetime',
  ) {

    const now = new Date();
    let dateFrom: Date | undefined;
    let groupFormat = '%Y-%m-%d';

    switch (period) {
      case 'daily':
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        groupFormat = '%H:00';
        break;
      case 'weekly': {
        const d = new Date(now);
        d.setDate(d.getDate() - 6);
        d.setHours(0, 0, 0, 0);
        dateFrom = d;
        break;
      }
      case 'monthly': {
        const d = new Date(now);
        d.setDate(d.getDate() - 29);
        d.setHours(0, 0, 0, 0);
        dateFrom = d;
        break;
      }
    }

    // Build match inline so Mongoose serialises ObjectId correctly
    const chefOid = new Types.ObjectId(chefId);

    const [totals, salesByDate] = await Promise.all([
      this.purchaseModel.aggregate([
        {
          $match: {
            chefId: chefOid,
            paymentStatus: { $in: ['paid', 'shipped', 'delivered'] },
            ...(dateFrom ? { createdAt: { $gte: dateFrom } } : {}),
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
            chefId: chefOid,
            paymentStatus: { $in: ['paid', 'shipped', 'delivered'] },
            ...(dateFrom ? { createdAt: { $gte: dateFrom } } : {}),
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: groupFormat, date: '$createdAt' },
            },
            amount: { $sum: '$price' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', amount: 1, orders: 1 } },
      ]),
    ]);

    const totalEarned = (totals[0]?.totalEarned as number) ?? 0;
    const totalOrders = (totals[0]?.totalOrders as number) ?? 0;
    const totalProfit = parseFloat((totalEarned * this.CHEF_PROFIT_RATE).toFixed(2));

    return {
      success: true,
      statusCode: 200,
      message: 'Chef earnings analytics retrieved successfully',
      data: {
        totalEarned: parseFloat(totalEarned.toFixed(2)),
        totalProfit,
        profitRate: `${this.CHEF_PROFIT_RATE * 100}%`,
        totalOrders,
        period,
        salesGraph: salesByDate,
      },
    };
  }

  async getChefDashboardEarnings(chefId: string) {
    const chefOid = new Types.ObjectId(chefId);

    const [totals, recentOrders, topCookbooks] = await Promise.all([
      this.purchaseModel.aggregate([
        { $match: { chefId: chefOid, paymentStatus: { $in: ['paid', 'shipped', 'delivered'] } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            totalOrders: { $sum: 1 },
          },
        },
      ]),

      this.purchaseModel
        .find({ chefId: chefOid })
        .sort({ createdAt: -1 })
        .limit(3)
        .select(
          'cookbookTitle cookbookImage price paymentStatus createdAt receiptEmail',
        )
        .lean(),

      this.purchaseModel.aggregate([
        { $match: { chefId: chefOid, paymentStatus: { $in: ['paid', 'shipped', 'delivered'] } } },
        {
          $group: {
            _id: '$cookbookId',
            cookbookTitle: { $first: '$cookbookTitle' },
            cookbookImage: { $first: '$cookbookImage' },
            totalSold: { $sum: 1 },
            totalRevenue: { $sum: '$price' },
          },
        },
        { $sort: { totalRevenue: -1 } },
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

    const totalRevenue = (totals[0]?.totalRevenue as number) ?? 0;
    const totalOrders = (totals[0]?.totalOrders as number) ?? 0;

    return {
      success: true,
      statusCode: 200,
      message: 'Chef dashboard earnings retrieved',
      data: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalProfit: parseFloat((totalRevenue * this.CHEF_PROFIT_RATE).toFixed(2)),
        totalOrders,
        recentOrders,
        topCookbooks: topCookbooks.map((c) => ({
          ...c,
          totalRevenue: parseFloat((c.totalRevenue as number).toFixed(2)),
        })),
      },
    };
  }

  async getAdminEarningsAnalytics() {

    const [totals, salesByDate, top3MostSoldCookbooks] = await Promise.all([
      this.purchaseModel.aggregate([
        { $match: { paymentStatus: { $in: ['paid', 'shipped', 'delivered'] } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            totalOrders: { $sum: 1 },
          },
        },
      ]),

      this.purchaseModel.aggregate([
        { $match: { paymentStatus: { $in: ['paid', 'shipped', 'delivered'] } } },
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
        { $match: { paymentStatus: { $in: ['paid', 'shipped', 'delivered'] } } },
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

    const totalRevenue = (totals[0]?.totalRevenue as number) ?? 0;
    const totalOrders = (totals[0]?.totalOrders as number) ?? 0;
    const totalProfit = parseFloat(
      (totalRevenue * this.ADMIN_PROFIT_RATE).toFixed(2),
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Admin earnings analytics retrieved successfully',
      data: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalProfit,
        profitRate: `${this.ADMIN_PROFIT_RATE * 100}%`,
        totalOrders,
        salesGraph: salesByDate,
        top3MostSoldCookbooks,
      },
    };
  }

  async getAdminTopChefs() {
    const topChefs = await this.purchaseModel.aggregate([
      { $match: { paymentStatus: { $in: ['paid', 'shipped', 'delivered'] } } },
      {
        $group: {
          _id: '$chefId',
          totalRevenue: { $sum: '$price' },
          totalSales: { $sum: 1 },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'chefInfo',
        },
      },
      { $unwind: '$chefInfo' },
      {
        $project: {
          _id: 0,
          chefId: '$_id',
          fullName: '$chefInfo.fullName',
          username: '$chefInfo.username',
          profileUrl: '$chefInfo.profile_url',
          totalRevenue: 1,
          totalSales: 1,
        },
      },
    ]);

    return {
      success: true,
      statusCode: 200,
      data: topChefs.map((c) => ({
        ...c,
        totalRevenue: parseFloat((c.totalRevenue as number).toFixed(2)),
      })),
    };
  }

  async confirmPayment(session: Stripe.Checkout.Session): Promise<void> {
    if (session.payment_status !== 'paid') {
      return;
    }

    const existing = await this.purchaseModel.findOne({
      stripeSessionId: session.id,
    });
    if (existing) {
      return;
    }

    const { cookbookId, buyerId, receiptEmail, billingAddress } =
      session.metadata as Record<string, string>;

    const todayPurchases = await this.purchaseModel.countDocuments({
      buyerId: new Types.ObjectId(buyerId),
      createdAt: { $gte: this.startOfUTCDay() },
    });
    if (todayPurchases >= 5) {
      this.logger.warn(
        `Daily purchase limit exceeded for user ${buyerId} — skipping fulfillment`,
      );
      return;
    }

    const cookbook = await this.cookbookModel.findOneAndUpdate(
      { _id: cookbookId, stockCount: { $gt: 0 } },
      { $inc: { stockCount: -1 } },
      { new: true },
    );
    if (!cookbook) return;

    await this.purchaseModel.create({
      cookbookId: new Types.ObjectId(cookbookId),
      buyerId: new Types.ObjectId(buyerId),
      chefId: new Types.ObjectId(cookbook.authorId),
      cookbookTitle: cookbook.title,
      cookbookImage: cookbook.cookbook_image,
      price: cookbook.price,
      stripeSessionId: session.id,
      paymentStatus: 'paid',
      billingAddress: JSON.parse(billingAddress || '{}'),
      receiptEmail,
    });

    await this.mailService.sendPurchaseReceipt(receiptEmail, {
      cookbookTitle: cookbook.title,
      cookbookImage: cookbook.cookbook_image,
      price: cookbook.price,
      purchaseDate: new Date(),
    });
  }
}
