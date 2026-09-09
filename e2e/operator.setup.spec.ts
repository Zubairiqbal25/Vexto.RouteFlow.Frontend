import { expect, test } from '@playwright/test';
import {
  accounts,
  chooseFromPicker,
  demoDriverName,
  demoPassengerName,
  departureTime,
  isoDate,
  isoWeekday,
  runId,
  signIn,
  useTableView,
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

  // The operational row, which a tenant account leads with. These four tiles come from the composed
  // summary endpoint, and are the first thing that breaks if it or its permission is wrong.
  // Scoped to the tiles themselves. The same words appear in the attendance panel's empty state,
  // and a bare text match would assert that an empty state exists rather than that a tile does.
  for (const tile of ['Buses running', "Today's trips", 'Boarded today']) {
    await expect(page.locator('vx-metric-card', { hasText: tile })).toBeVisible();
  }

  // A real number, not the em dash the tiles fall back to when the request fails.
  const trips = page.locator('vx-metric-card', { hasText: "Today's trips" });
  await expect(trips).not.toContainText('—');

  // The people-and-fleet band sits below the operational one for an owner account, which is the
  // ordering `dashboardFocus` derives from this account's permissions.
  await expect(page.getByRole('heading', { name: 'People and fleet' })).toBeVisible();
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
  await page.getByRole('tab', { name: /Stops & map/u }).click();

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
  // Activation lives in the header's overflow menu now: the workspace leads with the two actions a
  // planner uses every day, and putting six buttons across the top makes the one that matters stop
  // standing out.
  await page.getByRole('button', { name: 'More route actions' }).click();
  await page.getByRole('menuitem', { name: 'Activate route' }).click();
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
 * The stop timeline, and the fact that choosing on it is answered by the map beside it.
 *
 * The polyline needs a configured provider key, so the drawn line itself is not asserted — that is
 * covered by the backend tests against a stub provider, and an E2E run without a Maps key must not
 * fail for it. What is asserted is what the phase actually asked for: a numbered sequence, a real
 * boarding count per stop, and a selection the map panel acknowledges.
 */
test('renders the stop timeline and links it to the map', async ({ page }) => {
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: /Stops & map/u }).click();

  await expect(page.getByRole('heading', { name: 'Stop timeline' })).toBeVisible();

  // The sequence, as the operator reads it. Three stops were added, in this order.
  const stops = page.locator('vexto-route-timeline li');
  await expect(stops).toHaveCount(3);
  await expect(stops.first()).toContainText('Dubai Silicon Oasis');
  await expect(stops.last()).toContainText('Business Bay');

  // The last stop says it is the end of the route rather than leaving it to be inferred.
  await expect(stops.last()).toContainText('Destination');

  // Both passengers were assigned to stop 1, so it carries a count derived from the assignments the
  // workspace already holds — not from a request per stop.
  await expect(stops.first()).toContainText('2 passengers');

  await expect(page.getByRole('heading', { name: 'Route map' })).toBeVisible();
  await expect(page.getByText('Driving time')).toBeVisible();

  // Choosing a stop on the timeline is answered by the map panel. This is the cross-highlight the
  // phase asked for, asserted through the part of it that does not need a provider key.
  await stops.first().getByRole('button').first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Showing' })).toContainText(
    'Dubai Silicon Oasis',
  );
});

test('assigns the driver and vehicle, seeing capacity before confirming', async ({ page }) => {
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: 'Driver & vehicle' }).click();

  // `.first()` because the empty state offers the same action as the toolbar does — a list with
  // nothing in it should carry the button that fixes that, so both are correct and both match.
  await page.getByRole('button', { name: 'Assign crew' }).first().click();

  // Typed into searchable pickers, not chosen from dropdowns. This run created both records, so
  // naming them is also what stops the roster picking up somebody an earlier run left behind.
  await chooseFromPicker(page, 'res-driver', driverName);
  await chooseFromPicker(page, 'res-vehicle', plateNumber);

  // The comparison a dispatcher makes before committing: seats against people. The backend refuses
  // an impossible pairing anyway; showing it here is what stops them getting that far.
  await expect(page.getByText('Vehicle capacity')).toBeVisible();
  await expect(page.getByText('Assigned passengers')).toBeVisible();

  await page.getByRole('button', { name: 'Confirm assignment' }).click();

  await expect(page.getByText('Crew assigned to route.')).toBeVisible();
});

test('schedules the route and generates a trip for today', async ({ page }) => {
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: /Schedule/u }).click();

  // The operator's business weekday, matching the date the trips are then generated for. Read
  // from a different calendar than `isoDate`, these two disagree for four hours every night.
  const weekday = isoWeekday();

  await page.getByRole('button', { name: 'Add schedule' }).first().click();
  await page.locator('#sc-day').selectOption(weekday);
  // Earlier than any route the demo seed creates (06:15), and unique to this run. The passenger
  // app shows whichever trip departs first, so a tie leaves it a coin-toss — between a seeded trip,
  // or one an earlier run has already completed. See departureTime.
  await page.locator('#sc-time').fill(departureTime());
  await submit(page, 'schedule-form');
  await expect(page.getByText('Schedule added.')).toBeVisible();

  // Generation is the workspace's primary action now, rather than a form at the foot of a tab, so
  // it is reached from the page header and confirmed in a drawer.
  await page.getByRole('button', { name: 'Generate trips' }).first().click();
  await page.locator('#g-from').fill(isoDate(0));
  await page.locator('#g-to').fill(isoDate(0));
  await page.getByRole('button', { name: 'Generate trips', exact: true }).last().click();

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

/**
 * The question the route workspace exists to answer: is this route ready to produce trips.
 *
 * Asserted once the crew, the schedule and a trip are all in place, because "Ready" is only true
 * when every gap is closed — which is exactly what makes it worth stating.
 */
test('shows the route as ready for trip generation', async ({ page }) => {
  await openRoute(page, routeCode);

  await expect(page.getByText('Readiness')).toBeVisible();
  await expect(page.getByText('Ready for trip generation')).toBeVisible();

  // The overview answers who drives it, what they drive and when it next runs — without opening a
  // single tab, which was the whole complaint about the screen this replaced.
  await expect(page.getByRole('heading', { name: 'Assigned driver' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Assigned vehicle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next trip' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
});

test("finds today's trip by searching for its route code", async ({ page }) => {
  await page.goto('/trips');
  await useTableView(page);
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
test('substitutes the crew on the generated trip, through searchable pickers', async ({ page }) => {
  await openTodaysTrip(page, routeCode);

  await page.getByRole('button', { name: 'Change driver / vehicle' }).click();
  await expect(page.getByText('This trip only')).toBeVisible();

  // Typed into a server-side type-ahead, not chosen from a dropdown of the first fifty. On a pilot
  // database with more drivers than the cap this is the difference between finding the substitute
  // and being told, silently, that they do not exist.
  //
  // The substitute is the seeded driver by name, not whoever happens to be first: it is the account
  // the driver app signs in as, and this is what puts this run's trip in front of them.
  await chooseFromPicker(page, 'crew-driver', demoDriverName);
  await chooseFromPicker(page, 'crew-vehicle', plateNumber);

  // Capacity is compared here too, because a substitution is exactly when a smaller bus gets used.
  await expect(page.getByText('Passengers on this trip')).toBeVisible();

  await page.getByRole('button', { name: 'Confirm change' }).click();

  await expect(page.getByText('Crew changed for this trip.')).toBeVisible();

  // The route roster is untouched: the substitution applies to this journey only.
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: 'Driver & vehicle' }).click();
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
  await useTableView(page);
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
 * Two things have to happen first, and both are real user actions rather than test scaffolding.
 *
 * **The list has to be in its table layout.** Cards are the default on every list screen — they are
 * how an operator recognises a person and acts on them — so a fresh browser profile shows no table
 * at all, and every `tbody tr` assertion below would look for rows that were never rendered. This
 * clicks the same Cards/Table switch a person would.
 *
 * **The search has to have settled.** The box is debounced, so filling it and clicking immediately
 * opens the menu of whichever row was already there — a different record, quite possibly one from an
 * earlier run. Waiting for the row count is what makes the click land on the intended row rather
 * than on a race.
 */
async function narrowToSingleRow(
  page: import('@playwright/test').Page,
  searchLabel: string,
  term: string,
): Promise<void> {
  await useTableView(page);
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
  await page.getByRole('button', { name: 'Assign passenger' }).first().click();

  await chooseFromPicker(page, 'a-passenger', name);
  await page.locator('#a-stop').selectOption({ index: 1 });
  await submit(page, 'assign-passenger-form');

  await expect(page.getByText('Passenger assigned.')).toBeVisible();
}
