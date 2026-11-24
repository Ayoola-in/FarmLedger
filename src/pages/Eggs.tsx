import { Egg, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { addDays, formatDay, formatDayShort, lastNDays } from '../domain/dates';
import { eggsCrates, goodEggs } from '../domain/metrics';
import { LineChart } from '../ui/charts';
import { useFarm } from '../ui/farm';
import { useForms } from '../ui/forms';
import { toCsv } from '../domain/exports';
import { FilterBar, periodRange, type Period } from '../ui/filters';
import { download, Empty, PageHead, Tile } from '../ui/kit';

const PAGE = 30;

export default function Eggs() {
  const { records, today, workspace, canEdit, remove } = useFarm();
  const forms = useForms();
  const [limit, setLimit] = useState(PAGE);
  const [flockFilter, setFlockFilter] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const crate = workspace.farm.crate_size;

  const view = useMemo(() => {
    const logs = [...records.egg_logs].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    const total = (from: string, to: string) => logs.filter((l) => l.date >= from && l.date <= to).reduce((n, l) => n + l.collected, 0);
    const todayLogs = logs.filter((l) => l.date === today);
    const days = lastNDays(todayLogs.length > 0 ? today : addDays(today, -1), 30);
    return {
      logs, days,
      series: days.map((d) => logs.filter((l) => l.date === d).reduce((n, l) => n + l.collected, 0)),
      today: todayLogs.reduce((n, l) => n + l.collected, 0),
      good: todayLogs.reduce((n, l) => n + goodEggs(l), 0),
      week: total(addDays(today, -6), today),
      lastWeek: total(addDays(today, -13), addDays(today, -7)),
      flockName: new Map(records.flocks.map((f) => [f.id, f.name])),
    };
  }, [records, today]);

  const range = periodRange(period, today);
  const shown = view.logs.filter((l) => l.date >= range.from && l.date <= range.to && (!flockFilter || l.flock_id === flockFilter));
  const shownTotal = shown.reduce((n, l) => n + l.collected, 0);
  const shownCrates = eggsCrates(shownTotal, crate);
  const filtering = flockFilter !== '' || period !== 'all';
  const exportCsv = () => download(
    `farmledger-eggs-${period === 'all' ? 'all' : `${range.from}-to-${range.to}`}.csv`,
    toCsv([
      ['Date', 'Flock', 'Collected', 'Good', 'Broken', 'Dirty'],
      ...shown.map((l) => [l.date, view.flockName.get(l.flock_id) ?? '', l.collected, goodEggs(l), l.broken, l.dirty]),
    ]),
    'text/csv;charset=utf-8',
  );
  const crates = eggsCrates(view.week, crate);
  const change = view.lastWeek > 0 ? Math.round(((view.week - view.lastWeek) / view.lastWeek) * 100) : null;

  return (
    <div className="stack-lg">
      <PageHead title="Eggs">
        <button type="button" className="btn btn-primary" onClick={() => forms.open({ type: 'eggs' })}><Plus size={18} weight="bold" />Log eggs</button>
      </PageHead>
      <section className="grid-tiles" aria-label="Egg figures">
        <Tile label="Collected today" value={view.today.toLocaleString()} note={`${view.good.toLocaleString()} good`} />
        <Tile label="Last 7 days" value={view.week.toLocaleString()} note={`${crates.crates} crates, ${crates.loose} eggs`} />
        <Tile label="Against previous 7 days" value={change === null ? '–' : `${change > 0 ? '+' : ''}${change}%`} note={`Previous: ${view.lastWeek.toLocaleString()}`} />
      </section>
      <section className="card">
        <div className="card-head"><h2>Daily collection, last 30 days</h2></div>
        <div className="card-pad">
          <LineChart
            labels={view.days.map(formatDayShort)}
            fullLabels={view.days.map(formatDay)}
            series={[{ name: 'Eggs', color: 'var(--chart-1)', values: view.series }]}
            caption="Eggs collected per day for the last 30 days."
            format={(v) => v.toLocaleString()}
          />
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Records</h2></div>
        {view.logs.length === 0 ? (
          <Empty icon={<Egg size={26} />} title="No eggs logged yet" body="Log today’s collection and your trends will build from here." />
        ) : (
          <>
            <FilterBar
              select={{
                label: 'Flock', value: flockFilter, onChange: (v) => { setFlockFilter(v); setLimit(PAGE); },
                options: [{ value: '', label: 'All flocks' }, ...records.flocks.map((f) => ({ value: f.id, label: f.name }))],
              }}
              period={{ value: period, onChange: (v) => { setPeriod(v); setLimit(PAGE); } }}
              onExport={shown.length > 0 ? exportCsv : undefined}
              summary={filtering ? <>{shown.length} record{shown.length === 1 ? '' : 's'} · <strong className="num">{shownTotal.toLocaleString()}</strong> eggs ({shownCrates.crates} crates, {shownCrates.loose} eggs)</> : undefined}
            />
            {shown.length === 0 ? (
              <div className="empty">
                <p>No egg records match these filters.</p>
                <button type="button" className="btn btn-sm" onClick={() => { setFlockFilter(''); setPeriod('all'); }}>Clear filters</button>
              </div>
            ) : (
            <div className="table-wrap">
              <table className="rtable">
                <thead>
                  <tr><th>Date</th><th>Flock</th><th className="r">Collected</th><th className="r hide-sm">Good</th><th className="r hide-sm">Broken</th><th className="r hide-sm">Dirty</th><th><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {shown.slice(0, limit).map((log) => (
                    <tr key={log.id}>
                      <td className="nowrap c-main">{formatDay(log.date)}</td>
                      <td>{view.flockName.get(log.flock_id) ?? 'Removed flock'}{(log.broken > 0 || log.dirty > 0) && <span className="show-sm"> · {log.broken} broken, {log.dirty} dirty</span>}</td>
                      <td className="r c-end">{log.collected.toLocaleString()}<span className="show-sm"> eggs</span></td>
                      <td className="r hide-sm">{goodEggs(log).toLocaleString()}</td>
                      <td className="r hide-sm">{log.broken}</td>
                      <td className="r hide-sm">{log.dirty}</td>
                      <td className="c-act">
                        {canEdit(log) && (
                          <div className="actions">
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Edit eggs for ${formatDay(log.date)}`} onClick={() => forms.open({ type: 'eggs', record: log })}><PencilSimple size={17} /></button>
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Delete eggs for ${formatDay(log.date)}`} onClick={() => void remove('egg_logs', log.id, 'Egg record')}><Trash size={17} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            {shown.length > limit && (

              <div className="card-pad"><button type="button" className="btn btn-block" onClick={() => setLimit(limit + PAGE)}>Show more</button></div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
