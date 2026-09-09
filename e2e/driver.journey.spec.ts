import { expect, test } from '@playwright/test';
import { accounts, mockGps, openTodaysTrip, routeCode, signIn } from './fixtures';

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

  // The driver home greets by name; "Today's trips" is the document title, never a heading on the
  // page. Asserting the greeting proves the same thing — the list rendered for a signed-in driver.
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/u })).toBeVisible();
  // The screen leads with one trip and one action, which is the whole point of it: a driver asks
  // "what do I drive next", not "show me a list".
  //
  // Which lead appears depends on the driver's actual state, and both are correct. Mid-route they
  // get "Trip in progress" and a way back into it — offering them a different trip to *start* while
  // they are driving one would be the wrong answer. Otherwise they get the next-trip hero and its
  // START TRIP button. A pilot database keeps trips an earlier run left running, so the suite meets
  // both.
  const nextTrip = page.getByRole('region', { name: 'Next trip' });
  const inProgress = page.getByRole('link').filter({ hasText: 'Trip in progress' });

  await expect(nextTrip.or(inProgress).first()).toBeVisible();

  if (await nextTrip.count()) {
    await expect(nextTrip.getByRole('link', { name: 'START TRIP' })).toBeVisible();
  }

  // And this run's own trip is on the screen — as the hero when it is the soonest, otherwise in the
  // list beneath it. A pilot database accumulates: the seeded driver has several trips today, and
  // insisting this run's is the *first* of them would be asserting a coincidence.
  await expect(page.getByRole('main')).toContainText(routeCode);
});

test('starts the trip and begins sharing location', async ({ page }) => {
  await openTodaysTrip(page);

  // Waited for before anything is asked about the buttons. `isVisible()` does not wait, so on a
  // page that is still loading it reports "no start button" and the test would go on to expect
  // tracking from a trip nobody had started.
  const started = page.getByText('Started', { exact: true });
  const start = page.getByRole('button', { name: 'START TRIP' });

  await expect(start.or(started).first()).toBeVisible();

  if (await start.isVisible()) {
    await start.click();
  }

  // Re-run the suite and the trip is already under way, so the state is asserted rather than the
  // toast that only a first run produces.
  await expect(started.first()).toBeVisible();

  // The status line is the driver's only signal that the operator can see them.
  await expect(page.getByText('Location active')).toBeVisible({ timeout: 20_000 });
});

/**
 * The next stop, and the way to it.
 *
 * Asserted before boarding, because boarding the last person at a stop is exactly what makes the
 * panel move on — so this is the only point in the run where the first stop is still the answer.
 */
test('shows the next stop with a navigation link', async ({ page }) => {
  await openTodaysTrip(page);

  await expect(page.getByText('Next stop')).toBeVisible();
  await expect(page.getByText(/passenger.? waiting/u)).toBeVisible();

  // An external maps link, not an embedded navigator. Checked as an href rather than followed:
  // clicking it would leave the app for a third-party site.
  const navigate = page.getByRole('link', { name: 'Navigate to stop' });
  await expect(navigate).toBeVisible();
  await expect(navigate).toHaveAttribute('href', /google\.com\/maps\/dir/u);
});

test('boards the first passenger', async ({ page }) => {
  await openTodaysTrip(page);

  const boarded = page.getByRole('button', { name: 'Boarded' }).first();
  await expect(boarded).toBeVisible();
  await boarded.click();

  // The row updates in place rather than the list reloading.
  await expect(page.getByText('Boarded', { exact: true }).first()).toBeVisible();
});
