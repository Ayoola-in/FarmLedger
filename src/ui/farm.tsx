import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { db, loadRecords } from '../data/db';
import { useSession, type Workspace } from '../data/session';
import { remove, save, saveAll, type Draft, type SaveOptions } from '../data/repo';
import { nudgeSync } from '../data/syncController';
import { today as farmToday } from '../domain/dates';
import type { Base, FarmRecords, SyncTable } from '../domain/types';
import { useToast } from './kit';

interface FarmValue {
  workspace: Workspace;
  records: FarmRecords;
  today: string;
  /** Owners and managers. Decides what to show; the server enforces it regardless. */
  canManage: boolean;
  isOwner: boolean;
  /** Whether this person may edit a given record under the worker 24-hour rule. */
  canEdit(row: Base): boolean;
  save<T extends SyncTable>(table: T, draft: Draft<T>, options?: SaveOptions): Promise<FarmRecords[T][number]>;
  saveAll(records: Partial<FarmRecords>): Promise<number>;
  /** Deletes a record and offers Undo. */
  remove(table: SyncTable, id: string, label: string): Promise<void>;
}

const FarmContext = createContext<FarmValue | null>(null);

export function useFarm(): FarmValue {
  const value = useContext(FarmContext);
  if (!value) throw new Error('useFarm must be used inside FarmProvider');
  return value;
}

const DAY_MS = 86_400_000;

export function FarmProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const session = useSession();
  const toast = useToast();
  const workspace = session.workspace as Workspace;
  const canManage = workspace.member.role !== 'worker';
  const records = useLiveQuery(async () => {
    const loaded = await loadRecords(db);
    if (canManage) return loaded;
    // Workers can't read sales, so counts use the server's money-free copy.
    const sales: FarmRecords['sales'] = loaded.bird_sales.map((b) => ({
      ...b, category: 'birds', description: null, amount_kobo: 0, customer_id: null,
    }));
    return { ...loaded, sales };
  }, [canManage]);

  const context = session.writeContext;

  const saveRecord = useCallback<FarmValue['save']>(async (table, draft, options) => {
    for (const key of ['date', 'acquired_on'] as const) {
      const value = (draft as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Please choose a date.');
      if (value > farmToday(workspace.farm.time_zone)) throw new Error('The date can’t be in the future.');
    }
    const row = await save(context(), table, draft, options);
    nudgeSync();
    return row;
  }, [context, workspace.farm.time_zone]);

  const saveMany = useCallback<FarmValue['saveAll']>(async (rows) => {
    const count = await saveAll(context(), rows);
    nudgeSync();
    return count;
  }, [context]);

  const removeRecord = useCallback<FarmValue['remove']>(async (table, id, label) => {
    const undo = await remove(context(), table, id);
    nudgeSync();
    toast.show(`${label} deleted`, {
      action: {
        label: 'Undo',
        run: () => void undo().then(() => { nudgeSync(); }),
      },
    });
  }, [context, toast]);

  const value = useMemo<FarmValue | null>(() => {
    if (!records) return null;
    return {
      workspace,
      records,
      today: farmToday(workspace.farm.time_zone),
      canManage,
      isOwner: workspace.member.role === 'owner',
      canEdit: (row) =>
        canManage ||
        (row.created_by === workspace.userId && Date.now() - new Date(row.created_at).getTime() < DAY_MS),
      save: saveRecord,
      saveAll: saveMany,
      remove: removeRecord,
    };
  }, [records, workspace, canManage, saveRecord, saveMany, removeRecord]);

  if (!value) return <>{fallback}</>;
  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}
