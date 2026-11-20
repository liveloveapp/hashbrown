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
