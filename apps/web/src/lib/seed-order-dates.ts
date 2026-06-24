/** One-month seed window ends one week before today. */
export const SEED_PERIOD_DAYS = 30;
export const SEED_END_DAYS_AGO = 7;
export const SEED_START_DAYS_AGO = SEED_END_DAYS_AGO + SEED_PERIOD_DAYS;

/** Bill PDF/PNG files use dates within the last 7 days only. */
export const BILL_PERIOD_DAYS = 7;
export const BILL_MAX_DAYS_AGO = BILL_PERIOD_DAYS - 1;

export const FINANCE_WEEK_PERIOD_COUNT = Math.ceil(SEED_START_DAYS_AGO / 7);
export const FINANCE_MONTH_PERIOD_COUNT = 2;

type SeedOrderDateInput = {
  date?: string;
  daysAgo?: number;
  seedDay?: number;
  billDay?: number;
};

function clampDay(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function resolveSeedOrderDate(order: SeedOrderDateInput, now = new Date()): Date {
  const anchor = new Date(now);
  anchor.setHours(12, 0, 0, 0);

  if (typeof order.seedDay === "number" && Number.isFinite(order.seedDay)) {
    const seedDay = clampDay(order.seedDay, 0, SEED_PERIOD_DAYS);
    const daysAgo = SEED_END_DAYS_AGO + (SEED_PERIOD_DAYS - seedDay);
    const resolved = new Date(anchor);
    resolved.setDate(resolved.getDate() - daysAgo);
    return resolved;
  }

  if (typeof order.daysAgo === "number" && Number.isFinite(order.daysAgo)) {
    const resolved = new Date(anchor);
    resolved.setDate(resolved.getDate() - Math.max(0, Math.round(order.daysAgo)));
    return resolved;
  }

  if (order.date) {
    const parsed = new Date(order.date);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setHours(12, 0, 0, 0);
      return parsed;
    }
  }

  return anchor;
}

export function resolveBillOrderDate(order: SeedOrderDateInput, now = new Date()): Date {
  const anchor = new Date(now);
  anchor.setHours(12, 0, 0, 0);

  if (typeof order.billDay === "number" && Number.isFinite(order.billDay)) {
    const daysAgo = clampDay(order.billDay, 0, BILL_MAX_DAYS_AGO);
    const resolved = new Date(anchor);
    resolved.setDate(resolved.getDate() - daysAgo);
    return resolved;
  }

  if (typeof order.daysAgo === "number" && Number.isFinite(order.daysAgo)) {
    const daysAgo = clampDay(order.daysAgo, 0, BILL_MAX_DAYS_AGO);
    const resolved = new Date(anchor);
    resolved.setDate(resolved.getDate() - daysAgo);
    return resolved;
  }

  return anchor;
}

export function formatSeedOrderDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
