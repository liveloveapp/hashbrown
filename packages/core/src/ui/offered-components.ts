import type { ExposedComponentDescriptor } from './expose-component';
import { isUiKit, type UiKitInput } from './ui-kit';

/**
 * Merges the components a UI chat offers now into every component it has
 * offered before, keyed by name. Both lists are flattened like
 * `createUiKit` flattens them (kit members, then each component followed by
 * its declared children, depth first). The newest definition of a name
 * replaces older ones, and older components the newest list dropped are
 * kept after it. Declared children are pointed at the kept definition of
 * their name (copying the parent when that changes it), so the result never
 * holds two implementations under one name and can always be passed to
 * `createUiKit`. The result has one entry per name, so it stays bounded.
 *
 * @param newest - The components offered now.
 * @param previous - The result of the previous merge (or `[]`).
 * @returns The merged, flat component list; `previous` itself when nothing
 * changed.
 * @public
 */
export function mergeOfferedComponents<T extends ExposedComponentDescriptor>(
  newest: ReadonlyArray<UiKitInput<T>>,
  previous: ReadonlyArray<UiKitInput<T>>,
): T[] {
  const byName = new Map<string, T>();
  const visited = new Set<object>();

  function add(entry: T): void {
    if (visited.has(entry)) return;
    visited.add(entry);
    if (!byName.has(entry.name)) byName.set(entry.name, entry);
    if (Array.isArray(entry.children)) {
      (entry.children as T[]).forEach(add);
    }
  }
  function addAll(entries: ReadonlyArray<UiKitInput<T>>): void {
    for (const entry of entries) {
      if (isUiKit(entry)) {
        (entry.components as T[]).forEach(add);
      } else {
        add(entry as T);
      }
    }
  }
  addAll(newest);
  addAll(previous);

  const resolved = new Map<string, T>();
  function resolve(entry: T): T {
    const done = resolved.get(entry.name);
    if (done) return done;
    if (!Array.isArray(entry.children)) {
      resolved.set(entry.name, entry);
      return entry;
    }
    const copy = { ...entry };
    // Set before visiting the children, so cycles terminate.
    resolved.set(entry.name, copy);
    const children = (entry.children as T[]).map((child) =>
      resolve(byName.get(child.name) ?? child),
    );
    const unchanged = children.every(
      (child, index) => child === (entry.children as T[])[index],
    );
    if (unchanged) {
      resolved.set(entry.name, entry);
      return entry;
    }
    copy.children = children as T['children'];
    return copy;
  }
  const merged = [...byName.values()].map(resolve);

  const same =
    merged.length === previous.length &&
    merged.every((entry, index) => entry === previous[index]);
  return same ? (previous as T[]) : merged;
}
