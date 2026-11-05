import { ArrowsClockwise, Copy, DownloadSimple, Moon, SignOut, Trash, UploadSimple, UserPlus } from '@phosphor-icons/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db, metaGet } from '../data/db';
import { newId } from '../data/repo';
import { useSession } from '../data/session';
import { supabase } from '../data/supabase';
import { discardFailed, retryFailed } from '../data/sync';
import { syncNow } from '../data/syncController';
import { BACKUP_FORMAT, parseBackup, type Backup } from '../domain/exports';
import { importLegacyBackup, isLegacyBackup } from '../domain/legacy';
import type { Member, Role } from '../domain/types';
import { useFarm } from '../ui/farm';
import { ConfirmSheet, CountField, download, Field, PageHead, SelectField, useToast } from '../ui/kit';
import { setTheme, storedTheme, type ThemeChoice } from '../ui/theme';

export default function Settings() {
  const { isOwner, workspace } = useFarm();
  const isCloud = workspace.mode === 'cloud';
  return (
    <div className="stack-lg" style={{ maxWidth: 760 }}>
      <PageHead title="Settings" sub={`${workspace.member.display_name} · ${workspace.member.role}`} />
      {isOwner && <FarmSettings />}
      {isCloud && <Team />}
      <Appearance />
      <DataSection />
      {isCloud && workspace.member.role !== 'worker' && <History />}
      <Account />
    </div>
  );
}

function FarmSettings() {
  const { workspace } = useFarm();
  const { updateFarm } = useSession();
  const toast = useToast();
  const [name, setName] = useState(workspace.farm.name);
  const [crate, setCrate] = useState(String(workspace.farm.crate_size));
  const [lowDays, setLowDays] = useState(String(workspace.farm.low_feed_days));
  const [error, setError] = useState<string>();
  return (
    <section className="card card-pad stack">
      <h2>Farm</h2>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const crateSize = Number(crate);
          const days = Number(lowDays);
          if (!name.trim()) return setError('Enter a farm name.');
          if (!Number.isInteger(crateSize) || crateSize < 1 || crateSize > 500) return setError('Crate size must be a whole number from 1 to 500.');
          if (!Number.isInteger(days) || days < 0 || days > 365) return setError('Low feed warning must be 0 to 365 days.');
          setError(undefined);
          try {
            await updateFarm({ name: name.trim(), crate_size: crateSize, low_feed_days: days });
            toast.show('Farm settings saved');
          } catch {
            setError('Couldn’t save. Changing farm settings needs an internet connection.');
          }
        }}
      >
        <Field label="Farm name" value={name} onChange={setName} />
        <div className="field-row">
          <CountField label="Eggs per crate" value={crate} onChange={setCrate} />
          <CountField label="Warn when feed lasts under (days)" value={lowDays} onChange={setLowDays} />
        </div>
        {error && <div className="notice bad" role="alert">{error}</div>}
        <div><button type="submit" className="btn btn-primary">Save</button></div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- team

function Team() {
  const { workspace, canManage, isOwner } = useFarm();
  const toast = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('worker');
  const [link, setLink] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  const load = async () => {
    const { data, error } = await supabase!.from('members').select('*').order('created_at');
    if (error) setFailed(true);
    else {
      setFailed(false);
      setMembers(data as Member[]);
    }
  };
  useEffect(() => { void load(); }, []);

  const roleLabel = (r: Role) => r[0]?.toUpperCase() + r.slice(1);

  return (
    <section className="card card-pad stack">
      <h2>Team</h2>
      {failed && <p className="muted">Connect to the internet to see your team.</p>}
      {members && (
        <ul className="list" style={{ margin: '0 -18px' }}>
          {members.map((m) => {
            const isMe = m.id === workspace.member.id;
            const canRemove = !isMe && (isOwner || (canManage && m.role === 'worker'));
            return (
              <li key={m.id}>
                <div className="grow"><strong>{m.display_name || 'Unnamed'}</strong>{isMe && <span className="muted"> (you)</span>}</div>
                {isOwner && !isMe ? (
                  <select
                    className="input" style={{ width: 'auto', minHeight: 38, padding: '4px 8px' }} aria-label={`Role for ${m.display_name}`} value={m.role}
                    onChange={async (e) => {
                      const { error } = await supabase!.rpc('set_member_role', { member_id: m.id, new_role: e.target.value });
                      if (error) toast.show('Couldn’t change the role. Please try again.', { tone: 'bad' });
                      void load();
                    }}
                  >
                    <option value="manager">Manager</option>
                    <option value="worker">Worker</option>
                  </select>
                ) : <span className="badge">{roleLabel(m.role)}</span>}
                {canRemove && <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Remove ${m.display_name}`} onClick={() => setRemoving(m)}><Trash size={17} /></button>}
              </li>
            );
          })}
        </ul>
      )}
      {canManage && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            {isOwner && (
              <div className="grow" style={{ maxWidth: 240 }}>
                <SelectField label="Invite as" value={role} onChange={(v) => setRole(v as typeof role)} options={[{ value: 'worker', label: 'Worker: logs records, no finances' }, { value: 'manager', label: 'Manager: everything but settings' }]} />
              </div>
            )}
            <button
              type="button" className="btn"
              onClick={async () => {
                const { data, error } = await supabase!.rpc('create_invite', { invite_role: isOwner ? role : 'worker' });
                if (error) toast.show('Couldn’t create the invite. Check your connection.', { tone: 'bad' });
                else setLink(`${location.origin}/invite/${data as string}`);
              }}
            ><UserPlus size={18} />Create invite link</button>
          </div>
          {link && (
            <div className="notice good stack" style={{ gap: 8 }}>
              <span>Send this link to one person. It works once and expires in 7 days.</span>
              <code style={{ overflowWrap: 'anywhere', fontSize: '0.8rem' }}>{link}</code>
              <div>
                <button
                  type="button" className="btn btn-sm"
                  onClick={() => void navigator.clipboard.writeText(link).then(() => toast.show('Invite link copied'))}
                ><Copy size={15} />Copy link</button>
              </div>
            </div>
          )}
        </div>
      )}
      {removing && (
        <ConfirmSheet
          title={`Remove ${removing.display_name}?`}
          body="They’ll lose access right away, and the farm’s records are cleared from their device when it next connects. The records they logged stay."
          confirmLabel="Remove"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const target = removing;
            setRemoving(null);
            const { error } = await supabase!.rpc('remove_member', { member_id: target.id });
            if (error) toast.show('Couldn’t remove them. Please try again.', { tone: 'bad' });
            void load();
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- appearance and install

interface InstallEvent extends Event {
  prompt(): Promise<void>;
}

function Appearance() {
  const [theme, setChoice] = useState<ThemeChoice>(storedTheme());
  const [install, setInstall] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  return (
    <section className="card card-pad stack">
      <h2>Appearance</h2>
      <div className="row">
        <Moon size={20} aria-hidden="true" />
        <div className="segments" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as ThemeChoice[]).map((t) => (
            <button key={t} type="button" className="segment" aria-pressed={theme === t} onClick={() => { setTheme(t); setChoice(t); }}>
              {t[0]?.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {install && (
        <div>
          <button type="button" className="btn" onClick={() => void install.prompt().then(() => setInstall(null))}>
            <DownloadSimple size={18} />Install FarmLedger on this device
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- sync and data

function DataSection() {
  const { workspace, isOwner, saveAll, records } = useFarm();
  const toast = useToast();
  const session = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ count: number; apply: () => Promise<void>; note?: string } | null>(null);
  const [wipe, setWipe] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const outbox = useLiveQuery(() => db.outbox.toArray(), [], []);
  const lastSynced = useLiveQuery(() => metaGet<string>('last_synced_at'), [], undefined);
  const failed = outbox.filter((e) => e.status === 'failed');
  const isCloud = workspace.mode === 'cloud';

  const exportBackup = async () => {
    const tables = Object.keys(records) as (keyof typeof records)[];
    const all = Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await db[t].toArray()] as const)));
    const backup: Backup = {
      format: BACKUP_FORMAT, version: 1, exported_at: new Date().toISOString(),
      farm: { name: workspace.farm.name, crate_size: workspace.farm.crate_size, low_feed_days: workspace.farm.low_feed_days },
      records: all as unknown as Backup['records'],
    };
    download(`FarmLedger-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup), 'application/json');
    toast.show('Backup downloaded');
  };

  const readFile = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text());
      if (isLegacyBackup(data)) {
        const { records: mapped, summary } = importLegacyBackup(data as Record<string, unknown>, {
          farmId: workspace.farm.id, userId: workspace.userId, now: new Date().toISOString(), uuid: newId,
        });
        const count = Object.values(mapped).reduce((n, rows) => n + rows.length, 0);
        setPending({
          count,
          note: `This file is from the old FarmLedger app. Its figures will be corrected as they’re imported: ${summary.repairedSales} bird sale${summary.repairedSales === 1 ? '' : 's'} restored to the amount charged, and ${summary.removedDuplicateExpenses} duplicate cost${summary.removedDuplicateExpenses === 1 ? '' : 's'} removed.`,
          apply: async () => { await saveAll(mapped); },
        });
      } else {
        const backup = parseBackup(data);
        const count = Object.values(backup.records).reduce((n, rows) => n + rows.length, 0);
        setPending({ count, apply: async () => { await saveAll(backup.records); } });
      }
    } catch (error) {
      toast.show(error instanceof SyntaxError ? 'That file isn’t a valid backup.' : (error as Error).message, { tone: 'bad' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="card card-pad stack" id="data">
      <h2>Your data</h2>
      {isCloud ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row between">
            <p className="small">
              {outbox.filter((e) => e.status === 'pending').length > 0
                ? `${outbox.filter((e) => e.status === 'pending').length} changes saved on this device, waiting to upload.`
                : 'Everything on this device has been uploaded.'}
              {lastSynced && <span className="muted"> Last synced {new Date(lastSynced).toLocaleString('en-NG')}.</span>}
            </p>
            <button type="button" className="btn btn-sm" onClick={() => void syncNow()}><ArrowsClockwise size={15} />Sync now</button>
          </div>
          {failed.length > 0 && (
            <div className="notice bad stack" style={{ gap: 8 }}>
              <strong>{failed.length} change{failed.length === 1 ? ' was' : 's were'} not accepted by the server</strong>
              {failed.slice(0, 10).map((entry) => (
                <div className="row between" key={entry.seq}>
                  <span className="small grow">{entry.error}</span>
                  <button
                    type="button" className="btn btn-sm"
                    onClick={() => void discardFailed(entry.seq as number).then(syncNow)}
                  >Discard</button>
                </div>
              ))}
              <div><button type="button" className="btn btn-sm" onClick={() => void retryFailed().then(syncNow)}>Try all again</button></div>
            </div>
          )}
        </div>
      ) : (
        <p className="small muted">
          {workspace.demo ? 'This demo is stored only in this browser.' : 'This workspace is stored only on this device. Download backups regularly, because clearing browser data deletes it.'}
        </p>
      )}

      {isOwner && (
        <div className="row">
          <button type="button" className="btn" onClick={() => void exportBackup()}><DownloadSimple size={18} />Download backup</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}><UploadSimple size={18} />Import a backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Backup file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
        </div>
      )}

      {isOwner && isCloud && (
        <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <h3>Delete this farm</h3>
          <p className="small muted">Permanently removes the farm and all its records for everyone. This can’t be undone.</p>
          <div><button type="button" className="btn btn-danger" onClick={() => setWipe(true)}>Delete farm</button></div>
        </div>
      )}

      {pending && (
        <ConfirmSheet
          title="Import this file?"
          body={<div className="stack" style={{ gap: 8 }}><p>{pending.count.toLocaleString()} records will be added to {workspace.farm.name}. Records with the same ID are replaced.</p>{pending.note && <p className="small muted">{pending.note}</p>}</div>}
          confirmLabel="Import"
          onClose={() => setPending(null)}
          onConfirm={() => {
            const job = pending;
            setPending(null);
            job.apply().then(() => toast.show('Import complete')).catch(() => toast.show('Import failed. Nothing was changed.', { tone: 'bad' }));
          }}
        />
      )}
      {wipe && (
        <ConfirmSheet
          title="Delete this farm for good?"
          danger
          confirmLabel="Delete everything"
          body={<Field label={`Type “${workspace.farm.name}” to confirm`} value={confirmName} onChange={setConfirmName} autoComplete="off" />}
          onClose={() => { setWipe(false); setConfirmName(''); }}
          onConfirm={async () => {
            const { error } = await supabase!.rpc('delete_farm', { confirm_name: confirmName });
            if (error) {
              toast.show(error.code === '22023' ? 'The name doesn’t match.' : 'Couldn’t delete the farm. Check your connection.', { tone: 'bad' });
              return;
            }
            await session.signOut();
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- change history

interface AuditEntry {
  id: number;
  table_name: string;
  changed_at: string;
  changed_by: string | null;
}

function History() {
  const [entries, setEntries] = useState<AuditEntry[] | null | 'error'>(null);
  const [names, setNames] = useState(new Map<string, string>());
  const load = async () => {
    const [audit, members] = await Promise.all([
      supabase!.from('audit_log').select('id, table_name, changed_at, changed_by').order('changed_at', { ascending: false }).limit(30),
      supabase!.from('members').select('user_id, display_name'),
    ]);
    if (audit.error) return setEntries('error');
    setNames(new Map((members.data ?? []).map((m) => [m.user_id as string, m.display_name as string])));
    setEntries(audit.data as AuditEntry[]);
  };
  return (
    <section className="card card-pad stack">
      <h2>Change history</h2>
      <p className="small muted">Every edit keeps the previous version on the server.</p>
      {entries === null && <div><button type="button" className="btn" onClick={() => void load()}>Show recent changes</button></div>}
      {entries === 'error' && <p className="muted">Connect to the internet to see the history.</p>}
      {Array.isArray(entries) && (entries.length === 0 ? <p className="muted">No changes yet.</p> : (
        <ul className="list" style={{ margin: '0 -18px' }}>
          {entries.map((e) => (
            <li key={e.id} className="small">
              <div className="grow">{(e.changed_by && names.get(e.changed_by)) || 'Someone'} changed a record in {e.table_name.replace(/_/g, ' ')}</div>
              <span className="muted nowrap">{new Date(e.changed_at).toLocaleString('en-NG')}</span>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- account

function Account() {
  const { workspace } = useFarm();
  const session = useSession();
  const [confirm, setConfirm] = useState(false);
  const unsent = useLiveQuery(() => db.outbox.count(), [], 0);
  const label = workspace.demo ? 'Exit demo' : workspace.mode === 'local' ? 'Close workspace' : 'Sign out';
  const warning = workspace.mode === 'local'
    ? workspace.demo ? 'The sample data will be removed.' : 'This permanently deletes this workspace from this device. Download a backup first.'
    : unsent > 0
      ? `${unsent} change${unsent === 1 ? ' hasn’t' : 's haven’t'} uploaded yet and will be lost if you sign out now. Connect to the internet first if you can.`
      : 'Your records stay safe on the server. They’ll be removed from this device.';
  return (
    <section className="card card-pad stack">
      <h2>Account</h2>
      {session.user?.email && <p className="small muted">Signed in as {session.user.email}</p>}
      <div><button type="button" className="btn" onClick={() => setConfirm(true)}><SignOut size={18} />{label}</button></div>
      {confirm && (
        <ConfirmSheet
          title={`${label}?`}
          body={warning}
          confirmLabel={label}
          danger={unsent > 0 || (workspace.mode === 'local' && !workspace.demo)}
          onClose={() => setConfirm(false)}
          onConfirm={() => void session.signOut()}
        />
      )}
    </section>
  );
}
