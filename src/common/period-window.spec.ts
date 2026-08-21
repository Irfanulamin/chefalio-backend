import { createdAtMatch, isPeriod, resolvePeriod } from './period-window';

/**
 * The reference point for every case below. Chosen mid-afternoon local time
 * so a window that snapped to "now" instead of to midnight would show up.
 */
const NOW = new Date(2026, 7, 21, 15, 30, 0); // 21 Aug 2026, local

describe('resolvePeriod', () => {
  it('gives lifetime no lower bound', () => {
    const window = resolvePeriod('lifetime', NOW);
    expect(window.from).toBeUndefined();
    expect(window.period).toBe('lifetime');
  });

  it('defaults to lifetime, and falls back to it for junk input', () => {
    expect(resolvePeriod(undefined, NOW).period).toBe('lifetime');
    expect(resolvePeriod('yearly', NOW).period).toBe('lifetime');
    expect(resolvePeriod('', NOW).period).toBe('lifetime');
  });

  it('starts the daily window at local midnight today', () => {
    const { from } = resolvePeriod('daily', NOW);
    expect(from).toEqual(new Date(2026, 7, 21, 0, 0, 0, 0));
  });

  it('groups the daily window by hour, every other window by day', () => {
    expect(resolvePeriod('daily', NOW).groupFormat).toBe('%H:00');
    for (const p of ['weekly', 'monthly', 'lifetime']) {
      expect(resolvePeriod(p, NOW).groupFormat).toBe('%Y-%m-%d');
    }
  });

  it('makes the weekly window seven days inclusive of today', () => {
    const { from } = resolvePeriod('weekly', NOW);
    expect(from).toEqual(new Date(2026, 7, 15, 0, 0, 0, 0));
  });

  it('makes the monthly window thirty days inclusive of today', () => {
    const { from } = resolvePeriod('monthly', NOW);
    expect(from).toEqual(new Date(2026, 6, 23, 0, 0, 0, 0));
  });

  it('snaps to midnight rather than to the current time', () => {
    for (const p of ['daily', 'weekly', 'monthly']) {
      const { from } = resolvePeriod(p, NOW);
      expect(from!.getHours()).toBe(0);
      expect(from!.getMinutes()).toBe(0);
      expect(from!.getSeconds()).toBe(0);
      expect(from!.getMilliseconds()).toBe(0);
    }
  });

  it('crosses a month boundary correctly', () => {
    const firstOfMarch = new Date(2026, 2, 1, 9, 0, 0);
    expect(resolvePeriod('weekly', firstOfMarch).from).toEqual(
      new Date(2026, 1, 23, 0, 0, 0, 0),
    );
  });

  it('does not mutate the date it was given', () => {
    const now = new Date(2026, 7, 21, 15, 30, 0);
    resolvePeriod('monthly', now);
    expect(now).toEqual(new Date(2026, 7, 21, 15, 30, 0));
  });

  it('orders the windows from narrowest to widest', () => {
    const daily = resolvePeriod('daily', NOW).from!;
    const weekly = resolvePeriod('weekly', NOW).from!;
    const monthly = resolvePeriod('monthly', NOW).from!;

    expect(daily.getTime()).toBeGreaterThan(weekly.getTime());
    expect(weekly.getTime()).toBeGreaterThan(monthly.getTime());
  });
});

describe('createdAtMatch', () => {
  it('is empty for a window with no lower bound', () => {
    expect(createdAtMatch(resolvePeriod('lifetime', NOW))).toEqual({});
  });

  it('bounds createdAt for every other window', () => {
    const window = resolvePeriod('weekly', NOW);
    expect(createdAtMatch(window)).toEqual({
      createdAt: { $gte: window.from },
    });
  });

  it('spreads into a match object without adding keys', () => {
    const match = {
      chefId: 'abc',
      ...createdAtMatch(resolvePeriod('lifetime', NOW)),
    };
    expect(Object.keys(match)).toEqual(['chefId']);
  });
});

describe('isPeriod', () => {
  it('accepts the four supported windows', () => {
    for (const p of ['daily', 'weekly', 'monthly', 'lifetime']) {
      expect(isPeriod(p)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const p of ['yearly', 'DAILY', '', 'all-time']) {
      expect(isPeriod(p)).toBe(false);
    }
  });
});
