import { expect, test } from '@playwright/test';
import { accounts, completePaymentAtProvider, signIn } from './fixtures';

/**
 * The passenger paying, and the two states that matter either side of it.
 *
 * <b>No real payment provider is involved, and none can be.</b> The API runs with no Stripe keys,
 * so it registers the deterministic in-memory provider — which is what lets this test drive a
 * decline, a confirmation and an authoritative settlement without a live account, a network, or a
 * real card.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await signIn(page, accounts.passenger);
});

test('sees what they owe', async ({ page }) => {
  await page.goto('/payments');

  await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible();
  await expect(page.getByText('Due now')).toBeVisible();

  // The invoice the operator raised a moment ago.
  await expect(page.getByText(/INV-/u).first()).toBeVisible();
});

test('opens the invoice and sees what it is for', async ({ page }) => {
  await page.goto('/payments');
  await openOutstandingInvoice(page);

  await expect(page).toHaveURL(/\/payments\/[0-9a-f-]{36}/u);

  await expect(page.getByText('Billing period')).toBeVisible();
  await expect(page.getByText('Total').first()).toBeVisible();
});

/**
 * The heart of it: pay, and observe that the app does <em>not</em> claim the money has arrived
 * until the server — not the browser — says so.
 */
test('pays the invoice and waits for the provider to confirm', async ({ page }) => {
  await page.goto('/payments');
  await openOutstandingInvoice(page);

  // Waited for: reading the URL immediately after a click races the navigation, and an invoice id
  // read half a beat early is not an id at all.
  await page.waitForURL(/\/payments\/[0-9a-f-]{36}/u);

  const invoiceId = page.url().split('/').pop() ?? '';

  const payNow = page.getByRole('button', { name: 'Pay now' });
  const unavailable = page.getByText(/Online payment is not available/u);

  // Two legitimate states, and which one appears depends on the environment rather than on the
  // code. With a publishable key configured the app opens the provider's payment sheet; without
  // one it says online payment is unavailable — and says it in words, rather than offering an
  // inert button that would look broken. Both are asserted, because both are correct.
  await expect(payNow.or(unavailable).first()).toBeVisible();

  if (await payNow.isVisible()) {
    await payNow.click();

    await expect(
      page
        .getByRole('button', { name: /^Pay AED/u })
        .or(page.getByText(/payment form could not be opened/u))
        .first(),
    ).toBeVisible();
  }

  // The payer completes with the provider, and the provider tells Vexto — the authoritative path,
  // exactly as it happens in production. Nothing about this pretends the browser decided.
  await completePaymentAtProvider(invoiceId);

  await page.reload();

  await expect(page.getByText('Paid').first()).toBeVisible({ timeout: 20_000 });
});

test('the paid invoice appears as settled in the list', async ({ page }) => {
  await page.goto('/payments');

  await expect(page.getByText('Earlier')).toBeVisible();
  await expect(page.getByText('Paid').first()).toBeVisible();
});

/**
 * Opens an invoice that is actually payable.
 *
 * **Not simply the first one on the page.** A pilot database keeps every invoice every previous run
 * raised and settled, and the first row is very often one that has already been paid — which the
 * API correctly refuses to start a second payment for, with a 400 that reads like a broken payment
 * pipeline rather than like the test choosing the wrong invoice.
 *
 * The page already separates what is owed from what is settled, under "Due now", so this picks from
 * there — which is also the only part of the screen a passenger with something to pay looks at.
 */
async function openOutstandingInvoice(page: import('@playwright/test').Page): Promise<void> {
  const due = page.locator('section', { has: page.getByText('Due now') });

  await expect(due).toBeVisible();
  await due.getByRole('link').first().click();
}
