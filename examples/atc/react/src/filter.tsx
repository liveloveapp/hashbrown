import {
  createFilterSync,
  filterRequestInput,
  type FilterSync,
  type MapFilter,
  mapFilterSchema,
} from '@atc/shared';
import {
  createHttpTransport,
  type TransportOrFactory,
} from '@hashbrownai/core';
import { useStructuredCompletion } from '@hashbrownai/react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAtcStore } from './store';

// 5. Structured output, without a chat. One request in, one filter out,
//    validated by the same Skillet schema the server pins. No transcript.

const FILTER_TRANSPORT = createHttpTransport({ baseUrl: '/api/filter' });
const NONE: ReadonlySet<keyof MapFilter> = new Set();

function sameKeys(
  a: ReadonlySet<keyof MapFilter>,
  b: ReadonlySet<keyof MapFilter>,
): boolean {
  return a.size === b.size && [...a].every((key) => b.has(key));
}

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
  const [streamingKeys, setStreamingKeys] = useState(NONE);
  const sync = useRef<FilterSync | null>(null);
  const completion = useStructuredCompletion({
    input,
    // Required by Hashbrown; the server replaces it with the filter prompt
    // (server/src/filter-handler.ts).
    system: 'Provided by the server.',
    schema: mapFilterSchema,
    transport: options.transport ?? FILTER_TRANSPORT,
    debounceTime: 0,
  });
  const { output, stop } = completion;
  const stopRef = useRef(stop);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);
  useEffect(() => {
    const created = createFilterSync(store, () => stopRef.current());
    sync.current = created;

    return () => {
      created.dispose();
      sync.current = null;
    };
  }, [store]);
  // Each streamed update: complete fields to the store, the rest to the pill.
  useEffect(() => {
    const keys = sync.current?.update(output) ?? NONE;
    setStreamingKeys((previous) =>
      sameKeys(previous, keys) ? previous : keys,
    );
  }, [output]);

  const apply = (request: string) => {
    const next = filterRequestInput(
      request,
      store.getState().mapFilter?.filter ?? null,
    );
    sync.current?.begin();
    if (next === input) {
      // Hashbrown sends when the input changes; blank it first so the same
      // words (after a clear, say) are sent again.
      flushSync(() => setInput(null));
    }
    setInput(next);
  };

  return {
    apply,
    streaming: completion.isLoading ? streamingKeys : NONE,
    output,
  };
}
