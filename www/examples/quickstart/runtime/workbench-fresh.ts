import type { WorkbenchFrame } from './workbench';
import { parsePartialJson } from './workbench-inspector-modes';

/** The text that most recently arrived at one string path of a streamed value. */
export interface WorkbenchFresh {
  /** Dot path with array indexes as numbers, such as `title` or `steps.1`. */
  readonly path: string;
  /** The arrived suffix. */
  readonly text: string;
}

/** How many captured events back "recent" reaches. */
export const workbenchFreshWindow = 3;

type Leaf = { readonly path: string; readonly value: string };

function leaves(value: unknown, path: string): readonly Leaf[] {
  if (typeof value === 'string') return [{ path, value }];
  const join = (key: string) => (path === '' ? key : `${path}.${key}`);
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leaves(item, join(String(index))));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      leaves(item, join(key)),
    );
  }
  return [];
}

function valueAt(root: unknown, path: string): unknown {
  return path === ''
    ? root
    : path.split('.').reduce<unknown>((node, key) => {
        if (node === null || typeof node !== 'object') return undefined;
        return (node as Record<string, unknown>)[key];
      }, root);
}

/**
 * Finds the string that most recently grew between two streamed values.
 *
 * Walks `current` in document order. Each string leaf that differs from the
 * same path in `previous` (missing counts as an empty string) contributes the
 * suffix after the common prefix; the last such leaf is returned.
 *
 * @param previous - The earlier partial value.
 * @param current - The later partial value.
 * @returns The newest arrived text, or `null` when nothing changed.
 */
export function workbenchFreshText(
  previous: unknown,
  current: unknown,
): WorkbenchFresh | null {
  const changed = leaves(current, '').flatMap((leaf) => {
    const before = valueAt(previous, leaf.path);
    const old = typeof before === 'string' ? before : '';
    if (old === leaf.value) return [];
    let shared = 0;
    while (
      shared < old.length &&
      shared < leaf.value.length &&
      old[shared] === leaf.value[shared]
    ) {
      shared += 1;
    }
    return [{ path: leaf.path, text: leaf.value.slice(shared) }];
  });
  return changed[changed.length - 1] ?? null;
}

/**
 * Finds the text that streamed in just before a captured event.
 *
 * Compares the partial JSON at `cursor` with the one at the later of the
 * turn's first event and `workbenchFreshWindow` events back. The first event
 * of a turn compares against nothing. Finished events have no fresh text.
 *
 * @param events - The captured events.
 * @param cursor - The index of the event being shown.
 * @returns The newest arrived text, or `null` when finished or unchanged.
 */
export function workbenchFreshAt(
  events: readonly WorkbenchFrame[],
  cursor: number,
): WorkbenchFresh | null {
  const event = events[cursor];
  if (!event || event.status === 'complete' || event.status === 'error') {
    return null;
  }
  let first = cursor;
  while (first > 0 && events[first - 1].turn === event.turn) first -= 1;
  const start = Math.max(first, cursor - workbenchFreshWindow);
  const previous =
    start === cursor ? undefined : parsePartialJson(events[start].json);
  return workbenchFreshText(previous, parsePartialJson(event.json));
}
