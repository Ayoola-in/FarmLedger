import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SyncTable } from '../domain/types';
import type { BackendError, SyncBackend } from './sync';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when no backend is configured; the app then offers local workspaces only. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

interface ApiError {
  code?: string;
  message: string;
}

const FRIENDLY: Record<string, string> = {
  '42501': 'You don’t have permission to make this change. Workers can only edit their own records for 24 hours.',
  '23514': 'The server rejected these values. Check the numbers and try again.',
  '22P02': 'This record has an invalid value.',
};

export function classifyError(error: ApiError, status: number): BackendError {
  const transient = status === 0 || status === 401 || status === 408 || status === 429 || status >= 500 || !error.code;
  return { transient, message: (error.code && FRIENDLY[error.code]) || error.message };
}

export function supabaseBackend(client: SupabaseClient, farmId: string): SyncBackend {
  return {
    async push(table: SyncTable, rows) {
      const { error, status } = await client.from(table).upsert(rows, { onConflict: 'id' });
      return error ? classifyError(error, status) : null;
    },
    async pull(table: SyncTable, afterSeq, limit) {
      const { data, error, status } = await client
        .from(table)
        .select('*')
        .eq('farm_id', farmId)
        .gt('seq', afterSeq)
        .order('seq')
        .limit(limit);
      if (error) return { error: classifyError(error, status) };
      return { rows: data as Record<string, unknown>[] };
    },
  };
}
