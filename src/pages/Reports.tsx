import { DownloadSimple, Printer } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { addDays, daysBetween, formatDay, startOfMonth } from '../domain/dates';
import { toCsv } from '../domain/exports';
import { birdsAlive, flockPnl, profitAndLoss, type ProfitAndLoss } from '../domain/metrics';
import { formatMoney, formatMoneyShort } from '../domain/money';
import { BarChart, RankedBars } from '../ui/charts';
import { useFarm } from '../ui/farm';
import { download, Field, PageHead, Tile } from '../ui/kit';

type Preset = 'month' | 'last-month' | '90' | 'year' | 'custom';

function presetRange(preset: Preset, today: string): [string, string] | null {
  switch (preset) {
    case 'month': return [startOfMonth(today), today];
    case 'last-month': {
      const end = addDays(startOfMonth(today), -1);
      return [startOfMonth(end), end];
    }
    case '90': return [addDays(today, -89), today];
    case 'year': return [`${today.slice(0, 4)}-01-01`, today];
    case 'custom': return null;
  }
}

function monthsIn(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = from.slice(0, 7);
  const last = to.slice(0, 7);
  while (cursor <= last) {
    months.push(cursor);
    const [y, m] = cursor.split('-').map(Number) as [number, number];
    cursor = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return months;
}

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-NG', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

function changeNote(current: number, previous: number): string {
  if (previous === 0) return 'No earlier figure to compare';
  const change = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (Math.abs(change) > 300) return change > 0 ? 'Far above the previous period' : 'Far below the previous period';
  return `${change > 0 ? '+' : ''}${change}% on the previous period`;
}

export default function Reports() {
  const { records, today, workspace } = useFarm();
  const [preset, setPreset] = useState<Preset>('month');
  const [customFrom, setCustomFrom] = useState(addDays(today, -29));
  const [customTo, setCustomTo] = useState(today);
  const [from, to] = presetRange(preset, today) ?? (customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom]);

  const span = daysBetween(from, to);
  const pnl = useMemo(() => profitAndLoss(records, from, to), [records, from, to]);
  const previous = useMemo<ProfitAndLoss>(() => profitAndLoss(records, addDays(from, -span - 1), addDays(from, -1)), [records, from, span]);

  const months = useMemo(() => {
    // A short range still shows a few months of context.
    const list = monthsIn(span < 90 ? addDays(to, -150) : from, to);
    return list.map((m) => {
      const inMonth = <T extends { date: string }>(rows: T[]) => rows.filter((r) => r.date.startsWith(m));
      return {
        month: m,
        revenue: inMonth(records.sales).reduce((n, s) => n + s.amount_kobo, 0),
        expenses: inMonth(records.expenses).reduce((n, e) => n + e.amount_kobo, 0),
      };
    });
  }, [records, from, to, span]);

  const flockRows = useMemo(
    () => records.flocks.map((flock) => ({ flock, alive: birdsAlive(flock, records.mortality_logs, records.sales), pnl: flockPnl(flock, records) })),
    [records],
  );

  const exportCsv = () => {
    const sales = records.sales.filter((s) => s.date >= from && s.date <= to);
    const expenses = records.expenses.filter((e) => e.date >= from && e.date <= to);
    const rows: (string | number | null)[][] = [
      ['Type', 'Date', 'Category', 'Details', 'Amount (NGN)'],
      ...sales.map((s) => ['Sale', s.date, s.category, s.description, s.amount_kobo / 100]),
      ...expenses.map((e) => ['Expense', e.date, e.category, e.description ?? e.vendor, e.amount_kobo / 100]),
    ];
    download(`farmledger-${from}-to-${to}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };

  const money = (kobo: number) => formatMoney(kobo);
  const revenueItems = Object.entries(pnl.revenueByCategory).map(([label, value]) => ({ label: label[0]?.toUpperCase() + label.slice(1), value }));
  const expenseItems = Object.entries(pnl.expensesByCategory).map(([label, value]) => ({ label, value }));

  return (
    <div className="stack-lg">
      <PageHead title="Reports" sub={`${workspace.farm.name} · ${formatDay(from)} to ${formatDay(to)}`}>
        <button type="button" className="btn" onClick={exportCsv}><DownloadSimple size={18} />CSV</button>
        <button type="button" className="btn" onClick={() => window.print()}><Printer size={18} />Print or PDF</button>
      </PageHead>

      <div className="stack no-print" style={{ gap: 10 }}>
        <div className="segments" role="group" aria-label="Report period">
          {([['month', 'This month'], ['last-month', 'Last month'], ['90', '90 days'], ['year', 'This year'], ['custom', 'Custom']] as [Preset, string][]).map(([id, label]) => (
            <button key={id} type="button" className="segment" aria-pressed={preset === id} onClick={() => setPreset(id)}>{label}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="field-row" style={{ maxWidth: 420 }}>
            <Field label="From" type="date" value={customFrom} onChange={setCustomFrom} max={today} />
            <Field label="To" type="date" value={customTo} onChange={setCustomTo} max={today} />
          </div>
        )}
      </div>

      <section className="grid-tiles" aria-label="Summary">
        <Tile label="Revenue" value={money(pnl.revenueKobo)} note={changeNote(pnl.revenueKobo, previous.revenueKobo)} />
        <Tile label="Expenses" value={money(pnl.expensesKobo)} note={changeNote(pnl.expensesKobo, previous.expensesKobo)} />
        <Tile label={pnl.profitKobo >= 0 ? 'Profit' : 'Loss'} value={money(pnl.profitKobo)} tone={pnl.profitKobo < 0 ? 'neg' : undefined} note={changeNote(pnl.profitKobo, previous.profitKobo)} />
        <Tile label="Still owed from these sales" value={money(pnl.owedKobo)} note="Included in revenue" />
      </section>

      <div className="grid-main">
        <section className="card">
          <div className="card-head"><h2>Revenue and expenses by month</h2></div>
          <div className="card-pad">
            <BarChart
              labels={months.map((m) => monthLabel(m.month))}
              series={[
                { name: 'Revenue', color: 'var(--chart-1)', values: months.map((m) => m.revenue) },
                { name: 'Expenses', color: 'var(--chart-2)', values: months.map((m) => m.expenses) },
              ]}
              format={money}
              axisFormat={(v) => formatMoneyShort(v)}
              caption="Revenue and expenses for each month."
            />
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2>Profit and loss</h2></div>
          <div className="table-wrap">
            <table className="statement">
              <tbody>
                <tr className="head"><td colSpan={2}>Revenue</td></tr>
                {revenueItems.map((i) => <tr key={i.label}><td>{i.label}</td><td className="r">{money(i.value)}</td></tr>)}
                <tr className="head"><td colSpan={2}>Expenses</td></tr>
                {expenseItems.map((i) => <tr key={i.label}><td>{i.label}</td><td className="r">{money(i.value)}</td></tr>)}
                <tr className="total"><td>{pnl.profitKobo >= 0 ? 'Net profit' : 'Net loss'}</td><td className={`r ${pnl.profitKobo < 0 ? 'neg' : 'pos'}`}>{money(pnl.profitKobo)}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {expenseItems.length > 0 && (
        <section className="card card-pad stack">
          <h2>Where the money went</h2>
          <RankedBars items={expenseItems} format={money} />
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>Flock performance, all time</h2></div>
        {flockRows.length === 0 ? <p className="card-pad muted">No flocks yet.</p> : (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr><th>Flock</th><th className="r hide-sm">Birds alive</th><th className="r hide-sm">Eggs</th><th className="r hide-sm">Feed (kg)</th><th className="r">Total cost</th><th className="r hide-sm">Revenue</th><th className="r">Profit</th></tr>
              </thead>
              <tbody>
                {flockRows.map(({ flock, alive, pnl: f }) => (
                  <tr key={flock.id}>
                    <td>{flock.name}</td>
                    <td className="r hide-sm">{alive.toLocaleString()}</td>
                    <td className="r hide-sm">{f.eggsCollected.toLocaleString()}</td>
                    <td className="r hide-sm">{f.feedKg.toLocaleString()}</td>
                    <td className="r">{money(f.totalCostKobo)}</td>
                    <td className="r hide-sm">{money(f.revenueKobo)}</td>
                    <td className={`r ${f.profitKobo < 0 ? 'neg' : ''}`}>{money(f.profitKobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted card-pad">Flock profit counts sales linked to that flock, plus its purchase, health and direct costs, and feed eaten at the average price paid. Unlinked sales and farm-wide expenses appear only in the profit and loss above.</p>
      </section>
    </div>
  );
}
