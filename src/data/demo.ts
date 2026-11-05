// Realistic sample data for the demo workspace. Clearly labelled in the UI and
// never written to a real farm's records.
import { addDays, today } from '../domain/dates';
import { STARTER_SCHEDULE } from '../domain/health';
import type { Base, FarmRecords, Flock } from '../domain/types';

export function buildDemoRecords(farmId: string, now: Date): FarmRecords {
  // Fixed seed, so the demo always tells the same story.
  let state = 42;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const between = (min: number, max: number) => Math.round(min + random() * (max - min));
  const end = today('Africa/Lagos', now);
  const stampedAt = now.toISOString();
  const base = (): Base => ({ id: crypto.randomUUID(), farm_id: farmId, created_by: null, created_at: stampedAt, updated_at: stampedAt, deleted_at: null });

  const records: FarmRecords = {
    flocks: [], egg_logs: [], mortality_logs: [], feed_purchases: [], feed_usage: [], health_events: [],
    schedule_items: [], customers: [], sales: [], payments: [], expenses: [], bird_sales: [],
  };

  const flock = (name: string, house: string, ageOnArrival: number, daysAgo: number, quantity: number, nairaEach: number): Flock => {
    const row: Flock = {
      ...base(), name, breed: 'Isa Brown', source: 'Zartech Hatchery', house, acquired_on: addDays(end, -daysAgo),
      age_at_acquisition_days: ageOnArrival, quantity, status: 'active', closed_on: null, notes: null,
    };
    records.flocks.push(row);
    records.expenses.push({
      ...base(), date: row.acquired_on, category: 'Birds', amount_kobo: quantity * nairaEach * 100, vendor: row.source,
      description: `Purchase of ${name}`, flock_id: row.id, source_table: 'flock', source_id: row.id,
    });
    return row;
  };

  const layers = flock('Batch A', 'House 1', 112, 150, 800, 4200);
  const pullets = flock('Batch B', 'House 2', 56, 30, 500, 3100);

  records.schedule_items = STARTER_SCHEDULE.map((item) => ({ ...base(), ...item }));

  // Pullets reach 112 days in about a month, so their pre-lay dose is upcoming.
  for (const item of records.schedule_items) {
    if (item.age_days >= layers.age_at_acquisition_days) {
      records.health_events.push({
        ...base(), date: addDays(layers.acquired_on, item.age_days - layers.age_at_acquisition_days), flock_id: layers.id,
        kind: 'vaccine', product: item.product, schedule_item_id: item.id, notes: null,
      });
    }
    if (item.age_days >= pullets.age_at_acquisition_days && item.age_days <= 70) {
      const event = {
        ...base(), date: addDays(pullets.acquired_on, item.age_days - pullets.age_at_acquisition_days), flock_id: pullets.id,
        kind: 'vaccine' as const, product: item.product, schedule_item_id: item.id, notes: null,
      };
      if (event.date <= addDays(end, -6)) {
        records.health_events.push(event);
        records.expenses.push({
          ...base(), date: event.date, category: 'Health', amount_kobo: 1_800_000, vendor: 'Agrovet Ibadan', description: item.product,
          flock_id: pullets.id, source_table: 'health_event', source_id: event.id,
        });
      }
    }
  }

  // Feed: bought in bulk, used daily, with stock running low by today.
  const buyFeed = (daysAgo: number, type: string, kg: number, nairaPerKg: number) => {
    const row = { ...base(), date: addDays(end, -daysAgo), feed_type: type, supplier: 'Livestock Feeds Plc', quantity_kg: kg };
    records.feed_purchases.push(row);
    records.expenses.push({
      ...base(), date: row.date, category: 'Feed', amount_kobo: kg * nairaPerKg * 100, vendor: row.supplier,
      description: `${kg} kg of ${type}`, flock_id: null, source_table: 'feed_purchase', source_id: row.id,
    });
  };
  for (let d = 150; d >= 20; d -= 26) buyFeed(d, 'Layers Mash', 2500, 620);
  buyFeed(30, 'Grower Mash', 1600, 560);

  const customers = ['Mama Tunde Stores', 'Sunrise Bakery', 'Chidi Foods', 'Hajia Provisions'].map((name, i) => ({
    ...base(), name, phone: `+23480300000${i + 1}`,
  }));
  records.customers = customers;

  let alive = layers.quantity;
  for (let d = 90; d >= 0; d--) {
    const date = addDays(end, -d);
    // Rising to a mature peak, with a recent dip for the alerts to catch.
    const peak = 0.72 + 0.16 * Math.min(1, (90 - d) / 60);
    const dip = d <= 2 ? 0.8 : 1;
    const collected = Math.round(alive * peak * dip * (0.97 + random() * 0.06));
    const skipToday = d === 0;
    if (!skipToday) {
      records.egg_logs.push({ ...base(), date, flock_id: layers.id, collected, broken: between(2, 11), dirty: between(4, 16) });
    }
    records.feed_usage.push({ ...base(), date, flock_id: layers.id, feed_type: 'Layers Mash', quantity_kg: Math.round(alive * 0.115) });
    if (d <= 29) records.feed_usage.push({ ...base(), date, flock_id: pullets.id, feed_type: 'Grower Mash', quantity_kg: Math.round(pullets.quantity * 0.085) });
    if (random() < 0.12) {
      const lost = between(1, 2);
      alive -= lost;
      records.mortality_logs.push({ ...base(), date, flock_id: layers.id, quantity: lost, cause: random() < 0.5 ? 'Heat stress' : 'Unknown' });
    }

    // Egg sales about three times a week, with occasional credit.
    if (d % 2 === 0 && d > 0) {
      const crates = between(40, 65);
      const customer = customers[between(0, customers.length - 1)]!;
      const amount = crates * 4800 * 100;
      const sale = { ...base(), date, category: 'eggs' as const, description: `${crates} crates`, quantity: crates, amount_kobo: amount, customer_id: customer.id, flock_id: layers.id };
      records.sales.push(sale);
      if (d > 8 || random() < 0.5) {
        records.payments.push({ ...base(), date, sale_id: sale.id, amount_kobo: amount });
      } else {
        records.payments.push({ ...base(), date, sale_id: sale.id, amount_kobo: Math.round(amount * 0.4) });
      }
    }
    if (d % 7 === 3) {
      records.expenses.push({ ...base(), date, category: 'Labour', amount_kobo: 8_500_000, vendor: 'Farm staff', description: 'Weekly wages', flock_id: null, source_table: null, source_id: null });
    }
    if (d % 30 === 5) {
      records.expenses.push({ ...base(), date, category: 'Utilities', amount_kobo: 6_500_000, vendor: 'Diesel and power', description: 'Generator diesel', flock_id: null, source_table: null, source_id: null });
    }
  }
  return records;
}
