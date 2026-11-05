import type { User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { STARTER_SCHEDULE } from '../domain/health';
import { FINANCE_TABLES, type Farm, type Member, type Role } from '../domain/types';
import { db, metaGet, metaSet, wipeLocalData } from './db';
import { buildDemoRecords } from './demo';
import { newId, saveAll, stamp, type WriteContext } from './repo';
import { supabase, supabaseBackend } from './supabase';
import { purgeTables } from './sync';
import { nudgeSync, startSync, stopSync } from './syncController';

export interface Workspace {
  mode: 'local' | 'cloud';
  demo: boolean;
  userId: string | null;
  farm: Farm;
  member: Pick<Member, 'id' | 'display_name' | 'role'>;
}

const WORKSPACE_KEY = 'workspace';

type Status = 'loading' | 'signed-out' | 'no-farm' | 'ready';

interface SessionValue {
  status: Status;
  workspace: Workspace | null;
  user: User | null;
  /** A notice to show on the sign-in page, such as being removed from a farm. */
  notice: string | null;
  cloudAvailable: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string): Promise<{ needsConfirmation: boolean }>;
  sendReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  createFarm(farmName: string, memberName: string): Promise<void>;
  acceptInvite(token: string, memberName: string): Promise<void>;
  startLocal(farmName: string): Promise<void>;
  startDemo(): Promise<void>;
  updateFarm(changes: Partial<Pick<Farm, 'name' | 'crate_size' | 'low_feed_days'>>): Promise<void>;
  writeContext(): WriteContext;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

function localFarm(name: string): Farm {
  const now = new Date().toISOString();
  return { id: newId(), name, currency: 'NGN', time_zone: 'Africa/Lagos', crate_size: 30, low_feed_days: 7, created_at: now, updated_at: now };
}

const contextFor = (ws: Workspace): WriteContext => ({ farmId: ws.farm.id, userId: ws.userId, queue: ws.mode === 'cloud' });

async function seedSchedule(ctx: WriteContext): Promise<void> {
  await saveAll(ctx, {
    schedule_items: STARTER_SCHEDULE.map((item) => stamp<'schedule_items'>(ctx, item)),
  });
}

const canReadFinance = (role: Role) => role !== 'worker';

/** Fetches the signed-in person's current farm and role from the server. */
async function fetchMembership(userId: string): Promise<{ member: Member; farm: Farm } | null | 'unreachable'> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('members').select('*, farms(*)').eq('user_id', userId).maybeSingle();
  if (error) return 'unreachable';
  if (!data) return null;
  const { farms, ...member } = data as Member & { farms: Farm };
  return { member, farm: farms };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const adopt = useCallback(async (ws: Workspace) => {
    await metaSet(WORKSPACE_KEY, ws);
    setWorkspace(ws);
    setStatus('ready');
  }, []);

  /** Runs after each sync: applies role changes, or removal from the farm. */
  const reconcile = useCallback(async (userId: string) => {
    const current = await metaGet<Workspace>(WORKSPACE_KEY);
    const latest = await fetchMembership(userId);
    if (latest === 'unreachable' || !current || current.mode !== 'cloud') return;
    if (latest === null) {
      stopSync();
      await wipeLocalData();
      setWorkspace(null);
      setNotice('You no longer have access to that farm.');
      setStatus('no-farm');
      return;
    }
    if (current.member.role !== latest.member.role && !canReadFinance(latest.member.role)) {
      await purgeTables(FINANCE_TABLES);
    }
    const changed =
      current.member.role !== latest.member.role ||
      current.member.display_name !== latest.member.display_name ||
      JSON.stringify(current.farm) !== JSON.stringify(latest.farm);
    if (changed) await adopt({ ...current, farm: latest.farm, member: latest.member });
  }, [adopt]);

  const beginCloud = useCallback(async (nextUser: User) => {
    setUser(nextUser);
    const cached = await metaGet<Workspace>(WORKSPACE_KEY);
    if (cached?.mode === 'cloud' && cached.userId === nextUser.id) {
      // Opens immediately from this device; the server is only checked afterwards.
      await adopt(cached);
      startSync(supabaseBackend(supabase!, cached.farm.id), () => reconcile(nextUser.id));
      return;
    }
    const membership = await fetchMembership(nextUser.id);
    if (membership === null || membership === 'unreachable') {
      setStatus('no-farm');
      return;
    }
    // A different person on this device must never see the previous person's data.
    await wipeLocalData();
    await adopt({ mode: 'cloud', demo: false, userId: nextUser.id, farm: membership.farm, member: membership.member });
    startSync(supabaseBackend(supabase!, membership.farm.id), () => reconcile(nextUser.id));
  }, [adopt, reconcile]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      void navigator.storage?.persist?.();
      const cached = await metaGet<Workspace>(WORKSPACE_KEY);
      if (cached?.mode === 'local') {
        if (!cancelled) await adopt(cached);
        return;
      }
      if (!supabase) {
        if (!cancelled) setStatus('signed-out');
        return;
      }
      if (cached?.mode === 'cloud' && cached.userId) {
        // Open from the device first. An expired token can't be refreshed offline,
        // and that must never lock a farmer out of their own records.
        const userId = cached.userId;
        if (!cancelled) await adopt(cached);
        startSync(supabaseBackend(supabase, cached.farm.id), () => reconcile(userId));
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.user) setUser(data.session.user);
        // Signed out on the server. Queued records stay until this person signs back in.
        else if (!error && navigator.onLine) {
          stopSync();
          setStatus('signed-out');
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.user) await beginCloud(data.session.user);
      else setStatus('signed-out');
    })();
    return () => {
      cancelled = true;
    };
  }, [adopt, beginCloud, reconcile]);

  const signOut = useCallback(async () => {
    stopSync();
    await supabase?.auth.signOut({ scope: 'local' });
    await wipeLocalData();
    setUser(null);
    setWorkspace(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo<SessionValue>(() => ({
    status,
    workspace,
    user,
    notice,
    cloudAvailable: Boolean(supabase),
    async signIn(email, password) {
      const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setNotice(null);
      await wipeLocalWorkspaceIfLocal();
      await beginCloud(data.user);
    },
    async signUp(email, password, name) {
      const { data, error } = await supabase!.auth.signUp({
        email,
        password,
        options: { data: { display_name: name }, emailRedirectTo: `${location.origin}/onboarding` },
      });
      if (error) throw error;
      if (data.session && data.user) {
        await wipeLocalWorkspaceIfLocal();
        await beginCloud(data.user);
        return { needsConfirmation: false };
      }
      return { needsConfirmation: true };
    },
    async sendReset(email) {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/reset` });
      if (error) throw error;
    },
    async updatePassword(password) {
      const { error } = await supabase!.auth.updateUser({ password });
      if (error) throw error;
    },
    signOut,
    async createFarm(farmName, memberName) {
      const { data, error } = await supabase!.rpc('create_farm', { farm_name: farmName, member_name: memberName });
      if (error) throw error;
      const membership = await fetchMembership(user!.id);
      if (!membership || membership === 'unreachable') throw new Error('Your farm was created, but it could not be opened. Please refresh.');
      await wipeLocalData();
      const ws: Workspace = { mode: 'cloud', demo: false, userId: user!.id, farm: membership.farm, member: membership.member };
      await adopt(ws);
      await seedSchedule({ farmId: data as string, userId: user!.id, queue: true });
      startSync(supabaseBackend(supabase!, membership.farm.id), () => reconcile(user!.id));
      nudgeSync();
    },
    async acceptInvite(token, memberName) {
      const { error } = await supabase!.rpc('accept_invite', { invite_token: token, member_name: memberName });
      if (error) throw error;
      await wipeLocalData();
      await beginCloud(user!);
    },
    async startLocal(farmName) {
      await wipeLocalData();
      const farm = localFarm(farmName);
      const ws: Workspace = { mode: 'local', demo: false, userId: null, farm, member: { id: 'local', display_name: 'You', role: 'owner' } };
      await adopt(ws);
      await seedSchedule(contextFor(ws));
    },
    async startDemo() {
      await wipeLocalData();
      const farm = localFarm('Green Acres Poultry');
      const ws: Workspace = { mode: 'local', demo: true, userId: null, farm, member: { id: 'local', display_name: 'Demo', role: 'owner' } };
      await saveAll(contextFor(ws), buildDemoRecords(farm.id, new Date()));
      await adopt(ws);
    },
    async updateFarm(changes) {
      if (!workspace) return;
      const now = new Date().toISOString();
      if (workspace.mode === 'cloud') {
        const { data, error } = await supabase!.from('farms').update(changes).eq('id', workspace.farm.id).select().single();
        if (error) throw error;
        await adopt({ ...workspace, farm: data as Farm });
      } else {
        await adopt({ ...workspace, farm: { ...workspace.farm, ...changes, updated_at: now } });
      }
    },
    writeContext() {
      if (!workspace) throw new Error('No workspace is open');
      return contextFor(workspace);
    },
  }), [status, workspace, user, notice, signOut, beginCloud, adopt, reconcile]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

async function wipeLocalWorkspaceIfLocal(): Promise<void> {
  const cached = await metaGet<Workspace>(WORKSPACE_KEY, db);
  if (cached?.mode === 'local') await wipeLocalData();
}
