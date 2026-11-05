import type { Day } from './types';

const MS_PER_DAY = 86_400_000;

/** Today's calendar day on the farm, not in UTC. */
export function today(timeZone = 'Africa/Lagos', now: Date = new Date()): Day {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function toUtc(day: Day): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

export function addDays(day: Day, days: number): Day {
  return new Date(toUtc(day) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from a to b. Positive when b is later. */
export function daysBetween(a: Day, b: Day): number {
  return Math.round((toUtc(b) - toUtc(a)) / MS_PER_DAY);
}

export function lastNDays(endDay: Day, n: number): Day[] {
  return Array.from({ length: n }, (_, i) => addDays(endDay, i - n + 1));
}

export function startOfMonth(day: Day): Day {
  return `${day.slice(0, 7)}-01`;
}

export function inRange(day: Day, from: Day, to: Day): boolean {
  return day >= from && day <= to;
}

const dayFormat = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortFormat = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function formatDay(day: Day): string {
  return dayFormat.format(toUtc(day));
}

export function formatDayShort(day: Day): string {
  return shortFormat.format(toUtc(day));
}
