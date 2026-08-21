import { Injectable } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Cookbook } from '../cookbook/schemas/cookbook.schema';
import { CookbookPurchase } from './schemas/cookbook-purchase.schemas';
import {
  ADMIN_PROFIT_RATE,
  CHEF_PROFIT_RATE,
  adminProfit,
  chefProfit,
  earnedStatusMatch,
  rateLabel,
  roundMoney,
} from './order-lifecycle';
import { createdAtMatch, resolvePeriod } from '../common/period-window';

/**
 * The read-only half of cookbook purchases: chef and admin earnings
 * dashboards.
 *
 * These used to sit in CookbookPurchaseService alongside checkout and webhook
 * fulfilment — 265 lines of aggregation in the class that moves money. They
 * share its two models and nothing else: no writes, no Stripe, no mail. The
 * split leaves the purchase service about the purchase.
 *
 * Revenue is counted with `earnedStatusMatch()` and split with
 * `chefProfit`/`adminProfit` from order-lifecycle, so what counts as earned
 * is defined once for both dashboards and the rules that govern the orders.
 */
@Injectable()
export class EarningsAnalyticsService {
  constructor(
    @InjectModel(Cookbook.name)
    private cookbookModel: Model<Cookbook>,

    @InjectModel(CookbookPurchase.name)
    private purchaseModel: Model<CookbookPurchase>,
  ) {}

  async getChefEarningsAnalytics(chefId: string, period: string = 'lifetime') {
    const window = resolvePeriod(period);
    const chefOid = new Types.ObjectId(chefId);

    const match = {
      chefId: chefOid,
      paymentStatus: earnedStatusMatch(),
      ...createdAtMatch(window),
    };

    const [totals, salesByDate] = await Promise.all([
      this.purchaseModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalEarned: { $sum: '$price' },
            totalOrders: { $sum: 1 },
          },
        },
      ]),

      this.purchaseModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: {
                format: window.groupFormat,
                date: '$createdAt',
              },
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

    return {
      success: true,
      statusCode: 200,
      message: 'Chef earnings analytics retrieved successfully',
      data: {
        totalEarned: roundMoney(totalEarned),
        totalProfit: chefProfit(totalEarned),
        profitRate: rateLabel(CHEF_PROFIT_RATE),
        totalOrders,
        period: window.period,
        salesGraph: salesByDate,
      },
    };
  }

  async getChefDashboardEarnings(chefId: string) {
    const chefOid = new Types.ObjectId(chefId);
    const earned = { chefId: chefOid, paymentStatus: earnedStatusMatch() };

    const [totals, recentOrders, topCookbooks, totalCookbooks] =
      await Promise.all([
        this.purchaseModel.aggregate([
          { $match: earned },
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
          { $match: earned },
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

        // One integer instead of GET /cookbooks/my-cookbooks?limit=100, which
        // the dashboard was fetching in full so it could render `.length`.
        this.cookbookModel.countDocuments({ authorId: chefOid }),
      ]);

    const totalRevenue = (totals[0]?.totalRevenue as number) ?? 0;
    const totalOrders = (totals[0]?.totalOrders as number) ?? 0;

    return {
      success: true,
      statusCode: 200,
      message: 'Chef dashboard earnings retrieved',
      data: {
        totalCookbooks,
        totalRevenue: roundMoney(totalRevenue),
        totalProfit: chefProfit(totalRevenue),
        totalOrders,
        recentOrders,
        topCookbooks: topCookbooks.map((c) => ({
          ...c,
          totalRevenue: roundMoney(c.totalRevenue as number),
        })),
      },
    };
  }

  async getAdminEarningsAnalytics() {
    const earned = { paymentStatus: earnedStatusMatch() };

    const [totals, salesByDate, top3MostSoldCookbooks] = await Promise.all([
      this.purchaseModel.aggregate([
        { $match: earned },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            totalOrders: { $sum: 1 },
          },
        },
      ]),

      this.purchaseModel.aggregate([
        { $match: earned },
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
        { $match: earned },
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

    return {
      success: true,
      statusCode: 200,
      message: 'Admin earnings analytics retrieved successfully',
      data: {
        totalRevenue: roundMoney(totalRevenue),
        totalProfit: adminProfit(totalRevenue),
        profitRate: rateLabel(ADMIN_PROFIT_RATE),
        totalOrders,
        salesGraph: salesByDate,
        top3MostSoldCookbooks,
      },
    };
  }

  async getAdminTopChefs() {
    const topChefs = await this.purchaseModel.aggregate([
      { $match: { paymentStatus: earnedStatusMatch() } },
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
        totalRevenue: roundMoney(c.totalRevenue as number),
      })),
    };
  }
}
