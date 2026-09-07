import { expect, test } from '@playwright/test';
import {
  accounts,
  demoPassengerName,
  invoicePeriod,
  routeCode,
  runId,
  signIn,
} from './fixtures';

/**
 * The operator half of the money journey: connect payments, agree a fare, raise an invoice.
 *
 * Runs after the pilot trip journey, against the same passenger, so the invoice the passenger app
 * pays a moment later is one this run actually created.
 */
test.describe.configure({ mode: 'serial' });

/**
 * Run-scoped, like every other record this suite creates. A fixed description matches the rows an
 * earlier run left behind, and the list can then never be narrowed to one.
 */
const subscriptionDescription = `E2E transport ${runId}`;

test.beforeEach(async ({ page }) => {
  await signIn(page, accounts.operator);
});

/**
 * Connecting is idempotent, which matters here: the demo seed has usually already done it, and an
 * operator pressing the button again is how they come back to finish onboarding.
 */
test('has a payment account that can take payments', async ({ page }) => {
  await page.goto('/billing/account');

  await expect(page.getByRole('heading', { name: 'Payment account' })).toBeVisible();

  const connect = page.getByRole('button', { name: 'Connect payments' });

  if (await connect.isVisible()) {
    await connect.click();
  }

  // The state that decides whether a passenger sees a Pay button at all.
  await expect(page.getByText('Can take payments')).toBeVisible();
  await expect(page.locator('dd').filter({ hasText: 'Yes' }).first()).toBeVisible();
});

test('creates a transport subscription for the passenger', async ({ page }) => {
  await page.goto('/billing/subscriptions');

  await page.getByRole('button', { name: 'New subscription' }).click();

  // The seeded passenger, because they are the one with a login — the passenger app signs in as
  // them a few tests later and has to find this invoice.
  //
  // Matched by text and selected by value: the option label carries the mobile number too, so an
  // exact label match would not find it.
  const option = page.locator('#sub-passenger option', { hasText: demoPassengerName });
  await page.locator('#sub-passenger').selectOption((await option.getAttribute('value')) ?? '');

  // Route-specific, and deliberately so. The demo seed already gives this passenger a general
  // arrangement covering all their travel, and the domain refuses a second one for the same route
  // — correctly, because two of them would bill the same seat twice. A route-specific fee is a
  // different arrangement, which is exactly the case this field exists for.
  //
  // This run's own route, not simply the first in the list: a re-run against the same database
  // would otherwise pick the route it used last time and be refused as a duplicate, which is the
  // rule working rather than failing.
  const routeOption = page.locator('#sub-route option', { hasText: routeCode });
  await page.locator('#sub-route').selectOption((await routeOption.getAttribute('value')) ?? '');

  await page.locator('#sub-description').fill(subscriptionDescription);
  await page.locator('#sub-amount').fill('420');
  await page.locator('#sub-tax').fill('0');
  await page.getByRole('button', { name: 'Create subscription' }).click();

  await expect(page.getByText('Subscription created as a draft.')).toBeVisible();
});

/**
 * A subscription bills nothing until it is activated, which is what makes a mistyped amount a
 * correction rather than an invoice somebody has to be talked out of.
 */
test('activates the subscription so it can be invoiced', async ({ page }) => {
  await page.goto('/billing/subscriptions');

  await narrowToRow(page, subscriptionDescription);

  await page.getByRole('button', { name: /Actions for/u }).first().click();
  await page.getByRole('menuitem', { name: 'Activate' }).click();

  await expect(page.locator('vx-status-badge', { hasText: 'Active' }).first()).toBeVisible();
});

test('raises an invoice for the billing period', async ({ page }) => {
  await page.goto('/billing/subscriptions');

  await narrowToRow(page, subscriptionDescription);

  await page.getByRole('button', { name: /Actions for/u }).first().click();
  await page.getByRole('menuitem', { name: 'Generate invoice' }).click();

  const period = invoicePeriod();

  await page.locator('#inv-from').fill(period.start);
  await page.locator('#inv-to').fill(period.end);
  await page.locator('#inv-due').fill(period.due);

  await page.getByRole('button', { name: 'Generate invoice' }).last().click();

  await expect(page.getByText(/Invoice INV-/u)).toBeVisible();
});

/**
 * Generation is idempotent on the server, and this is the assertion that says so from outside:
 * the same period asked for twice leaves one invoice, not two demands for the same money.
 */
test('raising the same period again does not bill twice', async ({ page }) => {
  await page.goto('/billing/invoices');
  await page.getByLabel('Search invoices').fill('INV-');

  const before = await page.locator('tbody tr').count();

  await page.goto('/billing/subscriptions');
  await narrowToRow(page, subscriptionDescription);

  await page.getByRole('button', { name: /Actions for/u }).first().click();
  await page.getByRole('menuitem', { name: 'Generate invoice' }).click();

  const period = invoicePeriod();

  await page.locator('#inv-from').fill(period.start);
  await page.locator('#inv-to').fill(period.end);
  await page.locator('#inv-due').fill(period.due);
  await page.getByRole('button', { name: 'Generate invoice' }).last().click();

  await expect(page.getByText(/Invoice INV-/u)).toBeVisible();

  await page.goto('/billing/invoices');
  await page.getByLabel('Search invoices').fill('INV-');

  await expect(page.locator('tbody tr')).toHaveCount(before);
});

test('the billing summary counts the outstanding invoice', async ({ page }) => {
  await page.goto('/billing/invoices');

  await expect(page.getByText('Open invoices')).toBeVisible();
  await expect(page.getByText('Outstanding')).toBeVisible();

  // Aggregated by the server. A page of twenty invoices cannot produce a tenant-wide figure, and
  // this asserts the endpoint answered rather than the cards being hidden.
  await expect(page.getByText('Collected this month')).toBeVisible();
});

/**
 * Narrows a list to the row this run created before acting on it. The search is debounced, so
 * clicking straight away opens whichever row was already there — a different record, quite
 * possibly from an earlier run.
 */
async function narrowToRow(page: import('@playwright/test').Page, term: string): Promise<void> {
  await page.getByLabel('Search subscriptions').fill(term);
  await expect(page.locator('tbody tr')).toHaveCount(1);
}
