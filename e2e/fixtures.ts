import type { Page } from '@playwright/test';

/**
 * The accounts the pilot journey signs in as.
 *
 * The addresses match what `DemoDataSeeder` creates, so a machine that has run the demo seed needs
 * to supply only the passwords. **No password has a default**, and that is deliberate: a suite that
 * ships credentials is a suite that eventually ships real ones, and a UAT environment seeded with
 * real-looking data is exactly what a default password gets somebody into.
 *
 * See docs/pilot-setup.md for the whole sequence from a clean machine.
 */
export const accounts = {
  operator: {
    email: process.env['VEXTO_OPERATOR_EMAIL'] ?? 'owner@vexto-demo.test',
    password: process.env['VEXTO_OPERATOR_PASSWORD'] ?? '',
  },
  driver: {
    email: process.env['VEXTO_DRIVER_EMAIL'] ?? 'driver@vexto-demo.test',
    password: process.env['VEXTO_DRIVER_PASSWORD'] ?? '',
  },
  passenger: {
    email: process.env['VEXTO_PASSENGER_EMAIL'] ?? 'passenger@vexto-demo.test',
    password: process.env['VEXTO_PASSENGER_PASSWORD'] ?? '',
  },
};

/**
 * Vexto's own platform administrator.
 *
 * Kept out of `accounts` on purpose: `requireCredentials` insists on every entry there, and the
 * pilot journey does not need a ServiceAdmin. The visual review does, because the platform surface
 * and the onboarding wizard are gated on `Tenants.View` — which a TenantOwner correctly does not
 * hold. A run without this password skips those screenshots rather than failing.
 */
export const serviceAdmin = {
  email: process.env['VEXTO_SERVICE_ADMIN_EMAIL'] ?? 'service.admin@vexto.test',
  password: process.env['VEXTO_SERVICE_ADMIN_PASSWORD'] ?? '',
};

/** The operator the demo seed creates. Used to assert the run is pointed at seeded data. */
export const demoTenantName = process.env['VEXTO_TENANT_NAME'] ?? 'Vexto Demo Transport';

/**
 * The time this run's route departs, in the operator's local business time.
 *
 * Always in the 05:00 hour, so it is earlier than anything the demo seed creates (06:15) and the
 * passenger app therefore shows this run's trip as their next one. The minute comes from the run
 * id so that two runs against the same database do not produce two trips departing at the same
 * moment — which leaves "the next trip" a coin-toss, and the passenger journey asserting against a
 * bus from an earlier run that has already been completed.
 */
export function departureTime(): string {
  const minute = Number.parseInt(runId.slice(-2), 10) % 60;

  return `05:${minute.toString().padStart(2, '0')}`;
}

/** A run-scoped suffix so a re-run does not collide with the records the last one created. */
export const runId = process.env['VEXTO_RUN_ID'] ?? String(Date.now()).slice(-6);

/**
 * Fails immediately, and legibly, when the passwords are missing.
 *
 * Without this the suite fails on a login form with a timeout, which sends whoever is running it
 * looking at selectors rather than at their environment.
 */
export function requireCredentials(): void {
  const missing = Object.entries(accounts)
    .filter(([, account]) => account.password.length === 0)
    .map(([role]) => `VEXTO_${role.toUpperCase()}_PASSWORD`);

  if (missing.length > 0) {
    throw new Error(
      `The pilot journey needs these environment variables: ${missing.join(', ')}. ` +
        'They are the passwords of the demo accounts created by the backend demo seed — see ' +
        'docs/pilot-setup.md.',
    );
  }
}

export async function signIn(
  page: Page,
  account: { email: string; password: string },
): Promise<void> {
  requireCredentials();

  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

export function isoDate(daysFromToday = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);

  return date.toISOString().slice(0, 10);
}

/**
 * Feeds the browser a fixed position so the driver app publishes without real hardware.
 *
 * Geolocation cannot be faked from inside the page; it has to be granted and overridden at the
 * context level, which is why this takes the page's context rather than the page.
 */
export async function mockGps(page: Page, latitude = 25.118, longitude = 55.377): Promise<void> {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude, longitude });
}

/** The route the operator setup spec creates, and therefore the trip this run is about. */
export const routeCode = `E2E-${runId}`;

/**
 * Opens the driver's trip for this run.
 *
 * Deliberately not "the first card in the list". A pilot database accumulates trips — every
 * previous run left one, and several of them are still under way — so `.first()` picks whichever
 * happens to sort earliest and the rest of the journey then asserts against somebody else's trip.
 * The route code is unique per run, which makes it the only honest way to say "mine".
 */
export async function openTodaysTrip(page: Page): Promise<void> {
  await page.goto('/trips');

  await page.getByRole('link').filter({ hasText: routeCode }).first().click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}/u);
}

/**
 * The seeded people the driver and passenger apps sign in as.
 *
 * The setup spec creates its own driver and passenger to prove those screens work, but neither has
 * a login. The journey that follows has to run on the trip these two are actually on, or the three
 * apps are each looking at different data and the run proves nothing.
 */
export const demoDriverName = process.env['VEXTO_DRIVER_NAME'] ?? 'Imran Demo';
export const demoPassengerName = process.env['VEXTO_PASSENGER_NAME'] ?? 'Aisha Demo';

/** Where the API lives. The apps proxy to it; this file talks to it directly. */
export const apiUrl = process.env['VEXTO_API_URL'] ?? 'http://localhost:5154';

/**
 * Publishes one position for today's trip, over the API, as the driver.
 *
 * The passenger project needs a bus that is reporting *now*, and by the time it runs the driver
 * project's browser is closed — nothing is publishing any more, and a position from four minutes
 * ago is correctly not "live". Playwright cannot hold two browser contexts across projects, so the
 * fix comes over HTTP instead.
 *
 * Nothing about the product is stubbed here: this is the same endpoint, the same authentication
 * and the same payload the driver app sends. Only the thing holding the phone is different.
 */
export async function publishDriverPosition(): Promise<void> {
  requireCredentials();

  const trip = await passengersNextTripId();
  const token = await signInForToken(accounts.driver);

  const response = await fetch(`${apiUrl}/api/v1/driver/me/trips/${trip}/location`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      latitude: 25.118,
      longitude: 55.377,
      accuracyMeters: 12,
      speedKph: 34,
      headingDegrees: 210,
      recordedAtUtc: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Publishing a driver position failed with ${response.status}.`);
  }
}

async function signInForToken(account: { email: string; password: string }): Promise<string> {
  const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });

  if (!response.ok) {
    throw new Error(`Signing in as ${account.email} failed with ${response.status}.`);
  }

  const body = (await response.json()) as { accessToken: string };

  return body.accessToken;
}

/**
 * The trip the passenger's home screen will show, chosen exactly the way that screen chooses it.
 *
 * Not "this run's trip": a pilot database keeps every trip an earlier run created, the seeded
 * passenger ends up assigned to several of them, and the app shows whichever starts first. Picking
 * a different one here would publish a position nobody is looking at, and the failure would read
 * as a broken tracking pipeline rather than as two screens disagreeing about which bus is next.
 */
async function passengersNextTripId(): Promise<string> {
  const token = await signInForToken(accounts.passenger);

  const response = await fetch(
    `${apiUrl}/api/v1/passenger/me/trips?fromDate=${isoDate(0)}&pageSize=5`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    throw new Error(`Reading the passenger's trips failed with ${response.status}.`);
  }

  const body = (await response.json()) as {
    items: { tripId: string; scheduledStartAtUtc: string; tripStatus: string }[];
  };

  // The same rule the home screen uses: trips that have not finished first, then by departure.
  // Keeping the two in step is the point — a fixture that picked differently would publish a
  // position for a bus nobody is looking at.
  const finished = (status: string) => status === 'Completed' || status === 'Cancelled';

  const [next] = [...body.items].sort((a, b) => {
    const settled = Number(finished(a.tripStatus)) - Number(finished(b.tripStatus));

    return settled !== 0
      ? settled
      : a.scheduledStartAtUtc.localeCompare(b.scheduledStartAtUtc);
  });

  if (!next) {
    throw new Error('The passenger has no upcoming trip to track.');
  }

  return next.tripId;
}

/**
 * The billing period the operator invoices for, and when it falls due.
 *
 * The current calendar month, which is what the operator screen defaults to — so the E2E run and
 * a person clicking through produce the same invoice, and the idempotency assertion means what it
 * looks like.
 */
export function invoicePeriod(): { start: string; end: string; due: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const due = new Date(now.getFullYear(), now.getMonth(), 10);

  return {
    start: start.toLocaleDateString('en-CA'),
    end: end.toLocaleDateString('en-CA'),
    due: due.toLocaleDateString('en-CA'),
  };
}

/**
 * Completes a payment the way it actually completes: the payer confirms with the provider, and the
 * provider tells Vexto.
 *
 * <b>This does not reach into Vexto and set a status.</b> It posts to the same webhook endpoint a
 * real provider posts to, anonymously, with the provider's own reference for the payment — which
 * is the authoritative path and the only one that marks an invoice paid. A helper that flipped a
 * status directly would make the test pass while proving nothing.
 *
 * The API in an E2E run has no Stripe keys, so it is running the deterministic in-memory provider,
 * whose verifier accepts a plain JSON envelope. Against real Stripe this same endpoint would demand
 * a signature — which is exactly why signature verification is unit-tested separately, with a real
 * HMAC.
 */
export async function completePaymentAtProvider(invoiceId: string): Promise<void> {
  requireCredentials();

  // Start the payment the way the app does, if it has not been started already. The server
  // deduplicates, so calling this when the passenger has already opened the sheet returns the same
  // attempt rather than a second one.
  //
  // This step exists because an environment with no publishable key has no payment sheet to open,
  // and the browser therefore cannot start the payment itself. Everything after it — the provider
  // confirming, and Vexto learning about it — is the real path either way.
  const passengerToken = await signInForToken(accounts.passenger);

  const started = await fetch(
    `${apiUrl}/api/v1/passenger/me/invoices/${invoiceId}/payment-intent`,
    { method: 'POST', headers: { authorization: `Bearer ${passengerToken}` } },
  );

  if (!started.ok) {
    throw new Error(`Starting the payment failed with ${started.status}.`);
  }

  const operatorToken = await signInForToken(accounts.operator);

  const response = await fetch(
    `${apiUrl}/api/v1/payments?invoiceId=${invoiceId}&pageSize=5`,
    { headers: { authorization: `Bearer ${operatorToken}` } },
  );

  if (!response.ok) {
    throw new Error(`Reading the payment failed with ${response.status}.`);
  }

  const body = (await response.json()) as { items: { providerReference: string }[] };
  const [payment] = body.items;

  if (!payment) {
    throw new Error(`No payment has been started for invoice ${invoiceId}.`);
  }

  // Anonymous, because a payment provider has no Vexto login and cannot present a token.
  const webhook = await fetch(`${apiUrl}/api/v1/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: `evt_e2e_${Date.now()}`,

      // PaymentWebhookKind.PaymentSucceeded.
      kind: 1,
      paymentIntentId: payment.providerReference,
    }),
  });

  if (!webhook.ok) {
    throw new Error(`The payment webhook was rejected with ${webhook.status}.`);
  }
}
