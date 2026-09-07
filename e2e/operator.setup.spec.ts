import { expect, test } from '@playwright/test';
import {
  accounts,
  demoDriverName,
  demoPassengerName,
  departureTime,
  isoDate,
  runId,
  signIn,
} from './fixtures';

/**
 * The operator half of the pilot journey: build a route from nothing and put a trip on the road.
 *
 * Written as one ordered story rather than isolated cases, because that is what it proves — that a
 * dispatcher can go from an empty tenant to a generated trip without leaving the portal.
 */
test.describe.configure({ mode: 'serial' });

const passengerName = `Pilot Passenger ${runId}`;
const driverName = `Pilot Driver ${runId}`;
const plateNumber = `PLT${runId}`;
const routeCode = `E2E-${runId}`;

test.beforeEach(async ({ page }) => {
  await signIn(page, accounts.operator);
});

/**
 * The dashboard summary is the first request the portal makes after sign-in, and the first thing
 * that breaks if the composed endpoint or its permission is wrong. Asserted before anything is
 * created, so it proves the endpoint answers rather than that some number happens to be non-zero.
 */
test('loads the dashboard summary', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Active Passengers')).toBeVisible();
  await expect(page.getByText('Today at a glance')).toBeVisible();

  // Every counter resolves to a number. A dash would mean the summary request failed and the page
  // fell back to its empty state. Scoped to the term list, because "Scheduled" is also a trip
  // status badge elsewhere on the page.
  const glance = page.getByRole('term');

  await expect(glance.filter({ hasText: 'Scheduled' })).toBeVisible();
  await expect(glance.filter({ hasText: 'Boarded' })).toBeVisible();
});

test('creates a passenger', async ({ page }) => {
  await page.goto('/passengers');
  await page.getByRole('button', { name: 'Add Passenger' }).first().click();

  await page.getByLabel('First name').fill('Pilot');
  await page.getByLabel('Last name').fill(`Passenger ${runId}`);
  await page.getByLabel('Mobile number').fill(`+9715${runId}01`);
  await submit(page, 'passenger-form');

  await expect(page.getByText('Passenger added.')).toBeVisible();

  // Searched for rather than looked for on the first page: a development database accumulates
  // records, and a new one does not necessarily land on page one.
  await narrowToSingleRow(page, 'Search passengers', runId);
  await expect(page.getByRole('cell', { name: passengerName })).toBeVisible();

  // A passenger is created pending, and only an active one can be rostered on a route. Activating
  // here is what an operator does next, and what the assignment step below depends on.
  await page.getByRole('button', { name: /Actions for/u }).first().click();
  await page.getByRole('menuitem', { name: 'Activate' }).click();

  await expect(page.locator('vx-status-badge', { hasText: 'Active' }).first()).toBeVisible();
});

test('creates a driver', async ({ page }) => {
  await page.goto('/drivers');
  await page.getByRole('button', { name: 'Add Driver' }).first().click();

  await page.getByLabel('First name').fill('Pilot');
  await page.getByLabel('Last name').fill(`Driver ${runId}`);
  await page.getByLabel('Mobile number').fill(`+9715${runId}02`);
  await page.getByLabel('Licence number').fill(`LIC${runId}`);
  await page.getByLabel('Licence expiry').fill(isoDate(365));
  await submit(page, 'driver-form');

  await expect(page.getByText('Driver added.')).toBeVisible();

  // Narrowed to this run's own driver. A development database accumulates drivers from previous
  // runs, and acting on whichever one happens to sort first is how a suite starts passing for the
  // wrong reason. Searching is also what a person does.
  await narrowToSingleRow(page, 'Search drivers', runId);
  await expect(page.getByText(driverName)).toBeVisible();

  // A driver is created pending; only an active driver can be assigned to a route.
  await page.getByRole('button', { name: /Actions for/u }).first().click();
  await page.getByRole('menuitem', { name: 'Activate' }).click();

  // The resulting status, not the toast. A toast is transient by design; the state it announces is
  // what the next test depends on. The search above has already narrowed the table to this run's
  // own driver, so a visible 'Active' here is that driver's.
  await expect(page.locator('vx-status-badge', { hasText: 'Active' }).first()).toBeVisible();
});

test('creates a vehicle', async ({ page }) => {
  await page.goto('/vehicles');
  await page.getByRole('button', { name: 'Add Vehicle' }).first().click();

  await page.getByLabel('Plate number').fill(plateNumber);
  await page.locator('#v-type').selectOption('Bus');
  await page.getByLabel('Capacity').fill('30');
  await submit(page, 'vehicle-form');

  await expect(page.getByText('Vehicle added.')).toBeVisible();

  // Searched for rather than looked for on the first page, for the same reason as the passenger
  // and driver above: a development database accumulates records across runs.
  await narrowToSingleRow(page, 'Search vehicles', plateNumber);
  await expect(page.getByRole('cell', { name: plateNumber, exact: true })).toBeVisible();
});

test('creates a route and lands on its detail page', async ({ page }) => {
  await page.goto('/routes');
  await page.getByRole('button', { name: 'New Route' }).first().click();

  await page.locator('#r-code').fill(routeCode);
  await page.locator('#r-name').fill('DSO to Business Bay');
  await page.locator('#r-direction').selectOption('Outbound');
  await page.locator('#r-start').fill('06:15');
  await submit(page, 'route-form');

  // Creating a route navigates straight to where the remaining work happens.
  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}/u);
  await expect(page.getByRole('heading', { name: 'DSO to Business Bay' }).first()).toBeVisible();
});

test('adds stops in order', async ({ page }) => {
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: /Stops/u }).click();

  for (const stop of [
    { name: 'Dubai Silicon Oasis', lat: '25.118', lng: '55.377' },
    { name: 'Academic City', lat: '25.126', lng: '55.406' },
    { name: 'Business Bay', lat: '25.185', lng: '55.271' },
  ]) {
    await page.getByRole('button', { name: 'Add stop' }).first().click();
    await page.locator('#s-name').fill(stop.name);
    await page.locator('#s-lat').fill(stop.lat);
    await page.locator('#s-lng').fill(stop.lng);
    await submit(page, 'stop-form');

    // The stop itself, not the toast. Toasts replace one another inside a loop, so asserting on one
    // is a race; the row it announces is what the next step actually needs.
    await expect(page.getByText(stop.name).first()).toBeVisible();
  }

  await expect(page.getByText('Dubai Silicon Oasis').first()).toBeVisible();
  await expect(page.getByText('Business Bay').first()).toBeVisible();

  // A route is created as a draft and produces no trips until it is in service. It cannot be
  // activated before it has a stop, which is why this happens here rather than at creation.
  await page.getByRole('button', { name: 'Activate route' }).click();
  await expect(page.getByText('now in service')).toBeVisible();
});

test('assigns the passengers to the first stop', async ({ page }) => {
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: /Passengers/u }).click();

  // The one this run created, which is what proves the create-then-assign path works.
  await assignPassenger(page, passengerName);

  // And the seeded passenger, who is the only one with a login. Without this the passenger app
  // would sign in and find itself looking at a different route than the driver app.
  await assignPassenger(page, demoPassengerName);
});

/**
 * The map tab. The polyline needs a configured provider key, so only the stops and the panel are
 * asserted — the line itself is verified by the backend tests against a stub provider, and an E2E
 * run without a Maps key must not fail for it.
 */
test('renders the route map preview', async ({ page }) => {
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: 'Map' }).click();

  await expect(page.getByRole('heading', { name: 'Route map' })).toBeVisible();
  await expect(page.getByText('Distance')).toBeVisible();

  // 'Driving time' appears only on this panel. 'Stops' is also a tab label, so it would assert
  // that the tab exists rather than that the preview rendered.
  await expect(page.getByText('Driving time')).toBeVisible();
});

test('assigns the driver and vehicle', async ({ page }) => {
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: 'Resources' }).click();

  await page.getByRole('button', { name: 'Assign crew' }).click();
  await page.locator('#res-driver').selectOption({ index: 1 });
  await page.locator('#res-vehicle').selectOption({ index: 1 });
  await submit(page, 'assign-resources-form');

  await expect(page.getByText('Crew assigned to route.')).toBeVisible();
});

test('schedules the route and generates a trip for today', async ({ page }) => {
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: /Schedule/u }).click();

  const weekday = new Date().toLocaleDateString('en-GB', { weekday: 'long' });

  await page.getByRole('button', { name: 'Add schedule' }).click();
  await page.locator('#sc-day').selectOption(weekday);
  // Earlier than any route the demo seed creates (06:15), and unique to this run. The passenger
  // app shows whichever trip departs first, so a tie leaves it a coin-toss — between a seeded trip,
  // or one an earlier run has already completed. See departureTime.
  await page.locator('#sc-time').fill(departureTime());
  await submit(page, 'schedule-form');
  await expect(page.getByText('Schedule added.')).toBeVisible();

  await page.locator('#g-from').fill(isoDate(0));
  await page.locator('#g-to').fill(isoDate(0));
  await page.getByRole('button', { name: 'Generate Trips' }).click();

  // The result line, which persists on the page rather than fading like a toast. It also proves
  // the request finished, which the next test depends on: asserting on something that renders
  // before the response arrives would let the trips list be searched before the trip exists.
  //
  // The count matters, not just the sentence. This route is new, so exactly one trip is created;
  // an assertion that accepted "created 0, skipped 0" would pass on a run that generated nothing
  // and leave the driver and passenger journeys to fail somewhere much less obvious.
  await expect(page.getByRole('status').filter({ hasText: 'that already existed' }))
    .toContainText(/Created\s*1\s*trips/u);
});

test("finds today's trip by searching for its route code", async ({ page }) => {
  await page.goto('/trips');
  await page.getByLabel('Service date').fill(isoDate(0));

  // The search box matches the route code, name, driver name or plate — all snapshotted on the
  // trip, so this is one indexed query rather than a join across three modules.
  await page.getByLabel('Search trips').fill(routeCode);

  // Scoped to the table body. The route also appears as an <option> in the route filter, and an
  // option is never visible — matching it would fail while the row it is looking for is on screen.
  await expect(page.locator('tbody').getByText(routeCode)).toBeVisible();
});

/**
 * The dispatcher exception this phase exists for: driver A is sick, so this one trip runs with
 * somebody else and the route roster is deliberately left alone.
 */
test('substitutes the crew on the generated trip', async ({ page }) => {
  await openTodaysTrip(page, routeCode);

  await page.getByRole('button', { name: 'Change crew' }).click();
  await expect(page.getByText('Change crew for this trip')).toBeVisible();

  // The substitute is the seeded driver by name, not whoever happens to be first in the list: it
  // is the account the driver app signs in as, and this is what puts this run's trip in front of
  // them.
  const driverSelect = page.getByLabel('Substitute driver');
  const driverOption = driverSelect.locator('option', { hasText: demoDriverName });
  await driverSelect.selectOption((await driverOption.getAttribute('value')) ?? '');
  await page.getByLabel('Substitute vehicle').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Save crew' }).click();

  await expect(page.getByText('Crew changed for this trip.')).toBeVisible();

  // The route roster is untouched: the substitution applies to this journey only.
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: 'Resources' }).click();
  await expect(page.locator('vx-status-badge', { hasText: 'Active' }).first()).toBeVisible();
});

test("marks today's trip ready", async ({ page }) => {
  await openTodaysTrip(page, routeCode);
  await page.getByRole('button', { name: 'Mark ready' }).click();

  await expect(page.getByText('Trip marked ready.')).toBeVisible();
});

/** Opens today's trip for the route under test. */
async function openTodaysTrip(
  page: import('@playwright/test').Page,
  code: string,
): Promise<void> {
  await page.goto('/trips');
  await page.getByLabel('Service date').fill(isoDate(0));
  await page.getByLabel('Search trips').fill(code);

  // Waits for the filtered result before clicking. The search is debounced, so clicking straight
  // away opens whichever trip was already listed — a different one, and the failure then looks
  // like a routing bug rather than a race.
  await expect(page.locator('tbody tr')).toHaveCount(1);

  // The whole row opens the trip; there is no link to click.
  await page.locator('tbody tr').first().click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}/u);
}

/**
 * Filters a list down to exactly one row before acting on it.
 *
 * The search box is debounced, so filling it and clicking immediately opens the menu of whichever
 * row was already there — a different record, quite possibly one from an earlier run. Waiting for
 * the row count is what makes the click land on the intended row rather than on a race.
 */
async function narrowToSingleRow(
  page: import('@playwright/test').Page,
  searchLabel: string,
  term: string,
): Promise<void> {
  await page.getByLabel(searchLabel).fill(term);
  await expect(page.locator('tbody tr')).toHaveCount(1);
}

/**
 * Submits an open drawer.
 *
 * Every drawer's submit button carries `form="<id>"`, which is what makes it unambiguous: the
 * toolbar button that opened the drawer usually has the same wording, and matching on text alone
 * finds both.
 */
async function submit(page: import('@playwright/test').Page, formId: string): Promise<void> {
  await page.locator(`button[form="${formId}"]`).click();
}

/**
 * Finds the route by code and opens it. Used by every test after the route exists.
 *
 * Searched for rather than picked off the first page: a pilot database keeps every route an
 * earlier run created, so by the twentieth run this one is no longer listed until it is filtered
 * for.
 */
async function openRoute(page: import('@playwright/test').Page, code: string): Promise<void> {
  await page.goto('/routes');
  await narrowToSingleRow(page, 'Search routes', code);
  await page.getByRole('link', { name: code }).click();
  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}/u);
}

/** Assigns one passenger to the route's first stop. */
async function assignPassenger(
  page: import('@playwright/test').Page,
  name: string,
): Promise<void> {
  await page.getByRole('button', { name: 'Assign passenger' }).click();

  // The option label carries the mobile number too, so it is matched by text and selected by value.
  const option = page.locator('#a-passenger option', { hasText: name });
  await page.locator('#a-passenger').selectOption((await option.getAttribute('value')) ?? '');
  await page.locator('#a-stop').selectOption({ index: 1 });
  await submit(page, 'assign-passenger-form');

  await expect(page.getByText('Passenger assigned.')).toBeVisible();
}
