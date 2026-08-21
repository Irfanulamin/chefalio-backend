import {
  BadRequestException,
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
import { StripeGateway } from './stripe.gateway';
import {
  DAILY_PURCHASE_LIMIT,
  PaymentStatus,
  planTransition,
  startOfUTCDay,
} from './order-lifecycle';

@Injectable()
export class CookbookPurchaseService {
  private readonly logger = new Logger(CookbookPurchaseService.name);

  constructor(
    @InjectModel(Cookbook.name)
    private cookbookModel: Model<Cookbook>,

    @InjectModel(CookbookPurchase.name)
    private purchaseModel: Model<CookbookPurchase>,

    private readonly mailService: MailService,

    private readonly stripe: StripeGateway,
  ) {}

  /** How many cookbooks this buyer has already bought today (UTC). */
  private countPurchasesToday(buyerId: string | Types.ObjectId) {
    return this.purchaseModel.countDocuments({
      buyerId: new Types.ObjectId(buyerId),
      createdAt: { $gte: startOfUTCDay() },
    });
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

    if ((await this.countPurchasesToday(userId)) >= DAILY_PURCHASE_LIMIT) {
      throw new ForbiddenException(
        `Daily limit reached: you may purchase at most ${DAILY_PURCHASE_LIMIT} cookbooks per day`,
      );
    }

    const session = await this.stripe.createCheckoutSession({
      title: cookbook.title,
      image: cookbook.cookbook_image,
      price: cookbook.price,
      receiptEmail: dto.receiptEmail,
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

  /**
   * Move one order along its lifecycle.
   *
   * The transition itself is decided by `planTransition`, not here — which
   * is what closes two holes. A chef could previously mark a `pending` order
   * `delivered` without it ever being paid, because the DTO constrained the
   * status *value* and nothing constrained the *move*. And a `refunded`
   * order silently kept the stock it had consumed; the plan now carries the
   * restore, and it is applied in the same step as the status write.
   */
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

    const plan = planTransition(
      purchase.paymentStatus as PaymentStatus,
      paymentStatus as PaymentStatus,
    );

    if (!plan.ok) {
      throw new BadRequestException(plan.reason);
    }

    if (plan.stockDelta !== 0) {
      await this.cookbookModel.updateOne(
        { _id: cookbook._id },
        { $inc: { stockCount: plan.stockDelta } },
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

  /**
   * Turn a settled Stripe session into an order.
   *
   * Every early return here used to be silent — the buyer had paid, and the
   * webhook simply declined to fulfil and kept the money. Two of those paths
   * are genuinely reachable: a buyer who opens several checkout sessions
   * before paying any of them can pass the daily cap at session-creation
   * time and trip it at fulfillment time, and the last copy of a cookbook
   * can sell between checkout and the webhook firing.
   *
   * Refusing to fulfil is still right in both cases. Keeping the money is
   * not, so each refusal now compensates.
   */
  async confirmPayment(session: Stripe.Checkout.Session): Promise<void> {
    if (session.payment_status !== 'paid') {
      return;
    }

    // Stripe retries webhooks; `stripeSessionId` is uniquely indexed, so an
    // already-fulfilled session is a no-op rather than a second order.
    const existing = await this.purchaseModel.exists({
      stripeSessionId: session.id,
    });
    if (existing) {
      return;
    }

    const { cookbookId, buyerId, receiptEmail, billingAddress } =
      session.metadata as Record<string, string>;

    if ((await this.countPurchasesToday(buyerId)) >= DAILY_PURCHASE_LIMIT) {
      await this.refundUnfulfillable(
        session,
        `buyer ${buyerId} is over the ${DAILY_PURCHASE_LIMIT}/day purchase limit`,
      );
      return;
    }

    // Conditional decrement: two webhooks racing for the last copy cannot
    // both win, because the `$gt: 0` is evaluated with the write.
    const cookbook = await this.cookbookModel.findOneAndUpdate(
      { _id: cookbookId, stockCount: { $gt: 0 } },
      { $inc: { stockCount: -1 } },
      { new: true },
    );

    if (!cookbook) {
      await this.refundUnfulfillable(
        session,
        `cookbook ${cookbookId} went out of stock before fulfillment`,
      );
      return;
    }

    try {
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
    } catch (err) {
      // The stock is already spent at this point. Put it back before
      // bailing out, or a failed write permanently destroys a copy.
      await this.cookbookModel.updateOne(
        { _id: cookbook._id },
        { $inc: { stockCount: 1 } },
      );
      this.logger.error(
        `Failed to record purchase for session ${session.id}; stock restored`,
        err,
      );
      await this.refundUnfulfillable(session, 'order could not be recorded');
      return;
    }

    // Best effort — the order exists whether or not the receipt lands.
    try {
      await this.mailService.sendPurchaseReceipt(receiptEmail, {
        cookbookTitle: cookbook.title,
        cookbookImage: cookbook.cookbook_image,
        price: cookbook.price,
        purchaseDate: new Date(),
      });
    } catch (err) {
      this.logger.error(
        'Purchase receipt email failed for session ' + session.id,
        err,
      );
    }
  }

  private async refundUnfulfillable(
    session: Stripe.Checkout.Session,
    reason: string,
  ): Promise<void> {
    this.logger.warn(`Refunding session ${session.id}: ${reason}`);
    await this.stripe.refundSession(session);
  }
}
