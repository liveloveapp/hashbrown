import { parseStreamedFilter } from './filter-view';
import type { MapFilter } from './find-aircraft';
import type { AtcStore } from './store';

// The framework-free half of the natural-language map filter: what the apps
// send to /api/filter and how a streaming answer lands in the store. The
// hooks in react/src/filter.tsx and angular/src/app/filter.ts wrap it.

/**
 * The user message `/api/filter` expects: the request and the filter it
 * refines (null for a fresh one), as JSON.
 */
export function filterRequestInput(
  request: string,
  current: MapFilter | null,
): string {
  return JSON.stringify({ request, current });
}

/** Applies a streaming filter answer to the store, one run at a time. */
export interface FilterSync {
  /** Starts a run. Any run in flight is superseded; the newest wins. */
  begin(): void;
  /**
   * Applies the latest partial output of the current run: the fields that
   * are complete go to the store, once per distinct filter.
   * @returns The fields still streaming, empty when no run is live.
   */
  update(partial: unknown): ReadonlySet<keyof MapFilter>;
  /** Stops listening to the store. */
  dispose(): void;
}

const NONE: ReadonlySet<keyof MapFilter> = new Set();

/**
 * Creates a {@link FilterSync}. If the filter is cleared (the pill's ✕, or
 * the assistant) after the run applied something, the run stops being
 * authoritative: later output is ignored and `onCancel` is called once so the
 * caller can stop the stream.
 */
export function createFilterSync(
  store: AtcStore,
  onCancel: () => void,
): FilterSync {
  let live = false;
  let applied: string | null = null;

  const unsubscribe = store.subscribe(() => {
    if (live && applied !== null && store.getState().mapFilter === null) {
      live = false;
      onCancel();
    }
  });

  return {
    begin() {
      live = true;
      applied = null;
    },
    update(partial) {
      if (!live) {
        return NONE;
      }
      const parsed = parseStreamedFilter(partial);
      if (parsed.complete.size > 0) {
        const key = JSON.stringify(parsed.filter);
        if (key !== applied) {
          applied = key;
          store.setMapFilter(parsed.filter);
        }
      }

      return new Set(Object.keys(parsed.pending)) as ReadonlySet<
        keyof MapFilter
      >;
    },
    dispose: unsubscribe,
  };
}
