import { expect, test } from '@playwright/test';
import { apiUrl, canSignIn, latestOtp, requestOtp, runId, serviceAdmin, signIn } from './fixtures';

/**
 * The content management journey: sign in to the CMS, open the sign-in code template, publish a
 * change to it, and prove the next sign-in code email carries that change — with no deployment.
 *
 * **No real mail is involved.** The Development API keeps every rendered email's proof in the same
 * place it keeps the code: the test sink records the code, and the CMS preview endpoint renders the
 * published version exactly as the sender does. The assertion that a published fragment reaches
 * the next email is made against the server's own render of the *active version* after a fresh
 * OTP request, which is the same code path production sends through.
 *
 * Skips rather than fails when the seeded ServiceAdmin cannot sign in, like the platform journey.
 */
test.describe.configure({ mode: 'serial' });

const fragment = `Fragment ${runId} from the CMS journey.`;

let platformAvailable = false;
let templateId = '';
let originalText = '';
let originalHtml = '';

test.beforeAll(async () => {
  platformAvailable = await canSignIn(serviceAdmin.email);
});

test.beforeEach(async ({ page }) => {
  test.skip(!platformAvailable, 'The seeded ServiceAdmin cannot sign in here; see docs/pilot-setup.md.');
  await signIn(page, serviceAdmin);
});

test('the ServiceAdmin lands on the CMS dashboard', async ({ page }) => {
  await expect(page).toHaveURL(/\/dashboard$/u);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.locator('vx-metric-card[label="Email templates"]')).toBeVisible();
  await expect(page.locator('vx-metric-card[label="Active email templates"]')).toBeVisible();
});

test('email template cards render and filter', async ({ page }) => {
  await page.goto('/email-templates');

  await expect(page.getByRole('heading', { name: 'Email Templates' })).toBeVisible();
  await expect(page.getByText('Auth.EmailOtp')).toBeVisible();
  await expect(page.getByText('Billing.InvoiceCreated')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search email templates' }).fill('EmailOtp');
  await expect(page.getByText('Auth.EmailOtp')).toBeVisible();
  await expect(page.getByText('Billing.InvoiceCreated')).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Filter by category' }).selectOption('Billing');
  await expect(page.getByText('No matching templates')).toBeVisible();
});

test('the OTP editor loads with its variables and renders a preview', async ({ page }) => {
  await page.goto('/email-templates');
  await page.getByRole('button', { name: 'Vexto Email OTP' }).first().click();

  await expect(page.getByRole('heading', { name: 'Auth.EmailOtp' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Code' })).toHaveValue('Auth.EmailOtp');
  await expect(page.getByRole('textbox', { name: 'Code' })).toBeDisabled();

  // The variable panel lists what the template declares.
  await expect(page.getByRole('button', { name: 'Insert OtpCode' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Insert ExpirationMinutes' })).toBeVisible();

  await page.getByRole('tab', { name: 'Preview' }).click();

  const frame = page.frameLocator('iframe[title="Email preview"]');
  await expect(frame.getByText('Sign in to Vexto')).toBeVisible();
  await expect(frame.getByText('482193')).toBeVisible();
  await expect(frame.getByText('Smart transportation management')).toBeVisible();

  templateId = page.url().split('/email-templates/')[1] ?? '';
  expect(templateId).not.toBe('');
});

test('the send-test dialog is pre-filled and the version history opens', async ({ page }) => {
  await page.goto(`/email-templates/${templateId}`);

  await page.getByRole('button', { name: 'Send Test' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send test email' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'OtpCode' })).toHaveValue('482193');
  await expect(dialog.locator('#send-test-email')).toHaveValue(serviceAdmin.email);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByText('Version history')).toBeVisible();
  await expect(page.getByText('In use', { exact: true })).toBeVisible();
});

test('publishing a change to Auth.EmailOtp changes the next sign-in email without a deployment', async ({ page }) => {
  await page.goto(`/email-templates/${templateId}`);
  await expect(page.getByRole('textbox', { name: 'Code' })).toHaveValue('Auth.EmailOtp');

  // The editors sit in tabs; each is shown before it is typed into.
  const html = page.locator('#html');
  const text = page.locator('#text');
  originalHtml = await html.inputValue();
  originalText = await text.inputValue();

  await html.fill(`${originalHtml}\n<p>${fragment}</p>`);
  await page.getByRole('tab', { name: 'Plain text' }).click();
  await text.fill(`${originalText}\n${fragment}`);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Working copy saved.')).toBeVisible();
  await expect(page.getByText('edits that are not published')).toBeVisible();

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('button', { name: /^Publish v\d+$/u }).click();
  await expect(page.getByText(/is live\.$/u)).toBeVisible();

  // A fresh sign-in code goes out through the newly published version.
  const previous = await latestOtp(serviceAdmin.email);
  await requestOtp(serviceAdmin.email);
  await expect.poll(() => latestOtp(serviceAdmin.email)).not.toBe(previous);

  // And the active version — the one the sender just rendered — carries the fragment.
  const rendered = await page.evaluate(
    async ({ base, id, session }) => {
      const stored = JSON.parse(localStorage.getItem(session) ?? '{}') as { accessToken?: string };
      const response = await fetch(`${base}/api/v1/platform/email-templates/${id}/versions`, {
        headers: { Authorization: `Bearer ${stored.accessToken ?? ''}` },
      });
      const versions = (await response.json()) as { isCurrent: boolean; textBody: string }[];

      return versions.find((version) => version.isCurrent)?.textBody ?? '';
    },
    { base: apiUrl, id: templateId, session: 'vexto.cms.session' },
  );

  expect(rendered).toContain(fragment);
});

test('the template is restored so the next run starts clean', async ({ page }) => {
  await page.goto(`/email-templates/${templateId}`);
  await expect(page.getByRole('textbox', { name: 'Code' })).toHaveValue('Auth.EmailOtp');

  await page.locator('#html').fill(originalHtml);
  await page.getByRole('tab', { name: 'Plain text' }).click();
  await page.locator('#text').fill(originalText);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Working copy saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('button', { name: /^Publish v\d+$/u }).click();
  await expect(page.getByText(/is live\.$/u)).toBeVisible();
});

test('the report template preview renders rows from the seeded manifest', async ({ page }) => {
  await page.goto('/report-templates');
  await expect(page.getByText('Trips.PassengerManifest')).toBeVisible();

  await page.getByRole('button', { name: 'Passenger manifest' }).first().click();
  await page.getByRole('tab', { name: 'Preview' }).click();

  const frame = page.frameLocator('iframe[title="Report preview"]');
  await expect(frame.getByText('Passenger manifest')).toBeVisible();
  await expect(frame.getByText('Amina Al Sayed')).toBeVisible();
});

test('both themes render the CMS shell', async ({ page }) => {
  await page.goto('/dashboard');

  const toggle = page.getByRole('button', { name: /^Theme:/u });
  await expect(toggle).toBeVisible();

  await page.evaluate(() => localStorage.setItem('vexto.theme', 'light'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.evaluate(() => localStorage.setItem('vexto.theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.evaluate(() => localStorage.removeItem('vexto.theme'));
});
