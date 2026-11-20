import type { Frame, Locator, Page } from '@playwright/test';

/**
 * Selects an inspector view the way a reader does: clicks its tab when the bar
 * shows it, otherwise opens More and chooses it from the menu.
 *
 * @param scope - The page, frame or the visible workbench shell.
 * @param name - The exact view name, such as `JSON` or `Schema`.
 */
export async function selectInspectorTab(
  scope: Page | Frame | Locator,
  name: string,
): Promise<void> {
  const tab = scope
    .getByRole('tablist', { name: 'Inspector views', exact: true })
    .getByRole('tab', { name, exact: true });
  if ((await tab.count()) > 0) {
    await tab.click();
    return;
  }
  const row = scope.locator('.wb-tabs-row:visible');
  await row.getByRole('button', { name: 'More', exact: true }).click();
  await row.getByRole('menuitem', { name, exact: true }).click();
}

/**
 * Makes every lesson reachable the way a reader does: in the default icon rail
 * it clicks the rail button to open the overlay, then unfolds any collapsed
 * section (only the current lesson's section starts open). With the sidebar
 * already open, or in the stacked narrow layout, it only unfolds sections.
 *
 * @param scope - The page, frame or the visible workbench shell.
 */
export async function openLessons(
  scope: Page | Frame | Locator,
): Promise<void> {
  const overlay = scope.locator('.wb-nav-overlay');
  const rail = scope.locator(
    '.wb-rail-toggle[aria-label="Expand sidebar"]:visible',
  );
  if ((await overlay.count()) === 0 && (await rail.count()) > 0) {
    await rail.first().click();
    // Fails clearly when the overlay does not appear.
    await overlay.first().waitFor({ state: 'visible', timeout: 5000 });
  }
  const folded = scope.locator(
    '.wb-nav-heading[aria-expanded="false"]:visible',
  );
  // Unfolding re-renders the list, so always take the first one still folded.
  while ((await folded.count()) > 0) await folded.first().click();
}
