# FarmLedger

Poultry farm records and accounts for owners and their teams. Log eggs, feed, deaths and treatments from a phone, with or without signal, and see real profit per flock and for the whole farm.

## What it does

- **Today:** quick logging, key figures and what needs attention
- **Flocks:** birds alive, age, laying rate, mortality, cost per bird and per-flock profit
- **Eggs:** daily collection in eggs and crates, with checks for impossible entries and alerts when laying drops
- **Feed:** stock by type, days remaining and low-stock warnings
- **Health:** treatment records and an editable vaccination schedule with due dates per flock
- **Finance:** sales, expenses, customers, credit balances and WhatsApp receipts
- **Reports:** profit and loss, period comparison, flock performance, CSV and print to PDF
- **Team:** owner, manager and worker roles through single-use invite links. Workers never receive financial data.
- **Works offline:** installable PWA. Every screen works without signal, and changes sync when back online.

## Run it locally

Requires Node 24.

```bash
npm install
npm run dev
```

With no Supabase settings, the app runs in local-only mode: one device, no accounts. The demo farm is available either way.

## Connect the backend

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/migrations/20261105000000_init.sql`. If you use the Supabase CLI, run `supabase db push` instead.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key from **Project Settings > API**. Never use the `service_role` key here.
4. Under **Authentication > URL Configuration**, set the Site URL to your domain and add these redirect URLs:
   - `https://YOUR-DOMAIN/onboarding`
   - `https://YOUR-DOMAIN/auth/reset`
5. Under **Authentication > SMTP Settings**, add an email provider. Supabase's built-in sender is heavily rate limited and not meant for real users.

## Deploy

The app is a static site, and `vercel.json` sets up routing and security headers.

1. Import the repository into Vercel.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
3. Deploy.

The Content Security Policy allows connections only to the app itself and `*.supabase.co`. Update `vercel.json` if you add other services or use a custom Supabase domain.

## Test

```bash
npm run typecheck
npm test            # business logic, sync engine, database security rules
npm run build
npm run e2e         # browser tests on phone and desktop, under the production CSP
```

First run of the browser tests needs `npx playwright install chromium`. Database security tests run the real migration on PGlite, so Docker isn't needed. GitHub Actions runs all of this on every push.

## How it works

```
React UI ──> src/data/repo.ts ──> IndexedDB + upload queue ──> Supabase Postgres
   ^                                     ^                          |
   └──────── live queries ───────────────┴──── src/data/sync.ts ────┘
```

- **Device first.** The UI only reads and writes the on-device database. A write and its queue entry share one transaction, so neither can exist alone.
- **No duplicates.** Devices create record IDs, so a retried upload lands on the same record.
- **Ordered downloads.** Each farm has its own sequence counter, locked until commit, so numbers become visible strictly in order and a device can't skip a row.
- **Conflicts.** The last edit to reach the server wins, and the earlier version is kept in `audit_log`. Separate log entries never conflict.
- **Derived numbers.** Birds alive and feed stock are calculated from logs and never stored, so they can't drift.
- **One copy of each cost.** Costs live only in `expenses`, linked to their source record. This also keeps money out of every table workers can read.
- **Money and dates.** Amounts are whole kobo. Record dates are calendar days in the farm's time zone.
- **Security.** Row-level security in Postgres separates farms and enforces roles. App checks only decide what to show.

| Folder | Contents |
|---|---|
| `src/domain` | Pure business rules: metrics, health schedule, old-app import, exports |
| `src/data` | On-device database, write layer, sync engine, session, Supabase connection |
| `src/ui` | Shell, forms, charts and shared components |
| `src/pages` | One file per screen |
| `supabase/migrations` | Database schema and security rules |
| `tests`, `e2e` | Database security tests and browser tests |

## Moving from the old app

Export a backup from the old version, then choose **Settings > Your data > Import a backup**. The import corrects old faults as it goes: bird sales go back to the amount charged, flock costs reach expenses, and duplicate feed and vaccine costs are removed. Old backups never included vaccine records, so those can't be recovered from the file.
