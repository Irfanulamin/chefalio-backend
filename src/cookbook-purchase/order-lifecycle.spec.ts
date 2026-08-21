import {
  ADMIN_PROFIT_RATE,
  CHEF_PROFIT_RATE,
  DAILY_PURCHASE_LIMIT,
  EARNED_STATUSES,
  PAYMENT_STATUSES,
  PaymentStatus,
  adminProfit,
  chefProfit,
  earnedStatusMatch,
  planTransition,
  rateLabel,
  roundMoney,
  startOfUTCDay,
} from './order-lifecycle';

describe('order lifecycle — which statuses earn', () => {
  it('counts paid, shipped and delivered as revenue', () => {
    expect([...EARNED_STATUSES].sort()).toEqual([
      'delivered',
      'paid',
      'shipped',
    ]);
  });

  it.each(['pending', 'failed', 'refunded'] as PaymentStatus[])(
    'does not count %s as revenue',
    (status) => {
      expect(EARNED_STATUSES).not.toContain(status);
    },
  );

  it('builds a mongo match fragment over exactly those statuses', () => {
    expect(earnedStatusMatch()).toEqual({
      $in: ['paid', 'shipped', 'delivered'],
    });
  });

  it('hands out a fresh array so a caller cannot mutate the rule', () => {
    const fragment = earnedStatusMatch();
    fragment.$in.push('pending');
    expect(earnedStatusMatch().$in).not.toContain('pending');
  });
});

describe('order lifecycle — transitions', () => {
  it('lets a paid order ship, and a shipped order be delivered', () => {
    expect(planTransition('paid', 'shipped')).toEqual({
      ok: true,
      stockDelta: 0,
    });
    expect(planTransition('shipped', 'delivered')).toEqual({
      ok: true,
      stockDelta: 0,
    });
  });

  it('refuses to deliver an order that was never paid', () => {
    const result = planTransition('pending', 'delivered');
    expect(result.ok).toBe(false);
  });

  it('refuses to walk a delivered order back to shipped', () => {
    expect(planTransition('delivered', 'shipped').ok).toBe(false);
  });

  it('refuses a no-op transition', () => {
    const result = planTransition('paid', 'paid');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('already');
  });

  it.each(['failed', 'refunded'] as PaymentStatus[])(
    'treats %s as terminal',
    (terminal) => {
      for (const to of PAYMENT_STATUSES) {
        expect(planTransition(terminal, to).ok).toBe(false);
      }
    },
  );

  describe('refunds return the stock the order consumed', () => {
    it.each(['paid', 'shipped', 'delivered'] as PaymentStatus[])(
      'refunding a %s order restores one copy',
      (from) => {
        const result = planTransition(from, 'refunded');
        expect(result).toEqual({ ok: true, stockDelta: 1 });
      },
    );

    it('is the only transition that moves stock', () => {
      const moving: string[] = [];
      for (const from of PAYMENT_STATUSES) {
        for (const to of PAYMENT_STATUSES) {
          const result = planTransition(from, to);
          if (result.ok && result.stockDelta !== 0) {
            moving.push(`${from}->${to}`);
          }
        }
      }
      expect(moving.sort()).toEqual([
        'delivered->refunded',
        'paid->refunded',
        'shipped->refunded',
      ]);
    });
  });

  it('never reports a legal transition without a stock decision', () => {
    for (const from of PAYMENT_STATUSES) {
      for (const to of PAYMENT_STATUSES) {
        const result = planTransition(from, to);
        if (result.ok) expect(typeof result.stockDelta).toBe('number');
      }
    }
  });
});

describe('order lifecycle — money', () => {
  it('rounds to cents', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(19.999)).toBe(20);
    expect(roundMoney(0)).toBe(0);
  });

  it('rounds identically to the parseFloat(toFixed(2)) it replaced', () => {
    for (const n of [0, 0.1, 1.005, 12.345, 99.994, 99.995, 1234.567]) {
      expect(roundMoney(n)).toBe(parseFloat(n.toFixed(2)));
    }
  });

  it('splits revenue 80/20 between chef and platform', () => {
    expect(CHEF_PROFIT_RATE + ADMIN_PROFIT_RATE).toBe(1);
    expect(chefProfit(100)).toBe(80);
    expect(adminProfit(100)).toBe(20);
  });

  it('returns rounded currency, not a floating point tail', () => {
    // 0.1 * 3 * 0.8 is 0.24000000000000005 in IEEE 754.
    expect(chefProfit(0.30000000000000004)).toBe(0.24);
    expect(chefProfit(19.99)).toBe(15.99);
  });

  it('labels the rates as percentages', () => {
    expect(rateLabel(CHEF_PROFIT_RATE)).toBe('80%');
    expect(rateLabel(ADMIN_PROFIT_RATE)).toBe('20%');
  });
});

describe('order lifecycle — the daily cap boundary', () => {
  it('caps buyers at five cookbooks a day', () => {
    expect(DAILY_PURCHASE_LIMIT).toBe(5);
  });

  it('snaps to midnight UTC, not to the server timezone', () => {
    const start = startOfUTCDay(new Date('2026-08-21T23:45:00.000Z'));
    expect(start.toISOString()).toBe('2026-08-21T00:00:00.000Z');
  });

  it('puts a moment just after UTC midnight in the new day', () => {
    const start = startOfUTCDay(new Date('2026-08-21T00:00:01.000Z'));
    expect(start.toISOString()).toBe('2026-08-21T00:00:00.000Z');
  });

  it('does not mutate the date it was given', () => {
    const now = new Date('2026-08-21T13:22:00.000Z');
    startOfUTCDay(now);
    expect(now.toISOString()).toBe('2026-08-21T13:22:00.000Z');
  });
});
