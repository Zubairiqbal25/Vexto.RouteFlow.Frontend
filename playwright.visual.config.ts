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
 * Needs the three dev servers and an API with demo data. Credentials come from the same environment
 * variables as the pilot journey; no password is written down here.
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
});
