/**
 * The `daily | weekly | monthly | lifetime` window every dashboard filters by.
 *
 * The same switch statement was written twice — once in
 * CookbookPurchaseService.getChefEarningsAnalytics and once in
 * RecipeInteractionService.getChefAnalytics — with the same off-by-one-looking
 * arithmetic (`-6` days for a week, `-29` for a month, both inclusive of
 * today) and the same unstated choice of local-time day boundaries.
 *
 * Local time is preserved here rather than corrected to UTC: the windows feed
 * chef-facing dashboards where "today" means the reader's today. The daily
 * *caps* in order-lifecycle deliberately use UTC instead, since those are
 * abuse limits that should not shift with the server's timezone.
 */

export const PERIODS = ['daily', 'weekly', 'monthly', 'lifetime'] as const;
export type Period = (typeof PERIODS)[number];

export function isPeriod(value: string): value is Period {
  return (PERIODS as readonly string[]).includes(value);
}

export interface PeriodWindow {
  period: Period;
  /** Undefined for `lifetime` — no lower bound. */
  from?: Date;
  /** `$dateToString` format for grouping results within the window. */
  groupFormat: string;
}

const DAY = '%Y-%m-%d';
const HOUR = '%H:00';

/** Unrecognised input falls back to `lifetime`, matching the old `switch`. */
export function resolvePeriod(
  period: string = 'lifetime',
  now: Date = new Date(),
): PeriodWindow {
  switch (period) {
    case 'daily':
      return {
        period: 'daily',
        from: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        groupFormat: HOUR,
      };

    case 'weekly':
      return { period: 'weekly', from: daysAgo(now, 6), groupFormat: DAY };

    case 'monthly':
      return { period: 'monthly', from: daysAgo(now, 29), groupFormat: DAY };

    default:
      return { period: 'lifetime', groupFormat: DAY };
  }
}

/** `n` days back, snapped to local midnight — so the window includes today. */
function daysAgo(now: Date, n: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Mongo match fragment for the window, empty when there is no lower bound. */
export function createdAtMatch(window: PeriodWindow) {
  return window.from ? { createdAt: { $gte: window.from } } : {};
}
