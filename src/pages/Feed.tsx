import { Grains, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { formatDay } from '../domain/dates';
import { feedStock } from '../domain/metrics';
import { useFarm } from '../ui/farm';
import { useForms } from '../ui/forms';
import { Empty, PageHead } from '../ui/kit';

export default function Feed() {
  const { records, today, canManage, canEdit, remove, workspace } = useFarm();
  const forms = useForms();
  const stock = useMemo(() => feedStock(records.feed_purchases, records.feed_usage, today), [records, today]);
  const purchases = [...records.feed_purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const usage = [...records.feed_usage].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const flockName = new Map(records.flocks.map((f) => [f.id, f.name]));
  const low = workspace.farm.low_feed_days;

  return (
    <div className="stack-lg">
      <PageHead title="Feed">
        <button type="button" className="btn" onClick={() => forms.open({ type: 'feed-usage' })}>Log feed used</button>
        {canManage && <button type="button" className="btn btn-primary" onClick={() => forms.open({ type: 'feed-purchase' })}><Plus size={18} weight="bold" />Record purchase</button>}
      </PageHead>

      {stock.length === 0 ? (
        <div className="card">
          <Empty icon={<Grains size={26} />} title="No feed recorded yet" body="Record a purchase to see your stock and how many days it will last." />
        </div>
      ) : (
        <section className="grid-2" aria-label="Feed stock">
          {stock.map((s) => {
            const isLow = s.stockKg <= 0 || (s.daysLeft !== null && s.daysLeft <= low);
            const share = s.purchasedKg > 0 ? Math.max(0, Math.min(1, s.stockKg / s.purchasedKg)) : 0;
            return (
              <article className="card card-pad stack" key={s.feedType} style={{ gap: 10 }}>
                <div className="row between">
                  <h2>{s.feedType}</h2>
                  {isLow && <span className="badge bad">{s.stockKg <= 0 ? 'Out of stock' : 'Low'}</span>}
                </div>
                <div className="tile-value">{Math.max(0, s.stockKg).toLocaleString()} kg</div>
                <div className={`progress ${isLow ? 'low' : ''}`} aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></div>
                <p className="small muted">
                  {s.daysLeft !== null ? `About ${s.daysLeft} days left at ${Math.round(s.dailyUseKg).toLocaleString()} kg a day` : 'No use recorded in the last 14 days'}
                </p>
              </article>
            );
          })}
        </section>
      )}

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Recent use</h2></div>
          {usage.length === 0 ? <p className="card-pad muted">Nothing logged yet.</p> : (
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Date</th><th>Flock</th><th>Type</th><th className="r">Kg</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {usage.map((u) => (
                    <tr key={u.id}>
                      <td className="nowrap">{formatDay(u.date)}</td>
                      <td>{flockName.get(u.flock_id) ?? 'Removed flock'}</td>
                      <td>{u.feed_type}</td>
                      <td className="r">{u.quantity_kg.toLocaleString()}</td>
                      <td>
                        {canEdit(u) && (
                          <div className="actions">
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Edit feed use" onClick={() => forms.open({ type: 'feed-usage', record: u })}><PencilSimple size={17} /></button>
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Delete feed use" onClick={() => void remove('feed_usage', u.id, 'Feed record')}><Trash size={17} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2>Purchases</h2></div>
          {purchases.length === 0 ? <p className="card-pad muted">Nothing recorded yet.</p> : (
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Date</th><th>Type</th><th className="hide-sm">Supplier</th><th className="r">Kg</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id}>
                      <td className="nowrap">{formatDay(p.date)}</td>
                      <td>{p.feed_type}</td>
                      <td className="hide-sm">{p.supplier ?? '–'}</td>
                      <td className="r">{p.quantity_kg.toLocaleString()}</td>
                      <td>
                        {canManage && (
                          <div className="actions">
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Edit purchase" onClick={() => forms.open({ type: 'feed-purchase', record: p })}><PencilSimple size={17} /></button>
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Delete purchase" onClick={() => void remove('feed_purchases', p.id, 'Feed purchase')}><Trash size={17} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
