// Everything here is derived from log records. Nothing is stored, so counts
// cannot drift and two people logging offline both count once they sync.
import { addDays, daysBetween, inRange, lastNDays } from './dates';
import type {
  Day,
  EggLog,
  Expense,
  FarmRecords,
  FeedPurchase,
  FeedUsage,
  Flock,
  MortalityLog,
  Payment,
  Sale,
} from './types';

const alive = <T extends { deleted_at: string | null }>(rows: T[]): T[] => rows.filter((r) => !r.deleted_at);
const sum = <T>(rows: T[], pick: (r: T) => number): number => rows.reduce((total, r) => total + pick(r), 0);

export function birdsAlive(
  flock: Pick<Flock, 'id' | 'quantity'>,
  mortality: MortalityLog[],
  sales: Pick<Sale, 'flock_id' | 'category' | 'quantity' | 'deleted_at'>[],
): number {
  const dead = sum(alive(mortality).filter((m) => m.flock_id === flock.id), (m) => m.quantity);
  const sold = sum(alive(sales).filter((s) => s.flock_id === flock.id && s.category === 'birds'), (s) => s.quantity);
  return Math.max(0, flock.quantity - dead - sold);
}

export function flockAgeDays(flock: Pick<Flock, 'acquired_on' | 'age_at_acquisition_days'>, on: Day): number {
  return flock.age_at_acquisition_days + Math.max(0, daysBetween(flock.acquired_on, on));
}

export function mortalityRate(flock: Pick<Flock, 'id' | 'quantity'>, mortality: MortalityLog[]): number {
  if (flock.quantity <= 0) return 0;
  return sum(alive(mortality).filter((m) => m.flock_id === flock.id), (m) => m.quantity) / flock.quantity;
}

export function goodEggs(log: Pick<EggLog, 'collected' | 'broken' | 'dirty'>): number {
  return Math.max(0, log.collected - log.broken - log.dirty);
}

/** Birds alive at the end of a past day, used for a fair laying rate. */
function birdsAliveOn(
  flock: Flock,
  on: Day,
  mortality: MortalityLog[],
  sales: Pick<Sale, 'flock_id' | 'category' | 'quantity' | 'deleted_at' | 'date'>[],
): number {
  return birdsAlive(
    flock,
    mortality.filter((m) => m.date <= on),
    sales.filter((s) => s.date <= on),
  );
}

/** Eggs laid per bird alive over the window, as a fraction. Null with no logs. */
export function layingRate(
  flock: Flock,
  eggs: EggLog[],
  mortality: MortalityLog[],
  sales: Pick<Sale, 'flock_id' | 'category' | 'quantity' | 'deleted_at' | 'date'>[],
  endDay: Day,
  days = 7,
): number | null {
  const window = lastNDays(endDay, days);
  const logs = alive(eggs).filter((e) => e.flock_id === flock.id);
  let eggsLaid = 0;
  let birdDays = 0;
  for (const day of window) {
    const dayLogs = logs.filter((l) => l.date === day);
    if (dayLogs.length === 0) continue;
    eggsLaid += sum(dayLogs, (l) => l.collected);
    birdDays += birdsAliveOn(flock, day, mortality, sales);
  }
  return birdDays === 0 ? null : eggsLaid / birdDays;
}

export interface FeedStock {
  feedType: string;
  purchasedKg: number;
  usedKg: number;
  stockKg: number;
  /** Average daily use over the last 14 days. */
  dailyUseKg: number;
  /** Null when there is no recent use to project from. */
  daysLeft: number | null;
}

export function feedStock(purchases: FeedPurchase[], usage: FeedUsage[], endDay: Day): FeedStock[] {
  const types = new Set([...alive(purchases).map((p) => p.feed_type), ...alive(usage).map((u) => u.feed_type)]);
  const from = addDays(endDay, -13);
  return [...types].sort().map((feedType) => {
    const purchasedKg = sum(alive(purchases).filter((p) => p.feed_type === feedType), (p) => p.quantity_kg);
    const typeUsage = alive(usage).filter((u) => u.feed_type === feedType);
    const usedKg = sum(typeUsage, (u) => u.quantity_kg);
    const recent = sum(typeUsage.filter((u) => inRange(u.date, from, endDay)), (u) => u.quantity_kg);
    const dailyUseKg = recent / 14;
    const stockKg = Math.round((purchasedKg - usedKg) * 100) / 100;
    return {
      feedType,
      purchasedKg,
      usedKg,
      stockKg,
      dailyUseKg,
      daysLeft: dailyUseKg > 0 ? Math.max(0, Math.floor(stockKg / dailyUseKg)) : null,
    };
  });
}

/** Weighted average purchase price per kg, from each purchase's linked expense. */
export function feedCostPerKg(purchases: FeedPurchase[], expenses: Expense[]): Map<string, number> {
  const costs = new Map<string, { kobo: number; kg: number }>();
  const live = alive(expenses);
  for (const purchase of alive(purchases)) {
    const expense = live.find((e) => e.source_table === 'feed_purchase' && e.source_id === purchase.id);
    const entry = costs.get(purchase.feed_type) ?? { kobo: 0, kg: 0 };
    if (expense) {
      entry.kobo += expense.amount_kobo;
      entry.kg += purchase.quantity_kg;
    }
    costs.set(purchase.feed_type, entry);
  }
  return new Map([...costs].map(([type, c]) => [type, c.kg > 0 ? c.kobo / c.kg : 0]));
}

export function salePaid(sale: Pick<Sale, 'id'>, payments: Payment[]): number {
  return sum(alive(payments).filter((p) => p.sale_id === sale.id), (p) => p.amount_kobo);
}

export function saleBalance(sale: Pick<Sale, 'id' | 'amount_kobo'>, payments: Payment[]): number {
  return Math.max(0, sale.amount_kobo - salePaid(sale, payments));
}

export interface ProfitAndLoss {
  revenueKobo: number;
  expensesKobo: number;
  profitKobo: number;
  /** Charged but not yet paid. Counted in revenue, listed separately for cash. */
  owedKobo: number;
  revenueByCategory: Record<string, number>;
  expensesByCategory: Record<string, number>;
}

/** Accrual P&L. A credit sale counts as revenue on the day it is made. */
export function profitAndLoss(
  records: Pick<FarmRecords, 'sales' | 'expenses' | 'payments'>,
  from: Day,
  to: Day,
): ProfitAndLoss {
  const sales = alive(records.sales).filter((s) => inRange(s.date, from, to));
  const expenses = alive(records.expenses).filter((e) => inRange(e.date, from, to));
  const revenueByCategory: Record<string, number> = {};
  const expensesByCategory: Record<string, number> = {};
  for (const s of sales) revenueByCategory[s.category] = (revenueByCategory[s.category] ?? 0) + s.amount_kobo;
  for (const e of expenses) expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + e.amount_kobo;
  const revenueKobo = sum(sales, (s) => s.amount_kobo);
  const expensesKobo = sum(expenses, (e) => e.amount_kobo);
  return {
    revenueKobo,
    expensesKobo,
    profitKobo: revenueKobo - expensesKobo,
    owedKobo: sum(sales, (s) => saleBalance(s, records.payments)),
    revenueByCategory,
    expensesByCategory,
  };
}

export interface FlockPnl {
  purchaseKobo: number;
  feedKobo: number;
  healthKobo: number;
  otherKobo: number;
  totalCostKobo: number;
  revenueKobo: number;
  profitKobo: number;
  costPerBirdKobo: number;
  eggsCollected: number;
  feedKg: number;
}

/**
 * Per-flock profit. Feed purchases belong to the whole farm, so a flock is
 * charged for the feed it actually ate at the average price of that feed type.
 * That is why feed_purchase expenses are excluded from the direct costs here.
 */
export function flockPnl(flock: Flock, records: FarmRecords): FlockPnl {
  const expenses = alive(records.expenses).filter((e) => e.flock_id === flock.id);
  const bySource = (source: Expense['source_table']) =>
    sum(expenses.filter((e) => e.source_table === source), (e) => e.amount_kobo);
  const purchaseKobo = bySource('flock');
  const healthKobo = bySource('health_event');
  const otherKobo = bySource(null);

  const prices = feedCostPerKg(records.feed_purchases, records.expenses);
  const usage = alive(records.feed_usage).filter((u) => u.flock_id === flock.id);
  const feedKobo = Math.round(sum(usage, (u) => u.quantity_kg * (prices.get(u.feed_type) ?? 0)));

  const revenueKobo = sum(alive(records.sales).filter((s) => s.flock_id === flock.id), (s) => s.amount_kobo);
  const totalCostKobo = purchaseKobo + feedKobo + healthKobo + otherKobo;
  return {
    purchaseKobo,
    feedKobo,
    healthKobo,
    otherKobo,
    totalCostKobo,
    revenueKobo,
    profitKobo: revenueKobo - totalCostKobo,
    costPerBirdKobo: flock.quantity > 0 ? Math.round(totalCostKobo / flock.quantity) : 0,
    eggsCollected: sum(alive(records.egg_logs).filter((e) => e.flock_id === flock.id), (e) => e.collected),
    feedKg: sum(usage, (u) => u.quantity_kg),
  };
}

export function eggsCrates(eggs: number, crateSize: number): { crates: number; loose: number } {
  const size = Math.max(1, crateSize);
  return { crates: Math.floor(eggs / size), loose: eggs % size };
}
