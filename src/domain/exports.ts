import { formatDay } from './dates';
import { formatMoney } from './money';
import { SYNC_TABLES, type Farm, type FarmRecords } from './types';

/** Builds CSV, neutralising cells a spreadsheet would run as a formula. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function saleReceipt(input: {
  farmName: string;
  date: string;
  description: string;
  amountKobo: number;
  paidKobo: number;
  customer?: string | null;
}): string {
  const owed = input.amountKobo - input.paidKobo;
  return [
    `*Receipt from ${input.farmName}*`,
    `Date: ${formatDay(input.date)}`,
    input.customer ? `Customer: ${input.customer}` : null,
    `Item: ${input.description}`,
    `Total: ${formatMoney(input.amountKobo)}`,
    `Paid: ${formatMoney(input.paidKobo)}`,
    owed > 0 ? `Balance due: ${formatMoney(owed)}` : 'Fully paid. Thank you!',
  ].filter(Boolean).join('\n');
}

/** Link that opens WhatsApp with the message ready. Nigerian numbers become +234. */
export function whatsappLink(text: string, phone?: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const international = digits.startsWith('0') && digits.length === 11 ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}

export const BACKUP_FORMAT = 'farmledger-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exported_at: string;
  farm: Pick<Farm, 'name' | 'crate_size' | 'low_feed_days'>;
  records: FarmRecords;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the backup when valid, or throws a message fit to show the user. */
export function parseBackup(data: unknown): Backup {
  const b = data as Partial<Backup> | null;
  if (!b || b.format !== BACKUP_FORMAT) throw new Error('This isn’t a FarmLedger backup file.');
  if (b.version !== 1) throw new Error('This backup is from a newer version of FarmLedger. Update the app and try again.');
  if (!b.records || typeof b.records !== 'object') throw new Error('This backup file is damaged.');
  const records = {} as Record<string, unknown[]>;
  for (const table of SYNC_TABLES) {
    const rows = (b.records as unknown as Record<string, unknown>)[table] ?? [];
    if (!Array.isArray(rows) || rows.some((r) => !UUID.test(String((r as { id?: unknown })?.id)))) {
      throw new Error('This backup file is damaged.');
    }
    records[table] = rows;
  }
  return { ...(b as Backup), records: records as unknown as FarmRecords };
}
