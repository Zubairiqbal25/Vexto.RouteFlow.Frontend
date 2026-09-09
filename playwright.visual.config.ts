import { defineConfig } from '@playwright/test';

/**
 * The visual review run, kept out of the pilot journey's config on purpose.
 *
 * `playwright.config.ts` describes one story told across three apps, ordered by project
 * dependencies. This is not that: it signs in, screenshots every major screen in both themes, and
 * asserts nothing about the journey. Mixing the two would make the pilot suite's ordering
 * meaningless and its failures harder to read.
 *
 *   npx playwright test --config playwright.visual.config.ts
 *
 * It starts the three dev servers itself, reusing any that are already up, so `npm run e2e:visual`
 * is the whole command once the API is running. It used to assume they were there and failed with
 * ERR_CONNECTION_REFUSED — an error that reads like a broken app rather than a missing prerequisite.
 *
 * Needs an API with demo data. Credentials come from the same environment variables as the pilot
 * journey; no password is written down here.
 */
export default defineConfig({
  testDir: './e2e/visual',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    ignoreHTTPSErrors: true,
    // A screenshot of a half-loaded page is worse than no screenshot.
    actionTimeout: 20_000,
  },

  webServer: [
    {
      command: 'npm run start:operator',
      url: process.env['VEXTO_OPERATOR_URL'] ?? 'http://localhost:4200',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'npm run start:driver',
      url: process.env['VEXTO_DRIVER_URL'] ?? 'http://localhost:4201',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'npm run start:passenger',
      url: process.env['VEXTO_PASSENGER_URL'] ?? 'http://localhost:4202',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
