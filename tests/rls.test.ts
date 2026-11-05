// Runs the real migration on real Postgres (PGlite) and attacks it as each role.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const OWNER_A = '00000000-0000-4000-8000-00000000000a';
const MANAGER_A = '00000000-0000-4000-8000-00000000000b';
const WORKER_A = '00000000-0000-4000-8000-00000000000c';
const OWNER_B = '00000000-0000-4000-8000-00000000000d';
const STRANGER = '00000000-0000-4000-8000-00000000000e';
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let pg: PGlite;
let farmA: string;
let farmB: string;
let counter = 0;
const nextId = () => uuid(++counter);

/** Runs one statement as a signed-in user, the way PostgREST would. */
async function as<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await pg.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${user}', true);`);
  try {
    const result = await pg.query<T>(sql, params);
    await pg.exec('commit');
    return result.rows;
  } catch (error) {
    await pg.exec('rollback');
    throw error;
  }
}

const insertEgg = (user: string, farm: string, id = nextId(), collected = 10) =>
  as(user, `insert into egg_logs (id, farm_id, date, flock_id, collected) values ($1, $2, '2026-01-01', $3, $4)`, [id, farm, uuid(9999), collected]);
const insertExpense = (user: string, farm: string, id = nextId()) =>
  as(user, `insert into expenses (id, farm_id, date, category, amount_kobo) values ($1, $2, '2026-01-01', 'Labour', 100)`, [id, farm]);

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public, auth to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to authenticated, anon;
    -- Supabase's real defaults. The migration has to undo these itself.
    alter default privileges in schema public grant all on tables to anon, authenticated;
    insert into auth.users values ('${OWNER_A}'), ('${MANAGER_A}'), ('${WORKER_A}'), ('${OWNER_B}'), ('${STRANGER}');
  `);
  await pg.exec(readFileSync('supabase/migrations/20261105000000_init.sql', 'utf8'));

  farmA = (await as<{ id: string }>(OWNER_A, `select create_farm('Farm A', 'Ada') as id`))[0]!.id;
  farmB = (await as<{ id: string }>(OWNER_B, `select create_farm('Farm B', 'Bola') as id`))[0]!.id;
  const m = (await as<{ t: string }>(OWNER_A, `select create_invite('manager') as t`))[0]!.t;
  await as(MANAGER_A, 'select accept_invite($1, $2)', [m, 'Mike']);
  const w = (await as<{ t: string }>(OWNER_A, `select create_invite('worker') as t`))[0]!.t;
  await as(WORKER_A, 'select accept_invite($1, $2)', [w, 'Wale']);
});

describe('separation between farms', () => {
  it('hides every record of another farm', async () => {
    await insertEgg(OWNER_B, farmB);
    await insertExpense(OWNER_B, farmB);
    const tables = ['egg_logs', 'expenses', 'farms', 'members', 'invites', 'audit_log'];
    for (const table of tables) {
      const rows = await as<{ farm_id?: string; id: string }>(OWNER_A, `select * from ${table}`);
      const leaked = rows.filter((r) => (table === 'farms' ? r.id === farmB : r.farm_id === farmB));
      expect(leaked, table).toHaveLength(0);
    }
  });

  it('rejects writing into another farm', async () => {
    await expect(insertEgg(OWNER_A, farmB)).rejects.toThrow(/row-level security/);
    await expect(insertExpense(OWNER_A, farmB)).rejects.toThrow(/row-level security/);
  });

  it('rejects overwriting another farm’s record by guessing its ID', async () => {
    const id = nextId();
    await insertEgg(OWNER_B, farmB, id, 50);
    await expect(
      as(OWNER_A, `insert into egg_logs (id, farm_id, date, flock_id, collected) values ($1, $2, '2026-01-01', $3, 1)
        on conflict (id) do update set collected = 1`, [id, farmA, uuid(1)]),
    ).rejects.toThrow();
    const [row] = await as<{ collected: number }>(OWNER_B, 'select collected from egg_logs where id = $1', [id]);
    expect(row?.collected).toBe(50);
  });

  it('rejects moving a record to another farm', async () => {
    const id = nextId();
    await insertEgg(OWNER_A, farmA, id);
    await expect(as(OWNER_A, 'update egg_logs set farm_id = $1 where id = $2', [farmB, id])).rejects.toThrow();
  });

  it('gives a person with no farm nothing', async () => {
    expect(await as(STRANGER, 'select * from farms')).toHaveLength(0);
    expect(await as(STRANGER, 'select * from egg_logs')).toHaveLength(0);
    await expect(insertEgg(STRANGER, farmA)).rejects.toThrow(/row-level security/);
  });

  it('blocks reaching the sync counter or hard-deleting records', async () => {
    await expect(as(OWNER_A, 'select * from farm_sync')).rejects.toThrow(/permission denied/);
    await expect(as(OWNER_A, 'delete from egg_logs')).rejects.toThrow(/permission denied/);
    await expect(as(OWNER_A, 'delete from audit_log')).rejects.toThrow(/permission denied/);
  });

  it('blocks running operations while signed out', async () => {
    await pg.exec('begin; set local role anon;');
    await expect(pg.query(`select create_farm('x', 'y')`)).rejects.toThrow(/permission denied/);
    await pg.exec('rollback');
  });
});

describe('worker role', () => {
  it('can log eggs but never sees or writes money', async () => {
    await insertEgg(WORKER_A, farmA);
    await insertExpense(OWNER_A, farmA);
    for (const table of ['expenses', 'sales', 'payments', 'customers']) {
      expect(await as(WORKER_A, `select * from ${table}`), table).toHaveLength(0);
    }
    await expect(insertExpense(WORKER_A, farmA)).rejects.toThrow(/row-level security/);
  });

  it('holds no money columns in tables workers can read', () => {
    const sql = readFileSync('supabase/migrations/20261105000000_init.sql', 'utf8');
    for (const table of ['flocks', 'egg_logs', 'mortality_logs', 'feed_purchases', 'feed_usage', 'schedule_items', 'health_events', 'bird_sales']) {
      const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1] ?? '';
      expect(body, table).not.toBe('');
      expect(body, table).not.toMatch(/kobo|cost|price|amount/i);
    }
  });

  it('cannot manage flocks or feed purchases', async () => {
    await expect(as(WORKER_A, `insert into flocks (id, farm_id, name, acquired_on, quantity) values ($1, $2, 'x', '2026-01-01', 5)`, [nextId(), farmA])).rejects.toThrow(/row-level security/);
    await expect(as(WORKER_A, `insert into feed_purchases (id, farm_id, date, feed_type, quantity_kg) values ($1, $2, '2026-01-01', 'x', 5)`, [nextId(), farmA])).rejects.toThrow(/row-level security/);
  });

  it('can edit their own record within 24 hours', async () => {
    const id = nextId();
    await insertEgg(WORKER_A, farmA, id);
    const rows = await as(WORKER_A, 'update egg_logs set collected = 99 where id = $1 returning id', [id]);
    expect(rows).toHaveLength(1);
  });

  it('cannot edit someone else’s record', async () => {
    const id = nextId();
    await insertEgg(OWNER_A, farmA, id, 5);
    expect(await as(WORKER_A, 'update egg_logs set collected = 99 where id = $1 returning id', [id])).toHaveLength(0);
  });

  it('cannot edit their own record after 24 hours, or backdate it to get around that', async () => {
    const id = nextId();
    await insertEgg(WORKER_A, farmA, id);
    await pg.query(`alter table egg_logs disable trigger stamp`);
    await pg.query(`update egg_logs set created_at = now() - interval '25 hours' where id = $1`, [id]);
    await pg.query(`alter table egg_logs enable trigger stamp`);
    expect(await as(WORKER_A, 'update egg_logs set collected = 1 where id = $1 returning id', [id])).toHaveLength(0);

    const fresh = nextId();
    await as(WORKER_A, `insert into egg_logs (id, farm_id, date, flock_id, collected, created_by, created_at)
      values ($1, $2, '2026-01-01', $3, 1, $4, '2020-01-01')`, [fresh, farmA, uuid(1), OWNER_A]);
    const [row] = await as<{ created_by: string; created_at: Date }>(WORKER_A, 'select created_by, created_at from egg_logs where id = $1', [fresh]);
    expect(row?.created_by).toBe(WORKER_A);
    expect(new Date(row!.created_at).getFullYear()).toBeGreaterThan(2020);
  });

  it('cannot invite, change roles, remove people, change settings or read the audit log', async () => {
    await expect(as(WORKER_A, `select create_invite('worker')`)).rejects.toThrow(/not allowed/);
    const [owner] = await as<{ id: string }>(OWNER_A, 'select id from members where user_id = $1', [OWNER_A]);
    await expect(as(WORKER_A, 'select remove_member($1)', [owner!.id])).rejects.toThrow(/not allowed/);
    await expect(as(WORKER_A, 'select set_member_role($1, $2)', [owner!.id, 'worker'])).rejects.toThrow(/not allowed/);
    expect(await as(WORKER_A, `update farms set name = 'hacked' returning id`)).toHaveLength(0);
    expect(await as(WORKER_A, 'select * from audit_log')).toHaveLength(0);
  });

  it('cannot promote themselves through the members table', async () => {
    await expect(as(WORKER_A, `update members set role = 'owner' where user_id = $1`, [WORKER_A])).rejects.toThrow(/permission denied/);
  });
});

describe('bird sales for workers', () => {
  const sale = (id: string, flock: string) =>
    as(OWNER_A, `insert into sales (id, farm_id, date, category, quantity, amount_kobo, flock_id) values ($1, $2, '2026-01-01', 'birds', 10, 999, $3)`, [id, farmA, flock]);

  it('lets a worker see how many birds were sold, but not the price', async () => {
    const id = nextId();
    await sale(id, uuid(7));
    const rows = await as<Record<string, unknown>>(WORKER_A, 'select * from bird_sales where id = $1', [id]);
    expect(Number(rows[0]?.quantity)).toBe(10);
    expect(Object.keys(rows[0] ?? {}).join()).not.toMatch(/kobo|amount|price/);
    expect(await as(WORKER_A, 'select * from sales where id = $1', [id])).toHaveLength(0);
  });

  it('follows edits and deletions, and hides from other farms', async () => {
    const id = nextId();
    await sale(id, uuid(7));
    await as(OWNER_A, 'update sales set quantity = 4 where id = $1', [id]);
    let [row] = await as<{ quantity: string; deleted_at: string | null }>(WORKER_A, 'select quantity, deleted_at from bird_sales where id = $1', [id]);
    expect(Number(row?.quantity)).toBe(4);
    await as(OWNER_A, 'update sales set deleted_at = now() where id = $1', [id]);
    [row] = await as(WORKER_A, 'select quantity, deleted_at from bird_sales where id = $1', [id]);
    expect(row?.deleted_at).not.toBeNull();
    expect(await as(OWNER_B, 'select * from bird_sales where id = $1', [id])).toHaveLength(0);
  });

  it('stops counting a sale once it is no longer a bird sale', async () => {
    const id = nextId();
    await sale(id, uuid(7));
    await as(OWNER_A, `update sales set category = 'eggs' where id = $1`, [id]);
    const [row] = await as<{ deleted_at: string | null }>(WORKER_A, 'select deleted_at from bird_sales where id = $1', [id]);
    expect(row?.deleted_at).not.toBeNull();
  });

  it('can’t be written to directly', async () => {
    await expect(as(OWNER_A, `insert into bird_sales (id, farm_id, date, flock_id, quantity) values ($1, $2, '2026-01-01', $3, 1)`, [nextId(), farmA, uuid(1)])).rejects.toThrow(/permission denied/);
  });
});

describe('settings columns', () => {
  it('lets an owner change settings but not the farm ID', async () => {
    expect(await as(OWNER_A, `update farms set crate_size = 30 returning id`)).toHaveLength(1);
    await expect(as(OWNER_A, `update farms set id = gen_random_uuid()`)).rejects.toThrow(/permission denied/);
  });
});

describe('manager role', () => {
  it('sees finance and manages records', async () => {
    await insertExpense(MANAGER_A, farmA);
    expect((await as(MANAGER_A, 'select * from expenses')).length).toBeGreaterThan(0);
  });

  it('can only invite workers and only remove workers', async () => {
    await expect(as(MANAGER_A, `select create_invite('manager')`)).rejects.toThrow(/only invite workers/);
    const [owner] = await as<{ id: string }>(MANAGER_A, 'select id from members where user_id = $1', [OWNER_A]);
    await expect(as(MANAGER_A, 'select remove_member($1)', [owner!.id])).rejects.toThrow(/not allowed/);
  });

  it('cannot change settings or delete the farm', async () => {
    expect(await as(MANAGER_A, `update farms set name = 'x' returning id`)).toHaveLength(0);
    await expect(as(MANAGER_A, `select delete_farm('Farm A')`)).rejects.toThrow(/not allowed/);
  });
});

describe('invites', () => {
  it('stores only a hash, works once and can’t be reused', async () => {
    const token = (await as<{ t: string }>(OWNER_A, `select create_invite('worker') as t`))[0]!.t;
    const rows = await as<{ token_hash: string }>(OWNER_A, 'select token_hash from invites');
    expect(rows.some((r) => r.token_hash === token)).toBe(false);
    await as(STRANGER, 'select accept_invite($1, $2)', [token, 'New']);
    await as(OWNER_A, 'select remove_member(id) from members where user_id = $1', [STRANGER]);
    await expect(as(STRANGER, 'select accept_invite($1, $2)', [token, 'Again'])).rejects.toThrow(/invalid or has expired/);
  });

  it('rejects revoked and expired invites', async () => {
    const token = (await as<{ t: string }>(OWNER_A, `select create_invite('worker') as t`))[0]!.t;
    const [latest] = await as<{ id: string }>(OWNER_A, 'select id from invites order by created_at desc limit 1');
    await as(OWNER_A, 'select revoke_invite($1)', [latest!.id]);
    await expect(as(STRANGER, 'select accept_invite($1, $2)', [token, 'x'])).rejects.toThrow(/invalid or has expired/);

    const old = (await as<{ t: string }>(OWNER_A, `select create_invite('worker') as t`))[0]!.t;
    await pg.query(`update invites set expires_at = now() - interval '1 minute' where revoked_at is null and accepted_at is null`);
    await expect(as(STRANGER, 'select accept_invite($1, $2)', [old, 'x'])).rejects.toThrow(/invalid or has expired/);
  });

  it('refuses a second farm on one login', async () => {
    const token = (await as<{ t: string }>(OWNER_B, `select create_invite('worker') as t`))[0]!.t;
    await expect(as(WORKER_A, 'select accept_invite($1, $2)', [token, 'x'])).rejects.toThrow(/already belongs/);
    await expect(as(OWNER_A, `select create_farm('Second', 'x')`)).rejects.toThrow(/already belongs/);
  });
});

describe('sync support', () => {
  it('gives each change a later sequence number within a farm', async () => {
    const id = nextId();
    await insertEgg(OWNER_A, farmA, id);
    const [first] = await as<{ seq: string }>(OWNER_A, 'select seq from egg_logs where id = $1', [id]);
    await as(OWNER_A, 'update egg_logs set collected = 2 where id = $1', [id]);
    const [second] = await as<{ seq: string }>(OWNER_A, 'select seq from egg_logs where id = $1', [id]);
    expect(Number(second?.seq)).toBeGreaterThan(Number(first?.seq));
  });

  it('treats a retried upload as the same record', async () => {
    const id = nextId();
    const upsert = `insert into egg_logs (id, farm_id, date, flock_id, collected) values ($1, $2, '2026-01-01', $3, 7)
      on conflict (id) do update set collected = excluded.collected`;
    await as(WORKER_A, upsert, [id, farmA, uuid(1)]);
    await as(WORKER_A, upsert, [id, farmA, uuid(1)]);
    expect(await as(OWNER_A, 'select id from egg_logs where id = $1', [id])).toHaveLength(1);
  });

  it('keeps the previous version when a record is overwritten', async () => {
    const id = nextId();
    await insertEgg(OWNER_A, farmA, id, 11);
    await as(MANAGER_A, 'update egg_logs set collected = 22 where id = $1', [id]);
    const [entry] = await as<{ previous: { collected: number }; changed_by: string }>(OWNER_A, 'select previous, changed_by from audit_log where row_id = $1', [id]);
    expect(entry?.previous.collected).toBe(11);
    expect(entry?.changed_by).toBe(MANAGER_A);
  });

  it('rejects impossible egg counts on the server as well', async () => {
    await expect(
      as(OWNER_A, `insert into egg_logs (id, farm_id, date, flock_id, collected, broken) values ($1, $2, '2026-01-01', $3, 1, 5)`, [nextId(), farmA, uuid(1)]),
    ).rejects.toThrow(/check constraint/);
  });

  it('soft-deletes and restores a linked cost when a worker deletes their own record', async () => {
    const event = nextId();
    const cost = nextId();
    await as(WORKER_A, `insert into health_events (id, farm_id, date, flock_id, kind, product) values ($1, $2, '2026-01-01', $3, 'vaccine', 'NDV')`, [event, farmA, uuid(1)]);
    await as(OWNER_A, `insert into expenses (id, farm_id, date, category, amount_kobo, source_table, source_id) values ($1, $2, '2026-01-01', 'Health', 500, 'health_event', $3)`, [cost, farmA, event]);

    await as(WORKER_A, 'update health_events set deleted_at = now() where id = $1', [event]);
    let [row] = await as<{ deleted_at: string | null }>(OWNER_A, 'select deleted_at from expenses where id = $1', [cost]);
    expect(row?.deleted_at).not.toBeNull();

    await as(WORKER_A, 'update health_events set deleted_at = null where id = $1', [event]);
    [row] = await as<{ deleted_at: string | null }>(OWNER_A, 'select deleted_at from expenses where id = $1', [cost]);
    expect(row?.deleted_at).toBeNull();
  });
});

describe('deleting a farm', () => {
  it('requires the exact name and removes everything', async () => {
    await expect(as(OWNER_B, `select delete_farm('wrong')`)).rejects.toThrow(/does not match/);
    await as(OWNER_B, `select delete_farm('Farm B')`);
    const { rows } = await pg.query('select id from egg_logs where farm_id = $1', [farmB]);
    expect(rows).toHaveLength(0);
  });
});
