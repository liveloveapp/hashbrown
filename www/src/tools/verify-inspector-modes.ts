import { expect, type Locator } from '@playwright/test';

/**
 * Chooses a mode in the inspector panel's toggle by its explicit mode id,
 * as a reader would. The ids depend on the tab: `top`, `bottom` and `raw` for
 * most tabs; `tree`, `json` and `raw` on State; `schema`, `raw`, `parsed` and
 * `resolved` on UI; `raw`, `parsed` and `resolved` on JSON.
 *
 * @param root - The visible workbench shell.
 * @param id - The mode id to show.
 */
export async function showInspectorMode(
  root: Locator,
  id: string,
): Promise<void> {
  await root.locator(`.wb-inspector [role="radio"][data-mode="${id}"]`).click();
}

/**
 * Chooses a mode and reads its code block as JSON.
 *
 * @param root - The visible workbench shell.
 * @param id - The mode id to show.
 * @returns The parsed value shown in the panel.
 */
export async function readInspectorJson(
  root: Locator,
  id: string,
): Promise<ReturnType<typeof JSON.parse>> {
  await showInspectorMode(root, id);
  const panel = root.locator('.wb-inspector .wb-inspection');
  // The State tree exposes its value as JSON on the tree element.
  const tree = panel.locator('[role="tree"]');
  return JSON.parse(
    (await tree.count())
      ? ((await tree.getAttribute('data-json')) ?? 'null')
      : await panel.locator('pre').innerText(),
  );
}

/**
 * Reads the application state shown on the State tab, as JSON text. The Tree
 * mode adds the selected moment under `moment`; it is left out so the text only
 * changes when the application state does.
 *
 * @param root - The visible workbench shell.
 * @returns The application state without the selected moment.
 */
export async function readApplicationState(root: Locator): Promise<string> {
  const tree = await readInspectorJson(root, 'tree');
  return JSON.stringify(
    Object.fromEntries(Object.entries(tree).filter(([k]) => k !== 'moment')),
    null,
    2,
  );
}

/**
 * Reads what the selected tab used to show in its first section: the
 * application state on State (without the selected moment), the `top` mode
 * elsewhere.
 *
 * @param root - The visible workbench shell.
 * @returns The parsed value.
 */
export async function readFirstSection(
  root: Locator,
): Promise<ReturnType<typeof JSON.parse>> {
  const selected = await root
    .locator('.wb-inspector [role="tab"][aria-selected="true"]')
    .innerText();
  return selected === 'State'
    ? JSON.parse(await readApplicationState(root))
    : readInspectorJson(root, 'top');
}

/**
 * Waits until the inspector panel shows the text. The State tree is read
 * through the JSON it exposes, since its rows do not contain JSON syntax.
 *
 * @param panel - The `.wb-inspection` locator.
 * @param text - The substring to wait for.
 */
export async function expectInspectionText(
  panel: Locator,
  text: string,
): Promise<void> {
  await expect
    .poll(() =>
      panel.evaluate(
        (node) =>
          node.querySelector<HTMLElement>('[role="tree"]')?.dataset['json'] ??
          (node as HTMLElement).innerText,
      ),
    )
    .toContain(text);
}
