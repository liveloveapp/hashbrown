import type { Locator } from '@playwright/test';

const modeIds = {
  top: ['top', 'schema', 'raw'],
  bottom: ['bottom', 'resolved'],
  raw: ['raw'],
  tree: ['tree'],
} as const;

/**
 * Chooses a mode in the inspector panel's toggle, as a reader would.
 * `top` and `bottom` name the two sections a tab used to show side by side.
 *
 * @param root - The visible workbench shell.
 * @param mode - The section or mode to show.
 */
export async function showInspectorMode(
  root: Locator,
  mode: keyof typeof modeIds,
): Promise<void> {
  await root
    .locator(
      modeIds[mode]
        .map((id) => `.wb-inspector [role="radio"][data-mode="${id}"]`)
        .join(', '),
    )
    .first()
    .click();
}

/**
 * Chooses a section of the inspector panel and reads its code block as JSON.
 *
 * @param root - The visible workbench shell.
 * @param mode - The section or mode to show.
 * @returns The parsed value shown in the panel.
 */
export async function readInspectorJson(
  root: Locator,
  mode: keyof typeof modeIds,
): Promise<ReturnType<typeof JSON.parse>> {
  await showInspectorMode(root, mode);
  return JSON.parse(
    await root.locator('.wb-inspector .wb-inspection pre').innerText(),
  );
}
