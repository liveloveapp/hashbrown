import { expect, type Page } from '@playwright/test';

/** Exercises actual browser keyboard navigation without generating requests or applying state. */
export async function verifyWorkbenchKeyboard(
  page: Page,
  requestCount: () => number,
): Promise<void> {
  const root = page.locator('.wb:visible');
  const inspector = root.getByRole('tablist', {
    name: 'Inspector views',
    exact: true,
  });
  const tabs = inspector.getByRole('tab');
  const seek = root.getByRole('slider', {
    name: 'Seek captured event',
    exact: true,
  });
  const maximum = await seek.getAttribute('max');
  const requests = requestCount();
  const selected = inspector.getByRole('tab', { selected: true });
  await expect(inspector.locator('[role=tab][tabindex="0"]')).toHaveCount(1);
  await selected.focus();
  await page.keyboard.press('Tab');
  expect(
    await inspector.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(false);
  await page.keyboard.press('Shift+Tab');
  await expect(selected).toBeFocused();
  await page.keyboard.press('End');
  await expect(tabs.last()).toBeFocused();
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(
    inspector.getByRole('tab', { name: 'Requests', exact: true }),
  ).toBeFocused();
  await root
    .getByRole('button', { name: 'Model request', exact: true })
    .first()
    .focus();
  await page.keyboard.press('Enter');
  const detail = root.locator('.wb-requests-detail');
  const detailTabs = detail.getByRole('tablist', {
    name: 'Request detail views',
    exact: true,
  });
  await expect(detail).toBeVisible();
  await expect(detailTabs.locator('[role=tab][tabindex="0"]')).toHaveCount(1);
  await detailTabs.getByRole('tab', { selected: true }).focus();
  await page.keyboard.press('End');
  await expect(detailTabs.getByRole('tab').last()).toBeFocused();
  await expect(detailTabs.getByRole('tab').last()).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowRight');
  await expect(detailTabs.getByRole('tab').first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(detailTabs.getByRole('tab').last()).toBeFocused();
  await page.keyboard.press('Tab');
  expect(
    await detailTabs.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(false);
  await page.keyboard.press('Shift+Tab');
  await expect(detailTabs.getByRole('tab', { selected: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  const before = await seek.inputValue();
  await root.locator('.wb-nav a').first().focus();
  await page.keyboard.press('l');
  await page.keyboard.press('ArrowRight');
  expect(await seek.inputValue()).toBe(before);
  const separator = root.getByRole('separator', {
    name: 'Resize chat and inspector',
    exact: true,
  });
  await separator.focus();
  await page.keyboard.press('ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', '48');
  expect(await seek.inputValue()).toBe(before);
  await page.keyboard.press('Home');
  await expect(separator).toHaveAttribute('aria-valuenow', '44');
  await seek.focus();
  await page.keyboard.press('Home');
  await expect(seek).toHaveValue('0');
  await expect(seek).toHaveAttribute('aria-valuetext', /[Tt]urn 1.*[Ee]vent 1/);
  await page.keyboard.press('End');
  await expect(seek).toHaveValue(maximum ?? '');
  // Move focus out of widgets; the document-level player shortcut still works.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.tabIndex = -1;
    document.body.focus();
  });
  await page.keyboard.press('l');
  await expect(
    root.getByRole('button', { name: 'Return to live', exact: true }),
  ).toBeDisabled();
  await inspector.getByRole('tab', { name: 'State', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(root.locator('.wb-inspection')).toContainText('"revision": 0');
  await expect(seek).toHaveAttribute('max', maximum ?? '');
  expect(requestCount()).toBe(requests);
}
