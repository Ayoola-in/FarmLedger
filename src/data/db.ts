import Dexie, { type EntityTable, type Table } from 'dexie';
import { SYNC_TABLES, type FarmRecords, type SyncTable } from '../domain/types';

export interface OutboxEntry {
  seq?: number;
  table: SyncTable;
  row_id: string;
  row: Record<string, unknown>;
  /** Increases on each local edit, so a newer edit survives an in-flight upload. */
  rev: number;
  status: 'pending' | 'failed';
  error?: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

type RecordTables = { [K in SyncTable]: Table<FarmRecords[K][number], string> };

export type FarmDb = Dexie &
  RecordTables & {
    outbox: EntityTable<OutboxEntry, 'seq'>;
    meta: Table<MetaEntry, string>;
  };

export function openDb(name = 'farmledger'): FarmDb {
  const db = new Dexie(name) as FarmDb;
  const stores: Record<string, string> = {
    outbox: '++seq, &[table+row_id], status',
    meta: 'key',
  };
  for (const table of SYNC_TABLES) stores[table] = 'id, deleted_at';
  db.version(1).stores(stores);
  return db;
}

export const db = openDb();

export const metaGet = async <T>(key: string, store: FarmDb = db): Promise<T | undefined> =>
  (await store.meta.get(key))?.value as T | undefined;

export const metaSet = (key: string, value: unknown, store: FarmDb = db): Promise<string> =>
  store.meta.put({ key, value });

export async function wipeLocalData(store: FarmDb = db): Promise<void> {
  await store.transaction('rw', store.tables, async () => {
    await Promise.all(store.tables.map((t) => t.clear()));
  });
}

export async function loadRecords(store: FarmDb = db): Promise<FarmRecords> {
  const entries = await Promise.all(
    SYNC_TABLES.map(async (table) => {
      const rows = await (store[table] as Table<{ deleted_at: string | null }, string>).toArray();
      return [table, rows.filter((r) => !r.deleted_at)] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as FarmRecords;
}
