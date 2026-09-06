import type { Page } from '@playwright/test';

/**
 * The accounts and data the pilot journey uses.
 *
 * Everything comes from environment variables with development defaults, because a suite that
 * hardcodes credentials is a suite that eventually hardcodes real ones.
 */
export const accounts = {
  operator: {
    email: process.env['VEXTO_OPERATOR_EMAIL'] ?? 'dispatcher@vexto.local',
    password: process.env['VEXTO_OPERATOR_PASSWORD'] ?? '',
  },
  driver: {
    email: process.env['VEXTO_DRIVER_EMAIL'] ?? 'driver@vexto.local',
    password: process.env['VEXTO_DRIVER_PASSWORD'] ?? '',
  },
  passenger: {
    email: process.env['VEXTO_PASSENGER_EMAIL'] ?? 'passenger@vexto.local',
    password: process.env['VEXTO_PASSENGER_PASSWORD'] ?? '',
  },
};

/** A run-scoped suffix so a re-run does not collide with the records the last one created. */
export const runId = process.env['VEXTO_RUN_ID'] ?? String(Date.now()).slice(-6);

export async function signIn(
  page: Page,
  account: { email: string; password: string },
): Promise<void> {
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
