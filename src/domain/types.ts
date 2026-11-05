// Shared record shapes. Column names match supabase/migrations exactly, so a
// row can travel between IndexedDB and Postgres without any mapping layer.

export type Role = 'owner' | 'manager' | 'worker';

/** Calendar day in the farm's own time zone, formatted YYYY-MM-DD. */
export type Day = string;

export interface Base {
  id: string;
  farm_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Flock extends Base {
  name: string;
  breed: string;
  source: string | null;
  house: string | null;
  acquired_on: Day;
  /** Age of the birds on the day they arrived. Day-old chicks = 0. */
  age_at_acquisition_days: number;
  quantity: number;
  status: 'active' | 'closed';
  closed_on: Day | null;
  notes: string | null;
}

export interface EggLog extends Base {
  date: Day;
  flock_id: string;
  collected: number;
  broken: number;
  dirty: number;
}

export interface MortalityLog extends Base {
  date: Day;
  flock_id: string;
  quantity: number;
  cause: string | null;
}

export interface FeedPurchase extends Base {
  date: Day;
  feed_type: string;
  supplier: string | null;
  quantity_kg: number;
}

export interface FeedUsage extends Base {
  date: Day;
  flock_id: string;
  feed_type: string;
  quantity_kg: number;
}

export interface HealthEvent extends Base {
  date: Day;
  flock_id: string;
  kind: 'vaccine' | 'medication';
  product: string;
  schedule_item_id: string | null;
  notes: string | null;
}

export interface ScheduleItem extends Base {
  name: string;
  product: string;
  age_days: number;
}

export interface Customer extends Base {
  name: string;
  phone: string | null;
}

export type SaleCategory = 'eggs' | 'birds' | 'manure' | 'other';

export interface Sale extends Base {
  date: Day;
  category: SaleCategory;
  description: string | null;
  quantity: number;
  /** Full amount the customer was charged, never profit. */
  amount_kobo: number;
  customer_id: string | null;
  flock_id: string | null;
}

export interface Payment extends Base {
  date: Day;
  sale_id: string;
  amount_kobo: number;
}

/** Server-maintained copy of a bird sale with no money, so workers can count birds. */
export interface BirdSale extends Base {
  date: Day;
  flock_id: string;
  quantity: number;
}

export type ExpenseSource = 'flock' | 'feed_purchase' | 'health_event';

export interface Expense extends Base {
  date: Day;
  category: string;
  amount_kobo: number;
  vendor: string | null;
  description: string | null;
  flock_id: string | null;
  /** Set when a cost belongs to another record. Keeps exactly one copy of it. */
  source_table: ExpenseSource | null;
  source_id: string | null;
}

export interface Farm {
  id: string;
  name: string;
  currency: string;
  time_zone: string;
  crate_size: number;
  low_feed_days: number;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  farm_id: string;
  user_id: string;
  display_name: string;
  role: Role;
  created_at: string;
}

export interface FarmRecords {
  flocks: Flock[];
  egg_logs: EggLog[];
  mortality_logs: MortalityLog[];
  feed_purchases: FeedPurchase[];
  feed_usage: FeedUsage[];
  health_events: HealthEvent[];
  schedule_items: ScheduleItem[];
  customers: Customer[];
  sales: Sale[];
  payments: Payment[];
  expenses: Expense[];
  bird_sales: BirdSale[];
}

export type SyncTable = keyof FarmRecords;

/** Tables a worker's device never receives. */
export const FINANCE_TABLES: SyncTable[] = ['customers', 'sales', 'payments', 'expenses'];

export const SYNC_TABLES: SyncTable[] = [
  'flocks',
  'egg_logs',
  'mortality_logs',
  'feed_purchases',
  'feed_usage',
  'schedule_items',
  'health_events',
  'customers',
  'sales',
  'payments',
  'expenses',
  'bird_sales',
];
