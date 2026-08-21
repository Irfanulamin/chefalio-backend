import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { CookbookPurchaseModule } from './cookbook-purchase.module';
import { CookbookPurchaseController } from './cookbook-purchase.controller';
import { CookbookPurchaseService } from './cookbook-purchase.service';
import { StripeGateway } from './stripe.gateway';
import { EarningsAnalyticsService } from './earnings-analytics.service';
import { Cookbook } from '../cookbook/schemas/cookbook.schema';
import { CookbookPurchase } from './schemas/cookbook-purchase.schemas';
import { MailService } from '../services/mail.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';

/**
 * Wiring, not behaviour.
 *
 * The service and the controller both used to construct their own `Stripe`
 * client straight from config — so nothing failed at wire-up time and the
 * duplication was invisible until you read both files. Now that Stripe sits
 * behind one provider, a missing registration is a startup failure, and this
 * is the test that catches it before a deploy does.
 */
describe('CookbookPurchaseModule wiring', () => {
  const env: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_wiring',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_wiring',
    RESEND_API_KEY: 're_test_wiring',
    ALLOWED_ORIGIN: 'https://chefalio.test',
  };

  async function compile() {
    return (
      Test.createTestingModule({ imports: [CookbookPurchaseModule] })
        // Auth is not what this test is about. AuthGuard and RolesGuard resolve
        // JwtService from the JwtModule that AppModule registers globally, which
        // is not in scope when this module is compiled on its own.
        .overrideGuard(AuthGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .overrideProvider(ConfigService)
        .useValue({
          get: (k: string) => env[k],
          getOrThrow: (k: string) => {
            if (!env[k]) throw new Error(`missing ${k}`);
            return env[k];
          },
        })
        .overrideProvider(getModelToken(Cookbook.name))
        .useValue({})
        .overrideProvider(getModelToken(CookbookPurchase.name))
        .useValue({})
        .compile()
    );
  }

  it('resolves the controller, the service and the Stripe gateway', async () => {
    const moduleRef = await compile();

    expect(moduleRef.get(CookbookPurchaseController)).toBeInstanceOf(
      CookbookPurchaseController,
    );
    expect(moduleRef.get(CookbookPurchaseService)).toBeInstanceOf(
      CookbookPurchaseService,
    );
    expect(moduleRef.get(StripeGateway)).toBeInstanceOf(StripeGateway);
    expect(moduleRef.get(MailService)).toBeInstanceOf(MailService);
  });

  it('shares one Stripe gateway between the controller and the service', async () => {
    const moduleRef = await compile();
    const gateway = moduleRef.get(StripeGateway);

    // Both halves of the Stripe conversation — creating the checkout session
    // and verifying the webhook signature — go through the same client.
    expect(moduleRef.get(StripeGateway)).toBe(gateway);
  });

  it('exposes the gateway operations the purchase flow depends on', () => {
    for (const method of [
      'createCheckoutSession',
      'constructWebhookEvent',
      'refundSession',
    ]) {
      expect(typeof (StripeGateway.prototype as any)[method]).toBe('function');
    }
  });
});

/**
 * Analytics used to live inside CookbookPurchaseService, which meant the class
 * that moves money was also the class that renders dashboards — 265 of its 567
 * lines were read-only aggregation. Splitting them apart is only real if the
 * methods actually left, so this asserts both halves.
 */
describe('earnings analytics is its own service', () => {
  const READ_ONLY = [
    'getChefEarningsAnalytics',
    'getChefDashboardEarnings',
    'getAdminEarningsAnalytics',
    'getAdminTopChefs',
  ];

  it('owns every earnings dashboard method', () => {
    for (const m of READ_ONLY) {
      expect(typeof (EarningsAnalyticsService.prototype as any)[m]).toBe(
        'function',
      );
    }
  });

  it('leaves none of them behind on the purchase service', () => {
    for (const m of READ_ONLY) {
      expect((CookbookPurchaseService.prototype as any)[m]).toBeUndefined();
    }
  });

  it('keeps the money-moving methods on the purchase service', () => {
    for (const m of [
      'createCheckoutSession',
      'confirmPayment',
      'updatePaymentStatus',
    ]) {
      expect(typeof (CookbookPurchaseService.prototype as any)[m]).toBe(
        'function',
      );
    }
  });
});
