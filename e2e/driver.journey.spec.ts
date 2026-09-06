import { expect, test } from '@playwright/test';
import { accounts, mockGps, signIn } from './fixtures';

/**
 * The driver half of the pilot: open today's trip, start it, publish a position, board a passenger.
 *
 * Runs after `operator.setup.spec.ts` has generated the trip. The GPS is faked at the browser
 * context, which is the only place it can be — the app asks the real Geolocation API.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await mockGps(page);
  await signIn(page, accounts.driver);
});

test("sees today's trip", async ({ page }) => {
  await page.goto('/trips');

  await expect(page.getByRole('heading', { name: "Today's trips" })).toBeVisible();
  await expect(page.getByText('Open trip').or(page.getByText('Continue trip')).first()).toBeVisible();
});

test('starts the trip and begins sharing location', async ({ page }) => {
  await page.goto('/trips');
  await page.getByText('Open trip').or(page.getByText('Continue trip')).first().click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}/u);

  const start = page.getByRole('button', { name: 'START TRIP' });

  if (await start.isVisible()) {
    await start.click();
    await expect(page.getByText('Trip started.')).toBeVisible();
  }

  // The status line is the driver's only signal that the operator can see them.
  await expect(page.getByText('Location active')).toBeVisible({ timeout: 20_000 });
});

test('boards the first passenger', async ({ page }) => {
  await page.goto('/trips');
  await page.getByText('Continue trip').first().click();

  const boarded = page.getByRole('button', { name: 'Boarded' }).first();
  await expect(boarded).toBeVisible();
  await boarded.click();

  // The row updates in place rather than the list reloading.
  await expect(page.getByText('Boarded', { exact: true }).first()).toBeVisible();
});
