import { expect, test } from '@playwright/test';
import { accounts, isoDate, signIn } from './fixtures';

/**
 * The operator sees what the driver did.
 *
 * This is the assertion that matters most in the whole suite: three separate applications, one
 * backend, and the same trip. Runs last, after the driver has started the trip and boarded someone.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await signIn(page, accounts.operator);
});

test('shows the running vehicle on Live Fleet', async ({ page }) => {
  await page.goto('/live-fleet');

  await expect(page.getByRole('heading', { name: 'Live Fleet' })).toBeVisible();
  await expect(page.getByText('Connected')).toBeVisible({ timeout: 20_000 });

  // The side panel lists the bus whether or not a map key is configured for this environment.
  await expect(page.getByRole('heading', { name: 'On the road' })).toBeVisible();
  await expect(page.getByText('Live').first()).toBeVisible({ timeout: 30_000 });
});

test('shows the trip as started, with attendance recorded', async ({ page }) => {
  await page.goto('/trips');
  await page.getByLabel('Service date').fill(isoDate(0));

  const started = page.getByRole('row').filter({ hasText: 'Started' }).first();
  await expect(started).toBeVisible({ timeout: 20_000 });
  await started.click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}/u);
  await expect(page.getByText('Boarded').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Manifest' })).toBeVisible();
});

test('the dashboard reflects the running trip', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page.getByRole('heading', { name: 'Trips in progress' })).toBeVisible();
  await expect(page.getByText('Nothing running yet')).toBeHidden();
});
