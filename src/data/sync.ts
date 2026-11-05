// Moves records between this device and the server.
//
// Guarantees, each covered in sync.test.ts:
//  - a local change is never lost: it stays queued until the server accepts it
//  - retrying can't create duplicates: the device chooses each record's ID
//  - a newer local edit isn't overwritten by a download or by an upload finishing
//  - one rejected record is set aside and doesn't block the rest of the queue
import type { Table } from 'dexie';
import { SYNC_TABLES, type SyncTable } from '../domain/types';
import { db as defaultDb, metaGet, metaSet, type FarmDb, type OutboxEntry } from './db';

export interface BackendError {
  /** Temporary errors retry later. Permanent ones need a person to decide. */
  transient: boolean;
  message: string;
}

export interface SyncBackend {
  /** Uploads rows to one table. All succeed or all fail. */
  push(table: SyncTable, rows: Record<string, unknown>[]): Promise<BackendError | null>;
  /** Rows the user may read with seq above afterSeq, in seq order. */
  pull(table: SyncTable, afterSeq: number, limit: number): Promise<{ rows: Record<string, unknown>[] } | { error: BackendError }>;
}

const PUSH_BATCH = 100;
export const PULL_PAGE = 500;
const cursorKey = (table: SyncTable) => `cursor:${table}`;

export interface SyncResult {
  pushed: number;
  pulled: number;
  failed: number;
  /** Set when the run stopped on a temporary problem such as lost signal. */
  retryLater?: string;
}

/** Local-only fields never go up. The server stamps these itself. */
function toServerRow(row: Record<string, unknown>): Record<string, unknown> {
  const { seq: _seq, created_by: _by, created_at: _at, updated_at: _up, ...rest } = row;
  return rest;
}

async function acknowledge(store: FarmDb, entries: OutboxEntry[]): Promise<void> {
  await store.transaction('rw', store.outbox, async () => {
    for (const sent of entries) {
      const current = await store.outbox.get(sent.seq as number);
      // If the record was edited during the upload, keep that newer edit queued.
      if (current && current.rev === sent.rev) await store.outbox.delete(sent.seq as number);
    }
  });
}

async function pushQueue(store: FarmDb, backend: SyncBackend, result: SyncResult): Promise<boolean> {
  const queue = await store.outbox.where('status').equals('pending').sortBy('seq');
  let index = 0;
  while (index < queue.length) {
    // Group runs of one table while keeping the original order across tables,
    // so a parent always reaches the server before the records that follow it.
    const table = queue[index]!.table;
    const batch: OutboxEntry[] = [];
    while (index < queue.length && queue[index]!.table === table && batch.length < PUSH_BATCH) {
      batch.push(queue[index]!);
      index += 1;
    }

    const error = await backend.push(table, batch.map((e) => toServerRow(e.row)));
    if (!error) {
      await acknowledge(store, batch);
      result.pushed += batch.length;
      continue;
    }
    if (error.transient) {
      result.retryLater = error.message;
      return false;
    }
    if (batch.length === 1) {
      await markFailed(store, batch[0]!, error.message);
      result.failed += 1;
      continue;
    }
    // A batch fails as a whole. Retry one at a time to find the rejected record.
    for (const entry of batch) {
      const single = await backend.push(table, [toServerRow(entry.row)]);
      if (!single) {
        await acknowledge(store, [entry]);
        result.pushed += 1;
      } else if (single.transient) {
        result.retryLater = single.message;
        return false;
      } else {
        await markFailed(store, entry, single.message);
        result.failed += 1;
      }
    }
  }
  return true;
}

async function markFailed(store: FarmDb, entry: OutboxEntry, message: string): Promise<void> {
  await store.outbox.update(entry.seq as number, { status: 'failed', error: message });
}

async function pullTable(store: FarmDb, backend: SyncBackend, table: SyncTable, result: SyncResult): Promise<boolean> {
  let cursor = (await metaGet<number>(cursorKey(table), store)) ?? 0;
  for (;;) {
    const page = await backend.pull(table, cursor, PULL_PAGE);
    if ('error' in page) {
      result.retryLater = page.error.message;
      return false;
    }
    if (page.rows.length === 0) return true;
    const last = Number(page.rows[page.rows.length - 1]!.seq);
    await store.transaction('rw', store[table] as Table, store.outbox, store.meta, async () => {
      const queued = new Set(
        (await store.outbox.where('[table+row_id]').anyOf(page.rows.map((r) => [table, r.id as string])).toArray()).map((e) => e.row_id),
      );
      // A queued local edit is newer than this download, so it wins until it lands.
      const incoming = page.rows.filter((r) => !queued.has(r.id as string));
      await (store[table] as Table).bulkPut(incoming);
      await store.meta.put({ key: cursorKey(table), value: last });
    });
    cursor = last;
    result.pulled += page.rows.length;
    if (page.rows.length < PULL_PAGE) return true;
  }
}

/** One complete sync pass: uploads first, so downloads reflect this device's work. */
export async function runSync(backend: SyncBackend, store: FarmDb = defaultDb): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, failed: 0 };
  const pushedAll = await pushQueue(store, backend, result);
  if (!pushedAll) return result;
  for (const table of SYNC_TABLES) {
    if (!(await pullTable(store, backend, table, result))) return result;
  }
  await metaSet('last_synced_at', new Date().toISOString(), store);
  return result;
}

export async function retryFailed(store: FarmDb = defaultDb): Promise<void> {
  await store.outbox.where('status').equals('failed').modify({ status: 'pending', error: undefined });
}

/**
 * Drops a rejected change. The device can't tell whether the record ever existed
 * on the server, so it removes the local copy and downloads that table again.
 */
export async function discardFailed(seq: number, store: FarmDb = defaultDb): Promise<void> {
  const entry = await store.outbox.get(seq);
  if (!entry) return;
  await store.transaction('rw', store[entry.table] as Table, store.outbox, store.meta, async () => {
    await (store[entry.table] as Table).delete(entry.row_id);
    await store.outbox.delete(seq);
    await store.meta.delete(cursorKey(entry.table));
  });
}

/** After a role is reduced: removes tables this person may no longer read. */
export async function purgeTables(tables: SyncTable[], store: FarmDb = defaultDb): Promise<void> {
  for (const table of tables) {
    await (store[table] as Table).clear();
    await store.meta.delete(cursorKey(table));
    await store.outbox.filter((e) => e.table === table).delete();
  }
}
