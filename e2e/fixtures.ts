import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The accounts the pilot journey signs in as.
 *
 * Vexto is passwordless: an account is an email address and nothing else. The addresses match what
 * `DemoDataSeeder` creates, so a machine that has run the demo seed needs to supply nothing — the
 * sign-in code is read back from the API's Development-only test sink rather than from a mailbox.
 * That sink exists only when the API runs as Development with
 * `Authentication:EmailOtp:CaptureCodesForTesting` set, which is how a local or E2E environment is
 * configured and how no deployed one ever is.
 *
 * See docs/pilot-setup.md for the whole sequence from a clean machine.
 */
export const accounts = {
  operator: { email: process.env['VEXTO_OPERATOR_EMAIL'] ?? 'owner@vexto-demo.test' },
  driver: { email: process.env['VEXTO_DRIVER_EMAIL'] ?? 'driver@vexto-demo.test' },
  passenger: { email: process.env['VEXTO_PASSENGER_EMAIL'] ?? 'passenger@vexto-demo.test' },
};

/**
 * Vexto's own platform administrator: the seeded ServiceAdmin.
 *
 * Kept out of `accounts` on purpose so the pilot journey, which does not need a ServiceAdmin, does
 * not depend on one having been seeded. The platform journey and the visual review use it, and
 * skip rather than fail when the account cannot sign in.
 */
export const serviceAdmin = {
  email: process.env['VEXTO_SERVICE_ADMIN_EMAIL'] ?? 'zubairiqbal25@gmail.com',
};

export type Account = { readonly email: string };

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

/** Where the API lives. The apps proxy to it; this file talks to it directly. */
export const apiUrl = process.env['VEXTO_API_URL'] ?? 'http://localhost:5154';

/**
 * Asks the API to send a sign-in code, exactly as the login screen does.
 *
 * Over HTTP rather than through the page so the same helper serves the browser journeys and the
 * API-only fixtures below. The response is the same whatever the address, by design.
 */
export async function requestOtp(email: string): Promise<void> {
  const response = await fetch(`${apiUrl}/api/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error(`Requesting a sign-in code for ${email} failed with ${response.status}.`);
  }
}

/**
 * Reads the code the API just sent, from its Development-only test sink.
 *
 * A 404 here means one of two things, and the message says both: the API is not running with the
 * sink enabled, or the address has no active account and was therefore sent nothing — which is the
 * enumeration-safe behaviour of the request endpoint, not a bug in it.
 */
export async function getOtpFromTestProvider(email: string): Promise<string> {
  const response = await fetch(
    `${apiUrl}/api/v1/development/email-otp/${encodeURIComponent(email)}`,
  );

  if (!response.ok) {
    throw new Error(
      `No sign-in code was captured for ${email} (${response.status}). The API must run as ` +
        'Development with Authentication__EmailOtp__CaptureCodesForTesting=true, and the ' +
        'address must belong to an active account — see docs/pilot-setup.md.',
    );
  }

  const body = (await response.json()) as { code: string };

  return body.code;
}

/** Presents a code over HTTP and returns the access token. For fixtures that never open a page. */
export async function verifyOtp(email: string, code: string): Promise<string> {
  const response = await fetch(`${apiUrl}/api/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });

  if (!response.ok) {
    throw new Error(`Verifying the sign-in code for ${email} failed with ${response.status}.`);
  }

  const body = (await response.json()) as { accessToken: string };

  return body.accessToken;
}

/**
 * Signs in through the real login screen: the email, then the code the API sent, read back from the
 * test sink and typed into the boxes the way a person would.
 *
 * The code is read *after* the page has asked for one, so what is typed is the code the page's own
 * request produced — the same challenge, not an earlier one that a fresh request would retire.
 */
export async function signIn(page: Page, account: Account, baseUrl = ''): Promise<void> {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Email address').fill(account.email);

  const previous = await latestOtp(account.email);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await enterCodeFromSink(page, account.email, previous);

  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/**
 * Types the code the page's own request produced.
 *
 * Waited for rather than read immediately, and compared with what the sink held before the page
 * asked: the previous code may already be spent by an earlier test. If the page's request landed
 * inside the resend cooldown the API sent nothing, so this does what a person does — waits for the
 * "Resend code" button and presses it — and then types the code that produces.
 */
export async function enterCodeFromSink(page: Page, email: string, previous: string | null): Promise<void> {
  let code = await waitForNewOtp(email, previous, 2_500);

  if (code === null) {
    await page.getByRole('button', { name: 'Resend code' }).click({ timeout: 15_000 });
    code = await waitForNewOtp(email, previous, 5_000);
  }

  if (code === null) {
    throw new Error(`No new sign-in code arrived for ${email}. See docs/pilot-setup.md.`);
  }

  await page.getByRole('textbox', { name: 'Digit 1 of 6' }).click();
  await page.keyboard.type(code);
}

/** The code the sink currently holds for an address, or null when it holds none. */
export async function latestOtp(email: string): Promise<string | null> {
  const response = await fetch(`${apiUrl}/api/v1/development/email-otp/${encodeURIComponent(email)}`);

  return response.ok ? ((await response.json()) as { code: string }).code : null;
}

async function waitForNewOtp(email: string, previous: string | null, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const current = await latestOtp(email);

    if (current && current !== previous) {
      return current;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return null;
}

/** Whether an address can sign in at all — used to skip the platform journey when it cannot. */
export async function canSignIn(email: string): Promise<boolean> {
  try {
    await requestOtp(email);
    await getOtpFromTestProvider(email);

    return true;
  } catch {
    return false;
  }
}

/**
 * Switches a list screen to its table layout, if it is not already there.
 *
 * **Cards are the default on every list screen**, because they are how an operator recognises a
 * person or a vehicle and acts on them. A fresh browser profile therefore renders no table at all,
 * and any `tbody tr` assertion looks for rows that were never there.
 *
 * The preference is remembered per screen in local storage, so this is a no-op on a second visit
 * within one project — but each project gets its own storage, so every spec that reads rows has to
 * ask for them. It clicks the same Cards/Table switch a person would.
 *
 * Matched on the switch's `title`, which is stable: the visible label is hidden below `sm`, so the
 * button's accessible name changes with the viewport.
 */
export async function useTableView(page: Page): Promise<void> {
  const table = page.locator('button[title="Table view"]');

  // Waited for rather than probed: right after a navigation the toolbar has not rendered, and
  // `isVisible()` is an immediate question that answers "no" and skips the switch entirely.
  await table.waitFor({ state: 'visible' });

  if ((await table.getAttribute('aria-pressed')) === 'true') {
    return;
  }

  await table.click();
  await page.locator('button[title="Table view"][aria-pressed="true"]').waitFor();
}

/**
 * Chooses a record from a searchable picker by typing part of its label.
 *
 * Every form that chooses one record out of many now uses a server-side type-ahead rather than a
 * dropdown of the first twenty or fifty — which is not cosmetic: on a pilot database with more
 * passengers and routes than the cap, the record being assigned was simply not in the list, and the
 * list gave no sign of having ended.
 *
 * Waits for the option before clicking it: the picker debounces and then asks the server, so a
 * click straight after typing lands on whatever the *previous* term returned.
 */
export async function chooseFromPicker(page: Page, inputId: string, term: string): Promise<void> {
  const box = page.locator(`#${inputId}`);

  await box.click();
  await box.fill(term);

  const option = page
    .locator(`#${inputId}-listbox`)
    .getByRole('option')
    .filter({ hasText: term })
    .first();

  await expect(option).toBeVisible();
  await option.click();

  // The box shows what was chosen, which proves the selection landed rather than the menu merely
  // having closed.
  await expect(box).not.toHaveValue('');
}

/**
 * A service date in the operator's own business day, as `YYYY-MM-DD`.
 *
 * **Not the UTC date.** Vexto operates in the Gulf, four hours ahead, so between midnight and 04:00
 * local `toISOString()` still returns yesterday. A run started at 00:10 added a schedule for the
 * local weekday and then asked for trips on the UTC date — a different day — and generated nothing,
 * with an error that pointed at trip generation rather than at the clock. The app has the same fix,
 * in `serviceDate`; these two have to agree or the suite tests a different day from the product.
 */
export function isoDate(daysFromToday = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + daysFromToday * 86_400_000));
}

/** The weekday of a business day. Paired with `isoDate` so the two never name different days. */
export function isoWeekday(daysFromToday = 0): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: 'long',
  }).format(new Date(Date.now() + daysFromToday * 86_400_000));
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

  // The driver's home leads with one trip as a hero and lists the rest, so this run's trip is in
  // one of two places depending on whether it happens to be the soonest. The hero's action says
  // "START TRIP" and carries no route code — deliberately, because a driver reaching for it in a
  // moving vehicle needs one unambiguous target — so it is found by the code *beside* the button
  // rather than inside it.
  const hero = page.getByRole('region', { name: 'Next trip' });

  if (await hero.filter({ hasText: routeCode }).count()) {
    await hero.getByRole('link', { name: 'START TRIP' }).click();
  } else {
    await page.getByRole('link').filter({ hasText: routeCode }).first().click();
  }

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

async function signInForToken(account: Account): Promise<string> {
  await requestOtp(account.email);

  return verifyOtp(account.email, await getOtpFromTestProvider(account.email));
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
    `${apiUrl}/api/v1/passenger/me/trips?fromDate=${isoDate(0)}&pageSize=25`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    throw new Error(`Reading the passenger's trips failed with ${response.status}.`);
  }

  const body = (await response.json()) as {
    items: { tripId: string; scheduledStartAtUtc: string; tripStatus: string }[];
  };

  // The same rule the home screen uses: a running bus first, then one not yet run, then finished
  // ones — and departure time only within a band. Keeping the two in step is the point. A fixture
  // that picked differently would publish a position for a bus nobody is looking at, and on a
  // database with several days of runs in it would publish to a trip that has not started, which
  // the API correctly refuses with a 409.
  const relevance = (status: string) =>
    status === 'Started' ? 0 : status === 'Completed' || status === 'Cancelled' ? 2 : 1;

  const [next] = [...body.items].sort((a, b) => {
    const byRelevance = relevance(a.tripStatus) - relevance(b.tripStatus);

    return byRelevance !== 0
      ? byRelevance
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
  // Start the payment the way the app does.
  //
  // This step exists because an environment with no publishable key has no payment sheet to open,
  // and the browser therefore cannot start the payment itself. Everything after it — the provider
  // confirming, and Vexto learning about it — is the real path either way.
  //
  // **A 409 here is success, not failure.** An invoice that already has an attempt against it —
  // typically one an earlier run started and abandoned — is refused a second one, which is the
  // server being right: two live intents for one invoice is how somebody gets charged twice. What
  // this helper wants is *that invoice settled at the provider*, and the existing attempt is the
  // thing to settle. It is read back below either way.
  const passengerToken = await signInForToken(accounts.passenger);

  const started = await fetch(
    `${apiUrl}/api/v1/passenger/me/invoices/${invoiceId}/payment-intent`,
    { method: 'POST', headers: { authorization: `Bearer ${passengerToken}` } },
  );

  if (!started.ok && started.status !== 409) {
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
