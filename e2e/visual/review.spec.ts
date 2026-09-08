import { expect, test } from '@playwright/test';
import { accounts, serviceAdmin } from '../fixtures';

/**
 * Screenshots of every major screen, in both themes, at the breakpoints each app is used at.
 *
 * Not an assertion suite: this exists so a person can look at the product without clicking through
 * it, and so a visual regression is visible in a diff rather than discovered by a customer. It is
 * kept out of `playwright.config.ts`'s default projects and run explicitly.
 *
 * Credentials come from the same environment variables as the pilot journey. No password is ever
 * written down here.
 */

const OPERATOR = process.env['VEXTO_OPERATOR_URL'] ?? 'http://localhost:4200';
const DRIVER = process.env['VEXTO_DRIVER_URL'] ?? 'http://localhost:4201';
const PASSENGER = process.env['VEXTO_PASSENGER_URL'] ?? 'http://localhost:4202';

const OUT = 'test-results/visual';

/** Stamps the theme the way ThemeService does, before the app boots. */
async function useTheme(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    localStorage.setItem('vexto.theme', value as string);
  }, theme);
}

async function signIn(
  page: import('@playwright/test').Page,
  baseUrl: string,
  account: { email: string; password: string },
) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 20_000 });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`platform · ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    // The platform surface needs Tenants.View, which only a ServiceAdmin holds.
    test.skip(!serviceAdmin.password, 'VEXTO_SERVICE_ADMIN_PASSWORD is not set.');

    test('overview, tenants and the onboarding wizard', async ({ page }) => {
      await useTheme(page, theme);
      await signIn(page, OPERATOR, serviceAdmin);

      await page.goto(`${OPERATOR}/platform`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/platform-overview-${theme}.png`, fullPage: true });

      await page.goto(`${OPERATOR}/platform/tenants`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/platform-tenants-${theme}.png`, fullPage: true });

      await page.goto(`${OPERATOR}/platform/tenants/new`);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/platform-wizard-1-${theme}.png`, fullPage: true });

      // Step through to Review, so the summary and the sticky footer are captured too.
      await page.getByLabel('Trading name').fill('Northern Star Transport');
      await page.getByLabel('Legal name').fill('Northern Star Passenger Transport LLC');
      await page.getByLabel('Trade licence number').fill('TL-VISUAL-001');
      await page.getByLabel('Business email').fill('ops@northernstar.example');

      for (let step = 0; step < 5; step += 1) {
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.waitForTimeout(350);
      }

      await page.screenshot({ path: `${OUT}/platform-wizard-review-${theme}.png`, fullPage: true });

      expect(true).toBe(true);
    });
  });

  test.describe(`operator · ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('dashboard, passengers and drivers', async ({ page }) => {
      await useTheme(page, theme);
      await signIn(page, OPERATOR, accounts.operator);

      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/operator-dashboard-${theme}.png`, fullPage: true });

      await page.goto(`${OPERATOR}/passengers`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/operator-passengers-${theme}.png`, fullPage: true });

      await page.goto(`${OPERATOR}/drivers`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/operator-drivers-${theme}.png`, fullPage: true });

      await page.goto(`${OPERATOR}/live-fleet`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/operator-live-fleet-${theme}.png`, fullPage: true });

      await page.goto(`${OPERATOR}/vehicles`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/operator-vehicles-${theme}.png`, fullPage: true });

      await page.goto(`${OPERATOR}/routes`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/operator-routes-${theme}.png`, fullPage: true });

      await page.goto(`${OPERATOR}/trips`);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/operator-trips-${theme}.png`, fullPage: true });

      // The quick-view drawer, opened from the board.
      const firstTripCard = page.locator('vexto-trip-card').first();

      if (await firstTripCard.count()) {
        await firstTripCard.click();
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${OUT}/operator-trip-drawer-${theme}.png` });
        await page.keyboard.press('Escape');
      }

      await page.goto(`${OPERATOR}/platform/tenants/new`);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/operator-tenant-wizard-${theme}.png`, fullPage: true });

      // The notification centre.
      await page.goto(`${OPERATOR}/dashboard`);
      await page.waitForTimeout(1200);
      const bell = page.getByRole('button', { name: /Notifications/u }).first();

      if (await bell.count()) {
        await bell.click();
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${OUT}/operator-notifications-${theme}.png` });
      }

      expect(true).toBe(true);
    });
  });

  test.describe(`driver · ${theme}`, () => {
    // Tablet landscape: the driver app's primary form factor.
    test.use({ viewport: { width: 1366, height: 1024 } });

    test('today and the active trip', async ({ page }) => {
      await useTheme(page, theme);
      await signIn(page, DRIVER, accounts.driver);

      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/driver-today-${theme}.png`, fullPage: true });

      const firstTrip = page.locator('a[href^="/trips/"]').first();

      if (await firstTrip.count()) {
        await firstTrip.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${OUT}/driver-trip-${theme}.png`, fullPage: true });
      }

      expect(true).toBe(true);
    });
  });

  test.describe(`passenger · ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('home and billing', async ({ page }) => {
      await useTheme(page, theme);
      await signIn(page, PASSENGER, accounts.passenger);

      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/passenger-home-${theme}.png`, fullPage: true });

      await page.goto(`${PASSENGER}/billing`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/passenger-billing-${theme}.png`, fullPage: true });

      expect(true).toBe(true);
    });
  });
}
