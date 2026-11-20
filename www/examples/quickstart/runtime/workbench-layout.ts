import type { WorkbenchSidebarSection } from './workbench-lessons';

/** The persisted workbench shell layout preferences. */
export interface WorkbenchLayout {
  readonly rail: boolean;
  readonly collapsed: readonly WorkbenchSidebarSection[];
  readonly split: number;
}

/** The layout used when nothing valid is stored. */
export const workbenchLayoutDefaults: WorkbenchLayout = {
  rail: true,
  collapsed: ['start', 'concepts', 'production', 'recipes'],
  split: 44,
};

/** The storage key for the persisted layout. */
export const workbenchLayoutKey = 'hashbrown.workbench.layout.v2';

/** The pre-v2 storage key; only its split is migrated, once. */
export const workbenchLegacyLayoutKey = 'hashbrown.workbench.layout';

const sections: readonly string[] = [
  'conversations',
  'start',
  'concepts',
  'production',
  'recipes',
];

/** Clamps the conversation/inspector split to 25-75, falling back to 44. */
export function clampWorkbenchSplit(value: number): number {
  return Number.isFinite(value)
    ? Math.min(75, Math.max(25, value))
    : workbenchLayoutDefaults.split;
}

/** Returns the split after a divider key press, or null for other keys. */
export function stepWorkbenchSplit(split: number, key: string): number | null {
  if (key === 'ArrowLeft') return clampWorkbenchSplit(split - 4);
  if (key === 'ArrowRight') return clampWorkbenchSplit(split + 4);
  if (key === 'Home') return workbenchLayoutDefaults.split;
  return null;
}

/** Returns the layout with one lesson section expanded (not collapsed). */
export function workbenchExpandSection(
  layout: WorkbenchLayout,
  section: WorkbenchSidebarSection,
): WorkbenchLayout {
  return {
    ...layout,
    collapsed: layout.collapsed.filter((item) => item !== section),
  };
}

/** Parses a stored layout, ignoring anything invalid. */
export function parseWorkbenchLayout(raw: string | null): WorkbenchLayout {
  if (!raw) return workbenchLayoutDefaults;
  try {
    const value = JSON.parse(raw) as Partial<
      Record<keyof WorkbenchLayout, unknown>
    >;
    return {
      rail:
        typeof value.rail === 'boolean'
          ? value.rail
          : workbenchLayoutDefaults.rail,
      collapsed: Array.isArray(value.collapsed)
        ? ([
            ...new Set(
              value.collapsed.filter(
                (item): item is WorkbenchSidebarSection =>
                  typeof item === 'string' && sections.includes(item),
              ),
            ),
          ] as WorkbenchSidebarSection[])
        : workbenchLayoutDefaults.collapsed,
      split:
        typeof value.split === 'number'
          ? clampWorkbenchSplit(value.split)
          : workbenchLayoutDefaults.split,
    };
  } catch {
    return workbenchLayoutDefaults;
  }
}

/** A subscribable, persisted layout preference store. */
export interface WorkbenchLayoutStore {
  get(): WorkbenchLayout;
  /**
   * Applies a patch and notifies subscribers. Pass `{ persist: false }` for
   * transient updates, such as a drag in progress, that should not be saved.
   */
  set(
    patch: Partial<WorkbenchLayout>,
    options?: { readonly persist?: boolean },
  ): void;
  subscribe(listener: () => void): () => void;
}

/** Creates a layout store that keeps memory as truth and mirrors it to storage. */
export function createWorkbenchLayoutStore(
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): WorkbenchLayoutStore {
  let layout = workbenchLayoutDefaults;
  try {
    const saved = storage?.getItem(workbenchLayoutKey) ?? null;
    if (saved) {
      layout = parseWorkbenchLayout(saved);
    } else {
      // Migrate once: a legacy layout keeps only its split.
      const legacy = parseWorkbenchLayout(
        storage?.getItem(workbenchLegacyLayoutKey) ?? null,
      );
      layout = { ...workbenchLayoutDefaults, split: legacy.split };
    }
  } catch {
    // Storage may be blocked; stay memory-only.
  }
  const listeners = new Set<() => void>();
  return {
    get: () => layout,
    set(patch, options) {
      layout = parseWorkbenchLayout(JSON.stringify({ ...layout, ...patch }));
      if (options?.persist !== false) {
        try {
          storage?.setItem(workbenchLayoutKey, JSON.stringify(layout));
        } catch {
          // Storage may be blocked; memory still updates.
        }
      }
      [...listeners].forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

function resolveStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The shared layout store over localStorage when it is available. */
export const workbenchLayout: WorkbenchLayoutStore =
  createWorkbenchLayoutStore(resolveStorage());
