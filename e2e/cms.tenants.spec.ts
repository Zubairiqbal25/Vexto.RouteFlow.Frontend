import { expect, test } from '@playwright/test';
import { canSignIn, enterCodeFromSink, latestOtp, runId, serviceAdmin, signIn } from './fixtures';

/**
 * The CMS tenant onboarding journey, end to end across two apps and two people.
 *
 * 1. The ServiceAdmin signs in to the CMS by email code, opens Tenants, and walks the wizard:
 *    business details, contact, settings, a plan, and a tenant-owner invitation.
 * 2. The tenant owner accepts the invitation and signs in to the operator portal by email code,
 *    lands in their own tenant, creates a record there, and is refused by the CMS.
 * 3. The ServiceAdmin returns to the CMS, opens the tenant, and switches into its support context.
 *
 * **No real mail is involved.** The Development API exposes the invitation link in the onboarding
 * response (`Invitations:ExposeAcceptUrlInResponse`, Development-only), which is the test-provider
 * equivalent of reading the invitation email; the sign-in codes come from the same Development
 * sink every other journey uses. Nothing here reaches SMTP.
 *
 * Skips rather than fails when the seeded ServiceAdmin cannot sign in, like the CMS journey.
 */
test.describe.configure({ mode: 'serial' });

const OPERATOR_URL = process.env['VEXTO_OPERATOR_URL'] ?? 'http://localhost:4200';
const CMS_URL = process.env['VEXTO_CMS_URL'] ?? 'http://localhost:4203';

const tenantName = `Vexto Test Transport ${runId}`;
const ownerEmail = process.env['VEXTO_E2E_TENANT_OWNER_EMAIL'] ?? `owner.cms.${runId}@vexto-pilot.test`;

let platformAvailable = false;
let tenantId = '';
let acceptUrl = '';

test.beforeAll(async () => {
  platformAvailable = await canSignIn(serviceAdmin.email);
});

test.beforeEach(async () => {
  test.skip(!platformAvailable, 'The seeded ServiceAdmin cannot sign in here; see docs/pilot-setup.md.');
});

test('the ServiceAdmin creates a tenant through the wizard, with settings, a plan and an owner invitation', async ({ page }) => {
  await signIn(page, serviceAdmin, CMS_URL);
  await page.goto(`${CMS_URL}/tenants`);

  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
  await page.getByTestId('create-tenant').click();
  await expect(page.getByText('Step 1 of 6')).toBeVisible();

  // Validation is shown, not silently swallowed.
  await page.getByTestId('wizard-continue').click();
  await expect(page.getByTestId('step-error')).toContainText('trading name');

  await page.locator('[name="name"]').fill(tenantName);
  await page.locator('[name="legalName"]').fill(`${tenantName} LLC`);
  await page.locator('[name="tradeLicenseNumber"]').fill(`TL-CMS-${runId}`);
  await page.locator('[name="tradeLicenseExpiryDate"]').fill('2031-06-30');
  await page.locator('[name="email"]').fill(`ops.cms.${runId}@vexto-pilot.test`);
  await page.locator('[name="phone"]').fill('+971500000000');
  await page.getByTestId('wizard-continue').click();

  await expect(page.getByText('Step 2 of 6')).toBeVisible();
  await page.locator('[name="city"]').fill('Dubai');
  await page.locator('[name="emirate"]').fill('Dubai');
  await page.locator('[name="primaryContactName"]').fill('Ahmed Khan');
  await page.getByTestId('wizard-continue').click();

  // Settings arrive from the server's defaults; the grace period is the one thing changed.
  await expect(page.getByText('Step 3 of 6')).toBeVisible();
  await expect(page.locator('[name="timeZone"]')).not.toHaveValue('');
  await page.locator('[name="gracePeriod"]').fill('14');
  await page.getByTestId('wizard-continue').click();

  await expect(page.getByText('Step 4 of 6')).toBeVisible();
  await page.getByTestId('plan-starter').click();
  await expect(page.getByTestId('plan-starter')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('wizard-continue').click();

  await expect(page.getByText('Step 5 of 6')).toBeVisible();
  await page.locator('[name="adminFirstName"]').fill('Pilot');
  await page.locator('[name="adminLastName"]').fill(`Owner ${runId}`);
  await page.locator('[name="adminEmail"]').fill(ownerEmail);
  await page.getByTestId('wizard-continue').click();

  await expect(page.getByText('Step 6 of 6')).toBeVisible();
  await expect(page.getByTestId('review')).toContainText(tenantName);
  await expect(page.getByTestId('review')).toContainText(ownerEmail);

  // The invitation link is read from the onboarding response — Development exposes it precisely
  // so a journey like this needs no mailbox. The response is the only place it appears.
  const onboarding = page.waitForResponse((response) => response.url().endsWith('/api/v1/platform/tenants/onboarding'));
  await page.getByTestId('wizard-submit').click();

  const body = (await (await onboarding).json()) as {
    tenant: { tenant: { id: string; status: string }; ownerInvitationAcceptUrl: string | null; ownerInvitationDelivery: string | null };
    subscriptionId: string | null;
  };

  tenantId = body.tenant.tenant.id;
  acceptUrl = body.tenant.ownerInvitationAcceptUrl ?? '';
  expect(tenantId).not.toBe('');
  expect(acceptUrl).toContain('token=');
  expect(body.subscriptionId).not.toBeNull();
  expect(body.tenant.tenant.status).toBe('Pending');

  await expect(page.getByTestId('onboarding-success')).toContainText(`${tenantName} has been created.`);
  await expect(page.getByTestId('onboarding-success')).toContainText(ownerEmail);
  await expect(page.getByTestId('invitation-delivery')).toHaveText(/Sent|Delivery failed/u);
});

test('the tenant appears in the list with its invitation pending, and can be activated', async ({ page }) => {
  await signIn(page, serviceAdmin, CMS_URL);
  await page.goto(`${CMS_URL}/tenants`);

  await page.getByRole('searchbox', { name: 'Search tenants' }).fill(runId);
  const card = page.locator('vexto-cms-tenant-card').filter({ hasText: tenantName });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Invitation pending');
  await expect(card).toContainText('Pending');

  await card.getByRole('button', { name: 'Open Tenant' }).click();
  await expect(page).toHaveURL(new RegExp(`/tenants/${tenantId}$`, 'u'));
  await expect(page.getByTestId('tenant-name')).toHaveText(tenantName);
  await expect(page.getByTestId('tenant-plan')).toBeVisible();
  await expect(page.getByTestId('readiness')).toContainText('Invitation pending');

  await page.getByRole('tab', { name: 'Administrators' }).click();
  await expect(page.getByTestId('administrator-list')).toContainText(ownerEmail);
  await expect(page.getByTestId('administrator-list')).toContainText('Invitation pending');

  // Activation is the ServiceAdmin's decision, and does not wait for the administrator.
  await page.getByTestId('activate-tenant').click();
  await expect(page.getByTestId('suspend-tenant')).toBeVisible();
});

test('the tenant owner accepts the invitation, signs in by email code, and works only in their tenant', async ({ page }) => {
  test.skip(!acceptUrl, 'The onboarding step did not run.');

  await page.goto(acceptUrl);
  await expect(page.getByRole('heading', { name: 'Activate your account' })).toBeVisible();
  await page.getByRole('button', { name: 'Activate Account' }).click();
  await expect(page.getByRole('heading', { name: 'Your account is active' })).toBeVisible();

  // Email, then the code — no password anywhere.
  await page.goto(`${OPERATOR_URL}/login`);
  await page.getByLabel('Email address').fill(ownerEmail);
  const previous = await latestOtp(ownerEmail);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await enterCodeFromSink(page, ownerEmail, previous);
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

  // Correct tenant context: their own operator's name, and no tenant selector to switch it.
  await expect(page.getByText(tenantName).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch tenant' })).toHaveCount(0);

  // A tenant owner can create tenant resources.
  await page.goto(`${OPERATOR_URL}/routes`);
  await expect(page.getByRole('heading', { name: 'Routes' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Route' }).first()).toBeVisible();

  // And cannot open the CMS: the guard sends them to access-denied.
  await page.goto(`${CMS_URL}/login`);
  await page.getByLabel('Email address').fill(ownerEmail);
  const before = await latestOtp(ownerEmail);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await enterCodeFromSink(page, ownerEmail, before);
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await expect(page).toHaveURL(/access-denied/u);
});

test('the ServiceAdmin returns to the CMS and switches into the tenant support context', async ({ page, context }) => {
  await signIn(page, serviceAdmin, CMS_URL);
  await page.goto(`${CMS_URL}/tenants/${tenantId}`);
  await expect(page.getByTestId('tenant-name')).toHaveText(tenantName);

  // The administrator is now active, so setup is complete.
  await expect(page.getByTestId('setup-percent')).toContainText('100%');

  const portalTab = context.waitForEvent('page');
  await page.getByTestId('open-operator-portal').click();
  const portal = await portalTab;

  // A different origin with no session: the operator portal asks for a sign-in and keeps the
  // support entry point as the return URL, so the code brings the ServiceAdmin straight back.
  await portal.waitForURL(/\/login\?returnUrl=/u);
  await portal.getByLabel('Email address').fill(serviceAdmin.email);
  const previous = await latestOtp(serviceAdmin.email);
  await portal.getByRole('button', { name: 'Continue' }).click();
  await expect(portal.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await enterCodeFromSink(portal, serviceAdmin.email, previous);

  await portal.waitForURL(/\/dashboard/u);
  await expect(portal.getByRole('status').filter({ hasText: 'Service admin support mode' })).toContainText(tenantName);
  await expect(portal.getByRole('button', { name: 'Exit tenant' })).toBeVisible();
});
