import { expect, type Page } from '@playwright/test';

/**
 * Asserts the shell opens at its recording defaults: expanded sidebar, every
 * section open, a 44/56 split, and the inspector pair side by side.
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
  const captured = await root
    .locator('.wb-inspector [data-captured]')
    .boundingBox();
  const detail = await root
    .locator('.wb-inspector [data-detail]')
    .boundingBox();
  expect(captured).not.toBeNull();
  expect(detail).not.toBeNull();
  expect(
    Math.abs((captured?.y ?? 0) - (detail?.y ?? Infinity)),
  ).toBeLessThanOrEqual(1);
  expect(detail?.x ?? 0).toBeGreaterThan(captured?.x ?? 0);
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
