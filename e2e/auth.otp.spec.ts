import { expect, test } from '@playwright/test';
import { accounts, canSignIn, enterCodeFromSink, latestOtp, serviceAdmin, signIn } from './fixtures';

/**
 * Passwordless sign-in, across the three apps and the four kinds of account.
 *
 * Runs first, because everything after it signs in through the same screen: if the code never
 * arrives or lands on the wrong page, every later failure would be a symptom of this one. Each
 * journey is the real thing — the email typed, the code read from the API's Development sink the
 * way a person reads it from their inbox, the digits typed into the boxes — and the assertion is
 * where the person ends up.
 */
const OPERATOR = process.env['VEXTO_OPERATOR_URL'] ?? 'http://localhost:4200';
const DRIVER = process.env['VEXTO_DRIVER_URL'] ?? 'http://localhost:4201';
const PASSENGER = process.env['VEXTO_PASSENGER_URL'] ?? 'http://localhost:4202';

/** Fills the first step; returns what the sink held beforehand, for enterCodeFromSink. */
async function requestCodeOnScreen(page: import('@playwright/test').Page, baseUrl: string, email: string) {
  await page.goto(`${baseUrl}/login`);

  // No password anywhere on the screen.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByText(/forgot/iu)).toHaveCount(0);

  await page.getByLabel('Email address').fill(email);

  const previous = await latestOtp(email);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  return previous;
}

async function typeCode(page: import('@playwright/test').Page, code: string) {
  await page.getByRole('textbox', { name: 'Digit 1 of 6' }).click();
  await page.keyboard.type(code);
}

test('the ServiceAdmin signs in by code and lands on the platform dashboard', async ({ page }) => {
  test.skip(!(await canSignIn(serviceAdmin.email)), 'The seeded ServiceAdmin cannot sign in here.');

  const previous = await requestCodeOnScreen(page, OPERATOR, serviceAdmin.email);

  // The address is shown masked, never in full.
  await expect(page.getByText('zu***@gmail.com')).toBeVisible();

  await enterCodeFromSink(page, serviceAdmin.email, previous);

  await page.waitForURL(/\/platform/u);
  await expect(page.getByText('Vexto platform')).toBeVisible();
});

test('a wrong code is refused and the boxes clear for another go', async ({ page }) => {
  const previous = await requestCodeOnScreen(page, OPERATOR, accounts.operator.email);

  await typeCode(page, previous === '000000' ? '111111' : '000000');

  await expect(page.getByRole('alert')).toContainText('not valid');
  await expect(page).toHaveURL(/\/login/u);

  // The right one still works: the wrong answer counted, it did not spend the code.
  await enterCodeFromSink(page, accounts.operator.email, previous);
  await page.waitForURL(/\/dashboard/u);
});

test('the TenantOwner signs in by code and lands on the operator dashboard', async ({ page }) => {
  await signIn(page, accounts.operator, OPERATOR);

  await expect(page).toHaveURL(/\/dashboard/u);
});

test('"use another email" returns to the first step without a reload', async ({ page }) => {
  await requestCodeOnScreen(page, OPERATOR, 'wrong.address@vexto-demo.test');

  await page.getByRole('button', { name: 'Use another email' }).click();

  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel('Email address')).toHaveValue('wrong.address@vexto-demo.test');
});

test.describe('driver', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

  test('the Driver signs in by code on the tablet app and lands on today\'s trips', async ({ page }) => {
    const previous = await requestCodeOnScreen(page, DRIVER, accounts.driver.email);

    // Tablet-sized boxes: the driver app asks for the large variant.
    await expect(page.locator('vx-otp-input.vx-otp-large')).toBeVisible();

    await enterCodeFromSink(page, accounts.driver.email, previous);

    await page.waitForURL(/\/trips/u);
  });
});

test.describe('passenger', () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test('the Passenger signs in by code on the phone app and lands on home', async ({ page }) => {
    const previous = await requestCodeOnScreen(page, PASSENGER, accounts.passenger.email);

    // The attributes that make a phone keyboard useful.
    const first = page.getByRole('textbox', { name: 'Digit 1 of 6' });
    await expect(first).toHaveAttribute('inputmode', 'numeric');
    await expect(first).toHaveAttribute('autocomplete', 'one-time-code');
    await expect(page.getByLabel('Email address')).toHaveCount(0);

    await enterCodeFromSink(page, accounts.passenger.email, previous);

    await page.waitForURL(/\/home/u);
  });
});
