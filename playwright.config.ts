import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the Vexto pilot journey.
 *
 * The suite drives the three real apps against a real API — there are no mocks, because the thing
 * worth proving is that the operator, driver and passenger apps agree with the backend and with
 * each other. It therefore needs an API running at `VEXTO_API_URL` with a seeded tenant; see
 * docs/frontend-architecture.md for the accounts it expects.
 *
 * The dev servers are started by Playwright itself, so `npm run e2e` is the whole command.
 */
const OPERATOR_URL = process.env['VEXTO_OPERATOR_URL'] ?? 'http://localhost:4200';
const DRIVER_URL = process.env['VEXTO_DRIVER_URL'] ?? 'http://localhost:4201';
const PASSENGER_URL = process.env['VEXTO_PASSENGER_URL'] ?? 'http://localhost:4202';

export default defineConfig({
  testDir: './e2e',
  // The pilot journey is one story told across three apps: a passenger cannot be boarded before a
  // trip has been generated. Running it in parallel would be running it out of order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Ordered by `dependencies`, not by luck: the passenger cannot see a live bus before the driver
  // has started the trip, and the operator cannot verify attendance before it has been recorded.
  projects: [
    {
      name: 'operator-setup',
      testMatch: /operator.setup.spec.ts/u,
      use: { ...devices['Desktop Chrome'], baseURL: OPERATOR_URL },
    },
    {
      name: 'driver',
      testMatch: /driver.journey.spec.ts/u,
      dependencies: ['operator-setup'],
      // A driver works from a mounted tablet, and the layout is built for that viewport.
      use: { ...devices['iPad (gen 7) landscape'], baseURL: DRIVER_URL },
    },
    {
      name: 'passenger',
      testMatch: /passenger.journey.spec.ts/u,
      dependencies: ['driver'],
      use: { ...devices['Pixel 7'], baseURL: PASSENGER_URL },
    },
    {
      name: 'operator-verify',
      testMatch: /operator.verify.spec.ts/u,
      dependencies: ['passenger'],
      use: { ...devices['Desktop Chrome'], baseURL: OPERATOR_URL },
    },
    {
      name: 'driver-complete',
      testMatch: /driver.complete.spec.ts/u,
      dependencies: ['operator-verify'],
      use: { ...devices['iPad (gen 7) landscape'], baseURL: DRIVER_URL },
    },
  ],

  webServer: [
    {
      command: 'npm run start:operator',
      url: OPERATOR_URL,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
    {
      command: 'npm run start:driver',
      url: DRIVER_URL,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
    {
      command: 'npm run start:passenger',
      url: PASSENGER_URL,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
});
