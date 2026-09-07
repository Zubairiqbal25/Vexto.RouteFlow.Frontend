import { expect, test } from '@playwright/test';
import { accounts, publishDriverPosition, signIn } from './fixtures';

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
  // Scoped to the definition list. 'Scheduled' is also a trip status, so the bare text matches the
  // label and the badge and fails on strict mode the moment a trip has not started yet.
  const details = page.getByRole('term');
  await expect(details.filter({ hasText: 'Pickup' })).toBeVisible();
  await expect(details.filter({ hasText: 'Scheduled' })).toBeVisible();
});

test('shows the bus as live once the driver is publishing', async ({ page }) => {
  // A position from *now*. The driver project's browser closed when it finished, so the newest fix
  // on this trip is minutes old by the time this runs — correctly not live. See the fixture: it is
  // the driver's own endpoint, called the way the driver app calls it.
  await publishDriverPosition();

  await page.goto('/home');

  // Not anchored with `^`: Playwright matches a regex against the element's raw text, and the
  // template indents this line, so an anchored pattern never matches however right it looks.
  await expect(page.getByText(/Live · updated/u)).toBeVisible({ timeout: 30_000 });

  // A passenger is never shown raw coordinates.
  await expect(page.getByText(/25\.\d{3}/u)).toBeHidden();
});

/**
 * The arrival estimate.
 *
 * Written to accept either outcome, and that is deliberate rather than lazy. An ETA needs a
 * configured routing provider and a bus reporting freshly; a pilot environment without a Maps key
 * correctly shows "no estimate", and failing the run for it would mean the suite could only pass
 * with a billed third party reachable. What is asserted is the part that must always hold: the
 * passenger is told one thing or the other, never shown a number invented from nothing.
 */
test('shows an arrival estimate, or says there is none', async ({ page }) => {
  await page.goto('/home');

  const estimate = page.getByText(/minutes away|Arriving now/u);
  // Every answer the server can give has words on the screen: an estimate, "we cannot see your
  // bus", "you are on board", or "we cannot work out an arrival time". A run that shows none of
  // them is a passenger staring at a card that says nothing.
  const unavailable = page.getByText(/no arrival estimate|on board|cannot work out an arrival/u);

  await expect(estimate.or(unavailable).first()).toBeVisible({ timeout: 30_000 });
});

/**
 * The approaching notification, if the scenario reached the threshold.
 *
 * Also conditional, for the same reason: the notification is created by the ETA calculation, so it
 * only exists when a provider answered and the bus was genuinely within five minutes of the stop.
 * The bell itself must always be there and must always answer, which is what this asserts.
 */
test('has a notification bell that answers', async ({ page }) => {
  await page.goto('/home');

  const bell = page.getByRole('button', { name: /Notifications/u });
  await expect(bell).toBeVisible();

  await bell.click();

  // The driver started this trip a moment ago, so the panel should be holding that notification.
  // The empty state is still accepted: a run against a freshly seeded database that reached this
  // point another way has nothing to show, and that is a working bell, not a failure.
  const empty = page.getByText('Nothing to report.');
  const notification = page.getByText(/bus is on its way|bus is about|bus has changed/u);

  await expect(empty.or(notification).first()).toBeVisible();
});

test('declares an absence and can undo it', async ({ page }) => {
  await page.goto('/absences');

  await page.getByRole('button', { name: 'Declare absence' }).click();
  await expect(page.getByText('Absence saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).first().click();
  await page.getByRole('button', { name: 'Yes, I am travelling' }).click();

  await expect(page.getByText('Absence cancelled.')).toBeVisible();
});
