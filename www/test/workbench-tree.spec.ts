// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { repoRoot } from '../src/lib/repo-root';
import {
  changedPaths,
  createWorkbenchTree,
  defaultOpenPaths,
  workbenchTreeRows,
} from '../examples/quickstart/runtime/workbench-tree';

const state = { revision: 1, plan: { title: 'A', steps: ['x', 'y'] } };

function rowFor(element: HTMLElement, key: string): HTMLElement {
  const row = [
    ...element.querySelectorAll<HTMLElement>('[role=treeitem]'),
  ].find((node) => node.dataset.path === key);
  if (!row) throw new Error(`Missing row ${key}`);
  return row;
}

function paths(element: HTMLElement): (string | undefined)[] {
  return [...element.querySelectorAll<HTMLElement>('[role=treeitem]')].map(
    (node) => node.dataset.path,
  );
}

test('lists rows for the default open paths and leaves steps closed', () => {
  const open = defaultOpenPaths(state);

  const rows = workbenchTreeRows(state, open);

  expect(rows.map((row) => row.path)).toEqual([
    '/revision',
    '/plan',
    '/plan/title',
    '/plan/steps',
  ]);
  expect(rows[1]).toMatchObject({ kind: 'object', open: true, size: 2 });
  expect(rows[3]).toMatchObject({ kind: 'array', open: false, size: 2 });
  expect(rows[0]).toMatchObject({ kind: 'value', preview: '1', depth: 0 });
  expect(rows[2]).toMatchObject({ preview: '"A"', depth: 1 });
});

test('reports only the leaf paths whose value differs', () => {
  const next = { ...state, plan: { ...state.plan, title: 'B' } };

  const changed = changedPaths(state, next);

  expect([...changed]).toEqual(['/plan/title']);
});

test('clicking a branch hides its children', () => {
  const tree = createWorkbenchTree({ label: 'State' });
  tree.update(state, undefined);

  rowFor(tree.element, '/plan').click();

  expect(paths(tree.element)).toEqual(['/revision', '/plan']);
  expect(rowFor(tree.element, '/plan').getAttribute('aria-expanded')).toBe(
    'false',
  );
});

test('keeps a closed branch closed across updates', () => {
  const tree = createWorkbenchTree({ label: 'State' });
  tree.update(state, undefined);
  rowFor(tree.element, '/plan').click();

  tree.update({ ...state, revision: 2 }, state);

  expect(paths(tree.element)).toEqual(['/revision', '/plan']);
});

test('ArrowRight opens a closed branch', () => {
  const tree = createWorkbenchTree({ label: 'State' });
  tree.update(state, undefined);
  const steps = rowFor(tree.element, '/plan/steps');

  steps.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
  );

  expect(paths(tree.element)).toContain('/plan/steps/0');
});

test('ArrowLeft closes an open branch and ArrowDown moves focus', () => {
  const tree = createWorkbenchTree({ label: 'State' });
  document.body.append(tree.element);
  tree.update(state, undefined);

  rowFor(tree.element, '/revision').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
  );
  const focused = document.activeElement?.getAttribute('data-path');
  rowFor(tree.element, '/plan').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
  );

  expect(focused).toBe('/plan');
  expect(paths(tree.element)).toEqual(['/revision', '/plan']);
  tree.element.remove();
});

test('marks changed rows and exposes the value as JSON', () => {
  const tree = createWorkbenchTree({ label: 'State' });
  const next = { ...state, plan: { ...state.plan, title: 'B' } };

  tree.update(next, state);

  expect(rowFor(tree.element, '/plan/title').hasAttribute('data-changed')).toBe(
    true,
  );
  expect(rowFor(tree.element, '/revision').hasAttribute('data-changed')).toBe(
    false,
  );
  expect(JSON.parse(tree.element.dataset.json ?? 'null')).toEqual(next);
});

test('the changed-value highlight is a light cobalt tint, never a grey band', () => {
  const css = readFileSync(
    join(repoRoot(), 'www/examples/quickstart/runtime/workbench.css'),
    'utf8',
  );

  const rule =
    css.match(/\[role='treeitem'\]\[data-changed\] \{([^}]*)\}/)?.[1] ?? '';
  const keyframes =
    css.match(/@keyframes wb-tree-changed \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const tints = [
    ...`${rule}${keyframes}`.matchAll(/var\(--wb-cobalt\) (\d+)%/g),
  ].map((match) => Number(match[1]));

  expect(`${rule}${keyframes}`).not.toContain('--wb-tick');
  expect(`${rule}${keyframes}`).not.toContain('--wb-hover');
  expect(tints.length).toBeGreaterThan(0);
  expect(Math.max(...tints)).toBeLessThanOrEqual(16);
});
