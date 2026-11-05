import { Bird, CheckCircle, CurrencyCircleDollar, Egg, FirstAidKit, Grains, HeartBreak, WarningCircle } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { addDays, formatDay, formatDayShort, lastNDays, startOfMonth } from '../domain/dates';
import { computeAlerts, missingEggLogs } from '../domain/health';
import { birdsAlive, eggsCrates, feedStock, layingRate, profitAndLoss } from '../domain/metrics';
import { formatMoney } from '../domain/money';
import { LineChart } from '../ui/charts';
import { useFarm } from '../ui/farm';
import { useForms } from '../ui/forms';
import { Empty, PageHead, Tile } from '../ui/kit';
import { QuickButton } from '../ui/Shell';

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Today() {
  const { records, today, canManage, workspace } = useFarm();
  const forms = useForms();
  const farm = workspace.farm;

  const view = useMemo(() => {
    const active = records.flocks.filter((f) => f.status === 'active');
    const birds = active.reduce((n, f) => n + birdsAlive(f, records.mortality_logs, records.sales), 0);
    const todayLogs = records.egg_logs.filter((e) => e.date === today);
    const eggsToday = todayLogs.reduce((n, e) => n + e.collected, 0);
    const yesterday = addDays(today, -1);
    const eggsYesterday = records.egg_logs.filter((e) => e.date === yesterday).reduce((n, e) => n + e.collected, 0);
    const stock = feedStock(records.feed_purchases, records.feed_usage, today);
    const feedKg = stock.reduce((n, s) => n + Math.max(0, s.stockKg), 0);
    const soonest = stock.map((s) => s.daysLeft).filter((d): d is number => d !== null).sort((a, b) => a - b)[0];
    const rates = active
      .map((f) => ({ rate: layingRate(f, records.egg_logs, records.mortality_logs, records.sales, today), alive: birdsAlive(f, records.mortality_logs, records.sales) }))
      .filter((r) => r.rate !== null);
    const weight = rates.reduce((n, r) => n + r.alive, 0);
    const laying = weight > 0 ? rates.reduce((n, r) => n + (r.rate as number) * r.alive, 0) / weight : null;
    const days = lastNDays(todayLogs.length > 0 ? today : yesterday, 30);
    const eggSeries = days.map((d) => records.egg_logs.filter((e) => e.date === d).reduce((n, e) => n + e.collected, 0));
    return {
      active, birds, eggsToday, eggsYesterday, feedKg, soonest, laying, days, eggSeries,
      missing: missingEggLogs(records, today),
      alerts: computeAlerts(records, today, farm.low_feed_days),
      month: canManage ? profitAndLoss(records, startOfMonth(today), today) : null,
    };
  }, [records, today, canManage, farm.low_feed_days]);

  const crates = eggsCrates(view.eggsToday, farm.crate_size);

  if (records.flocks.length === 0) {
    return (
      <>
        <PageHead title={`${greeting()}`} sub={farm.name} />
        <div className="card">
          <Empty
            icon={<Bird size={26} />}
            title="Add your first flock"
            body={canManage ? 'Everything in FarmLedger starts with a flock. It takes less than a minute.' : 'Your manager hasn’t added a flock yet. You can log records once they do.'}
            action={canManage ? <button type="button" className="btn btn-primary" onClick={() => forms.open({ type: 'flock' })}>Add a flock</button> : undefined}
          />
        </div>
      </>
    );
  }

  return (
    <div className="stack-lg">
      <PageHead title={greeting()} sub={`${farm.name} · ${formatDay(today)}`} />

      <section className="quick-grid" aria-label="Log something">
        <QuickButton icon={<Egg size={26} />} label="Log eggs" onClick={() => forms.open({ type: 'eggs' })} />
        <QuickButton icon={<Grains size={26} />} label="Feed used" onClick={() => forms.open({ type: 'feed-usage' })} />
        <QuickButton icon={<HeartBreak size={26} />} label="Deaths" onClick={() => forms.open({ type: 'mortality' })} />
        <QuickButton
          icon={canManage ? <CurrencyCircleDollar size={26} /> : <FirstAidKit size={26} />}
          label={canManage ? 'Record sale' : 'Treatment'}
          onClick={() => forms.open({ type: canManage ? 'sale' : 'health' })}
        />
      </section>

      <section className="grid-tiles" aria-label="Key figures">
        <Tile
          label="Eggs today"
          value={view.eggsToday.toLocaleString()}
          note={view.eggsToday >= farm.crate_size ? `${crates.crates} crates, ${crates.loose} eggs` : `Yesterday: ${view.eggsYesterday.toLocaleString()}`}
        />
        <Tile label="Birds alive" value={view.birds.toLocaleString()} note={`${view.active.length} active flock${view.active.length === 1 ? '' : 's'}`} />
        <Tile label="Laying rate" value={view.laying === null ? '–' : `${Math.round(view.laying * 100)}%`} note="Last 7 days" />
        <Tile label="Feed in stock" value={`${Math.round(view.feedKg).toLocaleString()} kg`} note={view.soonest !== undefined ? `Lowest type: ${view.soonest} days left` : 'No recent use'} />
        {view.month && (
          <Tile
            label="Profit this month"
            value={formatMoney(view.month.profitKobo)}
            tone={view.month.profitKobo < 0 ? 'neg' : undefined}
            note={view.month.owedKobo > 0 ? `${formatMoney(view.month.owedKobo)} still owed` : 'Nothing owed'}
          />
        )}
      </section>

      <div className="grid-main">
        <section className="card">
          <div className="card-head"><h2>Eggs collected, last 30 days</h2></div>
          <div className="card-pad">
            <LineChart
              labels={view.days.map(formatDayShort)}
              fullLabels={view.days.map(formatDay)}
              series={[{ name: 'Eggs', color: 'var(--chart-1)', values: view.eggSeries }]}
              caption={`Eggs collected per day for the last 30 days. Latest full day: ${view.eggsYesterday}.`}
              format={(v) => v.toLocaleString()}
            />
          </div>
        </section>

        <section className="card" aria-labelledby="attention">
          <div className="card-head"><h2 id="attention">Needs attention</h2></div>
          {view.alerts.length === 0 && view.missing.length === 0 ? (
            <Empty icon={<CheckCircle size={26} weight="fill" />} title="All caught up" body="Nothing is overdue and today’s eggs are logged." />
          ) : (
            <ul className="list" style={{ marginTop: 8 }}>
              {view.missing.map((flock) => (
                <li key={flock.id}>
                  <span className="icon-chip"><Egg size={20} /></span>
                  <div className="grow"><strong>{flock.name}</strong><div className="small muted">No eggs logged today</div></div>
                  <button type="button" className="btn btn-sm" onClick={() => forms.open({ type: 'eggs', flockId: flock.id })}>Log</button>
                </li>
              ))}
              {view.alerts.map((alert) => (
                <li key={alert.id}>
                  <Link className="row-link" to={alert.link}>
                    <span className={`icon-chip ${alert.level}`}><WarningCircle size={20} weight="fill" /></span>
                    <div className="grow"><strong>{alert.title}</strong><div className="small muted">{alert.detail}</div></div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
