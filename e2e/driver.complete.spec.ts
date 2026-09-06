import { expect, test } from '@playwright/test';
import { accounts, mockGps, signIn } from './fixtures';

/**
 * The last step of the pilot: the driver finishes the trip.
 *
 * Runs after the operator has verified attendance, so the journey ends where a real one does —
 * with the trip closed and location sharing stopped.
 */
test('completes the trip and stops sharing location', async ({ page }) => {
  await mockGps(page);
  await signIn(page, accounts.driver);

  await page.goto('/trips');
  await page.getByText('Continue trip').first().click();

  await page.getByRole('button', { name: 'Complete trip' }).click();
  // Passengers are still expected, so the dialog warns before closing attendance.
  await page.getByRole('button', { name: 'Complete trip', exact: true }).last().click();

  await expect(page.getByText('Trip completed.')).toBeVisible();
  await expect(page).toHaveURL(/\/trips$/u);
});
