import { describe, expect, it } from 'vitest';
import { importLegacyBackup, isLegacyBackup } from './legacy';
import { birdsAlive, profitAndLoss } from './metrics';

let n = 0;
const ctx = { farmId: 'farm', userId: 'u', now: '2026-06-01T10:00:00.000Z', uuid: () => `id-${n++}` };

// A flock of 100 bought for ₦100,000 (₦1,000 a bird). 10 sold for ₦20,000 total,
// so the old app stored: quantity 90, cost ₦90,000, sale total ₦10,000 (profit).
const backup = {
  flocks: [{ id: 1, name: 'Batch 1', breed: 'Isa', purchaseDate: '2026-01-01', quantityPurchased: 90, cost: 90000, status: 'Active', birdsAlive: 85 }],
  daily_records: [
    { id: 1, type: 'EGG_COLLECTION', date: '2026-02-01', flockId: '1', eggsCollected: 50, brokenEggs: 1, dirtyEggs: 2 },
    { id: 2, type: 'FEED_CONSUMPTION', date: '2026-02-01', flockId: 1, feedType: 'Layers', quantityKg: 10, cost: 2000 },
  ],
  mortality: [{ id: 1, date: '2026-01-15', flockId: 1, quantity: 3, cause: 'Heat' }],
  feed_inventory: [{ id: 1, date: '2026-01-05', supplier: 'Mill', type: 'Layers', quantityKg: 100, totalCost: 20000 }],
  sales: [{ id: 1, date: '2026-03-01', category: 'Bird Sales', product: 'Spent hens', quantity: 10, total: 10000, customer: 'Ada', flockId: 1 }],
  expenses: [
    { id: 1, date: '2026-01-05', category: 'Feed', amount: 20000, description: 'Purchased 100kg' },
    { id: 2, date: '2026-01-20', category: 'Vaccine', flockId: 1, amount: 5000, description: 'Vaccine: Lasota' },
    { id: 3, date: '2026-02-02', category: 'Labour', amount: 15000, vendor: 'Musa' },
  ],
  vaccines: [{ id: 1, date: '2026-01-20', flockId: 1, type: 'Lasota', cost: 5000 }],
  settings: [],
};

describe('legacy import', () => {
  const { records, summary } = importLegacyBackup(backup, ctx);
  const flock = records.flocks[0]!;

  it('recognises old backups but not current ones', () => {
    expect(isLegacyBackup(backup)).toBe(true);
    expect(isLegacyBackup({ format: 'farmledger-backup', flocks: [] })).toBe(false);
    expect(isLegacyBackup('nope')).toBe(false);
  });

  it('restores the original flock size and cost', () => {
    expect(flock.quantity).toBe(100);
    const purchase = records.expenses.find((e) => e.source_table === 'flock');
    expect(purchase).toMatchObject({ amount_kobo: 10_000_000, source_id: flock.id, category: 'Birds' });
  });

  it('recovers the amount charged for a bird sale, not the profit', () => {
    expect(records.sales[0]?.amount_kobo).toBe(2_000_000);
    expect(records.sales[0]?.category).toBe('birds');
    expect(summary.repairedSales).toBe(1);
  });

  it('matches birds alive to what the old app showed', () => {
    expect(birdsAlive(flock, records.mortality_logs, records.sales)).toBe(85);
    expect(summary.adjustedFlocks).toBe(1);
  });

  it('links one copy of feed and vaccine costs, dropping the duplicates', () => {
    expect(records.expenses.filter((e) => e.category === 'Feed')).toHaveLength(1);
    expect(records.expenses.filter((e) => e.source_table === 'feed_purchase')).toHaveLength(1);
    expect(records.expenses.filter((e) => e.source_table === 'health_event')).toHaveLength(1);
    expect(records.expenses.some((e) => e.category === 'Vaccine')).toBe(false);
    expect(summary.removedDuplicateExpenses).toBe(2);
  });

  it('produces correct totals: revenue, and all costs exactly once', () => {
    const pnl = profitAndLoss(records, '2026-01-01', '2026-12-31');
    expect(pnl.revenueKobo).toBe(2_000_000);
    // ₦100,000 birds + ₦20,000 feed + ₦5,000 vaccine + ₦15,000 labour
    expect(pnl.expensesKobo).toBe(14_000_000);
  });

  it('normalises text flock IDs on egg logs', () => {
    expect(records.egg_logs[0]).toMatchObject({ flock_id: flock.id, collected: 50, broken: 1, dirty: 2 });
    expect(records.feed_usage[0]).toMatchObject({ flock_id: flock.id, quantity_kg: 10 });
  });

  it('creates customers once and marks old sales as paid', () => {
    expect(records.customers.map((c) => c.name)).toEqual(['Ada']);
    expect(records.payments[0]).toMatchObject({ sale_id: records.sales[0]?.id, amount_kobo: 2_000_000 });
  });

  it('survives malformed files without throwing', () => {
    const result = importLegacyBackup({ flocks: 'x', sales: [{ total: 'abc' }], daily_records: [{ type: 'EGG_COLLECTION', flockId: 99 }] } as never, ctx);
    expect(result.records.egg_logs).toHaveLength(0);
    expect(result.records.sales[0]?.amount_kobo).toBe(0);
  });
});
