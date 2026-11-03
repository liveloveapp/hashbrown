/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  Resource,
  ResourceStatus,
  runInInjectionContext,
  Signal,
} from '@angular/core';
import {
  Chat,
  type ConversationRecoveryConfiguration,
  type ConversationRecoveryState,
  type ConversationRestoreOptions,
  type ConversationSnapshot,
  createChatRuntime,
  type FinishReason,
  type JsonValue,
  type PendingConversationRecovery,
  type PendingInterruptBatch,
  type ResumeConversationRecoveryOptions,
  type ResumeOptions,
  type TokenUsage,
  type TransportOrFactory,
  ɵassertRuntimeMessageSchedulingAllowed,
} from '@hashbrownai/core';
import { ɵinjectDevelopmentCollector } from '../growth/collector';
import { ɵinjectHashbrownConfig } from '../providers/provide-hashbrown.fn';
import { createTransport } from '../utils/create-transport.fn';
import { connectCompletionInput } from './completion-input.fn';
import { ReactiveOption } from '../utils/types';
import { bindToolToInjector } from '../utils/create-tool.fn';
import { readReactiveOption, toNgSignal } from '../utils/signals';
import {
  createResourceSnapshot,
  createResourceValue,
} from './create-resource-snapshot.fn';

/**
 * A reference to the completion resource.
 *
 * @public
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface CompletionResourceRef<State = unknown> extends Resource<
  string | null
> {
  /** The current interrupt batch, retained until resume is acknowledged. */
  readonly pendingInterrupts: Signal<PendingInterruptBatch | undefined>;
  /** Whether the whole resumed interaction is executing. */
  readonly isResuming: Signal<boolean>;
  /** Submits a complete response batch for the current interruption. */
  resume(options: ResumeOptions): void;

  /** The inert browser recovery batch awaiting explicit settlement. */
  readonly pendingConversationRecovery: Signal<
    PendingConversationRecovery | undefined
  >;

  /**
   * Explicitly settle every recovered browser call and protected decision.
   * @param options - The complete outcomes and decisions for the current recovery batch.
   */
  resumeConversationRecovery(options: ResumeConversationRecoveryOptions): void;

  /** The local recovery revision and whether an explicit restore is required. */
  readonly recovery: Signal<ConversationRecoveryState>;

  /** Read owned trusted request configuration for an authenticated recovery lookup. */
  getRecoveryConfiguration(): ConversationRecoveryConfiguration;

  /**
   * Atomically restore idle conversation history without scheduling work.
   * @param snapshot - The canonical history and optional shared state and interrupts.
   * @param options - The local revision captured before the recovery lookup.
   */
  restoreConversation(
    snapshot: ConversationSnapshot<State>,
    options: ConversationRestoreOptions,
  ): void;
  /** The currently visible shared agent state. */
  readonly state: Signal<State | undefined>;
  /** Replace shared agent state without starting a generation. */
  setState(state: State): void;
  /**
   * Reloads the resource.
   *
   * @returns Whether the resource was reloaded.
   */
  reload: () => boolean;

  /**
   * Stops any currently-streaming message.
   * @param clearStreamingMessage - Whether the currently-streaming message should be removed from state.
   */
  stop: (clearStreamingMessage?: boolean) => void;
  /** Indicates whether the chat is receiving tokens. */
  isReceiving: Signal<boolean>;
  /** Indicates whether the chat is sending. */
  isSending: Signal<boolean>;
  /** Indicates whether the chat is generating. */
  isGenerating: Signal<boolean>;
  /** Indicates whether tool calls are running. */
  isRunningToolCalls: Signal<boolean>;
  /** Aggregate loading flag across transport, generation, and tool calls. */
  isLoading: Signal<boolean>;
  /** Transport/request error before generation events arrive. */
  sendingError: Signal<Error | undefined>;
  /** Error emitted during generation events. */
  generatingError: Signal<Error | undefined>;
  /**
   * The return value the agent attached to the last run that completed
   * (AG-UI's `RUN_FINISHED.result`), or `undefined` when it attached none.
   * Cleared when the next run starts. Interrupted, cancelled, and failed
   * runs never set it.
   */
  lastRunResult: Signal<JsonValue | undefined>;

  /**
   * The token usage of the last run that completed (AG-UI's
   * `RUN_FINISHED.usage`), one entry per provider and model, or `undefined`
   * when the server reported none. Cleared when the next run starts, so a turn
   * that calls tools reports only its final run.
   */
  lastRunUsage: Signal<readonly TokenUsage[] | undefined>;

  /**
   * Why the model stopped in the last run that completed, such as `length`
   * when the answer was cut off by a token limit, or `undefined` when the
   * server did not say. Cleared when the next run starts.
   */
  lastRunFinishReason: Signal<FinishReason | undefined>;
}

/**
 * Options for the completion resource.
 *
 * @public
 * @typeParam Input - The type of completion input.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface CompletionResourceOptions<Input, State = unknown> {
  /**
   * The input to the completion.
   */
  input: Signal<Input | null | undefined>;

  /**
   * The system prompt to use for the completion.
   */
  system: ReactiveOption<string>;

  /** The initial shared agent state. */
  state?: State;

  /**
   * The tools available to the completion. Handlers run in the resource's
   * injection context. Defaults to an empty array.
   */
  tools?: Chat.AnyTool[];

  /**
   * The API URL to use for the completion.
   */
  apiUrl?: ReactiveOption<string>;

  /**
   * The debug name for the completion resource.
   */
  debugName?: string;

  /**
   * Custom transport override for this completion resource.
   */
  transport?: TransportOrFactory;

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: ReactiveOption<string | undefined>;
}

/**
 * Creates a completion resource.
 *
 * @public
 * @param options - The options for the completion resource.
 * @typeParam Input - The type of the input to the completion.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 * @returns The completion resource.
 */
export function completionResource<Input, State = unknown>(
  options: CompletionResourceOptions<Input, State>,
): CompletionResourceRef<State> {
  const { input, system } = options;
  const injector = inject(Injector);
  const tools = (options.tools ?? []).map((tool) =>
    bindToolToInjector(tool, injector),
  );
  const destroyRef = inject(DestroyRef);
  const config = ɵinjectHashbrownConfig();
  const baseUrl = computed(() =>
    options.apiUrl !== undefined
      ? readReactiveOption(options.apiUrl)
      : config.baseUrl,
  );
  const resolveTransport = computed(() =>
    createTransport({
      transport: options.transport ?? config.transport,
      readBaseUrl: baseUrl,
      createMiddleware: () =>
        config.middleware?.map((middleware): Chat.Middleware => {
          return (requestInit) =>
            runInInjectionContext(injector, () => middleware(requestInit));
        }),
    }),
  );
  const collector = ɵinjectDevelopmentCollector();
  const runtime = createChatRuntime({
    debugName: options.debugName,
    system: readReactiveOption(system),
    state: options.state,
    messages: [],
    tools,
    retries: 3,
    transport: resolveTransport(),
    threadId:
      options.threadId !== undefined
        ? readReactiveOption(options.threadId)
        : undefined,
  });
  const detach = collector.attach(runtime);

  let previousThreadId =
    options.threadId !== undefined
      ? readReactiveOption(options.threadId)
      : undefined;
  const optionsEffect = effect(() => {
    const threadId =
      options.threadId !== undefined
        ? readReactiveOption(options.threadId)
        : undefined;
    const threadChanged = threadId !== previousThreadId;
    previousThreadId = threadId;
    runtime.updateOptions({
      debugName: options.debugName,
      system: readReactiveOption(system),
      tools,
      retries: 3,
      transport: resolveTransport(),
      ...(Object.hasOwn(options, 'threadId') &&
      (threadChanged || threadId !== undefined)
        ? { threadId }
        : {}),
    });
  });

  const teardown = runtime.start();

  destroyRef.onDestroy(() => {
    detach();
    teardown();
    optionsEffect.destroy();
  });

  const messages = toNgSignal(runtime.messages);
  const state = toNgSignal(runtime.state);
  const isReceiving = toNgSignal(runtime.isReceiving);
  const isSending = toNgSignal(runtime.isSending);
  const isGenerating = toNgSignal(runtime.isGenerating);
  const isRunningToolCalls = toNgSignal(runtime.isRunningToolCalls);
  const isLoading = toNgSignal(runtime.isLoading);
  const sendingError = toNgSignal(runtime.sendingError);
  const lastRunResult = toNgSignal(runtime.lastRunResult);
  const lastRunUsage = toNgSignal(runtime.lastRunUsage);
  const lastRunFinishReason = toNgSignal(runtime.lastRunFinishReason);
  const generatingError = toNgSignal(runtime.generatingError);

  const error = toNgSignal(
    runtime.error,
    options.debugName && `${options.debugName}.error`,
  );

  connectCompletionInput(input, runtime, true);

  const rawValue = computed(
    () => {
      const lastMessage = messages().findLast(
        (message) => message.role !== 'activity',
      );

      if (
        lastMessage &&
        lastMessage.role === 'assistant' &&
        typeof lastMessage.content === 'string'
      ) {
        return lastMessage.content;
      }
      return null;
    },
    { debugName: options.debugName && `${options.debugName}.rawValue` },
  );

  const status = computed((): ResourceStatus => {
    if (isLoading()) {
      return 'loading';
    }

    if (error()) {
      return 'error';
    }

    if (rawValue() !== null) {
      return 'resolved';
    }

    return 'idle';
  });
  const value = createResourceValue(
    rawValue,
    status,
    error,
    options.debugName && `${options.debugName}.value`,
  );
  const snapshot = createResourceSnapshot(
    value,
    status,
    error,
    options.debugName && `${options.debugName}.snapshot`,
  );
  const reload = () => {
    ɵassertRuntimeMessageSchedulingAllowed(runtime);
    const currentMessages = messages();
    const lastIndex = currentMessages.findLastIndex(
      (message) => message.role !== 'activity',
    );
    const lastMessage = currentMessages[lastIndex];

    if (!lastMessage) {
      return false;
    }

    const requestMessages =
      lastMessage.role === 'assistant'
        ? currentMessages.slice(0, lastIndex)
        : currentMessages;
    const lastRequestMessage = requestMessages.findLast(
      (message) => message.role !== 'error' && message.role !== 'activity',
    );

    if (lastRequestMessage?.role !== 'user') {
      return false;
    }

    if (lastMessage.role === 'assistant') {
      runtime.setMessages(requestMessages);

      return true;
    }

    runtime.resendMessages();

    return true;
  };

  function hasValue(this: CompletionResourceRef<State>) {
    return status() !== 'error' && rawValue() !== null;
  }

  function stop(clearStreamingMessage = false) {
    runtime.stop(clearStreamingMessage);
  }

  return {
    pendingInterrupts: toNgSignal(runtime.pendingInterrupts),
    isResuming: toNgSignal(runtime.isResuming),
    resume: runtime.resume,
    pendingConversationRecovery: toNgSignal(
      runtime.pendingConversationRecovery,
    ),
    resumeConversationRecovery: runtime.resumeConversationRecovery,
    recovery: toNgSignal(runtime.recovery),
    restoreConversation: runtime.restoreConversation,
    getRecoveryConfiguration: runtime.getRecoveryConfiguration,
    state,
    setState: (nextState: State) => runtime.setState(nextState),
    value,
    snapshot,
    status,
    error,
    isLoading,
    isReceiving,
    isSending,
    isGenerating,
    isRunningToolCalls,
    sendingError,
    lastRunResult,
    lastRunUsage,
    lastRunFinishReason,
    generatingError,
    reload,
    stop,
    hasValue: hasValue as any,
  };
}
