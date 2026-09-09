import { expect, test } from '@playwright/test';
import { accounts, signIn } from './fixtures';

/**
 * Light, dark, and the fact that the choice survives a reload.
 *
 * **Persistence is the part worth testing.** A toggle that works and then forgets is worse than no
 * toggle: somebody who chose dark because their depot office is dark gets a white flash on every
 * page load, and concludes the setting is broken. So this asserts the stored preference is honoured
 * on a fresh navigation, not merely that the class changes when the button is pressed.
 *
 * Colour itself is not asserted — that is what the visual review is for. What is asserted is the
 * one thing an automated check can be certain about: which theme the document says it is in.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await signIn(page, accounts.operator);
});

test('switches to dark and keeps it across a reload', async ({ page }) => {
  await page.goto('/');

  await chooseTheme(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // The whole point: a fresh document, not a re-render.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // And on a different screen, which is where a preference stored per-page would come apart.
  await page.goto('/routes');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('switches back to light and keeps that too', async ({ page }) => {
  await page.goto('/');

  await chooseTheme(page, 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

/**
 * Cycles the theme toggle until the requested preference is the active one.
 *
 * The toggle is one button that steps through light → dark → system, and its accessible name states
 * which is currently active ("Theme: dark. Switch to system."). Reading that name is what makes this
 * deterministic: clicking a fixed number of times would depend on which state the previous test left
 * behind, and `system` deliberately stamps no `data-theme` at all, so watching the attribute alone
 * cannot tell "not yet" from "stuck".
 */
async function chooseTheme(
  page: import('@playwright/test').Page,
  theme: 'light' | 'dark',
): Promise<void> {
  const toggle = page.getByRole('button', { name: /^Theme:/u }).first();

  await expect(toggle).toBeVisible();

  // Three presses is a full cycle, so any state is reachable from any other within it.
  for (let press = 0; press < 4; press += 1) {
    const label = (await toggle.getAttribute('aria-label')) ?? '';

    if (label.startsWith(`Theme: ${theme}.`)) {
      return;
    }

    await toggle.click();
  }

  throw new Error(`The theme toggle never reached ${theme}.`);
}
