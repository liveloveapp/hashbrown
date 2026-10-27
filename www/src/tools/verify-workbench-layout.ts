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
