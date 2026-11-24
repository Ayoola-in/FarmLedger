import { CurrencyCircleDollar, PencilSimple, Plus, Receipt, Trash, Users, WhatsappLogo } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { formatDay, startOfMonth } from '../domain/dates';
import { saleReceipt, toCsv, whatsappLink } from '../domain/exports';
import { profitAndLoss, saleBalance, salePaid } from '../domain/metrics';
import { formatMoney } from '../domain/money';
import type { Sale } from '../domain/types';
import { useFarm } from '../ui/farm';
import { saleCategoryLabel, useForms } from '../ui/forms';
import { FilterBar, matches, periodRange, type Period } from '../ui/filters';
import { download, Empty, PageHead, Tile } from '../ui/kit';

type Tab = 'sales' | 'expenses' | 'owed' | 'customers';
const PAGE = 25;

const LINK_NOTE: Record<string, string> = {
  flock: 'Change this cost by editing the flock.',
  feed_purchase: 'Change this cost by editing the feed purchase.',
  health_event: 'Change this cost by editing the treatment.',
};

export default function Finance() {
  const { records, today, remove, workspace } = useFarm();
  const forms = useForms();
  const [tab, setTab] = useState<Tab>('sales');
  const [limit, setLimit] = useState(PAGE);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [kind, setKind] = useState('');

  const customer = useMemo(() => new Map(records.customers.map((c) => [c.id, c])), [records.customers]);
  const month = useMemo(() => profitAndLoss(records, startOfMonth(today), today), [records, today]);
  const sales = useMemo(() => [...records.sales].sort((a, b) => b.date.localeCompare(a.date)), [records.sales]);
  const expenses = useMemo(() => [...records.expenses].sort((a, b) => b.date.localeCompare(a.date)), [records.expenses]);
  const owing = useMemo(() => sales.filter((s) => saleBalance(s, records.payments) > 0), [sales, records.payments]);
  const totalOwed = owing.reduce((n, s) => n + saleBalance(s, records.payments), 0);

  const range = periodRange(period, today);
  const buyerName = (sale: Sale) => (sale.customer_id ? customer.get(sale.customer_id)?.name : undefined) ?? 'Walk-in';
  const shownSales = sales.filter((s) => s.date >= range.from && s.date <= range.to && (!kind || s.category === kind)
    && matches(query, s.description, buyerName(s), saleCategoryLabel(s.category)));
  const shownExpenses = expenses.filter((e) => e.date >= range.from && e.date <= range.to && (!kind || e.category === kind)
    && matches(query, e.category, e.description, e.vendor));
  const expenseCategories = [...new Set(expenses.map((e) => e.category))].sort();
  const shownTotal = tab === 'sales'
    ? shownSales.reduce((n, s) => n + s.amount_kobo, 0)
    : shownExpenses.reduce((n, e) => n + e.amount_kobo, 0);
  const flockName = new Map(records.flocks.map((f) => [f.id, f.name]));

  const exportCsv = () => {
    const span = period === 'all' ? 'all' : `${range.from}-to-${range.to}`;
    if (tab === 'sales') {
      download(`farmledger-sales-${span}.csv`, toCsv([
        ['Date', 'Category', 'Description', 'Quantity', 'Customer', 'Flock', 'Total (NGN)', 'Paid (NGN)', 'Balance (NGN)'],
        ...shownSales.map((s) => [s.date, saleCategoryLabel(s.category), s.description, s.quantity, buyerName(s), s.flock_id ? flockName.get(s.flock_id) : '',
          s.amount_kobo / 100, salePaid(s, records.payments) / 100, saleBalance(s, records.payments) / 100]),
      ]), 'text/csv;charset=utf-8');
    } else {
      download(`farmledger-expenses-${span}.csv`, toCsv([
        ['Date', 'Category', 'Paid to', 'Note', 'Flock', 'Amount (NGN)'],
        ...shownExpenses.map((e) => [e.date, e.category, e.vendor, e.description, e.flock_id ? flockName.get(e.flock_id) : '', e.amount_kobo / 100]),
      ]), 'text/csv;charset=utf-8');
    }
  };
  const filtering = query.trim() !== '' || period !== 'all' || kind !== '';
  const filterBar = (count: number, noun: string, options: { value: string; label: string }[]) => (
    <FilterBar
      search={{ value: query, onChange: (v) => { setQuery(v); setLimit(PAGE); }, placeholder: tab === 'sales' ? 'Search customer or note' : 'Search category, payee or note' }}
      select={{ label: 'Category', value: kind, onChange: (v) => { setKind(v); setLimit(PAGE); }, options: [{ value: '', label: 'All categories' }, ...options] }}
      period={{ value: period, onChange: (v) => { setPeriod(v); setLimit(PAGE); } }}
      onExport={count > 0 ? exportCsv : undefined}
      summary={filtering ? <>{count} {noun}{count === 1 ? '' : 's'} · <strong className="num">{formatMoney(shownTotal)}</strong></> : undefined}
    />
  );
  const noMatch = (
    <div className="empty">
      <p>Nothing matches these filters.</p>
      <button type="button" className="btn btn-sm" onClick={() => { setQuery(''); setPeriod('all'); setKind(''); }}>Clear filters</button>
    </div>
  );

  const shareLink = (sale: Sale) => {
    const buyer = sale.customer_id ? customer.get(sale.customer_id) : undefined;
    return whatsappLink(
      saleReceipt({
        farmName: workspace.farm.name,
        date: sale.date,
        description: sale.description || `${sale.quantity} × ${saleCategoryLabel(sale.category)}`,
        amountKobo: sale.amount_kobo,
        paidKobo: salePaid(sale, records.payments),
        customer: buyer?.name,
      }),
      buyer?.phone,
    );
  };

  const saleLabel = (sale: Sale) => sale.description || `${sale.quantity} ${saleCategoryLabel(sale.category).toLowerCase()}`;

  return (
    <div className="stack-lg">
      <PageHead title="Finance">
        <button type="button" className="btn" onClick={() => forms.open({ type: 'expense' })}>Record expense</button>
        <button type="button" className="btn btn-primary" onClick={() => forms.open({ type: 'sale' })}><Plus size={18} weight="bold" />Record sale</button>
      </PageHead>

      <section className="grid-tiles" aria-label="This month">
        <Tile label="Revenue this month" value={formatMoney(month.revenueKobo)} />
        <Tile label="Expenses this month" value={formatMoney(month.expensesKobo)} />
        <Tile label="Profit this month" value={formatMoney(month.profitKobo)} tone={month.profitKobo < 0 ? 'neg' : undefined} />
        <Tile label="Owed by customers" value={formatMoney(totalOwed)} note={`${owing.length} unpaid sale${owing.length === 1 ? '' : 's'}`} />
      </section>

      <div className="segments" role="tablist" aria-label="Finance records">
        {([['sales', 'Sales'], ['expenses', 'Expenses'], ['owed', `Owed (${owing.length})`], ['customers', 'Customers']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" className="segment" aria-selected={tab === id} onClick={() => { setTab(id); setLimit(PAGE); setKind(''); }}>{label}</button>
        ))}
      </div>

      <section className="card">
        {tab === 'sales' && (sales.length === 0 ? (
          <Empty icon={<CurrencyCircleDollar size={26} />} title="No sales yet" body="Record a sale to start tracking revenue and who owes you." />
        ) : (<>
          {filterBar(shownSales.length, 'sale', (['eggs', 'birds', 'manure', 'other'] as const).map((c) => ({ value: c, label: saleCategoryLabel(c) })))}
          {shownSales.length === 0 ? noMatch : (
          <div className="table-wrap">
            <table className="rtable">
              <thead><tr><th>Date</th><th>Sale</th><th className="hide-sm">Customer</th><th className="r">Total</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shownSales.slice(0, limit).map((sale) => {
                  const balance = saleBalance(sale, records.payments);
                  return (
                    <tr key={sale.id}>
                      <td className="nowrap">{formatDay(sale.date)}<span className="show-sm"> · {buyerName(sale)}</span></td>
                      <td className="c-main">{saleLabel(sale)}</td>
                      <td className="hide-sm">{buyerName(sale)}</td>
                      <td className="r c-end">{formatMoney(sale.amount_kobo)}</td>
                      <td className="c-end2">{balance > 0 ? <span className="badge warn">{formatMoney(balance)} owed</span> : <span className="badge good">Paid</span>}</td>
                      <td className="c-act">
                        <div className="actions">
                          <a className="btn btn-ghost btn-sm btn-icon" href={shareLink(sale)} target="_blank" rel="noreferrer" aria-label={`Send receipt for ${saleLabel(sale)} on WhatsApp`}><WhatsappLogo size={17} /></a>
                          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Edit ${saleLabel(sale)}`} onClick={() => forms.open({ type: 'sale', record: sale })}><PencilSimple size={17} /></button>
                          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Delete ${saleLabel(sale)}`} onClick={() => void remove('sales', sale.id, 'Sale')}><Trash size={17} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </>))}

        {tab === 'expenses' && (expenses.length === 0 ? (
          <Empty icon={<Receipt size={26} />} title="No expenses yet" body="Flock, feed and treatment costs appear here automatically. Add anything else, like wages or diesel." />
        ) : (<>
          {filterBar(shownExpenses.length, 'expense', expenseCategories.map((c) => ({ value: c, label: c })))}
          {shownExpenses.length === 0 ? noMatch : (
          <div className="table-wrap">
            <table className="rtable">
              <thead><tr><th>Date</th><th>Category</th><th className="hide-sm">Details</th><th className="r">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shownExpenses.slice(0, limit).map((expense) => (
                  <tr key={expense.id}>
                    <td className="nowrap">{formatDay(expense.date)}{(expense.description || expense.vendor) && <span className="show-sm"> · {expense.description || expense.vendor}</span>}</td>
                    <td className="c-main">{expense.category}</td>
                    <td className="hide-sm">{expense.description || expense.vendor || '–'}</td>
                    <td className="r c-end">{formatMoney(expense.amount_kobo)}</td>
                    <td className="c-act">
                      {expense.source_table ? (
                        <span className="small muted" title={LINK_NOTE[expense.source_table]}>Linked</span>
                      ) : (
                        <div className="actions">
                          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Edit ${expense.category} expense`} onClick={() => forms.open({ type: 'expense', record: expense })}><PencilSimple size={17} /></button>
                          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Delete ${expense.category} expense`} onClick={() => void remove('expenses', expense.id, 'Expense')}><Trash size={17} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>))}

        {tab === 'owed' && (owing.length === 0 ? (
          <Empty icon={<CurrencyCircleDollar size={26} />} title="Nobody owes you" body="Sales on credit will appear here until they’re paid." />
        ) : (
          <ul className="list">
            {owing.map((sale) => {
              const buyer = sale.customer_id ? customer.get(sale.customer_id) : undefined;
              return (
                <li key={sale.id}>
                  <div className="grow">
                    <strong>{buyer?.name ?? 'Walk-in customer'}</strong>
                    <div className="small muted">{saleLabel(sale)} · {formatDay(sale.date)}</div>
                  </div>
                  <strong className="num nowrap">{formatMoney(saleBalance(sale, records.payments))}</strong>
                  <a className="btn btn-ghost btn-sm btn-icon" href={shareLink(sale)} target="_blank" rel="noreferrer" aria-label={`Send reminder to ${buyer?.name ?? 'customer'} on WhatsApp`}><WhatsappLogo size={17} /></a>
                  <button type="button" className="btn btn-sm" onClick={() => forms.open({ type: 'payment', sale })}>Record payment</button>
                </li>
              );
            })}
          </ul>
        ))}

        {((tab === 'sales' && shownSales.length > limit) || (tab === 'expenses' && shownExpenses.length > limit)) && (

          <div className="card-pad"><button type="button" className="btn btn-block" onClick={() => setLimit(limit + PAGE)}>Show more</button></div>
        )}

        {tab === 'customers' && (
          <>
            <div className="card-head"><h2>Customers</h2><button type="button" className="btn btn-sm" onClick={() => forms.open({ type: 'customer' })}><Plus size={15} />Add</button></div>
            {records.customers.length === 0 ? (
              <Empty icon={<Users size={26} />} title="No customers yet" body="Save regular buyers to track what they owe and send receipts on WhatsApp." />
            ) : (
              <ul className="list" style={{ marginTop: 8 }}>
                {records.customers.map((c) => {
                  const theirs = records.sales.filter((s) => s.customer_id === c.id);
                  const owed = theirs.reduce((n, s) => n + saleBalance(s, records.payments), 0);
                  return (
                    <li key={c.id}>
                      <div className="grow">
                        <strong>{c.name}</strong>
                        <div className="small muted">{c.phone ?? 'No phone'} · {theirs.length} sale{theirs.length === 1 ? '' : 's'}</div>
                      </div>
                      {owed > 0 && <span className="badge warn">{formatMoney(owed)} owed</span>}
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Edit ${c.name}`} onClick={() => forms.open({ type: 'customer', record: c })}><PencilSimple size={17} /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
