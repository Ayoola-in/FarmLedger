import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PAGES = ['/app', '/app/flocks', '/app/eggs', '/app/feed', '/app/health', '/app/finance', '/app/reports', '/app/settings'];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function openDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo farm' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })).toBeVisible();
}

async function newFarm(page: Page, name = 'Test Farm') {
  await page.goto('/onboarding');
  await page.getByLabel('Farm name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Add your first flock' })).toBeVisible();
}

async function addFlock(page: Page, name: string, birds: string, cost: string) {
  await page.goto('/app/flocks');
  await page.getByRole('button', { name: 'Add flock' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Flock name').fill(name);
  await dialog.getByLabel('Birds received').fill(birds);
  await dialog.getByLabel('Total purchase cost').fill(cost);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

test('demo opens and every screen renders without errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('landing and every screen pass accessibility checks in both themes', async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  const landing = await new AxeBuilder({ page }).analyze();
  expect(landing.violations.map((v) => `landing: ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  await openDemo(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => localStorage.setItem('farmledger-theme', t), theme);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${theme} ${path}: ${v.id}: ${v.nodes[0]?.target} ${v.nodes[0]?.any[0]?.message ?? ''}`)).toEqual([]);
    }
  }
});

test('no screen scrolls sideways', async ({ page }) => {
  await openDemo(page);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('new farm: costs, sales and credit add up correctly, and survive a reload', async ({ page }) => {
  await newFarm(page);
  await addFlock(page, 'Batch One', '100', '200,000');

  // Bird sale: the full amount is revenue and the bird count falls.
  await page.goto('/app/finance');
  await page.getByRole('button', { name: 'Record sale' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('What was sold').selectOption('birds');
  await dialog.getByLabel('Flock').selectOption({ label: 'Batch One' });
  await dialog.getByLabel('Birds', { exact: true }).fill('10');
  await dialog.getByLabel('Total charged').fill('50000');
  await dialog.getByLabel('Payment').selectOption('part');
  await dialog.getByLabel('Amount paid now').fill('20000');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  const tile = (label: string) => page.locator('.tile', { hasText: label });
  await expect(tile('Revenue this month')).toContainText('50,000');
  await expect(tile('Expenses this month')).toContainText('200,000');
  await expect(tile('Profit this month')).toContainText('150,000');
  await expect(tile('Owed by customers')).toContainText('30,000');

  // Can't sell more birds than remain.
  await page.getByRole('button', { name: 'Record sale' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('What was sold').selectOption('birds');
  await dialog.getByLabel('Flock').selectOption({ label: 'Batch One' });
  await dialog.getByLabel('Birds', { exact: true }).fill('91');
  await dialog.getByLabel('Total charged').fill('1000');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Only 90 birds are alive')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  // A credit payment clears the balance.
  await page.getByRole('tab', { name: /Owed/ }).click();
  await page.getByRole('button', { name: 'Record payment' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(tile('Owed by customers')).toContainText('₦0');

  // Editing the flock's cost updates its one linked expense.
  await page.goto('/app/flocks');
  await page.getByRole('link', { name: /Batch One/ }).click();
  await expect(page.locator('.tile', { hasText: 'Birds alive' })).toContainText('90');
  await page.getByRole('button', { name: 'Edit' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Total purchase cost')).toHaveValue('200000');
  await dialog.getByLabel('Total purchase cost').fill('300000');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await page.goto('/app/finance');
  await expect(tile('Expenses this month')).toContainText('300,000');
  await expect(tile('Profit this month')).toContainText('250,000');
});

test('impossible egg counts are blocked, and valid ones update Today', async ({ page }) => {
  await newFarm(page);
  await addFlock(page, 'Batch One', '100', '');
  await page.goto('/app');
  await page.getByRole('button', { name: 'Log eggs' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Eggs collected').fill('5');
  await dialog.getByLabel('Broken').fill('9');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText('can’t be more than');
  await dialog.getByLabel('Broken').fill('1');
  await dialog.getByLabel('Eggs collected').fill('64');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.tile', { hasText: 'Eggs today' })).toContainText('64');
  await expect(page.locator('.tile', { hasText: 'Eggs today' })).toContainText('2 crates, 4 eggs');
});

test('typed text can never run as code', async ({ page }) => {
  let ran = false;
  await page.exposeFunction('xssFired', () => { ran = true; });
  const payload = '<img src=x onerror="window.xssFired()"><script>window.xssFired()</script>';
  await newFarm(page, payload);
  await addFlock(page, payload, '10', '');
  await page.goto('/app/flocks');
  await expect(page.getByRole('main').getByText(payload).first()).toBeVisible();
  await page.goto('/app');
  await page.waitForTimeout(300);
  expect(ran).toBe(false);
});

test('delete offers undo, and undo restores the record', async ({ page }) => {
  await newFarm(page);
  await addFlock(page, 'Batch One', '100', '');
  await page.goto('/app/eggs');
  await page.getByRole('button', { name: 'Log eggs' }).click();
  await page.getByRole('dialog').getByLabel('Eggs collected').fill('42');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  const row = page.getByRole('row', { name: /Batch One/ });
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: /Delete eggs/ }).click();
  await expect(row).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row).toBeVisible();
});

test('the whole app keeps working offline, including saving and reloading', async ({ page, context }) => {
  await openDemo(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        setTimeout(resolve, 3000);
      });
    }
  });
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible();
  await context.setOffline(true);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
  }
  await page.goto('/app/eggs');
  await page.getByRole('button', { name: 'Log eggs' }).click();
  await page.getByRole('dialog').getByLabel('Eggs collected').fill('123');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(page.getByRole('cell', { name: '123', exact: true }).first()).toBeVisible();
  await context.setOffline(false);
});

test('a backup round-trips, and an old-app backup imports with corrected figures', async ({ page }) => {
  await newFarm(page);
  await addFlock(page, 'Kept Flock', '50', '10000');
  await page.goto('/app/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(backup.format).toBe('farmledger-backup');
  expect(backup.records.flocks).toHaveLength(1);
  expect(backup.records.expenses[0].amount_kobo).toBe(1_000_000);

  const legacy = join(tmpdir(), `legacy-${Date.now()}-${Math.random()}.json`);
  writeFileSync(legacy, JSON.stringify({
    flocks: [{ id: 1, name: 'Old Flock', breed: 'Isa', purchaseDate: '2026-01-01', quantityPurchased: 90, cost: 90000, status: 'Active', birdsAlive: 90 }],
    sales: [{ id: 1, date: '2026-03-01', category: 'Bird Sales', product: 'Hens', quantity: 10, total: 10000, customer: 'Ada', flockId: 1 }],
    expenses: [], daily_records: [], mortality: [], feed_inventory: [], vaccines: [],
  }));
  await page.getByLabel('Backup file').setInputFiles(legacy);
  await expect(page.getByRole('dialog')).toContainText('old FarmLedger app');
  await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText('Import complete')).toBeVisible();
  await page.goto('/app/reports');
  await page.getByRole('button', { name: 'This year' }).click();
  // ₦20,000 charged for the birds. ₦100,000 old flock + ₦10,000 kept flock.
  await expect(page.locator('.tile', { hasText: /^Revenue/ })).toContainText('20,000');
  await expect(page.locator('.tile', { hasText: /^Expenses/ })).toContainText('110,000');
});

test('a damaged backup is refused and changes nothing', async ({ page }) => {
  await newFarm(page);
  await page.goto('/app/settings');
  const bad = join(tmpdir(), `bad-${Date.now()}-${Math.random()}.json`);
  writeFileSync(bad, '{not json');
  await page.getByLabel('Backup file').setInputFiles(bad);
  await expect(page.getByText('isn’t a valid backup')).toBeVisible();
});

test('a cleared or future date is refused instead of breaking the app', async ({ page }) => {
  const errors = watchErrors(page);
  await newFarm(page);
  await addFlock(page, 'Batch One', '100', '');
  await page.goto('/app/eggs');
  await page.getByRole('button', { name: 'Log eggs' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Eggs collected').fill('10');
  await dialog.getByLabel('Date').fill('');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText('choose a date');
  await dialog.getByLabel('Date').fill('2099-01-01');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText('future');
  expect(errors).toEqual([]);
});

test('a bird sale asks for a flock instead of implying one', async ({ page }) => {
  await newFarm(page);
  await addFlock(page, 'Batch One', '100', '');
  await page.goto('/app/finance');
  await page.getByRole('button', { name: 'Record sale' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('What was sold').selectOption('birds');
  await expect(dialog.getByLabel('Flock')).toHaveValue('');
  await expect(dialog.getByLabel('Flock').locator('option:checked')).toHaveText('Choose a flock');
});

test('a worker sees correct bird counts but no money or management tools', async ({ page }) => {
  await newFarm(page);
  await addFlock(page, 'Batch One', '100', '50000');
  // Becomes a worker whose phone has received a sale of 10 birds from the server.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('farmledger');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['meta', 'flocks', 'expenses', 'bird_sales'], 'readwrite');
      const meta = tx.objectStore('meta');
      const get = meta.get('workspace');
      get.onsuccess = () => {
        const workspace = get.result.value;
        workspace.member.role = 'worker';
        meta.put({ key: 'workspace', value: workspace });
        const flocks = tx.objectStore('flocks').getAll();
        flocks.onsuccess = () => {
          tx.objectStore('bird_sales').put({
            id: crypto.randomUUID(), farm_id: workspace.farm.id, date: flocks.result[0].acquired_on, flock_id: flocks.result[0].id,
            quantity: 10, created_by: null, created_at: '', updated_at: '', deleted_at: null,
          });
          tx.objectStore('expenses').clear();
        };
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));

  await page.goto('/app');
  await expect(page.locator('.tile', { hasText: 'Birds alive' })).toContainText('90');
  await expect(page.getByRole('main')).not.toContainText('₦');
  await expect(page.getByRole('link', { name: 'Finance' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);

  for (const blocked of ['/app/finance', '/app/reports']) {
    await page.goto(blocked);
    await expect(page).toHaveURL(/\/app$/);
  }

  await page.goto('/app/flocks');
  await expect(page.getByRole('button', { name: 'Add flock' })).toHaveCount(0);
  await page.getByRole('link', { name: /Batch One/ }).click();
  await expect(page.getByRole('heading', { name: 'Batch One' })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('₦');
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByText('10 birds sold')).toBeVisible();

  await page.getByRole('button', { name: 'Treatment' }).click();
  await expect(page.getByRole('dialog').getByLabel('Cost')).toHaveCount(0);
});

test('screenshots for review', async ({ page }, info) => {
  test.setTimeout(240_000);
  const shot = (name: string) => page.screenshot({ path: `e2e-shots/${info.project.name}-${name}.png`, fullPage: true });
  await page.goto('/');
  await page.waitForTimeout(400);
  await shot('landing');
  await openDemo(page);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForTimeout(250);
    await shot(path.replace(/\W/g, '_'));
  }
  await page.evaluate(() => localStorage.setItem('farmledger-theme', 'dark'));
  await page.goto('/app/reports');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.getByRole('button', { name: '90 days' }).click();
  await page.waitForTimeout(250);
  await shot('dark-reports');
  await page.goto('/app');
  await page.waitForTimeout(250);
  await shot('dark-today');
  await page.getByRole('button', { name: 'Log eggs' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e-shots/${info.project.name}-dark-form.png` });
});
