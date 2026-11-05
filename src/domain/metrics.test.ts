import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, today } from './dates';
import { koboToInput, parseNaira } from './money';
import {
  birdsAlive,
  eggsCrates,
  feedCostPerKg,
  feedStock,
  flockAgeDays,
  flockPnl,
  goodEggs,
  layingRate,
  profitAndLoss,
  saleBalance,
} from './metrics';
import type { EggLog, Expense, FarmRecords, FeedPurchase, FeedUsage, Flock, MortalityLog, Payment, Sale } from './types';

const base = { farm_id: 'f', created_by: null, created_at: '', updated_at: '', deleted_at: null };
const flock: Flock = {
  ...base, id: 'a', name: 'A', breed: 'Isa Brown', source: null, house: null, acquired_on: '2026-01-01',
  age_at_acquisition_days: 0, quantity: 100, status: 'active', closed_on: null, notes: null,
};
const death = (quantity: number, date = '2026-01-02', extra = {}): MortalityLog =>
  ({ ...base, id: `m${Math.random()}`, flock_id: 'a', date, quantity, cause: null, ...extra });
const sale = (extra: Partial<Sale>): Sale => ({
  ...base, id: `s${Math.random()}`, date: '2026-01-03', category: 'eggs', description: null, quantity: 1,
  amount_kobo: 0, customer_id: null, flock_id: null, ...extra,
});
const expense = (extra: Partial<Expense>): Expense => ({
  ...base, id: `e${Math.random()}`, date: '2026-01-03', category: 'Other', amount_kobo: 0, vendor: null,
  description: null, flock_id: null, source_table: null, source_id: null, ...extra,
});
const payment = (sale_id: string, amount_kobo: number, extra = {}): Payment =>
  ({ ...base, id: `p${Math.random()}`, date: '2026-01-03', sale_id, amount_kobo, ...extra });
const eggs = (date: string, collected: number): EggLog =>
  ({ ...base, id: `g${date}`, date, flock_id: 'a', collected, broken: 0, dirty: 0 });
const purchase = (id: string, kg: number, type = 'Layers'): FeedPurchase =>
  ({ ...base, id, date: '2026-01-01', feed_type: type, supplier: null, quantity_kg: kg });
const use = (date: string, kg: number, type = 'Layers', flock_id = 'a'): FeedUsage =>
  ({ ...base, id: `u${date}${kg}`, date, flock_id, feed_type: type, quantity_kg: kg });
const empty: FarmRecords = {
  flocks: [], egg_logs: [], mortality_logs: [], feed_purchases: [], feed_usage: [], health_events: [],
  schedule_items: [], customers: [], sales: [], payments: [], expenses: [], bird_sales: [],
};

describe('money', () => {
  it('parses naira to whole kobo without float error', () => {
    expect(parseNaira('12,500.50')).toBe(1_250_050);
    expect(parseNaira('0.07')).toBe(7);
    expect(parseNaira('19.99')).toBe(1999);
    expect(parseNaira('₦ 1,000')).toBe(100_000);
  });
  it('rejects invalid amounts', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1.2.3']) expect(parseNaira(bad)).toBeNull();
  });
  it('round-trips through the form input format', () => {
    expect(koboToInput(1_250_050)).toBe('12500.50');
    expect(koboToInput(100_000)).toBe('1000');
    expect(koboToInput(7)).toBe('0.07');
  });
});

describe('dates', () => {
  it('uses the farm calendar day, not UTC (legacy midnight bug)', () => {
    // 00:30 in Lagos on 2 Mar is still 1 Mar in UTC.
    expect(today('Africa/Lagos', new Date('2026-03-01T23:30:00Z'))).toBe('2026-03-02');
  });
  it('does arithmetic across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
  });
});

describe('birdsAlive', () => {
  it('subtracts deaths and bird sales from the purchased quantity', () => {
    expect(birdsAlive(flock, [death(5), death(3)], [sale({ category: 'birds', flock_id: 'a', quantity: 10 })])).toBe(82);
  });
  it('counts two offline death logs independently', () => {
    expect(birdsAlive(flock, [death(1), death(1)], [])).toBe(98);
  });
  it('restores birds when a sale or death is deleted', () => {
    const deleted = { deleted_at: '2026-01-05' };
    expect(birdsAlive(flock, [death(5, '2026-01-02', deleted)], [sale({ category: 'birds', flock_id: 'a', quantity: 10, ...deleted })])).toBe(100);
  });
  it('ignores egg sales linked to the flock', () => {
    expect(birdsAlive(flock, [], [sale({ category: 'eggs', flock_id: 'a', quantity: 30 })])).toBe(100);
  });
  it('never goes negative', () => {
    expect(birdsAlive(flock, [death(500)], [])).toBe(0);
  });
});

describe('flock age', () => {
  it('adds the age the birds arrived at', () => {
    expect(flockAgeDays({ acquired_on: '2026-01-01', age_at_acquisition_days: 14 }, '2026-01-11')).toBe(24);
  });
});

describe('eggs', () => {
  it('computes good eggs and crates', () => {
    expect(goodEggs({ collected: 100, broken: 3, dirty: 2 })).toBe(95);
    expect(eggsCrates(95, 30)).toEqual({ crates: 3, loose: 5 });
  });
  it('laying rate uses only days with logs and birds alive that day', () => {
    const rate = layingRate(flock, [eggs('2026-01-10', 90), eggs('2026-01-09', 70)], [], [], '2026-01-10', 7);
    expect(rate).toBeCloseTo(0.8);
  });
  it('laying rate is null with no logs', () => {
    expect(layingRate(flock, [], [], [], '2026-01-10')).toBeNull();
  });
});

describe('feed', () => {
  it('derives stock and days left per type', () => {
    const [stock] = feedStock([purchase('p1', 500)], [use('2026-01-10', 140)], '2026-01-10');
    expect(stock).toMatchObject({ feedType: 'Layers', stockKg: 360, dailyUseKg: 10, daysLeft: 36 });
  });
  it('returns null days left with no recent use', () => {
    expect(feedStock([purchase('p1', 500)], [], '2026-01-10')[0]?.daysLeft).toBeNull();
  });
  it('weights price per kg across purchases', () => {
    const prices = feedCostPerKg(
      [purchase('p1', 100), purchase('p2', 300)],
      [
        expense({ source_table: 'feed_purchase', source_id: 'p1', amount_kobo: 100_000 }),
        expense({ source_table: 'feed_purchase', source_id: 'p2', amount_kobo: 500_000 }),
      ],
    );
    expect(prices.get('Layers')).toBe(1500);
  });
});

describe('profit and loss', () => {
  it('counts the flock purchase cost (legacy overstated profit)', () => {
    const pnl = profitAndLoss(
      { ...empty, sales: [sale({ amount_kobo: 500_000 })], expenses: [expense({ category: 'Birds', source_table: 'flock', source_id: 'a', amount_kobo: 200_000 })] },
      '2026-01-01', '2026-01-31',
    );
    expect(pnl.profitKobo).toBe(300_000);
    expect(pnl.expensesByCategory.Birds).toBe(200_000);
  });
  it('keeps the full bird sale amount as revenue (legacy stored profit)', () => {
    const pnl = profitAndLoss({ ...empty, sales: [sale({ category: 'birds', amount_kobo: 700_000 })] }, '2026-01-01', '2026-01-31');
    expect(pnl.revenueKobo).toBe(700_000);
  });
  it('tracks unpaid credit sales', () => {
    const s = sale({ id: 'credit', amount_kobo: 100_000 });
    const pnl = profitAndLoss({ ...empty, sales: [s], payments: [payment('credit', 30_000)] }, '2026-01-01', '2026-01-31');
    expect(pnl.owedKobo).toBe(70_000);
    expect(pnl.revenueKobo).toBe(100_000);
  });
  it('excludes other dates and deleted rows', () => {
    const pnl = profitAndLoss(
      { ...empty, sales: [sale({ amount_kobo: 1, date: '2025-12-31' }), sale({ amount_kobo: 2, deleted_at: 'x' })] },
      '2026-01-01', '2026-01-31',
    );
    expect(pnl.revenueKobo).toBe(0);
  });
  it('ignores deleted payments in a balance and never returns below zero', () => {
    const s = sale({ id: 'x', amount_kobo: 100 });
    expect(saleBalance(s, [payment('x', 40, { deleted_at: 'y' })])).toBe(100);
    expect(saleBalance(s, [payment('x', 500)])).toBe(0);
  });
});

describe('flockPnl', () => {
  it('charges feed eaten rather than the farm-wide purchase, with no double count', () => {
    const records: FarmRecords = {
      ...empty,
      feed_purchases: [purchase('p1', 100)],
      feed_usage: [use('2026-01-05', 10)],
      expenses: [
        expense({ source_table: 'flock', source_id: 'a', flock_id: 'a', amount_kobo: 1_000_000 }),
        expense({ source_table: 'feed_purchase', source_id: 'p1', amount_kobo: 200_000 }),
        expense({ source_table: 'health_event', source_id: 'h', flock_id: 'a', amount_kobo: 50_000 }),
        expense({ flock_id: 'a', amount_kobo: 25_000 }),
      ],
      sales: [sale({ flock_id: 'a', amount_kobo: 2_000_000 })],
    };
    expect(flockPnl(flock, records)).toMatchObject({
      purchaseKobo: 1_000_000,
      feedKobo: 20_000,
      healthKobo: 50_000,
      otherKobo: 25_000,
      totalCostKobo: 1_095_000,
      profitKobo: 905_000,
      costPerBirdKobo: 10_950,
    });
  });
});
