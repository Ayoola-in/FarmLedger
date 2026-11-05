// The single way records get written. Every change lands on the device and in
// the upload queue together, in one transaction, so neither can exist alone.
import type { Table } from 'dexie';
import type { Base, Expense, ExpenseSource, FarmRecords, SyncTable } from '../domain/types';
import { db as defaultDb, type FarmDb } from './db';

export interface WriteContext {
  farmId: string;
  userId: string | null;
  /** Local workspaces have no server, so they skip the queue. */
  queue: boolean;
  store?: FarmDb;
}

type Row<T extends SyncTable> = FarmRecords[T][number];
export type Draft<T extends SyncTable> = Omit<Row<T>, keyof Base> & { id?: string };

export const newId = (): string => crypto.randomUUID();

const OUTBOX_LOCAL_ONLY = ['seq'];

async function enqueue(store: FarmDb, table: SyncTable, row: Record<string, unknown>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(row).filter(([k]) => !OUTBOX_LOCAL_ONLY.includes(k)));
  const existing = await store.outbox.where('[table+row_id]').equals([table, row.id as string]).first();
  if (existing) {
    // Reuses the queue position so a parent stays ahead of its children.
    await store.outbox.update(existing.seq as number, { row: clean, rev: existing.rev + 1, status: 'pending', error: undefined });
  } else {
    await store.outbox.add({ table, row_id: row.id as string, row: clean, rev: 1, status: 'pending' });
  }
}

export function stamp<T extends SyncTable>(ctx: WriteContext, draft: Draft<T>, existing?: Row<T>): Row<T> {
  const now = new Date().toISOString();
  return {
    created_by: ctx.userId,
    created_at: now,
    deleted_at: null,
    ...existing,
    ...draft,
    id: draft.id ?? existing?.id ?? newId(),
    farm_id: ctx.farmId,
    updated_at: now,
  } as Row<T>;
}

async function write(store: FarmDb, ctx: WriteContext, table: SyncTable, row: Base): Promise<void> {
  await (store[table] as Table).put(row);
  if (ctx.queue) await enqueue(store, table, row as unknown as Record<string, unknown>);
}

export interface SaveOptions {
  /**
   * The record's cost, kept in its linked expense. Undefined leaves any existing
   * cost alone, which is what a worker's device does as it can't see costs.
   */
  cost?: { kobo: number; date: string; category: string; description: string; vendor?: string | null; flockId?: string | null; source: ExpenseSource };
  extra?: { [K in SyncTable]?: Draft<K>[] };
}

const ALL_TABLES = (store: FarmDb): Table[] => store.tables;

export async function save<T extends SyncTable>(ctx: WriteContext, table: T, draft: Draft<T>, options: SaveOptions = {}): Promise<Row<T>> {
  const store = ctx.store ?? defaultDb;
  return store.transaction('rw', ALL_TABLES(store), async () => {
    const existing = draft.id ? ((await (store[table] as Table).get(draft.id)) as Row<T> | undefined) : undefined;
    const row = stamp<T>(ctx, draft, existing);
    await write(store, ctx, table, row);

    if (options.cost) {
      const { kobo, date, category, description, vendor, flockId, source } = options.cost;
      const current = await linkedExpense(store, source, row.id);
      if (kobo > 0) {
        const expense = stamp<'expenses'>(ctx, {
          id: current?.id, date, category, amount_kobo: kobo, description, vendor: vendor ?? null,
          flock_id: flockId ?? null, source_table: source, source_id: row.id,
        }, current);
        await write(store, ctx, 'expenses', { ...expense, deleted_at: null });
      } else if (current && !current.deleted_at) {
        // A cost cleared back to zero removes the expense rather than leaving ₦0.
        await write(store, ctx, 'expenses', { ...current, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      }
    }

    for (const [extraTable, drafts] of Object.entries(options.extra ?? {})) {
      for (const d of drafts as Draft<SyncTable>[]) {
        await write(store, ctx, extraTable as SyncTable, stamp(ctx, d as never) as unknown as Base);
      }
    }
    return row;
  });
}

async function linkedExpense(store: FarmDb, source: ExpenseSource, id: string): Promise<Expense | undefined> {
  const all = await store.expenses.toArray();
  return all.find((e) => e.source_table === source && e.source_id === id);
}

const SOURCE_FOR: Partial<Record<SyncTable, ExpenseSource>> = {
  flocks: 'flock',
  feed_purchases: 'feed_purchase',
  health_events: 'health_event',
};

/**
 * Soft-deletes a record and everything that only makes sense with it, and
 * returns a function that puts them all back (used by the Undo button).
 */
export async function remove(ctx: WriteContext, table: SyncTable, id: string): Promise<() => Promise<void>> {
  const store = ctx.store ?? defaultDb;
  const when = new Date().toISOString();
  const affected: { table: SyncTable; id: string }[] = [];

  await store.transaction('rw', ALL_TABLES(store), async () => {
    const softDelete = async (t: SyncTable, rowId: string) => {
      const row = (await (store[t] as Table).get(rowId)) as Base | undefined;
      if (!row || row.deleted_at) return;
      await write(store, ctx, t, { ...row, deleted_at: when, updated_at: when });
      affected.push({ table: t, id: rowId });
    };

    await softDelete(table, id);

    const source = SOURCE_FOR[table];
    if (source) {
      const linked = await linkedExpense(store, source, id);
      if (linked) await softDelete('expenses', linked.id);
    }
    if (table === 'sales') {
      for (const p of await store.payments.toArray()) if (p.sale_id === id) await softDelete('payments', p.id);
    }
    if (table === 'flocks') {
      for (const t of ['egg_logs', 'mortality_logs', 'feed_usage', 'health_events'] as const) {
        const rows = (await store[t].toArray()) as { id: string; flock_id: string }[];
        for (const r of rows) {
          if (r.flock_id !== id) continue;
          await softDelete(t, r.id);
          if (t === 'health_events') {
            const linked = await linkedExpense(store, 'health_event', r.id);
            if (linked) await softDelete('expenses', linked.id);
          }
        }
      }
      for (const e of await store.expenses.toArray()) if (e.flock_id === id) await softDelete('expenses', e.id);
    }
  });

  return async () => {
    await store.transaction('rw', ALL_TABLES(store), async () => {
      const now = new Date().toISOString();
      for (const item of affected) {
        const row = (await (store[item.table] as Table).get(item.id)) as Base | undefined;
        if (row) await write(store, ctx, item.table, { ...row, deleted_at: null, updated_at: now });
      }
    });
  };
}

/** Writes many records at once, for restoring a backup or the import from the old app. */
export async function saveAll(ctx: WriteContext, records: Partial<FarmRecords>): Promise<number> {
  const store = ctx.store ?? defaultDb;
  let count = 0;
  await store.transaction('rw', ALL_TABLES(store), async () => {
    for (const [table, rows] of Object.entries(records)) {
      if (table === 'bird_sales') continue; // the server maintains this one
      for (const row of rows as Base[]) {
        await write(store, ctx, table as SyncTable, { ...row, farm_id: ctx.farmId });
        count += 1;
      }
    }
  });
  return count;
}

export async function linkedCost(source: ExpenseSource, id: string, store: FarmDb = defaultDb): Promise<number> {
  const expense = await linkedExpense(store, source, id);
  return expense && !expense.deleted_at ? expense.amount_kobo : 0;
}
