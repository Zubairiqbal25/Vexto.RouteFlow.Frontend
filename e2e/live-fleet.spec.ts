import { expect, test } from '@playwright/test';
import { accounts, publishDriverPosition, signIn } from './fixtures';

/**
 * The dispatcher's live screen, and the one interaction that makes it a screen rather than a list:
 * choosing a bus in the list marks it, names it, and offers the way into its trip.
 *
 * A position is published over the API first, for the same reason the passenger journey does it —
 * by the time this runs the driver's browser is closed, nothing is reporting, and a fix from four
 * minutes ago is correctly *not* live. Nothing about the product is stubbed: it is the same
 * endpoint, the same authentication and the same payload the driver app sends.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await publishDriverPosition();
  await signIn(page, accounts.operator);
  await page.goto('/live-fleet');
});

test('lists the buses that are reporting, in words as well as colour', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Live Fleet' })).toBeVisible();
  await expect(page.getByLabel('Search the active fleet')).toBeVisible();

  // At least one trip is under way — the driver journey started this run's — and its tracking state
  // is written out. A coloured pin on a map is not a status somebody can act on.
  await expect(
    page.locator('vx-status-badge').filter({ hasText: /Live|Stale|No signal/u }).first(),
  ).toBeVisible();
});

/**
 * Selecting a card marks exactly one, which is what keeps the map and the list agreeing.
 *
 * `aria-current` is the assertion rather than a background colour, because it is the part of the
 * selection a screen reader can also perceive — and because a colour assertion would be testing the
 * design tokens rather than the behaviour.
 */
test('selecting a bus marks it and offers its trip', async ({ page }) => {
  const cards = page.locator('aside[aria-label="Active fleet"] button[data-trip]');

  await expect(cards.first()).toBeVisible();
  await cards.first().click();

  await expect(page.locator('button[data-trip][aria-current="true"]')).toHaveCount(1);

  // The panel under the list follows the selection: it names the chosen bus and gives one way in.
  await expect(page.getByText('Selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open trip' })).toBeVisible();
});

test('opens the selected trip', async ({ page }) => {
  const cards = page.locator('aside[aria-label="Active fleet"] button[data-trip]');

  await expect(cards.first()).toBeVisible();
  await cards.first().click();
  await page.getByRole('button', { name: 'Open trip' }).click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}/u);

  // A running trip leads with the map, because the only question about a moving bus is where it is.
  await expect(page.locator('vx-map')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Passenger manifest' })).toBeVisible();
});

test('says so plainly when nothing is reporting', async ({ page }) => {
  // Filtering to a term nothing matches is the reachable version of "no buses": the empty state for
  // a filtered list and for an empty fleet are deliberately different sentences, because only one
  // of them is fixed by clearing a filter.
  await page.getByLabel('Search the active fleet').fill('no-such-bus-zzz');

  await expect(page.getByText('Nothing matches')).toBeVisible();
});
