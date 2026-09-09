import { expect, test } from '@playwright/test';
import {
  accounts,
  demoDriverName,
  isoDate,
  publishDriverPosition,
  routeCode,
  signIn,
  useTableView,
} from './fixtures';

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
  // As in the passenger journey: the driver's browser is closed by now, so a current position has
  // to come over the driver's own API for "on the road" to mean anything.
  await publishDriverPosition();

  await page.goto('/live-fleet');

  await expect(page.getByRole('heading', { name: 'Live Fleet' })).toBeVisible();
  await expect(page.getByText('Connected')).toBeVisible({ timeout: 20_000 });

  // The side panel lists the bus whether or not a map key is configured for this environment. The
  // list is grouped by tracking state, and each bus states its own — a coloured pin is not a status.
  await expect(page.locator('aside[aria-label="Active fleet"] button[data-trip]').first())
    .toBeVisible({ timeout: 30_000 });
  await expect(page.locator('vx-status-badge').filter({ hasText: 'Live' }).first())
    .toBeVisible({ timeout: 30_000 });
});

test('shows the trip as started, with attendance recorded', async ({ page }) => {
  await openThisRunsTrip(page);

  await expect(page.getByText('Boarded').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Passenger manifest' })).toBeVisible();

  // A running trip leads with the map, and the attendance bar states the split in words as well as
  // in colour — which is the whole reason the bar carries a legend.
  await expect(page.locator('vx-map')).toBeVisible();
  await expect(page.locator('vx-progress-bar').getByText(/\d+ \/ \d+ boarded/u)).toBeVisible();
});

test('the activity timeline records what the driver did, in order', async ({ page }) => {
  await openThisRunsTrip(page);

  const activity = page.locator('vx-section-card', { hasText: 'Activity' });
  await expect(activity).toBeVisible();

  // Three applications, one backend, one timeline. The driver started the trip and boarded somebody
  // from a tablet; the operator reads both here, in the order they happened, with the driver named.
  await expect(activity.getByText('Trip generated')).toBeVisible();
  await expect(activity.getByText('Trip started')).toBeVisible();
  await expect(activity.getByText(/boarded/u).first()).toBeVisible();

  // The crew substitution the setup spec made is on it too, and that is the half of the timeline
  // that could not exist at all before the read model: nothing anywhere recorded when a driver or a
  // bus was swapped, so no panel could show it without inventing a timestamp.
  //
  // Only the driver, because only the driver changed — the setup spec re-submitted the same vehicle.
  // The recorder writes an event per thing that actually moved, so a "Vehicle changed" line here
  // would be a record of something that did not happen.
  await expect(activity.getByText('Driver changed')).toBeVisible();
  await expect(activity.getByText('Vehicle changed')).toBeHidden();

  // And the driver is named on what they did from the tablet.
  await expect(activity.getByText(demoDriverName).first()).toBeVisible();
});

test('the manifest carries attendance and access state, and no money', async ({ page }) => {
  await openThisRunsTrip(page);

  const manifest = page.locator('vexto-trip-manifest');

  await expect(manifest.getByText('Boarded').first()).toBeVisible();

  // The operational surface stays operational: a dispatcher who needs the figures opens the
  // billing screens, where reading them is what the screen is for.
  await expect(manifest).not.toContainText('AED');
  await expect(manifest).not.toContainText(/invoice/iu);
});

test('the dashboard reflects the running trip', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page.getByRole('heading', { name: 'Running now' })).toBeVisible();

  // The empty state for that panel must not be on screen: a trip is under way, and this is the
  // assertion that the dashboard agrees with the fleet screen and the trip page about that.
  await expect(page.getByText('No buses are currently reporting live location')).toBeHidden();
});

/**
 * Opens the trip this run created, the one the driver has just been driving.
 *
 * Searched for by route code rather than taken off the first page: a pilot database keeps every
 * earlier trip, several of them still under way, so `.first()` picks whichever happens to sort
 * earliest and the assertions then describe somebody else's morning.
 */
async function openThisRunsTrip(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/trips');
  await useTableView(page);
  await page.getByLabel('Service date').fill(isoDate(0));

  // The search box is debounced, so the row count is what says the filter has actually applied.
  await page.getByLabel('Search trips').fill(routeCode);
  await expect(page.locator('tbody tr')).toHaveCount(1);

  await page
    .locator('tbody')
    .getByRole('row')
    .filter({ hasText: routeCode })
    .first()
    .click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}/u);
}
