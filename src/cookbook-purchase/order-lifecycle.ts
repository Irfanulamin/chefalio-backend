/**
 * The purchase lifecycle: which statuses exist, which transitions are legal,
 * what each one compensates, and how the money splits.
 *
 * This used to live as string literals scattered through
 * CookbookPurchaseService — `['paid', 'shipped', 'delivered']` appeared in
 * eight aggregations, the revenue split was multiplied inline in three
 * methods, and the fact that a refund owes the cookbook its stock back was
 * written down nowhere, so it never happened.
 *
 * Deliberately free of Nest and Mongoose: every rule here is a pure function
 * over plain values, so it is tested directly rather than through a service
 * with a database behind it.
 */

export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refunded',
  'shipped',
  'delivered',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * The statuses that count as revenue.
 *
 * `paid` and everything downstream of it: the money has settled, and
 * shipping or delivering an order does not earn it a second time. `pending`
 * has not settled, `failed` never will, and `refunded` has been given back.
 */
export const EARNED_STATUSES: readonly PaymentStatus[] = [
  'paid',
  'shipped',
  'delivered',
];

/** Mongo match fragment for "this order counts as revenue". */
export function earnedStatusMatch() {
  return { $in: [...EARNED_STATUSES] };
}

export const CHEF_PROFIT_RATE = 0.8;
export const ADMIN_PROFIT_RATE = 0.2;

/** At most this many cookbooks per buyer per UTC day. */
export const DAILY_PURCHASE_LIMIT = 5;

/**
 * Legal transitions, and the stock each one owes back.
 *
 * Stock is decremented once, at fulfillment, when the purchase row is
 * created. `refunded` is the only transition that returns it — which is the
 * rule that did not exist before: `refunded` was reachable in the schema
 * enum, and reaching it permanently consumed a copy of the cookbook.
 */
const TRANSITIONS: Record<
  PaymentStatus,
  Partial<Record<PaymentStatus, { stockDelta: number }>>
> = {
  pending: {
    paid: { stockDelta: 0 },
    failed: { stockDelta: 0 },
  },
  paid: {
    shipped: { stockDelta: 0 },
    refunded: { stockDelta: 1 },
  },
  shipped: {
    delivered: { stockDelta: 0 },
    refunded: { stockDelta: 1 },
  },
  delivered: {
    refunded: { stockDelta: 1 },
  },
  // Terminal.
  failed: {},
  refunded: {},
};

export type TransitionResult =
  | { ok: true; stockDelta: number }
  | { ok: false; reason: string };

/**
 * Whether an order may move from `from` to `to`, and what that owes.
 *
 * Before this existed, `updatePaymentStatus` wrote whatever status the
 * request carried: a `pending` order could be marked `delivered` without
 * ever being paid, and a `delivered` one could be walked back to `shipped`.
 * The DTO constrained the *value*; nothing constrained the *transition*.
 */
export function planTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): TransitionResult {
  if (from === to) {
    return { ok: false, reason: `Order is already "${from}"` };
  }

  const allowed = TRANSITIONS[from]?.[to];
  if (!allowed) {
    return {
      ok: false,
      reason: `Cannot move an order from "${from}" to "${to}"`,
    };
  }

  return { ok: true, stockDelta: allowed.stockDelta };
}

/**
 * Round to cents.
 *
 * Kept as `parseFloat(toFixed(2))` rather than `Math.round(n * 100) / 100`
 * because that is exactly what the seven scattered call sites this replaces
 * were doing, and money that changes value during a refactor is a bug.
 */
export function roundMoney(amount: number): number {
  return parseFloat(amount.toFixed(2));
}

export function chefProfit(revenue: number): number {
  return roundMoney(revenue * CHEF_PROFIT_RATE);
}

export function adminProfit(revenue: number): number {
  return roundMoney(revenue * ADMIN_PROFIT_RATE);
}

export function rateLabel(rate: number): string {
  return `${rate * 100}%`;
}

/**
 * Midnight UTC today — the boundary the daily purchase cap counts from.
 *
 * Note this is UTC while the analytics period windows in PeriodWindow are
 * local-time. That difference is pre-existing and preserved deliberately:
 * the caps are abuse limits that should not move with the server's timezone,
 * the dashboards are read by a chef who expects "today" to mean their today.
 */
export function startOfUTCDay(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
