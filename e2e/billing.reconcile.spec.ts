import { expect, test } from '@playwright/test';
import { accounts, signIn } from './fixtures';

/**
 * The operator sees the money arrive, and sends some of it back.
 *
 * Runs last, because a refund needs a payment that has actually succeeded — which is the previous
 * project's job.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await signIn(page, accounts.operator);
});

test('sees the payment in reconciliation', async ({ page }) => {
  await page.goto('/billing/payments');

  await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible();

  const row = page.locator('tbody tr').filter({ hasText: 'Succeeded' }).first();
  await expect(row).toBeVisible();

  // The gateway fee and net are blank because the provider has not reported them. That is the
  // honest state, and asserting it is what stops somebody "helpfully" filling it with a formula.
  await expect(row.locator('td').nth(4)).toHaveText('—');
  await expect(row.locator('td').nth(5)).toHaveText('—');
});

test('issues a partial refund', async ({ page }) => {
  await page.goto('/billing/payments');

  const row = page.locator('tbody tr').filter({ hasText: 'Succeeded' }).first();
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Payment actions' }).click();
  await page.getByRole('menuitem', { name: 'Refund' }).click();

  await page.getByLabel('Refund amount').fill('20');
  await page.getByLabel('Refund reason').fill('Two journeys missed.');
  await page.getByRole('button', { name: 'Refund', exact: true }).last().click();

  await expect(page.getByText('Refund sent to the passenger.')).toBeVisible();
  await expect(
    page.locator('tbody tr').filter({ hasText: 'Partially refunded' }).first(),
  ).toBeVisible();
});

/**
 * The invariant worth proving from outside: a refund can never exceed what is left. The server
 * refuses it with a message naming the remaining balance, and the screen shows that message rather
 * than a generic one.
 */
test('refuses a refund larger than what is left', async ({ page }) => {
  await page.goto('/billing/payments');

  const row = page.locator('tbody tr').filter({ hasText: 'Partially refunded' }).first();
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Payment actions' }).click();
  await page.getByRole('menuitem', { name: 'Refund' }).click();

  await page.getByLabel('Refund amount').fill('9999');
  await page.getByRole('button', { name: 'Refund', exact: true }).last().click();

  await expect(page.getByText(/still refundable/u)).toBeVisible();
});
