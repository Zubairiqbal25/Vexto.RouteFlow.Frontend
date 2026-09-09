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

/**
 * Where the screenshots land — deliberately *outside* `test-results/`.
 *
 * Playwright empties its output directory at the start of every run, so a visual review written
 * into `test-results/` was deleted the next time anybody ran the pilot journey. The screenshots are
 * the deliverable of this suite; they have to outlive the next unrelated run.
 */
const OUT = 'visual-review';

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

      // The route workspace, which is where a planner spends their day. Every tab is captured,
      // because each one was rebuilt and a screenshot of the overview alone would prove nothing
      // about the timeline or the passenger cards.
      await page.goto(`${OPERATOR}/routes`);
      await page.waitForTimeout(1500);

      const firstRoute = page.locator('vexto-route-card, tbody tr').first();

      if (await firstRoute.count()) {
        await firstRoute.click();
        await page.waitForURL(/\/routes\/[0-9a-f-]{36}/u, { timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${OUT}/operator-route-overview-${theme}.png`, fullPage: true });

        for (const [tab, name] of [
          [/Stops & map/u, 'route-stops'],
          [/Passengers/u, 'route-passengers'],
          ['Driver & vehicle', 'route-crew'],
          [/Schedule/u, 'route-schedule'],
          [/Trips/u, 'route-trips'],
        ] as const) {
          const control = page.getByRole('tab', { name: tab });

          if (await control.count()) {
            await control.click();
            await page.waitForTimeout(1500);
            await page.screenshot({ path: `${OUT}/operator-${name}-${theme}.png`, fullPage: true });
          }
        }

        // The one width the phase named explicitly: the route workspace has to stay usable on a
        // 1024-wide laptop, where the timeline and the map stack rather than sitting side by side.
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.getByRole('tab', { name: /Stops & map/u }).click().catch(() => undefined);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${OUT}/operator-route-1024-${theme}.png`, fullPage: true });
        await page.setViewportSize({ width: 1440, height: 900 });
      }

      // The trip workspace. Its layout follows the trip's state, so whichever trip is topmost is
      // worth capturing — a running one leads with the map, a finished one with what happened.
      await page.goto(`${OPERATOR}/trips`);
      await page.waitForTimeout(1500);

      // A trip card opens the quick-view drawer rather than the page — the drawer answers "what is
      // this trip", the page answers "let me work on it". So the way in is the drawer's own button,
      // which is also how a dispatcher actually gets there.
      const openTrip = page.locator('vexto-trip-card, tbody tr').first();

      if (await openTrip.count()) {
        await openTrip.click();
        await page.waitForTimeout(700);

        const openFull = page.getByRole('button', { name: 'Open full trip' });

        if (await openFull.count()) {
          await openFull.click();
        }

        if (await page.waitForURL(/\/trips\/[0-9a-f-]{36}/u, { timeout: 10_000 }).then(
          () => true,
          () => false,
        )) {
          await page.waitForTimeout(2500);
          await page.screenshot({ path: `${OUT}/operator-trip-detail-${theme}.png`, fullPage: true });

          await page.setViewportSize({ width: 1024, height: 768 });
          await page.waitForTimeout(1200);
          await page.screenshot({ path: `${OUT}/operator-trip-1024-${theme}.png`, fullPage: true });
          await page.setViewportSize({ width: 1440, height: 900 });
        }
      }

      // Agreements, now cards rather than a table.
      await page.goto(`${OPERATOR}/agreements`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/operator-agreements-${theme}.png`, fullPage: true });

      // The vehicle quick-view drawer, which was the last deferred one.
      await page.goto(`${OPERATOR}/vehicles`);
      await page.waitForTimeout(1500);

      const firstVehicle = page.locator('vexto-vehicle-card').first();

      if (await firstVehicle.count()) {
        await firstVehicle.click();
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${OUT}/operator-vehicle-drawer-${theme}.png` });
        await page.keyboard.press('Escape');
      }

      // The command palette, with its recent pages and permitted quick actions.
      await page.goto(`${OPERATOR}/dashboard`);
      await page.waitForTimeout(1200);
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/operator-command-palette-${theme}.png` });
      await page.keyboard.press('Escape');

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

  /**
   * The surfaces the pilot-completion phase added or rebuilt.
   *
   * Element screenshots rather than full pages: the thing to look at is the manifest row, the
   * timeline entry and the picker's open menu, and a full-page capture of a 1440-wide dashboard
   * shrinks each of them to a few pixels in a review.
   *
   * Reads the seeded demo operator on purpose — it is the only data with a blocked passenger, an
   * expired agreement and a route missing its schedule on it, which is most of what is worth
   * looking at.
   */
  test.describe(`operator depth · ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('attention, readiness, manifest, timeline, documents and pickers', async ({ page }) => {
      await useTheme(page, theme);
      await signIn(page, OPERATOR, accounts.operator);

      // The attention panel: what needs somebody to do something today.
      await page.goto(`${OPERATOR}/dashboard`);
      await page.waitForTimeout(2000);

      const attention = page.locator('vx-section-card', { hasText: 'Needs attention' });

      if (await attention.count()) {
        await attention.screenshot({ path: `${OUT}/operator-attention-${theme}.png` });
      }

      // Route readiness, on a route that is not ready and on one that is.
      await page.goto(`${OPERATOR}/routes`);
      await page.waitForTimeout(1500);
      await page.getByLabel('Search routes').fill('JLT-MED-AM');
      await page.waitForTimeout(1200);

      const unready = page.locator('vexto-route-card').first();

      if (await unready.count()) {
        await unready.screenshot({ path: `${OUT}/operator-route-readiness-${theme}.png` });
      }

      // The seeded morning trip, which has been driven far enough to have a manifest and a timeline
      // worth reading.
      await page.goto(`${OPERATOR}/trips`);
      await page.waitForTimeout(1500);
      await page.locator('button[title="Table view"]').click().catch(() => undefined);
      await page.getByLabel('Search trips').fill('DSO-BB-AM');
      await page.waitForTimeout(1500);

      // The started one specifically. A route runs on several days at once, and the topmost row is
      // whichever sorts first — a scheduled or cancelled trip whose manifest has nothing to show.
      const row = page.locator('tbody tr').filter({ hasText: 'Started' }).first();

      if (await row.count()) {
        await row.click();
        await page.waitForURL(/\/trips\/[0-9a-f-]{36}/u, { timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(2500);

        const manifest = page.locator('vexto-trip-manifest');

        if (await manifest.count()) {
          await manifest.screenshot({ path: `${OUT}/operator-manifest-${theme}.png` });
        }

        const timeline = page.locator('vx-section-card', { hasText: 'Activity' });

        if (await timeline.count()) {
          await timeline.screenshot({ path: `${OUT}/operator-trip-activity-${theme}.png` });
        }

        // The quick view of one manifest row.
        const openRow = page.locator('vexto-trip-manifest button[aria-label^="Open "]').first();

        if (await openRow.count()) {
          await openRow.click();
          await page.waitForTimeout(800);
          await page.screenshot({ path: `${OUT}/operator-manifest-drawer-${theme}.png` });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
        }

      }

      // The assignment drawer, with a picker open — the two things this phase changed about
      // choosing a driver. On a *scheduled* trip, because substituting a crew is only offered
      // before the journey runs: a started trip's driver is a record of who is actually at the
      // wheel, and correcting that is a different operation with different rules.
      await page.goto(`${OPERATOR}/trips`);
      await page.waitForTimeout(1500);
      await page.getByLabel('Search trips').fill('DSO-BB-AM');
      await page.waitForTimeout(1500);

      const scheduled = page.locator('tbody tr').filter({ hasText: 'Scheduled' }).first();

      if (await scheduled.count()) {
        await scheduled.click();
        await page.waitForURL(/\/trips\/[0-9a-f-]{36}/u, { timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(2000);

        const changeCrew = page.getByRole('button', { name: 'Change driver / vehicle' });

        if (await changeCrew.count()) {
          await changeCrew.click();
          await page.waitForTimeout(800);
          await page.screenshot({ path: `${OUT}/operator-assignment-drawer-${theme}.png` });

          await page.locator('#crew-driver').click();
          await page.waitForTimeout(1500);
          await page.screenshot({ path: `${OUT}/operator-picker-open-${theme}.png` });
          await page.keyboard.press('Escape');
          await page.keyboard.press('Escape');
        }
      }

      // Agreement cards, and the documents behind one of them.
      await page.goto(`${OPERATOR}/agreements`);
      await page.waitForTimeout(1500);
      await page.getByLabel('Search agreements').fill('AGR-DEMO-0001');
      await page.waitForTimeout(1500);

      const agreement = page.locator('vexto-agreement-card').first();

      if (await agreement.count()) {
        await agreement.screenshot({ path: `${OUT}/operator-agreement-card-${theme}.png` });
        await agreement.click();
        await page.waitForTimeout(800);

        const openAgreement = page.getByRole('link', { name: 'Open agreement' }).first();

        if (await openAgreement.count()) {
          await openAgreement.click();
          await page.waitForURL(/\/agreements\/[0-9a-f-]{36}/u, { timeout: 15_000 })
            .catch(() => undefined);
          await page.waitForTimeout(1500);

          await page.getByRole('tab', { name: 'Documents' }).click().catch(() => undefined);
          await page.waitForTimeout(1200);
          await page.screenshot({
            path: `${OUT}/operator-agreement-documents-${theme}.png`,
            fullPage: true,
          });
        }
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

      await page.goto(`${PASSENGER}/payments`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/passenger-billing-${theme}.png`, fullPage: true });

      expect(true).toBe(true);
    });
  });
}
