import { expect, test } from '@playwright/test';
import {
  accounts,
  chooseFromPicker,
  isoDate,
  routeCode,
  runId,
  signIn,
  useTableView,
} from './fixtures';

/**
 * The operational depth this phase added, exercised on the seeded demo operator.
 *
 * Deliberately reads the *seeded* records rather than the ones the pilot journey creates. The demo
 * seed exists to put every major state on screen — a blocked passenger, a bus in the workshop, an
 * expired agreement, a route missing its schedule — and a suite that only ever looked at records it
 * had just created would never see any of them.
 *
 * Runs after the operator setup project so that this run's own trip exists, and before the driver
 * project so that the trip is still substitutable.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await signIn(page, accounts.operator);
});

test('the dashboard names what needs attention, and links to it', async ({ page }) => {
  await page.goto('/dashboard');

  const panel = page.locator('vx-section-card', { hasText: 'Needs attention' });
  await expect(panel).toBeVisible();

  // The seed puts a blocked passenger, a bus in the workshop and an expiring licence on the demo
  // operator, so the panel has something to say. The counts come from the server: nothing here is
  // aggregated in the browser.
  await expect(panel.getByText(/blocked from travel/u)).toBeVisible();
  await expect(panel.getByText(/in maintenance/u)).toBeVisible();

  // An item nobody can act on is a worry, not a task.
  const blocked = panel.getByRole('link').filter({ hasText: 'blocked from travel' });
  await expect(blocked).toHaveAttribute('href', /\/passengers/u);
});

test('dashboard captions never contradict the number above them', async ({ page }) => {
  await page.goto('/dashboard');

  const noShows = page.locator('vx-metric-card', { hasText: 'No-shows today' });
  await expect(noShows).toBeVisible();

  // The regression this exists for: "Nobody missed a pickup" printed under a no-show count of five.
  // The line describes declared absences, and now says so.
  await expect(noShows).not.toContainText('missed');
  await expect(noShows).toContainText(/absence/u);
});

test('a route that cannot run says what is missing, and a ready one says it is ready', async ({
  page,
}) => {
  await page.goto('/routes');

  // The seed leaves one route with stops and passengers but no schedule and no crew — the state the
  // readiness badge exists for, and one the pilot journey's own route never reaches.
  await page.getByLabel('Search routes').fill('JLT-MED-AM');
  const unready = page.locator('vexto-route-card').filter({ hasText: 'JLT-MED-AM' });

  await expect(unready).toBeVisible();
  await expect(unready).toContainText('Add the days and times');
  await expect(unready).not.toContainText('Ready to run');

  // And the route this run built is ready, which is the other half of the assertion: "Active" alone
  // was never the answer to "can this route run".
  await page.getByLabel('Search routes').fill(routeCode);
  await expect(page.locator('vexto-route-card').filter({ hasText: routeCode })).toContainText(
    'Ready to run',
  );
});

test('the trip manifest shows who may travel, and never what they owe', async ({ page }) => {
  await openSeededTrip(page);

  await expect(page.getByRole('heading', { name: 'Passenger manifest' })).toBeVisible();

  const manifest = page.locator('vexto-trip-manifest');

  // The fact the operator could not see before this phase: the block was real, it was having an
  // effect at the kerb, and the only screen that showed it was the one in the driver's cab.
  await expect(manifest.getByText('Blocked').first()).toBeVisible();

  // A trip manifest is an operational surface, read by every shift supervisor who opens a trip.
  await expect(manifest).not.toContainText('AED');
  await expect(manifest).not.toContainText(/invoice/iu);

  // Photos, where there are any. A flag rather than a URL, so a passenger without one gets initials.
  await expect(manifest.locator('vx-avatar img').first()).toBeVisible();
});

test('a manifest row opens a quick view', async ({ page }) => {
  await openSeededTrip(page);

  await page.locator('vexto-trip-manifest button[aria-label^="Open "]').first().click();

  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('On this trip')).toBeVisible();

  // Same privacy boundary as the row it came from.
  await expect(drawer).not.toContainText('AED');
});

test('the trip activity timeline shows what actually happened', async ({ page }) => {
  await openSeededTrip(page);

  const activity = page.locator('vx-section-card', { hasText: 'Activity' });
  await expect(activity).toBeVisible();

  // Every entry is a row the backend wrote at the moment it happened. Before the read model existed
  // this panel could not show a trip starting, a passenger boarding and a crew change on one
  // timeline, because two of the three had no timestamp anywhere in the API.
  await expect(activity.getByText('Trip generated')).toBeVisible();
  await expect(activity.getByText('Trip started')).toBeVisible();
  await expect(activity.getByText(/boarded/u).first()).toBeVisible();
});

test('an agreement carries its documents, and a new one can be uploaded and removed', async ({
  page,
}) => {
  await page.goto('/agreements');

  const card = page.locator('vexto-agreement-card').filter({ hasText: 'AGR-DEMO-0001' });
  await expect(card).toBeVisible();

  // The paperclip is honest: it appears because files are actually attached, and the count comes
  // from the server rather than from a guess. Matched loosely on purpose — this suite runs against a
  // pilot database that earlier runs have already uploaded to, and pinning the exact number would
  // make the test fail for a reason that has nothing to do with agreements.
  await expect(card).toContainText(/[0-9]+ documents/u);

  await page.getByLabel('Search agreements').fill('AGR-DEMO-0001');

  // Waited for, not assumed. The search box is debounced, so clicking straight after filling it
  // opens whichever card was already on screen — which is how this test first opened the draft
  // agreement and then reported that its documents were missing.
  await expect(page.locator('vexto-agreement-card')).toHaveCount(1);

  // A click opens the quick view — "which one is this", answered without losing the list — and the
  // drawer offers the way through to the page, where the documents are. The drawer is deliberately
  // not where a contract is uploaded and read: a 26rem panel is the wrong room for it.
  await page.locator('vexto-agreement-card').first().click();

  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('link', { name: 'Open agreement' }).click();

  await expect(page).toHaveURL(/\/agreements\/[0-9a-f-]{36}/u);

  await page.getByRole('tab', { name: 'Documents' }).click();

  const documents = page.locator('vexto-agreement-documents');
  await expect(documents.getByText('Signed transport agreement.pdf')).toBeVisible();
  await expect(documents.getByText('Trade licence 2026.pdf')).toBeVisible();

  // The storage path is never on screen: downloads go through an authorized endpoint.
  await expect(documents).not.toContainText('agreements/');

  // A genuine PDF, because the upload path decides the format from the file's own first bytes and
  // would reject a fake — which is the point of that check.
  //
  // Named for this run. A pilot database keeps what earlier runs uploaded, so "the file called
  // pilot-upload-something" is not this test's file, and asserting on the prefix reported a
  // deletion as failed when it had in fact worked.
  const fileName = `pilot-upload-${runId}-${Date.now()}.pdf`;

  await documents.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n', 'ascii'),
  });

  await expect(page.getByText('Document uploaded.')).toBeVisible();

  const uploaded = documents.locator('li').filter({ hasText: fileName });
  await expect(uploaded).toBeVisible();

  await uploaded.getByRole('button', { name: 'Delete' }).click();

  // Confirmed inside the dialog, not by "the last Delete button on the page" — that one is the row's
  // own, now behind the modal's overlay, and clicking it was never going to land.
  await page
    .getByRole('dialog', { name: 'Delete this document?' })
    .getByRole('button', { name: 'Delete' })
    .click();

  await expect(page.getByText('Document deleted.')).toBeVisible();
  await expect(documents.getByText(fileName)).toBeHidden();
});

test('an expired agreement reads as expired without anybody having expired it', async ({ page }) => {
  await page.goto('/agreements');
  await useTableView(page);
  await page.getByLabel('Search agreements').fill('AGR-DEMO-0002');

  // Derived from the end date on read, the same way an invoice becomes overdue: nothing writes it,
  // so there is no nightly job to be wrong between midnight and whenever it ran.
  await expect(page.locator('tbody tr').first()).toContainText('Expired');
});

test('a filter picker searches the server and can be cleared again', async ({ page }) => {
  await page.goto('/trips');

  // The filter is a type-ahead, not a dropdown of the first fifty. That the term reaches the server
  // is what makes a record past the cap reachable at all; the cap itself is proved against a
  // database with more than fifty rows in PickerBeyondFirstPageTests, where building one is cheap.
  //
  // 10003 rather than 10004: the seeded 10004 is in the workshop, and the vehicle picker offers
  // only vehicles in service — which is itself correct, and exactly what it should not offer.
  await chooseFromPicker(page, 'trip-filter-vehicle', '10003');

  // And it can be undone. Without a clear button the only way out of a filter is a page reload,
  // which loses everything else that was set.
  await page.locator('button[aria-label^="Clear"]').first().click();
  await expect(page.locator('#trip-filter-vehicle')).toHaveValue('');
});

/**
 * Opens the seeded morning trip that is under way.
 *
 * Deliberately the seed's own trip rather than this run's: the seed drives one through a real
 * morning — started, some boarded, one absent, one dropped off, one blocked — which is the manifest
 * and the timeline worth looking at. This run's trip has not been driven yet when this spec runs.
 */
async function openSeededTrip(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/trips');
  await useTableView(page);
  await page.getByLabel('Service date').fill(isoDate(0));
  await page.getByLabel('Search trips').fill('DSO-BB-AM');

  // Waited for, not assumed. The search box is debounced, and by now a pilot database has several
  // started trips from earlier runs — so clicking "the first started row" straight after typing
  // opens whichever one was already listed, and every assertion afterwards describes the wrong bus.
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('tbody tr').first().click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}/u);
}
