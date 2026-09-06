import { expect, test } from '@playwright/test';
import { accounts, isoDate, runId, signIn } from './fixtures';

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

test('creates a passenger', async ({ page }) => {
  await page.goto('/passengers');
  await page.getByRole('button', { name: 'Add Passenger' }).first().click();

  await page.getByLabel('First name').fill('Pilot');
  await page.getByLabel('Last name').fill(`Passenger ${runId}`);
  await page.getByLabel('Mobile number').fill(`+9715${runId}0`);
  await page.getByRole('button', { name: 'Add passenger' }).click();

  await expect(page.getByText('Passenger added.')).toBeVisible();
  await expect(page.getByRole('cell', { name: passengerName })).toBeVisible();
});

test('creates a driver', async ({ page }) => {
  await page.goto('/drivers');
  await page.getByRole('button', { name: 'Add Driver' }).first().click();

  await page.getByLabel('First name').fill('Pilot');
  await page.getByLabel('Last name').fill(`Driver ${runId}`);
  await page.getByLabel('Mobile number').fill(`+9715${runId}1`);
  await page.getByLabel('Licence number').fill(`LIC${runId}`);
  await page.getByLabel('Licence expiry').fill(isoDate(365));
  await page.getByRole('button', { name: 'Add driver' }).click();

  await expect(page.getByText('Driver added.')).toBeVisible();
  await expect(page.getByText(driverName)).toBeVisible();

  // A driver is created Pending; only an active driver can be assigned to a route.
  await page.getByRole('button', { name: `Actions for Pilot` }).first().click();
  await page.getByRole('menuitem', { name: 'Activate' }).click();
  await expect(page.getByText('can be assigned to trips')).toBeVisible();
});

test('creates a vehicle', async ({ page }) => {
  await page.goto('/vehicles');
  await page.getByRole('button', { name: 'Add Vehicle' }).first().click();

  await page.getByLabel('Plate number').fill(plateNumber);
  await page.getByLabel('Vehicle type').selectOption('Bus');
  await page.getByLabel('Capacity').fill('30');
  await page.getByRole('button', { name: 'Add vehicle' }).click();

  await expect(page.getByText('Vehicle added.')).toBeVisible();
  await expect(page.getByRole('cell', { name: plateNumber, exact: true })).toBeVisible();
});

test('creates a route and lands on its detail page', async ({ page }) => {
  await page.goto('/routes');
  await page.getByRole('button', { name: 'New Route' }).first().click();

  await page.getByLabel('Code').fill(routeCode);
  await page.getByLabel('Name').fill('DSO to Business Bay');
  await page.getByLabel('Direction').selectOption('Outbound');
  await page.getByLabel('Default start time').fill('06:15');
  await page.getByRole('button', { name: 'Create route' }).click();

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
    await page.getByLabel('Name').fill(stop.name);
    await page.getByLabel('Latitude').fill(stop.lat);
    await page.getByLabel('Longitude').fill(stop.lng);
    await page.getByRole('button', { name: 'Add stop', exact: true }).last().click();
    await expect(page.getByText('Stop added.')).toBeVisible();
  }

  await expect(page.getByText('Dubai Silicon Oasis')).toBeVisible();
  await expect(page.getByText('Business Bay')).toBeVisible();
});

test('assigns the passenger to the first stop', async ({ page }) => {
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: /Passengers/u }).click();

  await page.getByRole('button', { name: 'Assign passenger' }).click();

  // The option label carries the mobile number too, so it is matched by text and selected by value.
  const option = page.locator('#a-passenger option', { hasText: passengerName });
  await page.getByLabel('Passenger').selectOption((await option.getAttribute('value')) ?? '');
  await page.getByLabel('Pickup stop').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Assign passenger', exact: true }).last().click();

  await expect(page.getByText('Passenger assigned.')).toBeVisible();
});

test('assigns the driver and vehicle', async ({ page }) => {
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: 'Resources' }).click();

  await page.getByRole('button', { name: 'Assign crew' }).click();
  await page.getByLabel('Driver').selectOption({ index: 1 });
  await page.getByLabel('Vehicle').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Assign crew', exact: true }).last().click();

  await expect(page.getByText('Crew assigned to route.')).toBeVisible();
});

test('schedules the route and generates a trip for today', async ({ page }) => {
  await openRoute(page, routeCode);
  await page.getByRole('tab', { name: /Schedule/u }).click();

  const weekday = new Date().toLocaleDateString('en-GB', { weekday: 'long' });

  await page.getByRole('button', { name: 'Add schedule' }).click();
  await page.getByLabel('Day').selectOption(weekday);
  await page.getByLabel('Start time').fill('06:15');
  await page.getByRole('button', { name: 'Add schedule', exact: true }).last().click();
  await expect(page.getByText('Schedule added.')).toBeVisible();

  await page.getByLabel('From').fill(isoDate(0));
  await page.getByLabel('To').fill(isoDate(0));
  await page.getByRole('button', { name: 'Generate Trips' }).click();

  await expect(page.getByText(/trips generated/u)).toBeVisible();
});

test("marks today's trip ready", async ({ page }) => {
  await page.goto('/trips');
  await page.getByLabel('Service date').fill(isoDate(0));
  await page.getByRole('link', { name: routeCode }).first().click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}/u);
  await page.getByRole('button', { name: 'Mark ready' }).click();

  await expect(page.getByText('Trip marked ready.')).toBeVisible();
});

/** Finds the route by code and opens it. Used by every test after the route exists. */
async function openRoute(page: import('@playwright/test').Page, code: string): Promise<void> {
  await page.goto('/routes');
  await page.getByRole('link', { name: code }).click();
  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}/u);
}
