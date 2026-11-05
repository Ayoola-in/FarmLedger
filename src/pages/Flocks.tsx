import { Bird, CaretRight, Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { birdsAlive, flockAgeDays, layingRate, mortalityRate } from '../domain/metrics';
import { useFarm } from '../ui/farm';
import { useForms } from '../ui/forms';
import { Empty, PageHead } from '../ui/kit';

export default function Flocks() {
  const { records, today, canManage } = useFarm();
  const forms = useForms();
  const [show, setShow] = useState<'active' | 'closed'>('active');
  const flocks = records.flocks.filter((f) => f.status === show).sort((a, b) => b.acquired_on.localeCompare(a.acquired_on));
  const closedCount = records.flocks.filter((f) => f.status === 'closed').length;

  return (
    <>
      <PageHead title="Flocks" sub={`${records.flocks.filter((f) => f.status === 'active').length} active`}>
        {canManage && <button type="button" className="btn btn-primary" onClick={() => forms.open({ type: 'flock' })}><Plus size={18} weight="bold" />Add flock</button>}
      </PageHead>
      {closedCount > 0 && (
        <div className="segments" style={{ marginBottom: 14 }}>
          <button type="button" className="segment" aria-pressed={show === 'active'} onClick={() => setShow('active')}>Active</button>
          <button type="button" className="segment" aria-pressed={show === 'closed'} onClick={() => setShow('closed')}>Closed ({closedCount})</button>
        </div>
      )}
      <div className="card">
        {flocks.length === 0 ? (
          <Empty
            icon={<Bird size={26} />}
            title="No flocks yet"
            body="Add a flock to start tracking its eggs, feed, health and costs."
            action={canManage ? <button type="button" className="btn btn-primary" onClick={() => forms.open({ type: 'flock' })}>Add a flock</button> : undefined}
          />
        ) : (
          <ul className="list">
            {flocks.map((flock) => {
              const alive = birdsAlive(flock, records.mortality_logs, records.sales);
              const rate = layingRate(flock, records.egg_logs, records.mortality_logs, records.sales, today);
              const weeks = Math.floor(flockAgeDays(flock, flock.closed_on ?? today) / 7);
              return (
                <li key={flock.id}>
                  <Link className="row-link" to={`/app/flocks/${flock.id}`}>
                    <span className="icon-chip good"><Bird size={20} /></span>
                    <div className="grow">
                      <strong>{flock.name}</strong>
                      <div className="small muted">
                        {[flock.breed, flock.house, `${weeks} weeks old`].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="small muted" style={{ textAlign: 'right' }}>
                      <div className="num"><strong style={{ color: 'var(--ink)' }}>{alive.toLocaleString()}</strong> birds</div>
                      <div className="num">{rate !== null ? `${Math.round(rate * 100)}% laying` : `${(mortalityRate(flock, records.mortality_logs) * 100).toFixed(1)}% lost`}</div>
                    </div>
                    <CaretRight size={18} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
