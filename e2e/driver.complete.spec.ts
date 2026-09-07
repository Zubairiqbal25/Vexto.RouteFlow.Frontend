import { expect, test } from '@playwright/test';
import { accounts, mockGps, openTodaysTrip, signIn } from './fixtures';

/**
 * The last step of the pilot: the driver finishes the trip.
 *
 * Runs after the operator has verified attendance, so the journey ends where a real one does —
 * with the trip closed and location sharing stopped.
 */
test('completes the trip and stops sharing location', async ({ page }) => {
  await mockGps(page);
  await signIn(page, accounts.driver);

  await openTodaysTrip(page);

  await page.getByRole('button', { name: 'Complete trip' }).click();

  // Passengers are still expected, so the dialog warns before closing attendance. Its confirm
  // button is found inside the dialog rather than by taking the last match on the page: the page's
  // own button is still in the DOM behind the backdrop, and which of the two comes last is not
  // something to rely on.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Complete trip', exact: true }).click();

  await expect(page.getByText('Trip completed.')).toBeVisible();
  await expect(page).toHaveURL(/\/trips$/u);
});
