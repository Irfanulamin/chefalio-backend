import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import Stripe from 'stripe';
import { CookbookPurchaseService } from './cookbook-purchase.service';
import { StripeGateway } from './stripe.gateway';
import { MailService } from '../services/mail.service';

/**
 * These exercise the fulfillment path, which is where the money is.
 *
 * The models and the Stripe gateway are stubbed rather than mocked wholesale:
 * the point is to assert what the service *does* when a paid session cannot be
 * turned into an order, and every one of those branches used to end in a bare
 * `return` that kept the buyer's money.
 */

const COOKBOOK_ID = new Types.ObjectId().toString();
const BUYER_ID = new Types.ObjectId().toString();
const CHEF_ID = new Types.ObjectId();

function paidSession(
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    payment_status: 'paid',
    payment_intent: 'pi_test_123',
    metadata: {
      cookbookId: COOKBOOK_ID,
      buyerId: BUYER_ID,
      receiptEmail: 'buyer@example.com',
      billingAddress: JSON.stringify({ name: 'A Buyer', city: 'Dhaka' }),
    },
    ...overrides,
  } as Stripe.Checkout.Session;
}

/** Only the model methods the purchase flow actually reaches. */
interface CookbookModelStub {
  findById: jest.Mock;
  findOneAndUpdate: jest.Mock;
  updateOne: jest.Mock;
  countDocuments: jest.Mock;
  aggregate: jest.Mock;
}

interface PurchaseModelStub {
  exists: jest.Mock;
  countDocuments: jest.Mock;
  create: jest.Mock;
  findById: jest.Mock;
  find: jest.Mock;
  aggregate: jest.Mock;
}

interface StripeStub {
  refundSession: jest.Mock;
  createCheckoutSession: jest.Mock;
}

/** The document shape confirmPayment writes, as far as these tests inspect it. */
interface RecordedOrder {
  paymentStatus: string;
  chefId: Types.ObjectId;
  price: number;
  stripeSessionId: string;
}

interface Harness {
  service: CookbookPurchaseService;
  stripe: StripeStub;
  cookbookModel: CookbookModelStub;
  purchaseModel: PurchaseModelStub;
  stockInc: jest.Mock;
  /** Orders that were actually written — a `create` that threw is not one. */
  recorded: RecordedOrder[];
}

function harness(
  options: {
    purchasesToday?: number;
    /** null simulates the conditional decrement losing the last copy. */
    stockClaim?: unknown;
    createThrows?: boolean;
    mailThrows?: boolean;
  } = {},
): Harness {
  const {
    purchasesToday = 0,
    stockClaim = {
      _id: COOKBOOK_ID,
      authorId: CHEF_ID,
      title: 'Ottolenghi Simple',
      cookbook_image: 'https://example.invalid/cover.jpg',
      price: 19.99,
    },
    createThrows = false,
    mailThrows = false,
  } = options;

  const stockInc = jest.fn().mockResolvedValue({ modifiedCount: 1 });

  const cookbookModel: CookbookModelStub = {
    findById: jest.fn().mockResolvedValue(stockClaim),
    findOneAndUpdate: jest.fn().mockResolvedValue(stockClaim),
    updateOne: stockInc,
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue([]),
  };

  const recorded: RecordedOrder[] = [];

  const purchaseModel: PurchaseModelStub = {
    exists: jest.fn().mockResolvedValue(null),
    countDocuments: jest.fn().mockResolvedValue(purchasesToday),
    create: jest.fn().mockImplementation((doc: RecordedOrder) => {
      if (createThrows) return Promise.reject(new Error('duplicate key'));
      recorded.push(doc);
      return Promise.resolve({ _id: new Types.ObjectId() });
    }),
    findById: jest.fn(),
    find: jest.fn(),
    aggregate: jest.fn().mockResolvedValue([]),
  };

  const stripe: StripeStub = {
    refundSession: jest.fn().mockResolvedValue(true),
    createCheckoutSession: jest
      .fn()
      .mockResolvedValue({ id: 'cs_test_123', url: 'https://checkout/x' }),
  };

  const mail = {
    sendPurchaseReceipt: mailThrows
      ? jest.fn().mockRejectedValue(new Error('smtp down'))
      : jest.fn().mockResolvedValue(undefined),
  };

  const service = new CookbookPurchaseService(
    cookbookModel as any,
    purchaseModel as any,
    mail as unknown as MailService,
    stripe as unknown as StripeGateway,
  );

  return { service, stripe, cookbookModel, purchaseModel, stockInc, recorded };
}

describe('confirmPayment — a session that can be fulfilled', () => {
  it('records the order and decrements stock exactly once', async () => {
    const h = harness();
    await h.service.confirmPayment(paidSession());

    expect(h.cookbookModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(h.cookbookModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: COOKBOOK_ID, stockCount: { $gt: 0 } },
      { $inc: { stockCount: -1 } },
      { new: true },
    );
    expect(h.purchaseModel.create).toHaveBeenCalledTimes(1);
  });

  it('records the order as paid, against the right chef and price', async () => {
    const h = harness();
    await h.service.confirmPayment(paidSession());

    const written = h.recorded[0];
    expect(written.paymentStatus).toBe('paid');
    expect(written.chefId.toString()).toBe(CHEF_ID.toString());
    expect(written.price).toBe(19.99);
    expect(written.stripeSessionId).toBe('cs_test_123');
  });

  it('does not refund a fulfilled order', async () => {
    const h = harness();
    await h.service.confirmPayment(paidSession());
    expect(h.stripe.refundSession).not.toHaveBeenCalled();
  });

  it('still records the order when the receipt email fails', async () => {
    const h = harness({ mailThrows: true });

    await expect(
      h.service.confirmPayment(paidSession()),
    ).resolves.toBeUndefined();
    expect(h.recorded).toHaveLength(1);
    expect(h.stripe.refundSession).not.toHaveBeenCalled();
  });
});

describe('confirmPayment — sessions that must not be fulfilled', () => {
  it('ignores a session that was never paid', async () => {
    const h = harness();
    await h.service.confirmPayment(
      paidSession({ payment_status: 'unpaid' } as any),
    );

    expect(h.purchaseModel.create).not.toHaveBeenCalled();
    expect(h.stripe.refundSession).not.toHaveBeenCalled();
  });

  it('is idempotent — a replayed webhook creates no second order', async () => {
    const h = harness();
    h.purchaseModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    await h.service.confirmPayment(paidSession());

    expect(h.purchaseModel.create).not.toHaveBeenCalled();
    expect(h.cookbookModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does not refund a replay — the first delivery was fulfilled', async () => {
    const h = harness();
    h.purchaseModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    await h.service.confirmPayment(paidSession());

    expect(h.stripe.refundSession).not.toHaveBeenCalled();
  });

  describe('when the buyer is over the daily cap', () => {
    it('creates no order', async () => {
      const h = harness({ purchasesToday: 5 });
      await h.service.confirmPayment(paidSession());
      expect(h.purchaseModel.create).not.toHaveBeenCalled();
    });

    it('refunds instead of keeping the money', async () => {
      const h = harness({ purchasesToday: 5 });
      await h.service.confirmPayment(paidSession());
      expect(h.stripe.refundSession).toHaveBeenCalledTimes(1);
    });

    it('does not consume stock it will not ship', async () => {
      const h = harness({ purchasesToday: 5 });
      await h.service.confirmPayment(paidSession());
      expect(h.cookbookModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('when the last copy sold before the webhook arrived', () => {
    it('creates no order', async () => {
      const h = harness({ stockClaim: null });
      await h.service.confirmPayment(paidSession());
      expect(h.purchaseModel.create).not.toHaveBeenCalled();
    });

    it('refunds instead of keeping the money', async () => {
      const h = harness({ stockClaim: null });
      await h.service.confirmPayment(paidSession());
      expect(h.stripe.refundSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the order cannot be written', () => {
    it('puts the stock it claimed back', async () => {
      const h = harness({ createThrows: true });
      await h.service.confirmPayment(paidSession());

      expect(h.stockInc).toHaveBeenCalledWith(
        { _id: COOKBOOK_ID },
        { $inc: { stockCount: 1 } },
      );
    });

    it('refunds instead of keeping the money', async () => {
      const h = harness({ createThrows: true });
      await h.service.confirmPayment(paidSession());
      expect(h.stripe.refundSession).toHaveBeenCalledTimes(1);
    });

    it('does not let the write failure escape into the webhook', async () => {
      const h = harness({ createThrows: true });
      await expect(
        h.service.confirmPayment(paidSession()),
      ).resolves.toBeUndefined();
    });
  });

  it('never both records an order and refunds it', async () => {
    for (const options of [
      {},
      { purchasesToday: 5 },
      { stockClaim: null },
      { createThrows: true },
    ]) {
      const h = harness(options);
      await h.service.confirmPayment(paidSession());

      const wasRecorded = h.recorded.length > 0;
      const wasRefunded = h.stripe.refundSession.mock.calls.length > 0;
      expect(wasRecorded && wasRefunded).toBe(false);

      // And exactly one of the two must have happened: a paid session is
      // either turned into an order or given back, never neither.
      expect(wasRecorded || wasRefunded).toBe(true);
    }
  });
});

describe('createCheckoutSession — the cap is enforced before charging', () => {
  it('refuses a buyer already at the daily cap', async () => {
    const h = harness({ purchasesToday: 5 });

    await expect(
      h.service.createCheckoutSession(BUYER_ID, {
        cookbookId: COOKBOOK_ID,
        receiptEmail: 'buyer@example.com',
        billingAddress: {} as any,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(h.stripe.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('refuses a chef buying their own cookbook', async () => {
    const h = harness();
    await expect(
      h.service.createCheckoutSession(CHEF_ID.toString(), {
        cookbookId: COOKBOOK_ID,
        receiptEmail: 'chef@example.com',
        billingAddress: {} as any,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('updatePaymentStatus — transitions are checked, not just values', () => {
  function purchaseHarness(currentStatus: string) {
    const h = harness();
    const save = jest.fn().mockResolvedValue(undefined);
    h.purchaseModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(),
      cookbookId: COOKBOOK_ID,
      paymentStatus: currentStatus,
      save,
    });
    return { ...h, save };
  }

  it('lets the owning chef ship a paid order', async () => {
    const h = purchaseHarness('paid');
    await h.service.updatePaymentStatus(CHEF_ID.toString(), 'p1', 'shipped');
    expect(h.save).toHaveBeenCalled();
  });

  it('rejects delivering an order that was never paid', async () => {
    const h = purchaseHarness('pending');
    await expect(
      h.service.updatePaymentStatus(CHEF_ID.toString(), 'p1', 'delivered'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.save).not.toHaveBeenCalled();
  });

  it('rejects a chef touching another chef’s order', async () => {
    const h = purchaseHarness('paid');
    await expect(
      h.service.updatePaymentStatus(
        new Types.ObjectId().toString(),
        'p1',
        'shipped',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('restores stock when an order is refunded', async () => {
    const h = purchaseHarness('delivered');
    await h.service.updatePaymentStatus(CHEF_ID.toString(), 'p1', 'refunded');

    expect(h.stockInc).toHaveBeenCalledWith(
      { _id: COOKBOOK_ID },
      { $inc: { stockCount: 1 } },
    );
  });

  it('does not touch stock on a plain shipping update', async () => {
    const h = purchaseHarness('paid');
    await h.service.updatePaymentStatus(CHEF_ID.toString(), 'p1', 'shipped');
    expect(h.stockInc).not.toHaveBeenCalled();
  });
});
