// Converts a backup file from the original FarmLedger app into today's records,
// repairing the old data faults along the way:
//  - bird sales stored profit rather than the amount charged
//  - selling birds shrank the flock's purchase quantity and cost
//  - flock purchase costs never reached expenses
//  - feed and vaccine costs were copied into separate, unlinked expenses
import type { Expense, FarmRecords, Flock, SaleCategory } from './types';

interface Context {
  farmId: string;
  userId: string | null;
  now: string;
  uuid: () => string;
}

type Raw = Record<string, unknown>;
const list = (value: unknown): Raw[] => (Array.isArray(value) ? (value as Raw[]) : []);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const number = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const kobo = (naira: unknown): number => Math.round(number(naira) * 100);
const day = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : fallback;

const SALE_CATEGORIES: Record<string, SaleCategory> = {
  'bird sales': 'birds',
  'egg sales': 'eggs',
  eggs: 'eggs',
  birds: 'birds',
  manure: 'manure',
  'manure sales': 'manure',
};

export interface LegacyImport {
  records: FarmRecords;
  summary: { adjustedFlocks: number; repairedSales: number; removedDuplicateExpenses: number };
}

export function isLegacyBackup(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Raw;
  return ['flocks', 'daily_records', 'feed_inventory'].some((k) => Array.isArray(d[k])) && !('format' in d);
}

export function importLegacyBackup(data: Raw, ctx: Context): LegacyImport {
  const stamp = { farm_id: ctx.farmId, created_by: ctx.userId, created_at: ctx.now, updated_at: ctx.now, deleted_at: null };
  const today = ctx.now.slice(0, 10);
  const records: FarmRecords = {
    flocks: [], egg_logs: [], mortality_logs: [], feed_purchases: [], feed_usage: [], health_events: [],
    schedule_items: [], customers: [], sales: [], payments: [], expenses: [], bird_sales: [],
  };
  const summary = { adjustedFlocks: 0, repairedSales: 0, removedDuplicateExpenses: 0 };
  const flockIds = new Map<string, string>();
  const refFlock = (legacyId: unknown): string | null => flockIds.get(String(legacyId)) ?? null;

  const rawFlocks = list(data.flocks);
  for (const f of rawFlocks) flockIds.set(String(f.id), ctx.uuid());

  const rawSales = list(data.sales);
  const rawMortality = list(data.mortality);

  const expense = (e: Partial<Expense> & Pick<Expense, 'date' | 'category' | 'amount_kobo'>): void => {
    records.expenses.push({
      ...stamp, id: ctx.uuid(), vendor: null, description: null, flock_id: null, source_table: null, source_id: null, ...e,
    });
  };

  for (const f of rawFlocks) {
    const id = flockIds.get(String(f.id)) as string;
    const birdSales = rawSales.filter((s) => s.category === 'Bird Sales' && String(s.flockId) === String(f.id));
    const sold = birdSales.reduce((n, s) => n + (number(s.quantity) || 1), 0);
    const dead = rawMortality.filter((m) => String(m.flockId) === String(f.id)).reduce((n, m) => n + number(m.quantity), 0);

    // Selling reduced quantity and cost in step, so cost per bird still holds.
    const remainingQty = number(f.quantityPurchased);
    const remainingCost = kobo(f.cost);
    const costPerBird = remainingQty > 0 ? remainingCost / remainingQty : 0;
    const quantity = Math.max(1, remainingQty + sold);
    const acquired = day(f.purchaseDate, today);
    const status = f.status === 'Active' ? 'active' : 'closed';

    const flock: Flock = {
      ...stamp, id, name: text(f.name) ?? 'Unnamed flock', breed: text(f.breed) ?? '', source: text(f.source), house: null,
      acquired_on: acquired, age_at_acquisition_days: 0, quantity, status, closed_on: status === 'closed' ? today : null, notes: null,
    };
    records.flocks.push(flock);

    const cost = Math.round(remainingCost + costPerBird * sold);
    if (cost > 0) {
      expense({
        date: acquired, category: 'Birds', amount_kobo: cost, vendor: text(f.source), flock_id: id,
        source_table: 'flock', source_id: id, description: `Purchase of ${flock.name}`,
      });
    }

    // Reconcile with what the old app showed as alive, so farmers see no jump.
    const shown = Number(f.birdsAlive);
    const missing = Number.isFinite(shown) ? Math.max(0, quantity - dead - sold - shown) : 0;
    if (missing > 0) {
      summary.adjustedFlocks += 1;
      records.mortality_logs.push({ ...stamp, id: ctx.uuid(), date: today, flock_id: id, quantity: missing, cause: 'Count adjustment from old app' });
    }
  }

  for (const m of rawMortality) {
    const flock_id = refFlock(m.flockId);
    if (flock_id && number(m.quantity) > 0) {
      records.mortality_logs.push({ ...stamp, id: ctx.uuid(), date: day(m.date, today), flock_id, quantity: number(m.quantity), cause: text(m.cause) });
    }
  }

  for (const r of list(data.daily_records)) {
    const flock_id = refFlock(r.flockId);
    if (r.type === 'EGG_COLLECTION' && flock_id) {
      const collected = Math.max(0, number(r.eggsCollected));
      const broken = Math.min(collected, Math.max(0, number(r.brokenEggs)));
      const dirty = Math.min(collected - broken, Math.max(0, number(r.dirtyEggs)));
      records.egg_logs.push({ ...stamp, id: ctx.uuid(), date: day(r.date, today), flock_id, collected, broken, dirty });
    } else if (r.type === 'FEED_CONSUMPTION' && flock_id && number(r.quantityKg) > 0) {
      records.feed_usage.push({ ...stamp, id: ctx.uuid(), date: day(r.date, today), flock_id, feed_type: text(r.feedType) ?? 'Other', quantity_kg: number(r.quantityKg) });
    }
  }

  // The old app copied these costs into expenses too. Link one copy and skip the other.
  const rawExpenses = [...list(data.expenses)];
  const takeDuplicate = (match: (e: Raw) => boolean): void => {
    const index = rawExpenses.findIndex(match);
    if (index >= 0) {
      rawExpenses.splice(index, 1);
      summary.removedDuplicateExpenses += 1;
    }
  };

  for (const f of list(data.feed_inventory)) {
    if (number(f.quantityKg) <= 0) continue;
    const id = ctx.uuid();
    const date = day(f.date, today);
    records.feed_purchases.push({ ...stamp, id, date, feed_type: text(f.type) ?? 'Other', supplier: text(f.supplier), quantity_kg: number(f.quantityKg) });
    if (kobo(f.totalCost) > 0) {
      expense({ date, category: 'Feed', amount_kobo: kobo(f.totalCost), vendor: text(f.supplier), source_table: 'feed_purchase', source_id: id, description: `${number(f.quantityKg)} kg of ${text(f.type) ?? 'feed'}` });
    }
    takeDuplicate((e) => e.category === 'Feed' && day(e.date, '') === date && kobo(e.amount) === kobo(f.totalCost));
  }

  for (const v of list(data.vaccines)) {
    const flock_id = refFlock(v.flockId);
    if (!flock_id) continue;
    const id = ctx.uuid();
    const date = day(v.date, today);
    const product = text(v.type) ?? 'Vaccine';
    records.health_events.push({ ...stamp, id, date, flock_id, kind: 'vaccine', product, schedule_item_id: null, notes: null });
    if (kobo(v.cost) > 0) {
      expense({ date, category: 'Health', amount_kobo: kobo(v.cost), flock_id, source_table: 'health_event', source_id: id, description: product });
    }
    takeDuplicate((e) => e.category === 'Vaccine' && day(e.date, '') === date && kobo(e.amount) === kobo(v.cost));
  }

  for (const e of rawExpenses) {
    if (number(e.amount) < 0) continue;
    expense({
      date: day(e.date, today), category: text(e.category) ?? 'Other', amount_kobo: kobo(e.amount), vendor: text(e.vendor),
      description: text(e.description), flock_id: refFlock(e.flockId),
    });
  }

  const customers = new Map<string, string>();
  for (const s of rawSales) {
    const name = text(s.customer);
    let customer_id: string | null = null;
    if (name) {
      customer_id = customers.get(name.toLowerCase()) ?? null;
      if (!customer_id) {
        customer_id = ctx.uuid();
        customers.set(name.toLowerCase(), customer_id);
        records.customers.push({ ...stamp, id: customer_id, name, phone: null });
      }
    }
    const category = SALE_CATEGORIES[String(s.category).toLowerCase()] ?? 'other';
    const quantity = number(s.quantity) || 1;
    const flock_id = refFlock(s.flockId);
    let amount = kobo(s.total);
    if (category === 'birds' && flock_id) {
      // Stored total was profit: add back the cost per bird to recover the charge.
      const raw = rawFlocks.find((f) => String(f.id) === String(s.flockId));
      const qty = raw ? number(raw.quantityPurchased) : 0;
      if (raw && qty > 0) {
        amount += Math.round((kobo(raw.cost) / qty) * quantity);
        summary.repairedSales += 1;
      }
    }
    const id = ctx.uuid();
    const date = day(s.date, today);
    records.sales.push({ ...stamp, id, date, category, description: text(s.product), quantity, amount_kobo: Math.max(0, amount), customer_id, flock_id });
    // The old app only recorded completed sales.
    if (amount > 0) records.payments.push({ ...stamp, id: ctx.uuid(), date, sale_id: id, amount_kobo: amount });
  }

  return { records, summary };
}
