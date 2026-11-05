import { CurrencyCircleDollar, PencilSimple, Plus, Receipt, Trash, Users, WhatsappLogo } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { formatDay, startOfMonth } from '../domain/dates';
import { saleReceipt, whatsappLink } from '../domain/exports';
import { profitAndLoss, saleBalance, salePaid } from '../domain/metrics';
import { formatMoney } from '../domain/money';
import type { Sale } from '../domain/types';
import { useFarm } from '../ui/farm';
import { saleCategoryLabel, useForms } from '../ui/forms';
import { Empty, PageHead, Tile } from '../ui/kit';

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

  const customer = useMemo(() => new Map(records.customers.map((c) => [c.id, c])), [records.customers]);
  const month = useMemo(() => profitAndLoss(records, startOfMonth(today), today), [records, today]);
  const sales = useMemo(() => [...records.sales].sort((a, b) => b.date.localeCompare(a.date)), [records.sales]);
  const expenses = useMemo(() => [...records.expenses].sort((a, b) => b.date.localeCompare(a.date)), [records.expenses]);
  const owing = useMemo(() => sales.filter((s) => saleBalance(s, records.payments) > 0), [sales, records.payments]);
  const totalOwed = owing.reduce((n, s) => n + saleBalance(s, records.payments), 0);

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
          <button key={id} type="button" role="tab" className="segment" aria-selected={tab === id} onClick={() => { setTab(id); setLimit(PAGE); }}>{label}</button>
        ))}
      </div>

      <section className="card">
        {tab === 'sales' && (sales.length === 0 ? (
          <Empty icon={<CurrencyCircleDollar size={26} />} title="No sales yet" body="Record a sale to start tracking revenue and who owes you." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Sale</th><th className="hide-sm">Customer</th><th className="r">Total</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {sales.slice(0, limit).map((sale) => {
                  const balance = saleBalance(sale, records.payments);
                  return (
                    <tr key={sale.id}>
                      <td className="nowrap">{formatDay(sale.date)}</td>
                      <td>{saleLabel(sale)}</td>
                      <td className="hide-sm">{sale.customer_id ? customer.get(sale.customer_id)?.name ?? '–' : 'Walk-in'}</td>
                      <td className="r">{formatMoney(sale.amount_kobo)}</td>
                      <td>{balance > 0 ? <span className="badge warn">{formatMoney(balance)} owed</span> : <span className="badge good">Paid</span>}</td>
                      <td>
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
        ))}

        {tab === 'expenses' && (expenses.length === 0 ? (
          <Empty icon={<Receipt size={26} />} title="No expenses yet" body="Flock, feed and treatment costs appear here automatically. Add anything else, like wages or diesel." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Category</th><th className="hide-sm">Details</th><th className="r">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {expenses.slice(0, limit).map((expense) => (
                  <tr key={expense.id}>
                    <td className="nowrap">{formatDay(expense.date)}</td>
                    <td>{expense.category}</td>
                    <td className="hide-sm">{expense.description || expense.vendor || '–'}</td>
                    <td className="r">{formatMoney(expense.amount_kobo)}</td>
                    <td>
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
        ))}

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

        {((tab === 'sales' && sales.length > limit) || (tab === 'expenses' && expenses.length > limit)) && (
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
