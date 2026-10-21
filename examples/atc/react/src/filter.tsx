import {
  createFilterSync,
  filterRequestInput,
  type FilterSync,
  type MapFilter,
  mapFilterSchema,
  streamingKeys,
} from '@atc/shared';
import {
  createHttpTransport,
  type TransportOrFactory,
} from '@hashbrownai/core';
import { useStructuredCompletion } from '@hashbrownai/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAtcStore } from './store';

// 5. Structured output, without a chat. One request in, one filter out,
//    validated by the same Skillet schema the server pins. No transcript.

const FILTER_TRANSPORT = createHttpTransport({ baseUrl: '/api/filter' });
const NONE: ReadonlySet<keyof MapFilter> = new Set();

/** The natural-language map filter. */
export interface MapFilterHandle {
  /**
   * Turns `request` into a filter, refining the one on the map. The answer
   * streams into the store as its fields complete; a newer call supersedes
   * one in flight.
   */
  apply(request: string): void;
  /** The fields the model is still writing, for the filter pill. */
  readonly streaming: ReadonlySet<keyof MapFilter>;
  /** The raw structured output so far (partial while streaming). */
  readonly output: unknown;
}

/**
 * Hook for the natural-language map filter, built on
 * `useStructuredCompletion` against `/api/filter`. `options.transport`
 * replaces the HTTP transport (tests).
 */
export function useMapFilter(
  options: { transport?: TransportOrFactory } = {},
): MapFilterHandle {
  const store = useAtcStore();
  const [input, setInput] = useState<string | null>(null);
  // What `input` holds, for `apply`, which must not change identity.
  const inputRef = useRef<string | null>(null);
  const sync = useRef<FilterSync | null>(null);
  const stopRef = useRef<() => void>(() => undefined);
  // The output of the run before this one, which must not be applied.
  const latest = useRef<unknown>(null);
  const stale = useRef<unknown>(null);
  const completion = useStructuredCompletion({
    input,
    // Required by Hashbrown; the server replaces it with the filter prompt
    // (server/src/filter-handler.ts).
    system: 'Provided by the server.',
    schema: mapFilterSchema,
    transport: options.transport ?? FILTER_TRANSPORT,
    debounceTime: 0,
  });
  const { output, stop, isLoading, error } = completion;

  useEffect(() => {
    const created = createFilterSync(store, () => stopRef.current());
    sync.current = created;

    return () => {
      created.dispose();
      sync.current = null;
    };
  }, [store]);
  // Each streamed update goes to the store; the final one is applied whole.
  useEffect(() => {
    stopRef.current = stop;
    latest.current = output;
    if (output === null || output === stale.current) {
      return;
    }
    if (isLoading) {
      sync.current?.update(output);
    } else if (!error) {
      sync.current?.finish(output);
    }
  }, [output, stop, isLoading, error]);

  const apply = useCallback(
    (request: string) => {
      const current = store.getState().mapFilter?.filter ?? null;
      const next = filterRequestInput(request, current);
      stale.current = latest.current;
      sync.current?.begin(current);
      if (next === inputRef.current) {
        // Hashbrown sends when the input changes; blank it first so the same
        // words (after a clear, say) are sent again.
        flushSync(() => setInput(null));
      }
      inputRef.current = next;
      setInput(next);
    },
    [store],
  );
  const streaming = useMemo(
    () => (isLoading ? streamingKeys(output) : NONE),
    [isLoading, output],
  );

  return { apply, streaming, output };
}
