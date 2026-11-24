// Every data-entry form, opened from anywhere through useForms().open(...).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { linkedCost, newId } from '../data/repo';
import { checkEggEntry } from '../domain/health';
import { birdsAlive, feedStock, saleBalance } from '../domain/metrics';
import { formatDay } from '../domain/dates';
import { formatMoney, koboToInput, parseNaira } from '../domain/money';
import type { Customer, EggLog, Expense, FeedPurchase, FeedUsage, Flock, HealthEvent, MortalityLog, Sale, SaleCategory, ScheduleItem } from '../domain/types';
import { useFarm } from './farm';
import { CountField, DecimalField, Field, FormSheet, MoneyField, SelectField, useToast } from './kit';

export type FormRequest =
  | { type: 'flock'; record?: Flock; cost?: number }
  | { type: 'eggs'; record?: EggLog; flockId?: string }
  | { type: 'mortality'; record?: MortalityLog; flockId?: string }
  | { type: 'feed-usage'; record?: FeedUsage; flockId?: string }
  | { type: 'feed-purchase'; record?: FeedPurchase; cost?: number }
  | { type: 'health'; record?: HealthEvent; flockId?: string; item?: ScheduleItem; cost?: number }
  | { type: 'sale'; record?: Sale; flockId?: string; category?: SaleCategory }
  | { type: 'expense'; record?: Expense; flockId?: string }
  | { type: 'payment'; sale: Sale }
  | { type: 'customer'; record?: Customer }
  | { type: 'schedule'; record?: ScheduleItem };

interface FormsApi {
  /** Linked costs are read first, so they appear when editing a record. */
  open(request: FormRequest): void;
}

const FormsContext = createContext<FormsApi>({ open: () => undefined });
export const useForms = (): FormsApi => useContext(FormsContext);

export function FormsProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<FormRequest | null>(null);
  const api = useMemo<FormsApi>(() => ({
    open(next) {
      void (async () => {
        if (next.type === 'flock' && next.record) next.cost = await linkedCost('flock', next.record.id);
        if (next.type === 'feed-purchase' && next.record) next.cost = await linkedCost('feed_purchase', next.record.id);
        if (next.type === 'health' && next.record) next.cost = await linkedCost('health_event', next.record.id);
        setRequest(next);
      })();
    },
  }), []);
  const close = () => setRequest(null);
  return (
    <FormsContext.Provider value={api}>
      {children}
      {request && <FormSwitch key={JSON.stringify([request.type, (request as { record?: { id: string } }).record?.id])} request={request} onClose={close} />}
    </FormsContext.Provider>
  );
}

function FormSwitch({ request, onClose }: { request: FormRequest; onClose: () => void }) {
  switch (request.type) {
    case 'flock': return <FlockForm {...request} onClose={onClose} />;
    case 'eggs': return <EggForm {...request} onClose={onClose} />;
    case 'mortality': return <MortalityForm {...request} onClose={onClose} />;
    case 'feed-usage': return <FeedUsageForm {...request} onClose={onClose} />;
    case 'feed-purchase': return <FeedPurchaseForm {...request} onClose={onClose} />;
    case 'health': return <HealthForm {...request} onClose={onClose} />;
    case 'sale': return <SaleForm {...request} onClose={onClose} />;
    case 'expense': return <ExpenseForm {...request} onClose={onClose} />;
    case 'payment': return <PaymentForm {...request} onClose={onClose} />;
    case 'customer': return <CustomerForm {...request} onClose={onClose} />;
    case 'schedule': return <ScheduleForm {...request} onClose={onClose} />;
  }
}

// ---------------------------------------------------------------- helpers

const toCount = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);
const toDecimal = (text: string): number | null => {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};
type Errors = Record<string, string>;

function useActiveFlocks(selected?: string) {
  const { records } = useFarm();
  return records.flocks
    .filter((f) => f.status === 'active' || f.id === selected)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function FlockSelect({ value, onChange, error, optional }: { value: string; onChange: (v: string) => void; error?: string; optional?: string }) {
  const flocks = useActiveFlocks(value);
  const options = flocks.map((f) => ({ value: f.id, label: f.name }));
  return (
    <SelectField
      label={optional ? 'Flock (optional)' : 'Flock'}
      value={value}
      onChange={onChange}
      error={error}
      options={optional ? [{ value: '', label: optional }, ...options] : value ? options : [{ value: '', label: 'Choose a flock' }, ...options]}
    />
  );
}

const useDefaultFlock = (given?: string) => {
  const flocks = useActiveFlocks(given);
  return given ?? flocks[0]?.id ?? '';
};

function NoFlockGuard({ flockId, onClose, title, children }: { flockId: string; onClose: () => void; title: string; children: ReactNode }) {
  if (flockId) return <>{children}</>;
  return (
    <FormSheet title={title} submitLabel="Close" onClose={onClose} onSubmit={onClose}>
      <p>Add a flock first, then you can record this against it.</p>
    </FormSheet>
  );
}

const DEFAULT_FEEDS = ['Chick Mash', 'Grower Mash', 'Layers Mash'];

function useFeedTypes(): string[] {
  const { records } = useFarm();
  return [...new Set([...DEFAULT_FEEDS, ...records.feed_purchases.map((p) => p.feed_type)])].sort();
}

// ---------------------------------------------------------------- flocks

function FlockForm({ record, cost, onClose }: { record?: Flock; cost?: number; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const [name, setName] = useState(record?.name ?? '');
  const [breed, setBreed] = useState(record?.breed ?? '');
  const [house, setHouse] = useState(record?.house ?? '');
  const [source, setSource] = useState(record?.source ?? '');
  const [date, setDate] = useState(record?.acquired_on ?? farm.today);
  const [age, setAge] = useState(String(record?.age_at_acquisition_days ?? 0));
  const [quantity, setQuantity] = useState(record ? String(record.quantity) : '');
  const [price, setPrice] = useState(cost ? koboToInput(cost) : '');
  const [errors, setErrors] = useState<Errors>({});

  return (
    <FormSheet
      title={record ? 'Edit flock' : 'Add a flock'}
      onClose={onClose}
      onSubmit={async () => {
        const e: Errors = {};
        const qty = toCount(quantity);
        const ageDays = toCount(age);
        const kobo = price.trim() ? parseNaira(price) : 0;
        if (!name.trim()) e.name = 'Give this flock a name.';
        if (!qty) e.quantity = 'Enter how many birds you received.';
        if (ageDays === null) e.age = 'Enter the age in whole days. Use 0 for day-old chicks.';
        if (kobo === null) e.price = 'Enter a valid amount, like 250000.';
        setErrors(e);
        if (Object.keys(e).length) return;
        const id = record?.id ?? newId();
        await farm.save('flocks', {
          id, name: name.trim(), breed: breed.trim(), house: house.trim() || null, source: source.trim() || null,
          acquired_on: date, age_at_acquisition_days: ageDays as number, quantity: qty as number,
          status: record?.status ?? 'active', closed_on: record?.closed_on ?? null, notes: record?.notes ?? null,
        }, {
          cost: { kobo: kobo as number, date, category: 'Birds', description: `Purchase of ${name.trim()}`, vendor: source.trim() || null, source: 'flock', flockId: id },
        });
        toast.show(record ? 'Flock updated' : 'Flock added');
        onClose();
      }}
    >
      <Field label="Flock name" value={name} onChange={setName} error={errors.name} placeholder="e.g. Batch A" autoFocus={!record} />
      <div className="field-row">
        <Field label="Breed" value={breed} onChange={setBreed} placeholder="Isa Brown" />
        <Field label="House" value={house} onChange={setHouse} placeholder="House 1" />
      </div>
      <div className="field-row">
        <CountField label="Birds received" value={quantity} onChange={setQuantity} error={errors.quantity} />
        <CountField label="Age on arrival (days)" value={age} onChange={setAge} error={errors.age} />
      </div>
      <Field label="Date received" type="date" value={date} onChange={setDate} max={farm.today} />
      <Field label="Bought from" value={source} onChange={setSource} placeholder="Hatchery or seller" />
      {farm.canManage && (
        <MoneyField label="Total purchase cost" value={price} onChange={setPrice} error={errors.price} hint="Added to your expenses automatically." />
      )}
    </FormSheet>
  );
}

// ---------------------------------------------------------------- daily logs

function EggForm({ record, flockId, onClose }: { record?: EggLog; flockId?: string; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const initialFlock = useDefaultFlock(record?.flock_id ?? flockId);
  const [flock, setFlock] = useState(initialFlock);
  const [date, setDate] = useState(record?.date ?? farm.today);
  const [collected, setCollected] = useState(record ? String(record.collected) : '');
  const [broken, setBroken] = useState(record ? String(record.broken) : '0');
  const [dirty, setDirty] = useState(record ? String(record.dirty) : '0');
  const [errors, setErrors] = useState<Errors>({});
  const [confirmed, setConfirmed] = useState(false);

  const selected = farm.records.flocks.find((f) => f.id === flock);
  const alive = selected ? birdsAlive(selected, farm.records.mortality_logs, farm.records.sales) : 0;
  const entry = { collected: toCount(collected) ?? 0, broken: toCount(broken) ?? 0, dirty: toCount(dirty) ?? 0 };
  const check = checkEggEntry(entry, alive);
  const crate = farm.workspace.farm.crate_size;
  const duplicate = !record && farm.records.egg_logs.some((l) => l.flock_id === flock && l.date === date);

  return (
    <NoFlockGuard flockId={initialFlock} onClose={onClose} title="Log eggs">
      <FormSheet
        title={record ? 'Edit egg record' : 'Log eggs'}
        onClose={onClose}
        error={check.error}
        warning={check.warning ?? (duplicate ? 'Eggs are already logged for this flock on this day. This adds a second collection.' : undefined)}
        submitLabel={check.warning && !confirmed ? 'Save anyway' : 'Save'}
        onSubmit={async () => {
          const e: Errors = {};
          if (toCount(collected) === null) e.collected = 'Enter the number of eggs collected.';
          if (toCount(broken) === null) e.broken = 'Whole numbers only.';
          if (toCount(dirty) === null) e.dirty = 'Whole numbers only.';
          setErrors(e);
          if (Object.keys(e).length || check.error) return;
          setConfirmed(true);
          await farm.save('egg_logs', { id: record?.id, date, flock_id: flock, ...entry });
          toast.show(`Saved ${entry.collected} eggs`);
          onClose();
        }}
      >
        <FlockSelect value={flock} onChange={setFlock} />
        <Field label="Date" type="date" value={date} onChange={setDate} max={farm.today} />
        <CountField label="Eggs collected" value={collected} onChange={setCollected} error={errors.collected} autoFocus hint={entry.collected >= crate ? `${Math.floor(entry.collected / crate)} crates and ${entry.collected % crate} eggs` : undefined} />
        <div className="field-row">
          <CountField label="Broken" value={broken} onChange={setBroken} error={errors.broken} />
          <CountField label="Dirty" value={dirty} onChange={setDirty} error={errors.dirty} />
        </div>
      </FormSheet>
    </NoFlockGuard>
  );
}

function MortalityForm({ record, flockId, onClose }: { record?: MortalityLog; flockId?: string; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const initialFlock = useDefaultFlock(record?.flock_id ?? flockId);
  const [flock, setFlock] = useState(initialFlock);
  const [date, setDate] = useState(record?.date ?? farm.today);
  const [quantity, setQuantity] = useState(record ? String(record.quantity) : '');
  const [cause, setCause] = useState(record?.cause ?? '');
  const [error, setError] = useState<string>();

  return (
    <NoFlockGuard flockId={initialFlock} onClose={onClose} title="Record deaths">
      <FormSheet
        title={record ? 'Edit death record' : 'Record deaths'}
        onClose={onClose}
        onSubmit={async () => {
          const qty = toCount(quantity);
          if (!qty) return setError('Enter how many birds died.');
          await farm.save('mortality_logs', { id: record?.id, date, flock_id: flock, quantity: qty, cause: cause.trim() || null });
          toast.show('Deaths recorded');
          onClose();
        }}
      >
        <FlockSelect value={flock} onChange={setFlock} />
        <Field label="Date" type="date" value={date} onChange={setDate} max={farm.today} />
        <CountField label="Number of birds" value={quantity} onChange={setQuantity} error={error} autoFocus />
        <Field label="Cause (if known)" value={cause} onChange={setCause} placeholder="e.g. Heat stress" />
      </FormSheet>
    </NoFlockGuard>
  );
}

function FeedUsageForm({ record, flockId, onClose }: { record?: FeedUsage; flockId?: string; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const types = useFeedTypes();
  const initialFlock = useDefaultFlock(record?.flock_id ?? flockId);
  const stock = feedStock(farm.records.feed_purchases, farm.records.feed_usage, farm.today);
  const [flock, setFlock] = useState(initialFlock);
  const [date, setDate] = useState(record?.date ?? farm.today);
  const [type, setType] = useState(record?.feed_type ?? stock.find((s) => s.stockKg > 0)?.feedType ?? types[0] ?? '');
  const [kg, setKg] = useState(record ? String(record.quantity_kg) : '');
  const [error, setError] = useState<string>();

  const available = (stock.find((s) => s.feedType === type)?.stockKg ?? 0) + (record?.feed_type === type ? record.quantity_kg : 0);
  const amount = toDecimal(kg) ?? 0;

  return (
    <NoFlockGuard flockId={initialFlock} onClose={onClose} title="Log feed used">
      <FormSheet
        title={record ? 'Edit feed use' : 'Log feed used'}
        onClose={onClose}
        warning={amount > available ? `That’s more than the ${available.toLocaleString()} kg of ${type} in stock. You can still save this and record the purchase later.` : undefined}
        onSubmit={async () => {
          const qty = toDecimal(kg);
          if (!qty) return setError('Enter the amount of feed in kg.');
          await farm.save('feed_usage', { id: record?.id, date, flock_id: flock, feed_type: type, quantity_kg: qty });
          toast.show('Feed use saved');
          onClose();
        }}
      >
        <FlockSelect value={flock} onChange={setFlock} />
        <SelectField label="Feed type" value={type} onChange={setType} options={types.map((t) => ({ value: t, label: t }))} />
        <Field label="Date" type="date" value={date} onChange={setDate} max={farm.today} />
        <DecimalField label="Amount used (kg)" value={kg} onChange={setKg} error={error} autoFocus hint={`${available.toLocaleString()} kg in stock`} />
      </FormSheet>
    </NoFlockGuard>
  );
}

function FeedPurchaseForm({ record, cost, onClose }: { record?: FeedPurchase; cost?: number; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const [date, setDate] = useState(record?.date ?? farm.today);
  const [type, setType] = useState(record?.feed_type ?? '');
  const [supplier, setSupplier] = useState(record?.supplier ?? '');
  const [kg, setKg] = useState(record ? String(record.quantity_kg) : '');
  const [price, setPrice] = useState(cost ? koboToInput(cost) : '');
  const [errors, setErrors] = useState<Errors>({});
  const types = useFeedTypes();

  return (
    <FormSheet
      title={record ? 'Edit feed purchase' : 'Record feed purchase'}
      onClose={onClose}
      onSubmit={async () => {
        const e: Errors = {};
        const qty = toDecimal(kg);
        const kobo = price.trim() ? parseNaira(price) : 0;
        if (!type.trim()) e.type = 'Enter the feed type.';
        if (!qty) e.kg = 'Enter the quantity in kg.';
        if (kobo === null) e.price = 'Enter a valid amount.';
        setErrors(e);
        if (Object.keys(e).length) return;
        await farm.save('feed_purchases', { id: record?.id, date, feed_type: type.trim(), supplier: supplier.trim() || null, quantity_kg: qty as number }, {
          cost: { kobo: kobo as number, date, category: 'Feed', description: `${qty} kg of ${type.trim()}`, vendor: supplier.trim() || null, source: 'feed_purchase' },
        });
        toast.show('Feed purchase saved');
        onClose();
      }}
    >
      <Field label="Feed type" value={type} onChange={setType} error={errors.type} list="feed-types" placeholder="Layers Mash" autoFocus={!record} />
      <datalist id="feed-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="field-row">
        <DecimalField label="Quantity (kg)" value={kg} onChange={setKg} error={errors.kg} />
        <MoneyField label="Total cost" value={price} onChange={setPrice} error={errors.price} />
      </div>
      <Field label="Date" type="date" value={date} onChange={setDate} max={farm.today} />
      <Field label="Supplier" value={supplier} onChange={setSupplier} />
    </FormSheet>
  );
}

function HealthForm({ record, flockId, item, cost, onClose }: { record?: HealthEvent; flockId?: string; item?: ScheduleItem; cost?: number; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const initialFlock = useDefaultFlock(record?.flock_id ?? flockId);
  const [flock, setFlock] = useState(initialFlock);
  const [date, setDate] = useState(record?.date ?? farm.today);
  const [kind, setKind] = useState<HealthEvent['kind']>(record?.kind ?? 'vaccine');
  const [product, setProduct] = useState(record?.product ?? item?.product ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [price, setPrice] = useState(cost ? koboToInput(cost) : '');
  const [errors, setErrors] = useState<Errors>({});

  return (
    <NoFlockGuard flockId={initialFlock} onClose={onClose} title="Record treatment">
      <FormSheet
        title={record ? 'Edit treatment' : item ? `Record: ${item.name}` : 'Record treatment'}
        onClose={onClose}
        onSubmit={async () => {
          const e: Errors = {};
          const kobo = price.trim() ? parseNaira(price) : 0;
          if (!product.trim()) e.product = 'Enter what was given.';
          if (kobo === null) e.price = 'Enter a valid amount.';
          setErrors(e);
          if (Object.keys(e).length) return;
          const draft = { id: record?.id, date, flock_id: flock, kind, product: product.trim(), schedule_item_id: record?.schedule_item_id ?? item?.id ?? null, notes: notes.trim() || null };
          // Workers neither see nor set costs, so their edits leave any cost untouched.
          await farm.save('health_events', draft, farm.canManage
            ? { cost: { kobo: kobo as number, date, category: 'Health', description: product.trim(), source: 'health_event', flockId: flock } }
            : {});
          toast.show('Treatment recorded');
          onClose();
        }}
      >
        <FlockSelect value={flock} onChange={setFlock} />
        <SelectField label="Type" value={kind} onChange={(v) => setKind(v as HealthEvent['kind'])} options={[{ value: 'vaccine', label: 'Vaccine' }, { value: 'medication', label: 'Medication' }]} />
        <Field label="Product" value={product} onChange={setProduct} error={errors.product} placeholder="e.g. NDV Lasota" />
        <Field label="Date given" type="date" value={date} onChange={setDate} max={farm.today} />
        {farm.canManage && <MoneyField label="Cost" value={price} onChange={setPrice} error={errors.price} hint="Added to your expenses automatically." />}
        <Field label="Notes" value={notes} onChange={setNotes} />
      </FormSheet>
    </NoFlockGuard>
  );
}

// ---------------------------------------------------------------- finance

const CATEGORY_LABELS: Record<SaleCategory, string> = { eggs: 'Eggs', birds: 'Birds', manure: 'Manure', other: 'Other' };
export const saleCategoryLabel = (c: SaleCategory): string => CATEGORY_LABELS[c];

function SaleForm({ record, flockId, category: initialCategory, onClose }: { record?: Sale; flockId?: string; category?: SaleCategory; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const paidBefore = record ? record.amount_kobo - saleBalance(record, farm.records.payments) : 0;
  const [date, setDate] = useState(record?.date ?? farm.today);
  const [category, setCategory] = useState<SaleCategory>(record?.category ?? initialCategory ?? 'eggs');
  const [flock, setFlock] = useState(record?.flock_id ?? flockId ?? '');
  const [quantity, setQuantity] = useState(record ? String(record.quantity) : '');
  const [amount, setAmount] = useState(record ? koboToInput(record.amount_kobo) : '');
  const [customer, setCustomer] = useState(record?.customer_id ?? '');
  const [newCustomer, setNewCustomer] = useState('');
  const [description, setDescription] = useState(record?.description ?? '');
  const [paid, setPaid] = useState<'full' | 'part' | 'none'>('full');
  const [paidAmount, setPaidAmount] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const selected = farm.records.flocks.find((f) => f.id === flock);
  // Editing a bird sale frees up its own birds, so they count as available.
  const alive = selected ? birdsAlive(selected, farm.records.mortality_logs, farm.records.sales) + (record?.category === 'birds' && record.flock_id === flock ? record.quantity : 0) : 0;
  const unit = category === 'eggs' ? 'Crates' : category === 'birds' ? 'Birds' : 'Quantity';

  return (
    <FormSheet
      title={record ? 'Edit sale' : 'Record sale'}
      onClose={onClose}
      onSubmit={async () => {
        const e: Errors = {};
        const qty = toDecimal(quantity);
        const kobo = parseNaira(amount);
        const partial = paid === 'part' ? parseNaira(paidAmount) : null;
        if (!qty) e.quantity = 'Enter the quantity sold.';
        if (kobo === null) e.amount = 'Enter the total charged, like 48000.';
        if (category === 'birds') {
          if (!flock) e.flock = 'Choose which flock the birds came from.';
          else if (qty && qty > alive) e.quantity = `Only ${alive} birds are alive in this flock.`;
          else if (qty && !Number.isInteger(qty)) e.quantity = 'Whole birds only.';
        }
        if (record && kobo !== null && kobo < paidBefore) e.amount = `${formatMoney(paidBefore)} has already been paid on this sale. Remove a payment first to charge less.`;
        if (!record && paid === 'part' && (partial === null || (kobo !== null && partial > kobo))) e.paid = 'Enter an amount up to the sale total.';
        setErrors(e);
        if (Object.keys(e).length) return;

        let customerId: string | null = customer || null;
        if (customer === 'new' && newCustomer.trim()) {
          customerId = (await farm.save('customers', { name: newCustomer.trim(), phone: null })).id;
        } else if (customer === 'new') customerId = null;

        const sale = await farm.save('sales', {
          id: record?.id, date, category, description: description.trim() || null, quantity: qty as number,
          amount_kobo: kobo as number, customer_id: customerId, flock_id: flock || null,
        });
        if (!record) {
          const pay = paid === 'full' ? (kobo as number) : paid === 'part' ? (partial as number) : 0;
          if (pay > 0) await farm.save('payments', { date, sale_id: sale.id, amount_kobo: pay });
        }
        toast.show('Sale saved');
        onClose();
      }}
    >
      <SelectField label="What was sold" value={category} onChange={(v) => setCategory(v as SaleCategory)} options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
      <FlockSelect value={flock} onChange={setFlock} error={errors.flock} optional={category === 'birds' ? undefined : 'Not linked to a flock'} />
      <div className="field-row">
        <DecimalField label={unit} value={quantity} onChange={setQuantity} error={errors.quantity} hint={category === 'birds' && selected ? `${alive} alive` : undefined} />
        <MoneyField label="Total charged" value={amount} onChange={setAmount} error={errors.amount} />
      </div>
      <Field label="Date" type="date" value={date} onChange={setDate} max={farm.today} />
      <SelectField
        label="Customer"
        value={customer}
        onChange={setCustomer}
        options={[{ value: '', label: 'Walk-in customer' }, ...farm.records.customers.map((c) => ({ value: c.id, label: c.name })), { value: 'new', label: '+ New customer' }]}
      />
      {customer === 'new' && <Field label="Customer name" value={newCustomer} onChange={setNewCustomer} autoFocus />}
      {!record && (
        <SelectField label="Payment" value={paid} onChange={(v) => setPaid(v as typeof paid)} options={[{ value: 'full', label: 'Paid in full' }, { value: 'part', label: 'Part paid' }, { value: 'none', label: 'On credit (not paid yet)' }]} />
      )}
      {!record && paid === 'part' && <MoneyField label="Amount paid now" value={paidAmount} onChange={setPaidAmount} error={errors.paid} />}
      {record && <SalePayments sale={record} />}
      <Field label="Note" value={description} onChange={setDescription} />
    </FormSheet>
  );
}

const EXPENSE_CATEGORIES = ['Labour', 'Utilities', 'Transport', 'Repairs', 'Equipment', 'Rent', 'Packaging', 'Other'];

function ExpenseForm({ record, flockId, onClose }: { record?: Expense; flockId?: string; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const [date, setDate] = useState(record?.date ?? farm.today);
  const [category, setCategory] = useState(record?.category ?? 'Labour');
  const [amount, setAmount] = useState(record ? koboToInput(record.amount_kobo) : '');
  const [vendor, setVendor] = useState(record?.vendor ?? '');
  const [description, setDescription] = useState(record?.description ?? '');
  const [flock, setFlock] = useState(record?.flock_id ?? flockId ?? '');
  const [error, setError] = useState<string>();
  const options = [...new Set([...EXPENSE_CATEGORIES, category])];

  return (
    <FormSheet
      title={record ? 'Edit expense' : 'Record expense'}
      onClose={onClose}
      onSubmit={async () => {
        const kobo = parseNaira(amount);
        if (kobo === null || kobo === 0) return setError('Enter the amount, like 15000.');
        await farm.save('expenses', {
          id: record?.id, date, category, amount_kobo: kobo, vendor: vendor.trim() || null, description: description.trim() || null,
          flock_id: flock || null, source_table: record?.source_table ?? null, source_id: record?.source_id ?? null,
        });
        toast.show('Expense saved');
        onClose();
      }}
    >
      <SelectField label="Category" value={category} onChange={setCategory} options={options.map((c) => ({ value: c, label: c }))} />
      <MoneyField label="Amount" value={amount} onChange={setAmount} error={error} autoFocus={!record} />
      <Field label="Date" type="date" value={date} onChange={setDate} max={farm.today} />
      <Field label="Paid to" value={vendor} onChange={setVendor} />
      <FlockSelect value={flock} onChange={setFlock} optional="Whole farm" />
      <Field label="Note" value={description} onChange={setDescription} />
    </FormSheet>
  );
}

/** Payments on a sale, each removable (with Undo) when entered wrongly. */
function SalePayments({ sale }: { sale: Sale }) {
  const farm = useFarm();
  const payments = farm.records.payments.filter((p) => p.sale_id === sale.id).sort((a, b) => a.date.localeCompare(b.date));
  if (payments.length === 0) return <p className="small muted">No payments recorded yet. Use Record payment on the Owed tab when the customer pays.</p>;
  return (
    <div className="field">
      <span className="field-label">Payments received</span>
      <ul className="mini-list">
        {payments.map((p) => (
          <li key={p.id}>
            <span>{formatDay(p.date)}</span>
            <strong className="num">{formatMoney(p.amount_kobo)}</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void farm.remove('payments', p.id, 'Payment')}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaymentForm({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const balance = saleBalance(sale, farm.records.payments);
  const [amount, setAmount] = useState(koboToInput(balance));
  const [date, setDate] = useState(farm.today);
  const [error, setError] = useState<string>();
  return (
    <FormSheet
      title="Record payment"
      onClose={onClose}
      onSubmit={async () => {
        const kobo = parseNaira(amount);
        if (!kobo) return setError('Enter the amount received.');
        if (kobo > balance) return setError(`The balance on this sale is only ₦${koboToInput(balance)}.`);
        await farm.save('payments', { date, sale_id: sale.id, amount_kobo: kobo });
        toast.show('Payment recorded');
        onClose();
      }}
    >
      <MoneyField label="Amount received" value={amount} onChange={setAmount} error={error} autoFocus />
      <Field label="Date" type="date" value={date} onChange={setDate} max={farm.today} />
    </FormSheet>
  );
}

function CustomerForm({ record, onClose }: { record?: Customer; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const [name, setName] = useState(record?.name ?? '');
  const [phone, setPhone] = useState(record?.phone ?? '');
  const [error, setError] = useState<string>();
  return (
    <FormSheet
      title={record ? 'Edit customer' : 'Add customer'}
      onClose={onClose}
      extraAction={record ? (
        <button type="button" className="btn btn-danger" onClick={() => { void farm.remove('customers', record.id, 'Customer'); onClose(); }}>Delete</button>
      ) : undefined}
      onSubmit={async () => {
        if (!name.trim()) return setError('Enter the customer’s name.');
        await farm.save('customers', { id: record?.id, name: name.trim(), phone: phone.trim() || null });
        toast.show('Customer saved');
        onClose();
      }}
    >
      <Field label="Name" value={name} onChange={setName} error={error} autoFocus />
      <Field label="Phone" type="tel" value={phone} onChange={setPhone} placeholder="0803 000 0000" hint="Used to send receipts on WhatsApp." />
      {record && <p className="small muted">Deleting a customer keeps their sales, which then show as walk-in.</p>}
    </FormSheet>
  );
}

function ScheduleForm({ record, onClose }: { record?: ScheduleItem; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const [name, setName] = useState(record?.name ?? '');
  const [product, setProduct] = useState(record?.product ?? '');
  const [age, setAge] = useState(record ? String(record.age_days) : '');
  const [errors, setErrors] = useState<Errors>({});
  return (
    <FormSheet
      title={record ? 'Edit schedule item' : 'Add to schedule'}
      onClose={onClose}
      onSubmit={async () => {
        const e: Errors = {};
        const days = toCount(age);
        if (!name.trim()) e.name = 'Enter a name.';
        if (days === null) e.age = 'Enter the bird age in whole days.';
        setErrors(e);
        if (Object.keys(e).length) return;
        await farm.save('schedule_items', { id: record?.id, name: name.trim(), product: product.trim(), age_days: days as number });
        toast.show('Schedule updated');
        onClose();
      }}
    >
      <Field label="Name" value={name} onChange={setName} error={errors.name} placeholder="Newcastle booster" autoFocus={!record} />
      <Field label="Product" value={product} onChange={setProduct} placeholder="NDV Lasota" />
      <CountField label="Bird age when due (days)" value={age} onChange={setAge} error={errors.age} />
    </FormSheet>
  );
}
