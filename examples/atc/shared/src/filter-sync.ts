import { parseStreamedFilter } from './filter-view';
import { isEmptyMapFilter, type MapFilter } from './find-aircraft';
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

/**
 * What the filter pill says when a filter run fails (an HTTP error, the
 * network, the model). Text only; it clears on the next request or the pill's
 * x.
 */
export const FILTER_FAILED_NOTICE = "Couldn't filter. Try again.";

/** A filter with every field "any". */
const EMPTY_FILTER: MapFilter = {
  airline: null,
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  near: null,
  inAirspace: null,
};

const NONE: ReadonlySet<keyof MapFilter> = new Set();

/** The fields of a partial answer that are present but not yet whole. */
export function streamingKeys(partial: unknown): ReadonlySet<keyof MapFilter> {
  const pending = Object.keys(parseStreamedFilter(partial).pending);

  return pending.length === 0
    ? NONE
    : (new Set(pending) as ReadonlySet<keyof MapFilter>);
}

/** Applies a streaming filter answer to the store, one run at a time. */
export interface FilterSync {
  /**
   * Starts a run that refines `base`, the filter the request was sent with
   * (null for a fresh one). Any run in flight is superseded; newest wins.
   */
  begin(base: MapFilter | null): void;
  /**
   * Applies the latest partial output of the current run. Only fields the
   * answer has decided (present, whole, or an explicit null) replace the
   * base's, so a refinement never flickers; each distinct filter reaches the
   * store once.
   */
  update(partial: unknown): void;
  /**
   * Ends the run with its final output, applied whole: clauses the answer
   * omitted are dropped.
   */
  finish(partial: unknown): void;
  /**
   * Ends the run after an error and puts back the filter it refined (the
   * `begin` base, or no filter), so a half-applied answer never lingers.
   * Returns true when a run was live; false when it had already finished,
   * been cancelled or been superseded, and nothing changed.
   */
  fail(): boolean;
  /** Stops listening to the store. */
  dispose(): void;
}

/**
 * Creates a {@link FilterSync}. If anything else changes the map filter while
 * a run is live (the pill's x, a typed clear, the assistant's
 * `setMapFilter` or `clearMapFilter`), the run stops being authoritative:
 * later output is ignored and `onCancel` is called once so the caller can
 * stop the stream.
 */
export function createFilterSync(
  store: AtcStore,
  onCancel: () => void,
): FilterSync {
  let live = false;
  let base: MapFilter = EMPTY_FILTER;
  // The filter the run started from, as `begin` received it.
  let start: MapFilter | null = null;
  let applied: string | null = null;
  // The filter object the store holds while the run owns it: the base, then
  // each filter the run applied. The store keeps the object it was given, even
  // when it re-resolves for chart or airspace data, so identity tells the
  // run's own writes from anyone else's.
  let expected: MapFilter | null = null;

  const unsubscribe = store.subscribe(() => {
    if (live && (store.getState().mapFilter?.filter ?? null) !== expected) {
      live = false;
      onCancel();
    }
  });

  const apply = (next: MapFilter) => {
    const key = JSON.stringify(next);
    if (key !== applied) {
      applied = key;
      // A filter that keeps nothing is a clear; the store holds null for it.
      expected = isEmptyMapFilter(next) ? null : next;
      store.setMapFilter(next);
    }
  };

  return {
    begin(current) {
      live = true;
      start = current;
      base = current ?? EMPTY_FILTER;
      applied = current === null ? null : JSON.stringify(current);
      expected = store.getState().mapFilter?.filter ?? null;
    },
    update(partial) {
      if (!live) {
        return;
      }
      const parsed = parseStreamedFilter(partial);
      if (parsed.complete.size === 0) {
        return;
      }
      const next: Record<string, unknown> = { ...base };
      for (const key of parsed.complete) {
        next[key] = parsed.filter[key];
      }
      apply(next as unknown as MapFilter);
    },
    finish(partial) {
      if (!live) {
        return;
      }
      const parsed = parseStreamedFilter(partial);
      if (parsed.complete.size > 0) {
        apply(parsed.filter);
      }
      live = false;
    },
    fail() {
      if (!live) {
        return false;
      }
      live = false;
      if (start === null) {
        store.clearMapFilter();
      } else {
        store.setMapFilter(start);
      }

      return true;
    },
    dispose: unsubscribe,
  };
}
