// Decides when sync runs and publishes its state to the UI.
import { db } from './db';
import { runSync, type SyncBackend } from './sync';

export type SyncState = 'local' | 'idle' | 'syncing' | 'offline' | 'error';

interface Status {
  state: SyncState;
  message?: string;
}

let status: Status = { state: 'local' };
const listeners = new Set<() => void>();

function publish(next: Status): void {
  status = next;
  listeners.forEach((l) => l());
}

export const syncStatus = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => status,
};

let backend: SyncBackend | null = null;
let afterSync: (() => Promise<void>) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let backoffMs = 5_000;
let running = false;
let again = false;

async function runOnce(): Promise<void> {
  if (!backend) return;
  if (!navigator.onLine) {
    publish({ state: 'offline' });
    return;
  }
  if (running) {
    again = true;
    return;
  }
  running = true;
  publish({ state: 'syncing' });
  try {
    const sync = async () => {
      const result = await runSync(backend as SyncBackend, db);
      if (result.retryLater) {
        publish({ state: 'offline', message: result.retryLater });
        schedule(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 5 * 60_000);
      } else {
        backoffMs = 5_000;
        publish({ state: result.failed > 0 ? 'error' : 'idle' });
      }
      await afterSync?.();
    };
    // Only one tab syncs at a time when the browser supports it.
    if (navigator.locks) await navigator.locks.request('farmledger-sync', sync);
    else await sync();
  } catch (error) {
    publish({ state: 'offline', message: error instanceof Error ? error.message : 'Sync failed' });
    schedule(backoffMs);
  } finally {
    running = false;
    if (again) {
      again = false;
      void runOnce();
    }
  }
}

function schedule(ms: number): void {
  clearTimeout(timer);
  timer = setTimeout(() => void runOnce(), ms);
}

/** Call after any local write. Waits briefly so a burst of edits goes up together. */
export function nudgeSync(): void {
  if (backend) schedule(800);
}

export const syncNow = (): Promise<void> => runOnce();

const onOnline = () => void runOnce();
const onOffline = () => publish({ state: 'offline' });
const onVisible = () => {
  if (document.visibilityState === 'visible') void runOnce();
};

export function startSync(next: SyncBackend, onAfterSync?: () => Promise<void>): void {
  stopSync();
  backend = next;
  afterSync = onAfterSync ?? null;
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  interval = setInterval(() => void runOnce(), 60_000);
  void runOnce();
}

export function stopSync(): void {
  backend = null;
  afterSync = null;
  clearTimeout(timer);
  clearInterval(interval);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', onVisible);
  publish({ state: 'local' });
}
