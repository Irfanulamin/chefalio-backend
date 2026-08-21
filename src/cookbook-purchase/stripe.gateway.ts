import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * The one place a Stripe client is constructed.
 *
 * There used to be two — CookbookPurchaseService built one pinned to
 * apiVersion '2026-02-25.clover' for checkout, and CookbookPurchaseController
 * built a second, unpinned one purely to verify webhook signatures. Two
 * clients on two API versions handling two halves of the same conversation.
 *
 * Collapsing them also gives the purchase flow a seam it did not have: the
 * service now depends on this interface rather than on Stripe's SDK, so
 * confirmPayment can be exercised against a stub instead of the network.
 */
@Injectable()
export class StripeGateway {
  private readonly logger = new Logger(StripeGateway.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-02-25.clover',
    });
    this.webhookSecret = this.config.getOrThrow('STRIPE_WEBHOOK_SECRET');
  }

  /** Where Stripe sends the buyer back to. */
  private get origin(): string {
    return (
      this.config.get<string>('ALLOWED_ORIGIN') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:3000'
    );
  }

  async createCheckoutSession(params: {
    title: string;
    image: string;
    /** Major units (dollars); converted to cents here. */
    price: number;
    receiptEmail: string;
    metadata: Record<string, string>;
  }): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: params.receiptEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: params.title,
              images: [params.image],
            },
            unit_amount: Math.round(params.price * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${this.origin}/payment-success`,
      cancel_url: `${this.origin}/payment-cancel`,
      metadata: params.metadata,
    });
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }

  /**
   * Give a settled payment back.
   *
   * Used when a session has been paid for but cannot be fulfilled — the
   * buyer tripped the daily cap in a race, or the last copy sold between
   * checkout and the webhook. Both of those paths previously just returned,
   * keeping the money and shipping nothing.
   *
   * Reports success rather than throwing: the caller is a webhook handler
   * whose own failure would make Stripe retry the whole fulfillment, and a
   * failed refund needs a human, not a retry loop.
   */
  async refundSession(session: Stripe.Checkout.Session): Promise<boolean> {
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

    if (!paymentIntentId) {
      this.logger.error(
        `Cannot refund session ${session.id}: no payment_intent on the session`,
      );
      return false;
    }

    try {
      await this.stripe.refunds.create({ payment_intent: paymentIntentId });
      this.logger.log(`Refunded session ${session.id} (${paymentIntentId})`);
      return true;
    } catch (err) {
      this.logger.error(
        `Refund FAILED for session ${session.id} (${paymentIntentId}) — ` +
          `this buyer has been charged for an order that will not be fulfilled ` +
          `and needs a manual refund`,
        err,
      );
      return false;
    }
  }
}
