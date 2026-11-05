import {
  ArrowsClockwise, Bird, ChartLineUp, CheckCircle, CloudSlash, CurrencyCircleDollar, Egg, FirstAidKit, Gear, Grains, House,
  List, Plus, HeartBreak, WarningCircle,
} from '@phosphor-icons/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { db } from '../data/db';
import { useSession } from '../data/session';
import { syncStatus } from '../data/syncController';
import { useFarm } from './farm';
import { useForms } from './forms';
import { Sheet } from './kit';

const NAV = [
  { to: '/app', label: 'Today', icon: House, end: true },
  { to: '/app/flocks', label: 'Flocks', icon: Bird },
  { to: '/app/eggs', label: 'Eggs', icon: Egg },
  { to: '/app/feed', label: 'Feed', icon: Grains },
  { to: '/app/health', label: 'Health', icon: FirstAidKit },
  { to: '/app/finance', label: 'Finance', icon: CurrencyCircleDollar, managers: true },
  { to: '/app/reports', label: 'Reports', icon: ChartLineUp, managers: true },
  { to: '/app/settings', label: 'Settings', icon: Gear },
];

/** Always says plainly whether this person's records are safe. */
export function SyncPill() {
  const { workspace } = useSession();
  const status = useSyncExternalStore(syncStatus.subscribe, syncStatus.get);
  const outbox = useLiveQuery(async () => {
    const all = await db.outbox.toArray();
    return { pending: all.filter((e) => e.status === 'pending').length, failed: all.filter((e) => e.status === 'failed').length };
  }, [], { pending: 0, failed: 0 });

  if (workspace?.mode !== 'cloud') return null;

  let icon: ReactNode = <CheckCircle size={16} weight="fill" />;
  let text = 'Synced';
  let tone = '';
  if (outbox.failed > 0) {
    icon = <WarningCircle size={16} weight="fill" />;
    text = `${outbox.failed} need${outbox.failed === 1 ? 's' : ''} attention`;
    tone = 'bad';
  } else if (status.state === 'offline') {
    icon = <CloudSlash size={16} />;
    text = outbox.pending > 0 ? `Offline, ${outbox.pending} saved here` : 'Offline';
    tone = outbox.pending > 0 ? 'warn' : '';
  } else if (status.state === 'syncing' || outbox.pending > 0) {
    icon = <ArrowsClockwise size={16} className="spin" />;
    text = 'Syncing';
  }
  return <Link to="/app/settings#data" className={`sync-pill ${tone}`} aria-live="polite">{icon}{text}</Link>;
}

function QuickLogSheet({ onClose }: { onClose: () => void }) {
  const forms = useForms();
  const { canManage } = useFarm();
  const go = (fn: () => void) => () => { onClose(); fn(); };
  return (
    <Sheet title="Quick log" onClose={onClose}>
      <div className="sheet-body">
        <div className="quick-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <QuickButton icon={<Egg size={26} />} label="Eggs" onClick={go(() => forms.open({ type: 'eggs' }))} />
          <QuickButton icon={<Grains size={26} />} label="Feed used" onClick={go(() => forms.open({ type: 'feed-usage' }))} />
          <QuickButton icon={<HeartBreak size={26} />} label="Deaths" onClick={go(() => forms.open({ type: 'mortality' }))} />
          <QuickButton icon={<FirstAidKit size={26} />} label="Treatment" onClick={go(() => forms.open({ type: 'health' }))} />
          {canManage && <QuickButton icon={<CurrencyCircleDollar size={26} />} label="Sale" onClick={go(() => forms.open({ type: 'sale' }))} />}
          {canManage && <QuickButton icon={<List size={26} />} label="Expense" onClick={go(() => forms.open({ type: 'expense' }))} />}
        </div>
      </div>
    </Sheet>
  );
}

export function QuickButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button type="button" className="quick" onClick={onClick}>{icon}{label}</button>;
}

function MoreSheet({ onClose, items }: { onClose: () => void; items: typeof NAV }) {
  return (
    <Sheet title="More" onClose={onClose}>
      <div className="sheet-body">
        <ul className="nav-list">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} className="nav-link" onClick={onClose}><Icon size={22} />{label}</NavLink>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { workspace, signOut } = useSession();
  const { canManage } = useFarm();
  const [quickOpen, setQuickOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const items = NAV.filter((n) => !n.managers || canManage);
  const primary = items.filter((n) => ['Today', 'Flocks'].includes(n.label));
  const fourth = canManage ? items.find((n) => n.label === 'Finance') : items.find((n) => n.label === 'Eggs');
  const inMore = items.filter((n) => !primary.includes(n) && n !== fourth);
  const farmName = workspace?.farm.name ?? '';

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <Link to="/app" className="brand"><img src="/logo-mark.webp" alt="" width="36" height="36" />FarmLedger</Link>
        <ul className="nav-list">
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Icon size={21} />{label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-foot">
          <button type="button" className="btn btn-primary" onClick={() => setQuickOpen(true)}><Plus size={18} weight="bold" />Quick log</button>
          <SyncPill />
          <div className="small muted" style={{ padding: '2px 8px' }}>{farmName}</div>
        </div>
      </nav>

      {workspace?.demo && (
        <aside className="demo-banner" aria-label="Demo notice">
          You’re exploring a demo farm with sample data.
          <button type="button" className="btn btn-sm" onClick={() => void signOut()}>Exit demo</button>
        </aside>
      )}

      <main className="main">
        <div className="topbar">
          <Link to="/app" className="brand"><img src="/logo-mark.webp" alt="" width="30" height="30" />FarmLedger</Link>
          <SyncPill />
        </div>
        {children}
      </main>

      <nav className="tabbar" aria-label="Main">
        {primary.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            <Icon size={23} />{label}
          </NavLink>
        ))}
        <button type="button" className="tab-add" aria-label="Quick log" onClick={() => setQuickOpen(true)}><Plus size={26} weight="bold" /></button>
        {fourth && (
          <NavLink to={fourth.to} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            <fourth.icon size={23} />{fourth.label}
          </NavLink>
        )}
        <button type="button" className="tab" onClick={() => setMoreOpen(true)}><List size={23} />More</button>
      </nav>

      {quickOpen && <QuickLogSheet onClose={() => setQuickOpen(false)} />}
      {moreOpen && <MoreSheet items={inMore} onClose={() => setMoreOpen(false)} />}
    </div>
  );
}
