import { expect, test } from '@playwright/test';
import { demoTenantName, runId, serviceAdmin, signIn } from './fixtures';

/**
 * Vexto's own half of the pilot: onboarding an operator, inviting its owner, and stepping into its
 * support context.
 *
 * Deliberately separate from the tenant journey, because the account it uses is a genuinely
 * different kind of thing. A `ServiceAdmin` holds no tenant membership and no tenant claim; it
 * reaches an operator's data only by explicitly entering that operator's support context, through
 * the one audited door the backend provides. That door is the only client-supplied input in Vexto
 * that can influence which tenant's records are served, which is exactly why it is worth an E2E
 * test rather than a unit test alone.
 *
 * The whole spec skips rather than fails when no ServiceAdmin password is configured: the pilot
 * journey does not need one, and a machine set up only for the tenant story should not go red here.
 */
test.describe.configure({ mode: 'serial' });

const tenantName = `Pilot Operator ${runId}`;
const ownerEmail = `owner.${runId}@vexto-pilot.test`;

test.skip(
  () => serviceAdmin.password.length === 0,
  'Set VEXTO_SERVICE_ADMIN_PASSWORD to run the platform journey.',
);

test.beforeEach(async ({ page }) => {
  await signIn(page, serviceAdmin);
});

/**
 * Where Vexto staff land.
 *
 * About *operators*, not about their passengers: aggregating every tenant's operational data onto
 * one screen would mean a cross-tenant read of exactly the records tenant isolation exists to keep
 * apart, for a number nobody at Vexto acts on.
 */
test('shows the platform overview', async ({ page }) => {
  await page.goto('/platform');

  await expect(page.getByText('Vexto platform')).toBeVisible();
  await expect(page.locator('vx-metric-card', { hasText: 'Operators' })).toBeVisible();
});

/**
 * Tenant cards say what is actually true about each operator.
 *
 * **Named conditions, never a score.** A "health: 72%" cannot be argued with and cannot be acted
 * on; "trade licence expires on 3 March" names the thing and names the fix. The seed puts one
 * suspended operator and one that was created and never activated on the platform list, so both
 * ends of the range are on screen — an operator with nothing wrong shows no indicators at all,
 * because a card listing green ticks makes the one card that matters no louder than the rest.
 */
test('tenant cards carry deterministic health indicators', async ({ page }) => {
  await page.goto('/platform/tenants');

  const suspended = page.locator('vexto-tenant-card').filter({ hasText: 'Vexto Demo Coaches' });
  await expect(suspended).toBeVisible();
  await expect(suspended).toContainText('Suspended');
  await expect(suspended).toContainText('nobody can sign in');

  const pending = page.locator('vexto-tenant-card').filter({ hasText: 'Vexto Demo Shuttle' });
  await expect(pending).toBeVisible();
  await expect(pending).toContainText('never activated');
  await expect(pending).toContainText('Trade licence expires');

  // And the healthy operator says nothing, which is the other half of the rule.
  const healthy = page.locator('vexto-tenant-card').filter({ hasText: demoTenantName });
  await expect(healthy).toBeVisible();
  await expect(healthy).not.toContainText('Trade licence expired');
  await expect(healthy).not.toContainText('never activated');
});

/**
 * The onboarding wizard, end to end, including the owner invitation.
 *
 * The owner is invited rather than given a password an administrator chose: the invitation token is
 * stored hashed exactly like a refresh token, and nobody but the new owner ever knows their
 * password. Filling the owner step is therefore part of proving onboarding works, not an extra.
 */
test('creates a tenant and invites its owner', async ({ page }) => {
  await page.goto('/platform/tenants/new');

  await expect(page.getByText('Step 1 of')).toBeVisible();

  await page.getByLabel('Trading name').fill(tenantName);
  await page.getByLabel('Legal name').fill(`${tenantName} LLC`);
  await page.getByLabel('Trade licence number').fill(`TL-E2E-${runId}`);
  await page.getByLabel('Business email').fill(`ops.${runId}@vexto-pilot.test`);

  // Walk to the review step, filling the owner in on whichever step asks for it. The middle steps
  // are optional by design — an address and a contact are things an operator fills in later — so
  // this walks by the step counter rather than asserting a fixed number of them, which would break
  // the day one is added.
  //
  // The counter is also what makes each step transition observable: `isVisible()` does not
  // auto-wait, so checking for the final button straight after a click asks Angular a question
  // before it has re-rendered, and the walk then falls off the end of the wizard.
  const steps = Number(
    (await page.getByText(/Step \d+ of \d+/u).innerText()).match(/of (\d+)/u)?.[1] ?? '6',
  );

  for (let step = 1; step < steps; step += 1) {
    // Identified by the step's own heading rather than by a field label: "Email" appears on the
    // Contact step too, and filling the owner's address into Vexto's contact record would create a
    // tenant that looks right and invites nobody.
    const onOwnerStep = await page
      .getByRole('heading', { name: 'Owner', exact: true })
      .isVisible()
      .catch(() => false);

    if (onOwnerStep) {
      await page.getByLabel('First name').fill('Pilot');
      await page.getByLabel('Last name').fill(`Owner ${runId}`);
      await page.getByLabel('Email').fill(ownerEmail);
    }

    await page.getByRole('button', { name: 'Continue' }).click();

    // Wait for the step actually to advance before looking at the next one.
    await expect(page.getByText(`Step ${step + 1} of ${steps}`)).toBeVisible();
  }

  await page.getByRole('button', { name: 'Create tenant' }).click();

  // Onboarding ends on its own screen rather than a toast, and the screen names the operator that
  // now exists. That is what proves a tenant was created, rather than that a form submitted.
  await expect(page.getByRole('heading', { name: new RegExp(`${runId}.*is on the platform`, 'u') }))
    .toBeVisible({ timeout: 30_000 });
});

test('finds the new operator in the tenant list', async ({ page }) => {
  await page.goto('/platform/tenants');
  await page.getByLabel(/Search/iu).first().fill(runId);

  await expect(page.getByText(tenantName).first()).toBeVisible();
});

/**
 * Entering an operator's support context.
 *
 * The privilege comes from the signed token and never from the header — a caller who is not a
 * ServiceAdmin is refused with 403 rather than silently ignored, even when the value matches their
 * own tenant. What this asserts is the visible consequence: once a context is chosen, the ordinary
 * tenant screens serve that operator's records to an account that holds no membership in it.
 *
 * The demo operator is chosen rather than the one just created, because a brand-new tenant would
 * prove the switch happened and then show nothing.
 */
test('enters a tenant support context', async ({ page }) => {
  await page.goto('/platform');

  await page.getByRole('button', { name: 'Switch tenant' }).click();

  const listbox = page.getByRole('listbox', { name: 'Tenants' });
  await expect(listbox).toBeVisible();

  await listbox.getByRole('searchbox').or(page.getByLabel('Search tenants')).fill(demoTenantName);
  await listbox.getByRole('option', { name: new RegExp(demoTenantName, 'iu') }).first().click();

  // Tenant screens now answer for that operator rather than refusing for want of a tenant.
  await page.goto('/routes');
  await expect(page.getByRole('heading', { name: 'Routes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Route' }).first()).toBeVisible();
});
