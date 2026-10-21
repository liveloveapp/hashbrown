import {
  createFilterSync,
  filterRequestInput,
  type MapFilter,
  mapFilterSchema,
  streamingKeys,
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
  // The output of the run before this one, which must not be applied.
  let stale: unknown = null;
  // Each streamed update goes to the store; the final one is applied whole.
  effect(() => {
    const value = output();
    const loading = resource.isLoading();
    if (value === null || value === stale) {
      return;
    }
    if (loading) {
      sync.update(value);
    } else if (resource.status() !== 'error') {
      sync.finish(value);
    }
  });
  // Hashbrown sends when the input changes, so `apply` blanks it first to send
  // the same words again (after a clear, say). `apply` sets `input` to null
  // and `queued` to the real value together; every effect then runs once and
  // sees null (the completion's input effect resets its ownership). This
  // effect then sets the real input, which schedules a second pass where the
  // completion sees a changed input and sends. That holds whatever order the
  // effects were created in, because the real input is only set after the
  // first pass has read null.
  effect(() => {
    const next = queued();
    if (next !== null && input() === null) {
      queued.set(null);
      input.set(next);
    }
  });

  return {
    apply(request) {
      const current = store.getState().mapFilter?.filter ?? null;
      const next = filterRequestInput(request, current);
      stale = output();
      sync.begin(current);
      if (next === input()) {
        queued.set(next);
        input.set(null);
      } else {
        input.set(next);
      }
    },
    streaming: computed(() =>
      resource.isLoading() ? streamingKeys(output()) : NONE,
    ),
    output,
  };
}
