import { describe, expect, it } from 'vitest';
import { checkEggEntry, computeAlerts, dosesDue, missingEggLogs } from './health';
import type { FarmRecords, Flock, ScheduleItem } from './types';

const base = { farm_id: 'f', created_by: null, created_at: '', updated_at: '', deleted_at: null };
const flock: Flock = {
  ...base, id: 'a', name: 'House A', breed: '', source: null, house: null, acquired_on: '2026-01-01',
  age_at_acquisition_days: 7, quantity: 100, status: 'active', closed_on: null, notes: null,
};
const item = (id: string, age_days: number): ScheduleItem => ({ ...base, id, name: id, product: id, age_days });
const empty: FarmRecords = {
  flocks: [], egg_logs: [], mortality_logs: [], feed_purchases: [], feed_usage: [], health_events: [],
  schedule_items: [], customers: [], sales: [], payments: [], expenses: [], bird_sales: [],
};

describe('dosesDue', () => {
  it('works out due dates from age on arrival and skips doses before arrival', () => {
    const due = dosesDue({ flocks: [flock], schedule_items: [item('early', 1), item('later', 21)], health_events: [] }, '2026-01-10');
    expect(due.map((d) => d.item.id)).toEqual(['later']);
    expect(due[0]).toMatchObject({ dueOn: '2026-01-15', daysUntil: 5 });
  });
  it('removes a dose once given and restores it if that record is deleted', () => {
    const event = { ...base, id: 'h', date: '2026-01-15', flock_id: 'a', kind: 'vaccine' as const, product: 'x', schedule_item_id: 'later', notes: null };
    const input = { flocks: [flock], schedule_items: [item('later', 21)] };
    expect(dosesDue({ ...input, health_events: [event] }, '2026-01-10')).toHaveLength(0);
    expect(dosesDue({ ...input, health_events: [{ ...event, deleted_at: 'x' }] }, '2026-01-10')).toHaveLength(1);
  });
  it('ignores closed flocks', () => {
    expect(dosesDue({ flocks: [{ ...flock, status: 'closed' }], schedule_items: [item('later', 21)], health_events: [] }, '2026-01-10')).toHaveLength(0);
  });
});

describe('computeAlerts', () => {
  it('ranks overdue doses first and leaves distant doses out', () => {
    const alerts = computeAlerts({ ...empty, flocks: [flock], schedule_items: [item('soon', 21), item('late', 8), item('far', 200)] }, '2026-01-14', 7);
    expect(alerts.map((a) => a.level)).toEqual(['critical', 'warning']);
    expect(alerts[0]?.detail).toBe('12 days overdue');
    expect(alerts[1]?.detail).toBe('Due in 1 day');
  });
  it('warns on low and empty feed', () => {
    const buy = { ...base, id: 'p', date: '2026-01-01', feed_type: 'Layers', supplier: null, quantity_kg: 150 };
    const use = { ...base, id: 'u', date: '2026-01-10', flock_id: 'a', feed_type: 'Layers', quantity_kg: 140 };
    expect(computeAlerts({ ...empty, feed_purchases: [buy], feed_usage: [use] }, '2026-01-10', 7)[0]?.title).toContain('running low');
    expect(computeAlerts({ ...empty, feed_purchases: [{ ...buy, quantity_kg: 140 }], feed_usage: [use] }, '2026-01-10', 7)[0]?.title).toContain('run out');
  });
  it('flags a laying drop only against a real baseline', () => {
    const log = (date: string, collected: number) => ({ ...base, id: date, date, flock_id: 'a', collected, broken: 0, dirty: 0 });
    const earlier = ['2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07'].map((d) => log(d, 90));
    const recent = ['2026-01-08', '2026-01-09', '2026-01-10'].map((d) => log(d, 60));
    const alerts = computeAlerts({ ...empty, flocks: [flock], egg_logs: [...earlier, ...recent] }, '2026-01-10', 7);
    expect(alerts.find((a) => a.id === 'lay-a')?.detail).toBe('Down 33% on the previous week');
    expect(computeAlerts({ ...empty, flocks: [flock], egg_logs: recent }, '2026-01-10', 7).find((a) => a.id === 'lay-a')).toBeUndefined();
  });
});

describe('entry checks', () => {
  it('blocks impossible egg counts', () => {
    expect(checkEggEntry({ collected: 5, broken: 3, dirty: 3 }, 100).error).toBeTruthy();
  });
  it('warns on an implausibly high count but allows it', () => {
    expect(checkEggEntry({ collected: 120, broken: 0, dirty: 0 }, 100).warning).toBeTruthy();
    expect(checkEggEntry({ collected: 90, broken: 0, dirty: 0 }, 100)).toEqual({});
  });
  it('lists active flocks with nothing logged today', () => {
    const egg = { ...base, id: 'e', date: '2026-01-10', flock_id: 'a', collected: 1, broken: 0, dirty: 0 };
    expect(missingEggLogs({ flocks: [flock], egg_logs: [] }, '2026-01-10')).toHaveLength(1);
    expect(missingEggLogs({ flocks: [flock], egg_logs: [egg] }, '2026-01-10')).toHaveLength(0);
  });
});
