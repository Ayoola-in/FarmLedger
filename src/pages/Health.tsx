import { CheckCircle, FirstAidKit, PencilSimple, Plus, Trash, WarningCircle } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { formatDay } from '../domain/dates';
import { dosesDue } from '../domain/health';
import { useFarm } from '../ui/farm';
import { useForms } from '../ui/forms';
import { Empty, PageHead } from '../ui/kit';

function dueText(days: number): string {
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `In ${days} day${days === 1 ? '' : 's'}`;
}

export default function Health() {
  const { records, today, canManage, canEdit, remove } = useFarm();
  const forms = useForms();
  const due = useMemo(() => dosesDue(records, today).filter((d) => d.daysUntil <= 30), [records, today]);
  const [limit, setLimit] = useState(20);
  const allEvents = useMemo(() => [...records.health_events].sort((a, b) => b.date.localeCompare(a.date)), [records.health_events]);
  const events = allEvents.slice(0, limit);
  const schedule = [...records.schedule_items].sort((a, b) => a.age_days - b.age_days);
  const flockName = new Map(records.flocks.map((f) => [f.id, f.name]));

  return (
    <div className="stack-lg">
      <PageHead title="Health" sub="Vaccinations and treatments">
        <button type="button" className="btn btn-primary" onClick={() => forms.open({ type: 'health' })}><Plus size={18} weight="bold" />Record treatment</button>
      </PageHead>

      <section className="card">
        <div className="card-head"><h2>Coming up in the next 30 days</h2></div>
        {due.length === 0 ? (
          <Empty icon={<CheckCircle size={26} weight="fill" />} title="Nothing due" body="No scheduled vaccinations in the next 30 days." />
        ) : (
          <ul className="list" style={{ marginTop: 8 }}>
            {due.map((dose) => {
              const overdue = dose.daysUntil < 0;
              return (
                <li key={`${dose.flock.id}-${dose.item.id}`}>
                  <span className={`icon-chip ${overdue ? 'critical' : dose.daysUntil <= 3 ? 'warning' : ''}`}>
                    {overdue ? <WarningCircle size={20} weight="fill" /> : <FirstAidKit size={20} />}
                  </span>
                  <div className="grow">
                    <strong>{dose.item.name}</strong>
                    <div className="small muted">{dose.flock.name} · {dueText(dose.daysUntil)} · {formatDay(dose.dueOn)}</div>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => forms.open({ type: 'health', flockId: dose.flock.id, item: dose.item })}>Mark given</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Treatment history</h2></div>
          {events.length === 0 ? <p className="card-pad muted">No treatments recorded yet.</p> : (
            <ul className="list" style={{ marginTop: 8 }}>
              {events.map((event) => (
                <li key={event.id}>
                  <div className="grow">
                    <strong>{event.product}</strong>
                    <div className="small muted">{flockName.get(event.flock_id) ?? 'Removed flock'} · {formatDay(event.date)}</div>
                  </div>
                  {canEdit(event) && (
                    <div className="actions">
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Edit ${event.product}`} onClick={() => forms.open({ type: 'health', record: event })}><PencilSimple size={17} /></button>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Delete ${event.product}`} onClick={() => void remove('health_events', event.id, 'Treatment')}><Trash size={17} /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {allEvents.length > limit && (
            <div className="card-pad"><button type="button" className="btn btn-block" onClick={() => setLimit(limit + 20)}>Show more</button></div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Vaccination schedule</h2>
            {canManage && <button type="button" className="btn btn-sm" onClick={() => forms.open({ type: 'schedule' })}><Plus size={15} />Add</button>}
          </div>
          <p className="small muted" style={{ padding: '6px 18px 10px' }}>
            A general starting point, not veterinary advice. Disease risks vary by area, so review this with your vet.
          </p>
          {schedule.length === 0 && <p className="card-pad muted">No vaccinations scheduled. Add the ones your vet recommends to get due-date reminders.</p>}
          <ul className="list">
            {schedule.map((item) => (

              <li key={item.id}>
                <div className="grow">
                  <strong>{item.name}</strong>
                  <div className="small muted">Day {item.age_days}{item.product ? ` · ${item.product}` : ''}</div>
                </div>
                {canManage && (
                  <div className="actions">
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Edit ${item.name}`} onClick={() => forms.open({ type: 'schedule', record: item })}><PencilSimple size={17} /></button>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Remove ${item.name}`} onClick={() => void remove('schedule_items', item.id, item.name)}><Trash size={17} /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
