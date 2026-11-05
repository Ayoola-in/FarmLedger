import { addDays, daysBetween } from './dates';
import { birdsAlive, feedStock, layingRate } from './metrics';
import type { Day, FarmRecords, Flock, ScheduleItem } from './types';

/** Common layer-programme starting point. Farmers edit it with their vet. */
export const STARTER_SCHEDULE: { name: string; product: string; age_days: number }[] = [
  { name: "Marek's disease", product: "Marek's vaccine", age_days: 1 },
  { name: 'Newcastle (first dose)', product: 'NDV Lasota', age_days: 7 },
  { name: 'Gumboro (first dose)', product: 'IBD vaccine', age_days: 14 },
  { name: 'Newcastle (booster)', product: 'NDV Lasota', age_days: 21 },
  { name: 'Gumboro (booster)', product: 'IBD vaccine', age_days: 28 },
  { name: 'Fowl pox', product: 'Fowl pox vaccine', age_days: 42 },
  { name: 'Newcastle (Komarov)', product: 'NDV Komarov', age_days: 56 },
  { name: 'Fowl typhoid', product: 'Fowl typhoid vaccine', age_days: 70 },
  { name: 'Newcastle (pre-lay)', product: 'NDV Komarov', age_days: 112 },
];

export interface DoseDue {
  flock: Flock;
  item: ScheduleItem;
  dueOn: Day;
  /** Negative when overdue. */
  daysUntil: number;
}

/**
 * Doses still outstanding for active flocks. Doses that fell due before the
 * flock arrived are skipped, because those were the seller's to give.
 */
export function dosesDue(records: Pick<FarmRecords, 'flocks' | 'schedule_items' | 'health_events'>, on: Day): DoseDue[] {
  const given = new Set(
    records.health_events
      .filter((e) => !e.deleted_at && e.schedule_item_id)
      .map((e) => `${e.flock_id}|${e.schedule_item_id}`),
  );
  const out: DoseDue[] = [];
  for (const flock of records.flocks) {
    if (flock.deleted_at || flock.status !== 'active') continue;
    for (const item of records.schedule_items) {
      if (item.deleted_at || item.age_days < flock.age_at_acquisition_days) continue;
      if (given.has(`${flock.id}|${item.id}`)) continue;
      const dueOn = addDays(flock.acquired_on, item.age_days - flock.age_at_acquisition_days);
      out.push({ flock, item, dueOn, daysUntil: daysBetween(on, dueOn) });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

export type AlertLevel = 'critical' | 'warning' | 'info';
export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  link: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function computeAlerts(records: FarmRecords, on: Day, lowFeedDays: number): Alert[] {
  const alerts: Alert[] = [];

  for (const dose of dosesDue(records, on)) {
    if (dose.daysUntil > 3) continue;
    const overdue = dose.daysUntil < 0;
    alerts.push({
      id: `dose-${dose.flock.id}-${dose.item.id}`,
      level: overdue ? 'critical' : 'warning',
      title: `${dose.item.name}: ${dose.flock.name}`,
      detail: overdue
        ? `${plural(-dose.daysUntil, 'day')} overdue`
        : dose.daysUntil === 0 ? 'Due today' : `Due in ${plural(dose.daysUntil, 'day')}`,
      link: '/app/health',
    });
  }

  for (const stock of feedStock(records.feed_purchases, records.feed_usage, on)) {
    if (stock.stockKg <= 0 && stock.usedKg > 0) {
      alerts.push({ id: `feed-${stock.feedType}`, level: 'critical', title: `${stock.feedType} feed has run out`, detail: 'Record a purchase once restocked', link: '/app/feed' });
    } else if (stock.daysLeft !== null && stock.daysLeft <= lowFeedDays) {
      alerts.push({ id: `feed-${stock.feedType}`, level: 'warning', title: `${stock.feedType} feed is running low`, detail: `About ${plural(stock.daysLeft, 'day')} left`, link: '/app/feed' });
    }
  }

  for (const flock of records.flocks) {
    if (flock.deleted_at || flock.status !== 'active') continue;
    if (birdsAlive(flock, records.mortality_logs, records.sales) === 0) continue;
    const recent = layingRate(flock, records.egg_logs, records.mortality_logs, records.sales, on, 3);
    const earlier = layingRate(flock, records.egg_logs, records.mortality_logs, records.sales, addDays(on, -3), 7);
    if (recent !== null && earlier !== null && earlier >= 0.2 && recent < earlier * 0.85) {
      const drop = Math.round((1 - recent / earlier) * 100);
      alerts.push({ id: `lay-${flock.id}`, level: 'warning', title: `Laying has dropped in ${flock.name}`, detail: `Down ${drop}% on the previous week`, link: `/app/flocks/${flock.id}` });
    }
  }

  const rank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level]);
}

export function missingEggLogs(records: Pick<FarmRecords, 'flocks' | 'egg_logs'>, on: Day): Flock[] {
  const logged = new Set(records.egg_logs.filter((e) => !e.deleted_at && e.date === on).map((e) => e.flock_id));
  return records.flocks.filter((f) => !f.deleted_at && f.status === 'active' && !logged.has(f.id));
}

/** Returns a blocking error, or a warning the user may confirm past. */
export function checkEggEntry(entry: { collected: number; broken: number; dirty: number }, alive: number): { error?: string; warning?: string } {
  if (entry.broken + entry.dirty > entry.collected) {
    return { error: 'Broken and dirty eggs can’t be more than the eggs collected.' };
  }
  if (alive > 0 && entry.collected > alive * 1.1) {
    return { warning: `That’s more eggs than the ${alive} birds in this flock would normally lay in a day.` };
  }
  return {};
}
