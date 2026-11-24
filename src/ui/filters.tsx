// Search, period and category filters shared by the record lists.
import { DownloadSimple, MagnifyingGlass, X } from '@phosphor-icons/react';
import { useId, type ReactNode } from 'react';
import { addDays, startOfMonth } from '../domain/dates';
import type { Day } from '../domain/types';

export type Period = 'all' | '7d' | '30d' | 'month' | 'last-month' | 'year';

export const PERIOD_LABELS: Record<Period, string> = {
  all: 'All time',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
  'last-month': 'Last month',
  year: 'This year',
};

/** Inclusive day range for a period, ending today. */
export function periodRange(period: Period, today: Day): { from: Day; to: Day } {
  switch (period) {
    case '7d': return { from: addDays(today, -6), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case 'month': return { from: startOfMonth(today), to: today };
    case 'last-month': {
      const end = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(end), to: end };
    }
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default: return { from: '0000-01-01', to: '9999-12-31' };
  }
}

/** Case-insensitive match of a search term against any of the given texts. */
export function matches(term: string, ...texts: (string | null | undefined)[]): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return texts.some((t) => t?.toLowerCase().includes(q));
}

export function FilterBar(props: {
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
  period?: { value: Period; onChange: (v: Period) => void };
  select?: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] };
  onExport?: () => void;
  summary?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="filter-bar no-print">
      {props.search && (
        <div className="search-input">
          <MagnifyingGlass size={17} aria-hidden="true" />
          <label htmlFor={`${id}-q`} className="sr-only">Search</label>
          <input
            id={`${id}-q`}
            className="input"
            type="search"
            value={props.search.value}
            placeholder={props.search.placeholder}
            onChange={(e) => props.search?.onChange(e.target.value)}
          />
          {props.search.value && (
            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Clear search" onClick={() => props.search?.onChange('')}><X size={15} /></button>
          )}
        </div>
      )}
      {props.select && (
        <>
          <label htmlFor={`${id}-s`} className="sr-only">{props.select.label}</label>
          <select id={`${id}-s`} className="input filter-select" value={props.select.value} onChange={(e) => props.select?.onChange(e.target.value)}>
            {props.select.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </>
      )}
      {props.period && (
        <>
          <label htmlFor={`${id}-p`} className="sr-only">Period</label>
          <select id={`${id}-p`} className="input filter-select" value={props.period.value} onChange={(e) => props.period?.onChange(e.target.value as Period)}>
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
          </select>
        </>
      )}
      {props.onExport && (
        <button type="button" className="btn btn-sm filter-export" onClick={props.onExport}><DownloadSimple size={16} />CSV</button>
      )}
      {props.summary && <div className="filter-summary small muted">{props.summary}</div>}
    </div>
  );
}
