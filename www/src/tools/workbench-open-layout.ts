import type { Page } from '@playwright/test';

/**
 * Seeds an open-sidebar layout before the page loads, for verifiers that
 * exercise the lesson sidebar. A reader's first visit now starts in rail mode,
 * so these verifiers opt in explicitly. Existing saved choices are kept.
 */
export async function seedOpenWorkbenchLayout(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      const key = 'hashbrown.workbench.layout.v2';
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({ rail: false, collapsed: [], split: 44 }),
        );
    } catch {
      // Storage may be blocked; the verifier then sees the defaults.
    }
  });
}
