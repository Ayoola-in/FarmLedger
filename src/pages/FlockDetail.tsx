import { ArrowLeft, CurrencyCircleDollar, Egg, FirstAidKit, Grains, PencilSimple, HeartBreak, Trash } from '@phosphor-icons/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { addDays, formatDay, formatDayShort, lastNDays } from '../domain/dates';
import { birdsAlive, flockAgeDays, flockPnl, layingRate, mortalityRate } from '../domain/metrics';
import { formatMoney } from '../domain/money';
import { LineChart } from '../ui/charts';
import { useFarm } from '../ui/farm';
import { useForms } from '../ui/forms';
import { ConfirmSheet, PageHead, Tile } from '../ui/kit';

interface TimelineItem {
  key: string;
  date: string;
  icon: ReactNode;
  title: string;
  detail?: string;
}

export default function FlockDetail() {
  const { id } = useParams();
  const { records, today, canManage, save, remove } = useFarm();
  const forms = useForms();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'close' | 'delete' | null>(null);
  const flock = records.flocks.find((f) => f.id === id);

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!flock) return [];
    const items: TimelineItem[] = [
      ...records.mortality_logs.filter((m) => m.flock_id === flock.id).map((m) => ({
        key: m.id, date: m.date, icon: <HeartBreak size={20} />, title: `${m.quantity} bird${m.quantity === 1 ? '' : 's'} died`, detail: m.cause ?? undefined,
      })),
      ...records.health_events.filter((h) => h.flock_id === flock.id).map((h) => ({
        key: h.id, date: h.date, icon: <FirstAidKit size={20} />, title: h.product, detail: h.kind === 'vaccine' ? 'Vaccine' : 'Medication',
      })),
      ...records.sales.filter((s) => s.flock_id === flock.id && s.category === 'birds').map((s) => ({
        key: s.id, date: s.date, icon: <CurrencyCircleDollar size={20} />, title: `${s.quantity} birds sold`, detail: canManage ? formatMoney(s.amount_kobo) : undefined,
      })),
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);
  }, [records, flock, canManage]);

  if (!flock) return <Navigate to="/app/flocks" replace />;

  const alive = birdsAlive(flock, records.mortality_logs, records.sales);
  const rate = layingRate(flock, records.egg_logs, records.mortality_logs, records.sales, today);
  const ageDays = flockAgeDays(flock, flock.closed_on ?? today);
  const pnl = canManage ? flockPnl(flock, records) : null;
  const loggedToday = records.egg_logs.some((e) => e.flock_id === flock.id && e.date === today);
  const days = lastNDays(loggedToday ? today : addDays(today, -1), 30);
  const eggs = days.map((d) => records.egg_logs.filter((e) => e.flock_id === flock.id && e.date === d).reduce((n, e) => n + e.collected, 0));
  const isActive = flock.status === 'active';

  return (
    <div className="stack-lg">
      <div>
        <Link to="/app/flocks" className="btn btn-ghost btn-sm" style={{ marginLeft: -12 }}><ArrowLeft size={16} />Flocks</Link>
        <PageHead
          title={flock.name}
          sub={[flock.breed, flock.house, isActive ? `${Math.floor(ageDays / 7)} weeks old` : `Closed ${formatDay(flock.closed_on ?? today)}`].filter(Boolean).join(' · ')}
        >
          {canManage && <button type="button" className="btn" onClick={() => forms.open({ type: 'flock', record: flock })}><PencilSimple size={18} />Edit</button>}
          {canManage && isActive && <button type="button" className="btn" onClick={() => setConfirm('close')}>Close flock</button>}
          {canManage && <button type="button" className="btn btn-icon" aria-label="Delete flock" onClick={() => setConfirm('delete')}><Trash size={18} /></button>}
        </PageHead>
      </div>

      {isActive && (
        <section className="quick-grid" aria-label="Log for this flock">
          <button type="button" className="quick" onClick={() => forms.open({ type: 'eggs', flockId: flock.id })}><Egg size={26} />Eggs</button>
          <button type="button" className="quick" onClick={() => forms.open({ type: 'feed-usage', flockId: flock.id })}><Grains size={26} />Feed used</button>
          <button type="button" className="quick" onClick={() => forms.open({ type: 'mortality', flockId: flock.id })}><HeartBreak size={26} />Deaths</button>
          <button type="button" className="quick" onClick={() => forms.open({ type: 'health', flockId: flock.id })}><FirstAidKit size={26} />Treatment</button>
        </section>
      )}

      <section className="grid-tiles" aria-label="Flock figures">
        <Tile label="Birds alive" value={alive.toLocaleString()} note={`of ${flock.quantity.toLocaleString()} received`} />
        <Tile label="Mortality" value={`${(mortalityRate(flock, records.mortality_logs) * 100).toFixed(1)}%`} />
        <Tile label="Laying rate" value={rate === null ? '–' : `${Math.round(rate * 100)}%`} note="Last 7 days" />
        {pnl && <Tile label="Cost per bird" value={formatMoney(pnl.costPerBirdKobo)} note="All costs so far" />}
      </section>

      <div className="grid-main">
        <section className="card">
          <div className="card-head"><h2>Eggs, last 30 days</h2></div>
          <div className="card-pad">
            <LineChart
              labels={days.map(formatDayShort)}
              fullLabels={days.map(formatDay)}
              series={[{ name: 'Eggs', color: 'var(--chart-1)', values: eggs }]}
              caption={`Eggs collected per day from ${flock.name} over the last 30 days.`}
              format={(v) => v.toLocaleString()}
            />
          </div>
        </section>

        {pnl && (
          <section className="card">
            <div className="card-head"><h2>Profit and loss</h2></div>
            <div className="table-wrap">
              <table className="statement">
                <tbody>
                  <tr><td>Revenue</td><td className="r">{formatMoney(pnl.revenueKobo)}</td></tr>
                  <tr><td>Bird purchase</td><td className="r">−{formatMoney(pnl.purchaseKobo)}</td></tr>
                  <tr><td>Feed eaten ({pnl.feedKg.toLocaleString()} kg)</td><td className="r">−{formatMoney(pnl.feedKobo)}</td></tr>
                  <tr><td>Health</td><td className="r">−{formatMoney(pnl.healthKobo)}</td></tr>
                  <tr><td>Other</td><td className="r">−{formatMoney(pnl.otherKobo)}</td></tr>
                  <tr className="total"><td>{pnl.profitKobo >= 0 ? 'Profit' : 'Loss'}</td><td className={`r ${pnl.profitKobo < 0 ? 'neg' : 'pos'}`}>{formatMoney(pnl.profitKobo)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="small muted card-pad">Sales only count here when they’re linked to this flock.</p>
          </section>
        )}
      </div>

      <section className="card">
        <div className="card-head"><h2>Recent events</h2></div>
        {timeline.length === 0 ? (
          <p className="card-pad muted">No deaths, treatments or bird sales recorded yet.</p>
        ) : (
          <ul className="list" style={{ marginTop: 8 }}>
            {timeline.map((item) => (
              <li key={item.key}>
                <span className="icon-chip">{item.icon}</span>
                <div className="grow"><strong>{item.title}</strong>{item.detail && <div className="small muted">{item.detail}</div>}</div>
                <span className="small muted nowrap">{formatDayShort(item.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirm === 'close' && (
        <ConfirmSheet
          title={`Close ${flock.name}?`}
          body={`It leaves your active flocks and stops generating reminders. Its records and profit stay available, and ${alive} birds will be shown as remaining.`}
          confirmLabel="Close flock"
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void save('flocks', { ...flock, status: 'closed', closed_on: today });
          }}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmSheet
          title={`Delete ${flock.name}?`}
          body="This also deletes its egg, feed, death and treatment records and its costs. You can undo right after. To keep the history, close the flock instead."
          confirmLabel="Delete flock"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void remove('flocks', flock.id, flock.name).then(() => navigate('/app/flocks'));
          }}
        />
      )}
    </div>
  );
}
