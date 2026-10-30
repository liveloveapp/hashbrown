import { expect, type Page } from '@playwright/test';

/**
 * Asserts the shell opens at its recording defaults: expanded sidebar, every
 * section open, a 44/56 split, and one inspector panel (or, on the Requests tab, the
 * overview slider above the table).
 */
export async function expectWorkbenchDefaultLayout(page: Page): Promise<void> {
  const root = page.locator('.wb:visible');
  await expect(root).not.toHaveClass(/\bwb-rail\b/);
  await expect(root.locator('.wb-split')).toHaveAttribute(
    'aria-valuenow',
    '44',
  );
  await expect(
    root.locator('.wb-nav-heading[aria-expanded=false]'),
  ).toHaveCount(0);
  const requests = root.locator('.wb-inspector .wb-requests');
  if ((await requests.count()) > 0) {
    // The Requests tab shows an overview and a table; there is no inspector panel.
    await expect(
      requests.getByRole('slider', { name: 'Seek request timeline' }),
    ).toBeVisible();
    // Before the first request the table has no rows, so it has no size.
    await expect(requests.locator('table.wb-requests-table')).toBeAttached();
    return;
  }
  // One panel per tab: a single section with a mode toggle, no side-by-side pair.
  await expect(root.locator('.wb-inspector [data-captured]')).toHaveCount(1);
  await expect(root.locator('.wb-inspector [data-detail]')).toHaveCount(0);
  await expect(
    root.getByRole('radiogroup', { name: 'Inspector view', exact: true }),
  ).toBeVisible();
}

/**
 * Asserts the page has no horizontal overflow. Narrow layouts clip the shell
 * sideways, so document width alone would hide content that is cut off: every
 * rendered element must also lie inside the viewport unless an ancestor lets
 * the user scroll it horizontally.
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const scrollsSideways = (element: Element) => {
      for (
        let node = element.parentElement;
        node && node !== document.body;
        node = node.parentElement
      ) {
        const { overflowX } = getComputedStyle(node);
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }
      return false;
    };
    return [...document.querySelectorAll('.wb:not([hidden]) *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        if (getComputedStyle(element).visibility === 'hidden') return false;
        return (
          (rect.left < -1 || rect.right > innerWidth + 1) &&
          !scrollsSideways(element)
        );
      })
      .slice(0, 5)
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}.${[...element.classList].join('.')} ${Math.round(element.getBoundingClientRect().right)}px`,
      );
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()?.width ?? Infinity);
  expect(offenders).toEqual([]);
}
