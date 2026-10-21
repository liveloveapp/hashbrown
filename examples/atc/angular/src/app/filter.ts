import {
  createFilterSync,
  filterRequestInput,
  type MapFilter,
  mapFilterSchema,
} from '@atc/shared';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  type Signal,
  signal,
} from '@angular/core';
import {
  createHttpTransport,
  type TransportOrFactory,
} from '@hashbrownai/core';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { ATC_STORE } from './store';

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
  readonly streaming: Signal<ReadonlySet<keyof MapFilter>>;
  /** The raw structured output so far (partial while streaming). */
  readonly output: Signal<unknown>;
}

/**
 * The natural-language map filter, built on `structuredCompletionResource`
 * against `/api/filter`. Call in an injection context. `options.transport`
 * replaces the HTTP transport (tests).
 */
export function injectMapFilter(
  options: { transport?: TransportOrFactory } = {},
): MapFilterHandle {
  const store = inject(ATC_STORE);
  const input = signal<string | null>(null);
  // Set when the next input equals the current one; see `apply`.
  const queued = signal<string | null>(null);
  const resource = structuredCompletionResource({
    input,
    // Required by Hashbrown; the server replaces it with the filter prompt
    // (server/src/filter-handler.ts).
    system: 'Provided by the server.',
    schema: mapFilterSchema,
    transport: options.transport ?? FILTER_TRANSPORT,
    debounce: 0,
  });
  const sync = createFilterSync(store, () => resource.stop());
  inject(DestroyRef).onDestroy(() => sync.dispose());

  // An Angular resource's value() throws while it is in error.
  const output = computed<unknown>(() =>
    resource.status() === 'error' ? null : resource.value(),
  );
  const streamingKeys = signal(NONE, { equal: sameKeys });
  // Each streamed update: complete fields to the store, the rest to the pill.
  effect(() => streamingKeys.set(sync.update(output())));
  // Hashbrown sends when the input changes; `apply` blanks it first so the
  // same words (after a clear, say) are sent again.
  effect(() => {
    const next = queued();
    if (next !== null && input() === null) {
      queued.set(null);
      input.set(next);
    }
  });

  return {
    apply(request) {
      const next = filterRequestInput(
        request,
        store.getState().mapFilter?.filter ?? null,
      );
      sync.begin();
      if (next === input()) {
        queued.set(next);
        input.set(null);
      } else {
        input.set(next);
      }
    },
    streaming: computed(() => (resource.isLoading() ? streamingKeys() : NONE)),
    output,
  };
}
