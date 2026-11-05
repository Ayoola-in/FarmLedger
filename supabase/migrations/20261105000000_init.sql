-- FarmLedger schema. Row-level security here is the real boundary between farms
-- and between roles; the app's own checks only decide what to show.

-- ---------------------------------------------------------------- tenancy

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  currency text not null default 'NGN',
  time_zone text not null default 'Africa/Lagos',
  crate_size int not null default 30 check (crate_size between 1 and 500),
  low_feed_days int not null default 7 check (low_feed_days between 0 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per farm. Updating it takes a row lock held until commit, so sequence
-- numbers within a farm become visible strictly in order. A plain Postgres
-- sequence would let a slow transaction commit a lower number after a device
-- had already pulled past it, and that device would miss the row forever.
create table public.farm_sync (
  farm_id uuid primary key references public.farms (id) on delete cascade,
  seq bigint not null default 0
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  -- One farm per login in this version.
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null default '',
  role text not null check (role in ('owner', 'manager', 'worker')),
  created_at timestamptz not null default now()
);
create index on public.members (farm_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  -- Only a hash is stored, so reading this table cannot reveal a usable link.
  token_hash text not null unique,
  role text not null check (role in ('manager', 'worker')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index on public.invites (farm_id);

-- ---------------------------------------------------------------- permission helpers

create function public.farm_role(target uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where farm_id = target and user_id = auth.uid()
$$;

create function public.is_member(target uuid) returns boolean
language sql stable as $$ select public.farm_role(target) is not null $$;

create function public.is_manager(target uuid) returns boolean
language sql stable as $$ select public.farm_role(target) in ('owner', 'manager') $$;

-- ---------------------------------------------------------------- farm records
-- IDs come from the device, which makes a retried upload idempotent.
-- flock_id and similar references are deliberately not foreign keys: a parent
-- rejected by the server must not block every queued child behind it.

create table public.flocks (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  breed text not null default '',
  source text,
  house text,
  acquired_on date not null,
  age_at_acquisition_days int not null default 0 check (age_at_acquisition_days >= 0),
  quantity int not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'closed')),
  closed_on date,
  notes text,
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0
);

create table public.egg_logs (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  date date not null,
  flock_id uuid not null,
  collected int not null check (collected >= 0),
  broken int not null default 0 check (broken >= 0),
  dirty int not null default 0 check (dirty >= 0),
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0,
  check (broken + dirty <= collected)
);

create table public.mortality_logs (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  date date not null,
  flock_id uuid not null,
  quantity int not null check (quantity > 0),
  cause text,
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0
);

create table public.feed_purchases (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  date date not null,
  feed_type text not null check (length(trim(feed_type)) > 0),
  supplier text,
  quantity_kg numeric(12, 2) not null check (quantity_kg > 0),
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0
);

create table public.feed_usage (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  date date not null,
  flock_id uuid not null,
  feed_type text not null check (length(trim(feed_type)) > 0),
  quantity_kg numeric(12, 2) not null check (quantity_kg > 0),
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0
);

create table public.schedule_items (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  product text not null default '',
  age_days int not null check (age_days >= 0),
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0
);

create table public.health_events (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  date date not null,
  flock_id uuid not null,
  kind text not null check (kind in ('vaccine', 'medication')),
  product text not null check (length(trim(product)) > 0),
  schedule_item_id uuid,
  notes text,
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0
);

create table public.customers (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0
);

create table public.sales (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  date date not null,
  category text not null check (category in ('eggs', 'birds', 'manure', 'other')),
  description text,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  amount_kobo bigint not null check (amount_kobo >= 0),
  customer_id uuid,
  flock_id uuid,
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0
);

create table public.payments (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  date date not null,
  sale_id uuid not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0
);

-- The only place a cost is stored. Operational tables hold no money, so workers,
-- who can read those tables but not this one, never receive financial data.
create table public.expenses (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  date date not null,
  category text not null check (length(trim(category)) > 0),
  amount_kobo bigint not null check (amount_kobo >= 0),
  vendor text,
  description text,
  flock_id uuid,
  source_table text check (source_table in ('flock', 'feed_purchase', 'health_event')),
  source_id uuid,
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0
);

-- Bird counts with no money attached. Workers can't read sales, yet their phones
-- must still subtract sold birds, so the server maintains this copy from sales.
create table public.bird_sales (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  date date not null,
  flock_id uuid not null,
  quantity numeric(12, 2) not null,
  created_by uuid, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  seq bigint not null default 0
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  table_name text not null,
  row_id uuid not null,
  previous jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index on public.audit_log (farm_id, changed_at desc);

-- ---------------------------------------------------------------- triggers

create function public.stamp_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.farm_id <> old.farm_id then
      raise exception 'a record cannot move between farms' using errcode = '42501';
    end if;
    -- Keeps the author and age fixed, which the worker 24-hour rule relies on.
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  update public.farm_sync set seq = seq + 1 where farm_id = new.farm_id returning seq into new.seq;
  return new;
end $$;

create function public.record_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (farm_id, table_name, row_id, previous, changed_by)
  values (old.farm_id, tg_table_name, old.id, to_jsonb(old), auth.uid());
  return null;
end $$;

-- A worker may delete their own vaccine record but cannot touch expenses, so the
-- server keeps the linked cost in step whoever made the change.
create function public.cascade_linked_expense() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  source text := tg_argv[0];
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.expenses set deleted_at = new.deleted_at
    where source_table = source and source_id = new.id and deleted_at is null;
  elsif new.deleted_at is null and old.deleted_at is not null then
    update public.expenses set deleted_at = null
    where source_table = source and source_id = new.id and deleted_at = old.deleted_at;
  end if;
  return null;
end $$;

create function public.mirror_bird_sale() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category = 'birds' and new.flock_id is not null then
    insert into public.bird_sales (id, farm_id, date, flock_id, quantity, deleted_at)
    values (new.id, new.farm_id, new.date, new.flock_id, new.quantity, new.deleted_at)
    on conflict (id) do update set date = excluded.date, flock_id = excluded.flock_id,
      quantity = excluded.quantity, deleted_at = excluded.deleted_at;
  else
    update public.bird_sales set deleted_at = now() where id = new.id and deleted_at is null;
  end if;
  return null;
end $$;

create trigger mirror after insert or update on public.sales
  for each row execute function public.mirror_bird_sale();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger touch before update on public.farms
  for each row execute function public.touch_updated_at();

create trigger cascade_expense after update of deleted_at on public.flocks
  for each row execute function public.cascade_linked_expense('flock');
create trigger cascade_expense after update of deleted_at on public.feed_purchases
  for each row execute function public.cascade_linked_expense('feed_purchase');
create trigger cascade_expense after update of deleted_at on public.health_events
  for each row execute function public.cascade_linked_expense('health_event');

-- ---------------------------------------------------------------- policies

-- Supabase grants everything on new tables by default. Start from nothing, so
-- the grants below are the complete list of what signed-in people can do.
revoke all on all tables in schema public from anon, authenticated;

alter table public.farms enable row level security;
alter table public.farm_sync enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.audit_log enable row level security;

create policy farms_read on public.farms for select to authenticated using (public.is_member(id));
create policy farms_update on public.farms for update to authenticated
  using (public.farm_role(id) = 'owner') with check (public.farm_role(id) = 'owner');
create policy members_read on public.members for select to authenticated using (public.is_member(farm_id));
create policy invites_read on public.invites for select to authenticated using (public.is_manager(farm_id));
create policy audit_read on public.audit_log for select to authenticated using (public.is_manager(farm_id));

alter table public.bird_sales enable row level security;
create index on public.bird_sales (farm_id, seq);
create trigger stamp before insert or update on public.bird_sales for each row execute function public.stamp_row();
create policy read on public.bird_sales for select to authenticated using (public.is_member(farm_id));

grant select on public.farms, public.members, public.invites, public.audit_log, public.bird_sales to authenticated;
grant update (name, currency, time_zone, crate_size, low_feed_days) on public.farms to authenticated;

do $$
declare
  t text;
  worker_logged text[] := array['egg_logs', 'mortality_logs', 'feed_usage', 'health_events'];
  shared text[] := array['flocks', 'feed_purchases', 'schedule_items'];
  finance text[] := array['customers', 'sales', 'payments', 'expenses'];
begin
  foreach t in array worker_logged || shared || finance loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create index on public.%I (farm_id, seq)', t);
    execute format('create trigger stamp before insert or update on public.%I for each row execute function public.stamp_row()', t);
    execute format('create trigger audit after update on public.%I for each row execute function public.record_audit()', t);
    -- No delete grant: records are soft-deleted so the deletion reaches every device.
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;

  foreach t in array worker_logged loop
    execute format('create policy read on public.%I for select to authenticated using (public.is_member(farm_id))', t);
    execute format('create policy add on public.%I for insert to authenticated with check (public.is_member(farm_id))', t);
    execute format($p$create policy edit on public.%I for update to authenticated
      using (public.is_manager(farm_id) or (public.is_member(farm_id) and created_by = auth.uid() and created_at > now() - interval '24 hours'))
      with check (public.is_member(farm_id))$p$, t);
  end loop;

  foreach t in array shared loop
    execute format('create policy read on public.%I for select to authenticated using (public.is_member(farm_id))', t);
    execute format('create policy add on public.%I for insert to authenticated with check (public.is_manager(farm_id))', t);
    execute format('create policy edit on public.%I for update to authenticated using (public.is_manager(farm_id)) with check (public.is_manager(farm_id))', t);
  end loop;

  foreach t in array finance loop
    execute format('create policy read on public.%I for select to authenticated using (public.is_manager(farm_id))', t);
    execute format('create policy add on public.%I for insert to authenticated with check (public.is_manager(farm_id))', t);
    execute format('create policy edit on public.%I for update to authenticated using (public.is_manager(farm_id)) with check (public.is_manager(farm_id))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- operations
-- Membership changes run through these functions, so every rule sits in one place.

create function public.create_farm(farm_name text, member_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'this account already belongs to a farm' using errcode = '23505';
  end if;
  insert into farms (name) values (farm_name) returning id into new_id;
  insert into farm_sync (farm_id) values (new_id);
  insert into members (farm_id, user_id, display_name, role) values (new_id, auth.uid(), member_name, 'owner');
  return new_id;
end $$;

create function public.create_invite(invite_role text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me members;
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  select * into me from members where user_id = auth.uid();
  if me.id is null or me.role = 'worker' then
    raise exception 'not allowed to invite' using errcode = '42501';
  end if;
  if me.role = 'manager' and invite_role <> 'worker' then
    raise exception 'managers can only invite workers' using errcode = '42501';
  end if;
  insert into invites (farm_id, token_hash, role, created_by)
  values (me.farm_id, encode(sha256(convert_to(token, 'UTF8')), 'hex'), invite_role, auth.uid());
  return token;
end $$;

create function public.revoke_invite(invite_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update invites i set revoked_at = now()
  from members m
  where i.id = invite_id and m.user_id = auth.uid() and m.farm_id = i.farm_id
    and (m.role = 'owner' or (m.role = 'manager' and i.role = 'worker'));
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;

create function public.accept_invite(invite_token text, member_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  invite invites;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'this account already belongs to a farm' using errcode = '23505';
  end if;
  select * into invite from invites
  where token_hash = encode(sha256(convert_to(invite_token, 'UTF8')), 'hex')
    and accepted_at is null and revoked_at is null and expires_at > now()
  for update;
  if invite.id is null then raise exception 'this invite is invalid or has expired' using errcode = 'P0002'; end if;
  insert into members (farm_id, user_id, display_name, role)
  values (invite.farm_id, auth.uid(), member_name, invite.role);
  update invites set accepted_by = auth.uid(), accepted_at = now() where id = invite.id;
  return invite.farm_id;
end $$;

create function public.set_member_role(member_id uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me members;
  target members;
begin
  select * into me from members where user_id = auth.uid();
  select * into target from members where id = member_id;
  if me.role is distinct from 'owner' or target.farm_id is distinct from me.farm_id
     or target.id = me.id or new_role not in ('manager', 'worker') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update members set role = new_role where id = member_id;
end $$;

create function public.remove_member(member_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me members;
  target members;
begin
  select * into me from members where user_id = auth.uid();
  select * into target from members where id = member_id;
  if target.farm_id is distinct from me.farm_id or target.id = me.id
     or not (me.role = 'owner' or (me.role = 'manager' and target.role = 'worker')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from members where id = member_id;
end $$;

create function public.delete_farm(confirm_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me members;
  target farms;
begin
  select * into me from members where user_id = auth.uid();
  select * into target from farms where id = me.farm_id;
  if me.role is distinct from 'owner' then raise exception 'not allowed' using errcode = '42501'; end if;
  if target.name <> confirm_name then raise exception 'farm name does not match' using errcode = '22023'; end if;
  delete from farms where id = target.id;
end $$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_farm(text, text)', 'create_invite(text)', 'revoke_invite(uuid)', 'accept_invite(text, text)',
    'set_member_role(uuid, text)', 'remove_member(uuid)', 'delete_farm(text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
