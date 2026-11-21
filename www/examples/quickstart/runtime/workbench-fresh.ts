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

/** Reads the value of a captured event that fresh text is measured on. */
export type WorkbenchFreshRead = (event: WorkbenchFrame) => unknown;

/**
 * Reads the raw streamed JSON of an event, parsed as far as it has arrived.
 * This is what the inspector's Streaming view shows.
 *
 * @param event - A captured event.
 * @returns The parsed partial document.
 */
export const workbenchStreamedJson: WorkbenchFreshRead = (event) =>
  parsePartialJson(event.json);

/**
 * Reads the props Hashbrown resolved for an event. This is what the rendered
 * component receives, so a field appears here only once it has resolved.
 *
 * @param event - A captured event.
 * @returns The resolved props, or `null` before any resolve.
 */
export const workbenchResolvedProps: WorkbenchFreshRead = (event) =>
  event.props;

/**
 * Finds the text that arrived just before a captured event.
 *
 * Compares the value `read` returns at `cursor` with the one at the later of
 * the turn's first event and `workbenchFreshWindow` events back. The first
 * event of a turn compares against nothing. Finished events have no fresh
 * text.
 *
 * @param events - The captured events.
 * @param cursor - The index of the event being shown.
 * @param read - Which value to compare; defaults to the streamed JSON.
 * @returns The newest arrived text, or `null` when finished or unchanged.
 */
export function workbenchFreshAt(
  events: readonly WorkbenchFrame[],
  cursor: number,
  read: WorkbenchFreshRead = workbenchStreamedJson,
): WorkbenchFresh | null {
  const event = events[cursor];
  if (!event || finished(event)) return null;
  let first = cursor;
  while (first > 0 && events[first - 1].turn === event.turn) first -= 1;
  const start = Math.max(first, cursor - workbenchFreshWindow);
  const previous = start === cursor ? undefined : read(events[start]);
  return workbenchFreshText(previous, read(event));
}

function finished(event: WorkbenchFrame): boolean {
  return event.status === 'complete' || event.status === 'error';
}

/**
 * Finds the text to fade out on a finished event: the fresh text of the
 * streaming frame just before it in the same turn. Only the first finished
 * event after the stream settles; later finished events (such as an accept)
 * and unfinished events have none, so the fade plays once.
 *
 * @param events - The captured events.
 * @param cursor - The index of the event being shown.
 * @param read - Which value to compare; defaults to the streamed JSON.
 * @returns The text to show once more as a settling mark, or `null`.
 */
export function workbenchSettleAt(
  events: readonly WorkbenchFrame[],
  cursor: number,
  read: WorkbenchFreshRead = workbenchStreamedJson,
): WorkbenchFresh | null {
  const event = events[cursor];
  const before = events[cursor - 1];
  if (!event || !finished(event)) return null;
  if (!before || before.turn !== event.turn || finished(before)) return null;
  return workbenchFreshAt(events, cursor - 1, read);
}

/**
 * Maps a path inside a streamed document to the plan card field it feeds.
 *
 * A generative UI document nests the card's fields under
 * `ui.<index>.<Component>.props.`; that prefix is dropped. Other paths pass
 * through unchanged.
 *
 * @param path - A path such as `ui.0.SummaryCard.props.steps.1`.
 * @returns The card path, such as `steps.1`.
 */
export function workbenchCardPath(path: string): string {
  return path.replace(/^ui\.\d+\.[^.]+\.props\./, '');
}
