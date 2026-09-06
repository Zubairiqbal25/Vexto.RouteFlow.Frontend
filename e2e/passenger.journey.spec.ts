import { expect, test } from '@playwright/test';
import { accounts, signIn } from './fixtures';

/**
 * The passenger half of the pilot: see the next bus, see it moving, and say you are not travelling.
 *
 * Runs after the driver has started the trip, so there is a live position to show.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await signIn(page, accounts.passenger);
});

test('shows the next trip on the home screen', async ({ page }) => {
  await page.goto('/home');

  await expect(page.getByRole('heading', { name: 'Your next trip' })).toBeVisible();
  await expect(page.getByText('Pickup')).toBeVisible();
  await expect(page.getByText('Scheduled')).toBeVisible();
});

test('shows the bus as live once the driver is publishing', async ({ page }) => {
  await page.goto('/home');

  // The position arrives over SignalR after the initial fetch; give it room on a cold connection.
  await expect(page.getByText(/^Live ·/u)).toBeVisible({ timeout: 30_000 });

  // A passenger is never shown raw coordinates.
  await expect(page.getByText(/25\.\d{3}/u)).toBeHidden();
});

test('declares an absence and can undo it', async ({ page }) => {
  await page.goto('/absences');

  await page.getByRole('button', { name: 'Declare absence' }).click();
  await expect(page.getByText('Absence saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).first().click();
  await page.getByRole('button', { name: 'Yes, I am travelling' }).click();

  await expect(page.getByText('Absence cancelled.')).toBeVisible();
});
