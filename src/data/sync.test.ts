import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SyncTable } from '../domain/types';
import { openDb, type FarmDb } from './db';
import { remove, save, type WriteContext } from './repo';
import { discardFailed, purgeTables, PULL_PAGE, retryFailed, runSync, type BackendError, type SyncBackend } from './sync';

/** In-memory stand-in for Postgres with the same seq and upsert behaviour. */
class FakeServer implements SyncBackend {
  rows = new Map<string, Record<string, unknown>>();
  seq = 0;
  failNextPush: BackendError | null = null;
  rejectIf: ((row: Record<string, unknown>) => boolean) | null = null;
  beforeAck: (() => Promise<void>) | null = null;
  pushLog: string[] = [];
  offline = false;

  key(table: string, id: unknown) {
    return `${table}:${id}`;
  }
  async push(table: SyncTable, rows: Record<string, unknown>[]) {
    if (this.offline) return { transient: true, message: 'offline' };
    if (this.failNextPush) {
      const error = this.failNextPush;
      this.failNextPush = null;
      return error;
    }
    if (rows.some((r) => this.rejectIf?.(r))) return { transient: false, message: 'rejected by server' };
    for (const row of rows) {
      this.pushLog.push(`${table}:${row.id as string}`);
      this.rows.set(this.key(table, row.id), { ...this.rows.get(this.key(table, row.id)), ...row, seq: ++this.seq });
    }
    await this.beforeAck?.();
    return null;
  }
  async pull(table: SyncTable, afterSeq: number, limit: number) {
    if (this.offline) return { error: { transient: true, message: 'offline' } };
    const rows = [...this.rows.entries()]
      .filter(([k, r]) => k.startsWith(`${table}:`) && Number(r.seq) > afterSeq)
      .map(([, r]) => r)
      .sort((a, b) => Number(a.seq) - Number(b.seq))
      .slice(0, limit);
    return { rows };
  }
  remote(table: string, row: Record<string, unknown>) {
    this.rows.set(this.key(table, row.id), { farm_id: 'f', deleted_at: null, ...row, seq: ++this.seq });
  }
}

let device: FarmDb;
let server: FakeServer;
let ctx: WriteContext;
let n = 0;

const egg = (extra = {}) => ({ date: '2026-01-01', flock_id: 'flock', collected: 10, broken: 0, dirty: 0, ...extra });
const queueSize = () => device.outbox.count();

beforeEach(async () => {
  device = openDb(`test-${n++}`);
  server = new FakeServer();
  ctx = { farmId: 'f', userId: 'u', queue: true, store: device };
});

describe('uploading', () => {
  it('sends a saved record and clears the queue', async () => {
    const row = await save(ctx, 'egg_logs', egg());
    expect(await queueSize()).toBe(1);
    const result = await runSync(server, device);
    expect(result.pushed).toBe(1);
    expect(await queueSize()).toBe(0);
    expect(server.rows.get(`egg_logs:${row.id}`)?.collected).toBe(10);
  });

  it('keeps records safe through lost signal, then delivers them', async () => {
    await save(ctx, 'egg_logs', egg());
    server.offline = true;
    const result = await runSync(server, device);
    expect(result.retryLater).toBe('offline');
    expect(await queueSize()).toBe(1);
    server.offline = false;
    await runSync(server, device);
    expect(await queueSize()).toBe(0);
    expect(server.rows.size).toBe(1);
  });

  it('does not duplicate when the response is lost after the server saved it', async () => {
    const row = await save(ctx, 'egg_logs', egg());
    let dropOnce = true;
    const realPush = server.push.bind(server);
    server.push = async (table, rows) => {
      const response = await realPush(table, rows);
      if (dropOnce) {
        dropOnce = false;
        return { transient: true, message: 'timeout' };
      }
      return response;
    };
    await runSync(server, device);
    expect(await queueSize()).toBe(1);
    await runSync(server, device);
    expect(await queueSize()).toBe(0);
    expect([...server.rows.keys()]).toEqual([`egg_logs:${row.id}`]);
  });

  it('never sends server-stamped fields', async () => {
    const row = await save(ctx, 'egg_logs', egg());
    await runSync(server, device);
    const sent = server.rows.get(`egg_logs:${row.id}`)!;
    expect(sent.created_by).toBeUndefined();
    expect(sent.created_at).toBeUndefined();
    expect(sent.updated_at).toBeUndefined();
  });

  it('keeps a newer edit queued if it happens during the upload', async () => {
    const row = await save(ctx, 'egg_logs', egg({ collected: 1 }));
    server.beforeAck = async () => {
      server.beforeAck = null;
      await save(ctx, 'egg_logs', egg({ id: row.id, collected: 2 }));
    };
    await runSync(server, device);
    expect(await queueSize()).toBe(1);
    await runSync(server, device);
    expect(await queueSize()).toBe(0);
    expect(server.rows.get(`egg_logs:${row.id}`)?.collected).toBe(2);
  });

  it('combines repeat edits into a single queued change', async () => {
    const row = await save(ctx, 'egg_logs', egg({ collected: 1 }));
    await save(ctx, 'egg_logs', egg({ id: row.id, collected: 2 }));
    expect(await queueSize()).toBe(1);
  });

  it('keeps the original order across tables so parents land first', async () => {
    const flock = await save(ctx, 'flocks', { name: 'A', breed: '', source: null, house: null, acquired_on: '2026-01-01', age_at_acquisition_days: 0, quantity: 5, status: 'active', closed_on: null, notes: null });
    const log = await save(ctx, 'egg_logs', egg({ flock_id: flock.id }));
    await save(ctx, 'flocks', { id: flock.id, name: 'A2', breed: '', source: null, house: null, acquired_on: '2026-01-01', age_at_acquisition_days: 0, quantity: 5, status: 'active', closed_on: null, notes: null });
    await runSync(server, device);
    expect(server.pushLog).toEqual([`flocks:${flock.id}`, `egg_logs:${log.id}`]);
    expect(server.rows.get(`flocks:${flock.id}`)?.name).toBe('A2');
  });

  it('sets aside a rejected record and still delivers the rest', async () => {
    const good1 = await save(ctx, 'egg_logs', egg());
    const bad = await save(ctx, 'egg_logs', egg({ collected: 666 }));
    const good2 = await save(ctx, 'egg_logs', egg());
    server.rejectIf = (r) => r.collected === 666;
    const result = await runSync(server, device);
    expect(result).toMatchObject({ pushed: 2, failed: 1 });
    expect(server.rows.has(`egg_logs:${good1.id}`)).toBe(true);
    expect(server.rows.has(`egg_logs:${good2.id}`)).toBe(true);
    const [failed] = await device.outbox.toArray();
    expect(failed).toMatchObject({ row_id: bad.id, status: 'failed', error: 'rejected by server' });
  });

  it('can retry a failed change', async () => {
    await save(ctx, 'egg_logs', egg({ collected: 666 }));
    server.rejectIf = (r) => r.collected === 666;
    await runSync(server, device);
    server.rejectIf = null;
    await runSync(server, device);
    expect(await queueSize()).toBe(1); // failed items wait for a decision
    await retryFailed(device);
    await runSync(server, device);
    expect(await queueSize()).toBe(0);
  });

  it('editing a failed change requeues it', async () => {
    const row = await save(ctx, 'egg_logs', egg({ collected: 666 }));
    server.rejectIf = (r) => r.collected === 666;
    await runSync(server, device);
    await save(ctx, 'egg_logs', egg({ id: row.id, collected: 6 }));
    await runSync(server, device);
    expect(await queueSize()).toBe(0);
    expect(server.rows.get(`egg_logs:${row.id}`)?.collected).toBe(6);
  });

  it('discarding a failed change removes it and re-downloads the server’s version', async () => {
    server.remote('egg_logs', { id: 'x', collected: 5 });
    await runSync(server, device);
    await save(ctx, 'egg_logs', egg({ id: 'x', collected: 666 }));
    server.rejectIf = (r) => r.collected === 666;
    await runSync(server, device);
    const [failed] = await device.outbox.toArray();
    await discardFailed(failed!.seq!, device);
    server.rejectIf = null;
    await runSync(server, device);
    expect((await device.egg_logs.get('x'))?.collected).toBe(5);
  });
});

describe('downloading', () => {
  it('receives other devices’ records and only asks for what’s new', async () => {
    server.remote('egg_logs', { id: 'a', collected: 1 });
    await runSync(server, device);
    expect((await device.egg_logs.get('a'))?.collected).toBe(1);
    server.remote('egg_logs', { id: 'b', collected: 2 });
    const second = await runSync(server, device);
    expect(second.pulled).toBe(1);
  });

  it('does not overwrite a queued local edit with an older server version', async () => {
    server.remote('egg_logs', { id: 'a', collected: 1 });
    await runSync(server, device);
    await save(ctx, 'egg_logs', egg({ id: 'a', collected: 77 }));
    server.remote('egg_logs', { id: 'a', collected: 10 });
    // A rejected upload leaves the edit queued while the download still runs.
    const rejecting: SyncBackend = { push: async () => ({ transient: false, message: 'no' }), pull: server.pull.bind(server) };
    await runSync(rejecting, device);
    expect((await device.egg_logs.get('a'))?.collected).toBe(77);
  });

  it('applies a deletion from another device', async () => {
    server.remote('egg_logs', { id: 'a', collected: 1 });
    await runSync(server, device);
    server.remote('egg_logs', { id: 'a', collected: 1, deleted_at: '2026-01-02' });
    await runSync(server, device);
    expect((await device.egg_logs.get('a'))?.deleted_at).toBe('2026-01-02');
  });

  it('reads through multiple pages without skipping', async () => {
    for (let i = 0; i < PULL_PAGE + 5; i++) server.remote('egg_logs', { id: `r${i}`, collected: i });
    const result = await runSync(server, device);
    expect(result.pulled).toBe(PULL_PAGE + 5);
    expect(await device.egg_logs.count()).toBe(PULL_PAGE + 5);
  });

  it('resumes from where it stopped after losing signal mid-download', async () => {
    server.remote('egg_logs', { id: 'a', collected: 1 });
    server.remote('flocks', { id: 'f', name: 'x' });
    const realPull = server.pull.bind(server);
    server.pull = async (table, after, limit) => (table === 'egg_logs' ? { error: { transient: true, message: 'offline' } } : realPull(table, after, limit));
    const first = await runSync(server, device);
    expect(first.retryLater).toBe('offline');
    server.pull = realPull;
    await runSync(server, device);
    expect(await device.egg_logs.count()).toBe(1);
  });

  it('downloads historic finance after a promotion, and clears it after a demotion', async () => {
    server.remote('expenses', { id: 'e', amount_kobo: 100 });
    let canSeeFinance = false;
    const realPull = server.pull.bind(server);
    server.pull = async (t, a, l) => (t === 'expenses' && !canSeeFinance ? { rows: [] } : realPull(t, a, l));
    await runSync(server, device);
    expect(await device.expenses.count()).toBe(0);

    canSeeFinance = true;
    await runSync(server, device);
    expect(await device.expenses.count()).toBe(1);

    canSeeFinance = false;
    await purgeTables(['expenses'], device);
    expect(await device.expenses.count()).toBe(0);

    canSeeFinance = true;
    await runSync(server, device);
    expect(await device.expenses.count()).toBe(1);
  });
});

describe('linked costs', () => {
  const flockDraft = (extra = {}) => ({ name: 'A', breed: '', source: null, house: null, acquired_on: '2026-01-01', age_at_acquisition_days: 0, quantity: 5, status: 'active' as const, closed_on: null, notes: null, ...extra });
  const cost = (kobo: number) => ({ kobo, date: '2026-01-01', category: 'Birds', description: 'x', source: 'flock' as const });
  const live = async () => (await device.expenses.toArray()).filter((e) => !e.deleted_at);

  it('stays as one expense when the source is edited (legacy stale-copy bug)', async () => {
    const flock = await save(ctx, 'flocks', flockDraft(), { cost: cost(1000) });
    await save(ctx, 'flocks', flockDraft({ id: flock.id }), { cost: cost(2500) });
    const expenses = await live();
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ amount_kobo: 2500, source_id: flock.id });
  });

  it('removes the expense when a cost is cleared and leaves it alone when no cost is given', async () => {
    const flock = await save(ctx, 'flocks', flockDraft(), { cost: cost(1000) });
    await save(ctx, 'flocks', flockDraft({ id: flock.id, name: 'B' }));
    expect(await live()).toHaveLength(1);
    await save(ctx, 'flocks', flockDraft({ id: flock.id }), { cost: cost(0) });
    expect(await live()).toHaveLength(0);
  });

  it('deleting the source removes its expense, and undo restores both', async () => {
    const flock = await save(ctx, 'flocks', flockDraft(), { cost: cost(1000) });
    const undo = await remove(ctx, 'flocks', flock.id);
    expect((await device.flocks.get(flock.id))?.deleted_at).toBeTruthy();
    expect(await live()).toHaveLength(0);
    await undo();
    expect((await device.flocks.get(flock.id))?.deleted_at).toBeNull();
    expect(await live()).toHaveLength(1);
  });

  it('deleting a flock takes its logs with it, and undo brings them back', async () => {
    const flock = await save(ctx, 'flocks', flockDraft());
    const log = await save(ctx, 'egg_logs', egg({ flock_id: flock.id }));
    const other = await save(ctx, 'egg_logs', egg({ flock_id: 'other' }));
    const undo = await remove(ctx, 'flocks', flock.id);
    expect((await device.egg_logs.get(log.id))?.deleted_at).toBeTruthy();
    expect((await device.egg_logs.get(other.id))?.deleted_at).toBeNull();
    await undo();
    expect((await device.egg_logs.get(log.id))?.deleted_at).toBeNull();
  });

  it('deleting a sale removes its payments', async () => {
    const sale = await save(ctx, 'sales', { date: '2026-01-01', category: 'eggs', description: null, quantity: 1, amount_kobo: 100, customer_id: null, flock_id: null });
    const pay = await save(ctx, 'payments', { date: '2026-01-01', sale_id: sale.id, amount_kobo: 100 });
    await remove(ctx, 'sales', sale.id);
    expect((await device.payments.get(pay.id))?.deleted_at).toBeTruthy();
  });

  it('sends deletions to the server as soft deletes', async () => {
    const row = await save(ctx, 'egg_logs', egg());
    await runSync(server, device);
    await remove(ctx, 'egg_logs', row.id);
    await runSync(server, device);
    expect(server.rows.get(`egg_logs:${row.id}`)?.deleted_at).toBeTruthy();
  });

  it('local workspaces write records without queueing them', async () => {
    await save({ ...ctx, queue: false }, 'egg_logs', egg());
    expect(await queueSize()).toBe(0);
    expect(await device.egg_logs.count()).toBe(1);
  });
});
