import {
  assertInInjectionContext,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  runInInjectionContext,
  type Signal,
  signal,
  untracked,
} from '@angular/core';
import {
  type Chat,
  createHttpDecisionTransport,
  type DecidableSchema,
  type Decision,
  s,
  ɵcreateDecisionRuntime,
} from '@hashbrownai/core';
import {
  type ProvideHashbrownOptions,
  ɵHASHBROWN_CONFIG_INJECTION_TOKEN,
} from '../providers/provide-hashbrown.fn';
import { readReactiveOption } from '../utils/signals';
import type { ReactiveOption } from '../utils/types';

/**
 * Options for {@link decisionResource}.
 *
 * @public
 */
export interface DecisionResourceOptions<S extends DecidableSchema> {
  /** The decidable schema whose questions the model answers. */
  schema: S;
  /** The input to decide about. `null` or `undefined` keeps the resource idle. */
  input: Signal<string | Decision.JsonValue | null | undefined>;
  /** Optional system text sent along with the input. */
  system?: ReactiveOption<string>;
  /** Milliseconds to wait after an input change before sending. */
  debounce?: number;
  /** Number of retries for retryable transport errors. */
  retries?: number;
  /** Overrides the provider's decision transport for this resource. */
  transport?: Decision.Transport;
  /** Order of options in questions; `shuffled` varies per request. */
  optionOrder?: 'declared' | 'shuffled';
}

/**
 * The result of {@link decisionResource}.
 *
 * @public
 */
export interface DecisionResourceRef<S extends DecidableSchema> {
  /** The last decoded value, or null. */
  value: Signal<s.Infer<S> | null>;
  /** Metadata mirroring the value, or null. */
  meta: Signal<Decision.Meta<S> | null>;
  /** Whether a request is in flight. */
  isLoading: Signal<boolean>;
  /** The last failure, cleared when a new request starts. */
  error: Signal<Error | undefined>;
  /** Resends the last non-null input; returns false when there is none. */
  reload: () => boolean;
  /** Aborts the in-flight request, keeping the last value. */
  stop: () => void;
}

function resolveTransport(
  options: { transport?: Decision.Transport },
  config: ProvideHashbrownOptions | null,
  injector: Injector,
): Decision.Transport {
  if (options.transport) return options.transport;
  if (config?.decision?.transport) return config.decision.transport;

  return createHttpDecisionTransport({
    url: config?.decision?.url,
    middleware: config?.middleware?.map((middleware): Chat.Middleware => {
      return (requestInit) =>
        runInInjectionContext(injector, () => middleware(requestInit));
    }),
  });
}

/**
 * Decides about an input by asking a model closed questions defined by a
 * decidable schema, and exposes the typed answer with its metadata as signals.
 *
 * The decision runtime is recreated when the `system` option changes. Input
 * changes trigger a new decision. Must be called in an injection context; the
 * in-flight request is aborted when the context is destroyed.
 *
 * @public
 * @example
 * ```ts
 * const decision = decisionResource({
 *   schema: s.object('Decision', {
 *     intent: s.enumeration('Intent', ['filter', 'chat']),
 *   }),
 *   input: query,
 * });
 * ```
 * @param options - The decision options.
 * @returns The decision signals and controls.
 */
export function decisionResource<S extends DecidableSchema>(
  options: DecisionResourceOptions<S>,
): DecisionResourceRef<S> {
  assertInInjectionContext(decisionResource);
  const config = inject(ɵHASHBROWN_CONFIG_INJECTION_TOKEN, { optional: true });
  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);
  const transport = resolveTransport(options, config, injector);

  // Construction is side-effect free, so a computed may create the runtime.
  const runtime = computed(() =>
    ɵcreateDecisionRuntime({
      schema: options.schema,
      transport,
      system:
        options.system === undefined
          ? undefined
          : readReactiveOption(options.system),
      debounceTime: options.debounce,
      retries: options.retries,
      optionOrder: options.optionOrder,
    }),
  );
  // Surface an invalid schema synchronously.
  runtime();

  const version = signal(0);
  const state = computed(() => {
    version();
    return runtime().getState();
  });

  effect((onCleanup) => {
    const current = runtime();
    const unsubscribe = current.subscribe(() => version.update((n) => n + 1));
    untracked(() => version.update((n) => n + 1));
    onCleanup(() => {
      unsubscribe();
      current.destroy();
    });
  });

  effect(() => {
    const current = runtime();
    const input = options.input() ?? null;
    untracked(() => current.setInput(input));
  });

  destroyRef.onDestroy(() => untracked(runtime).destroy());

  return {
    value: computed(() => state().value),
    meta: computed(() => state().meta),
    isLoading: computed(() => state().status === 'loading'),
    error: computed(() => state().error),
    reload: () => untracked(runtime).reload(),
    stop: () => untracked(runtime).stop(),
  };
}
