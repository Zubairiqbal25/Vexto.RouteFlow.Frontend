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

/**
 * The suffix that makes this run's records its own, fixed here rather than in the fixtures.
 *
 * Playwright runs each project in its own worker process, and a value derived from the clock in a
 * module the workers import is therefore a *different* value in each of them: the operator project
 * would create route E2E-950771 and the driver project would then look for E2E-128742 and find
 * nothing. This file is loaded once, in the parent process, and workers inherit its environment —
 * so setting it here is what makes one run one story.
 */
process.env['VEXTO_RUN_ID'] ??= String(Date.now()).slice(-6);

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
      name: 'platform',
      testMatch: /platform.setup.spec.ts/u,
      use: { ...devices['Desktop Chrome'], baseURL: OPERATOR_URL },
    },
    {
      name: 'operator-setup',
      dependencies: ['platform'],
      testMatch: /operator.setup.spec.ts/u,
      use: { ...devices['Desktop Chrome'], baseURL: OPERATOR_URL },
    },
    // The operational depth added in the pilot-completion phase: agreements and their documents,
    // route readiness, the trip activity timeline, the enriched manifest and the attention panel.
    // Between setup and the driver because it reads a trip that has not been driven yet, and
    // because it leaves this run's trip exactly as it found it.
    {
      name: 'operator-depth',
      dependencies: ['operator-setup'],
      testMatch: /operator.depth.spec.ts/u,
      use: { ...devices['Desktop Chrome'], baseURL: OPERATOR_URL },
    },
    {
      name: 'driver',
      testMatch: /driver.journey.spec.ts/u,
      dependencies: ['operator-depth'],
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
      name: 'live-fleet',
      testMatch: /live-fleet.spec.ts/u,
      dependencies: ['passenger'],
      use: { ...devices['Desktop Chrome'], baseURL: OPERATOR_URL },
    },
    {
      name: 'operator-verify',
      testMatch: /operator.verify.spec.ts/u,
      dependencies: ['live-fleet'],
      use: { ...devices['Desktop Chrome'], baseURL: OPERATOR_URL },
    },
    {
      name: 'driver-complete',
      testMatch: /driver.complete.spec.ts/u,
      dependencies: ['operator-verify'],
      use: { ...devices['iPad (gen 7) landscape'], baseURL: DRIVER_URL },
    },

    // The money half of the pilot, after the transport half. It runs against the same seeded
    // passenger, so the invoice the passenger app pays is one this run raised.
    {
      name: 'billing-operator',
      testMatch: /billing.operator.spec.ts/u,
      dependencies: ['driver-complete'],
      use: { ...devices['Desktop Chrome'], baseURL: OPERATOR_URL },
    },
    {
      name: 'billing-passenger',
      testMatch: /billing.passenger.spec.ts/u,
      dependencies: ['billing-operator'],
      use: { ...devices['Pixel 7'], baseURL: PASSENGER_URL },
    },
    {
      name: 'billing-reconcile',
      testMatch: /billing.reconcile.spec.ts/u,
      dependencies: ['billing-passenger'],
      use: { ...devices['Desktop Chrome'], baseURL: OPERATOR_URL },
    },
    {
      name: 'theme',
      testMatch: /theme.spec.ts/u,
      dependencies: ['billing-reconcile'],
      use: { ...devices['Desktop Chrome'], baseURL: OPERATOR_URL },
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
