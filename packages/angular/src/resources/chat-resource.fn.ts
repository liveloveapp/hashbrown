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
  type PendingInterruptBatch,
  type ResumeOptions,
  type SubagentRun,
  type TokenUsage,
  type TransportOrFactory,
  ɵassertRuntimeMessageSchedulingAllowed,
} from '@hashbrownai/core';
import { ɵinjectDevelopmentCollector } from '../growth/collector';
import { ɵinjectHashbrownConfig } from '../providers/provide-hashbrown.fn';
import {
  readReactiveOption,
  readSignalLike,
  toNgSignal,
} from '../utils/signals';
import { ReactiveOption } from '../utils/types';
import { bindToolToInjector } from '../utils/create-tool.fn';
import { createTransport } from '../utils/create-transport.fn';
import {
  createResourceSnapshot,
  createResourceValue,
} from './create-resource-snapshot.fn';

/**
 * Represents the reactive chat resource, including current messages and control methods.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 * @param sendMessage - Send a new user message to the chat.
 * @param reload - Remove the last assistant response and re-send the previous user message. Returns true if a reload was performed.
 */
export interface ChatResourceRef<
  Tools extends Chat.AnyTool,
  State = unknown,
> extends Resource<Chat.Message<string, Tools>[]> {
  /** The currently visible shared agent state. */
  readonly state: Signal<State | undefined>;
  /** Observed native subagent invocations in the current conversation. */
  readonly subagents: Signal<readonly SubagentRun[]>;
  /** The complete pending interrupt batch, including while claimed. */
  readonly pendingInterrupts: Signal<PendingInterruptBatch | undefined>;
  /** Whether the resumed interaction is still running. */
  readonly isResuming: Signal<boolean>;
  /** Submit a complete response batch to resume the interrupted interaction. */
  resume(options: ResumeOptions): void;

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

  /** Replace shared agent state without starting a generation. */
  setState(state: State): void;
  /** Indicates whether the chat is currently receiving tokens. */
  isReceiving: Signal<boolean>;
  /** Indicates whether the chat is currently sending a user message. */
  isSending: Signal<boolean>;
  /** Indicates whether the chat is currently generating assistant output. */
  isGenerating: Signal<boolean>;
  /** Indicates whether the chat is running tool calls. */
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
  /**
   * Send a new user message to the chat.
   *
   * @param message - The user message to send.
   */
  sendMessage: (message: Chat.UserMessageInput) => void;

  /**
   * Replace the current chat message history.
   *
   * @param messages - The new array of chat messages.
   */
  setMessages: (messages: Chat.MessageInput<string, Tools>[]) => void;

  /**
   * Stops any currently-streaming message.
   *
   * @param clearStreamingMessage - Whether the currently-streaming message should be removed from state.
   */
  stop: (clearStreamingMessage?: boolean) => void;

  /**
   * Remove the last assistant response and re-send the previous user message. Returns true if a reload was performed.
   *
   * @returns Whether the resource was reloaded.
   */
  reload: () => boolean;

  /**
   * The last assistant message for the chat.
   *
   */
  lastAssistantMessage: Signal<
    Chat.AssistantMessage<string, Tools> | undefined
  >;
}

/**
 * Configuration options for the chat resource.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @param system - The system (assistant) prompt.
 * @param tools - Optional array of bound tools available to the chat.
 * @param messages - Optional initial list of chat messages.
 * @param debounce - Optional debounce interval in milliseconds between user inputs.
 * @param debugName - Optional name used for debugging in logs.
 * @param apiUrl - Optional override for the API base URL.
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface ChatResourceOptions<
  Tools extends Chat.AnyTool,
  State = unknown,
> {
  /**
   * The system prompt to use for the chat.
   */
  system: ReactiveOption<string>;

  /**
   * The tools to use for the chat.
   *
   * @typeParam Tools - The set of tool definitions available to the chat.
   */
  tools?: Tools[];

  /**
   * The initial messages for the chat.
   *
   * @typeParam Tools - The set of tool definitions available to the chat.
   */
  messages?:
    | Chat.MessageInput<string, Tools>[]
    | Signal<Chat.MessageInput<string, Tools>[]>;

  /** The initial shared agent state. */
  state?: State;

  /**
   * The debounce time for the chat.
   */
  debounce?: number;

  /**
   * The debug name for the chat.
   */
  debugName?: string;

  /**
   * The API URL to use for the chat.
   */
  apiUrl?: ReactiveOption<string>;

  /**
   * Custom transport to use for this chat resource.
   */
  transport?: TransportOrFactory;

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: ReactiveOption<string | undefined>;
}

/**
 * This Angular resource provides a reactive chat interface for send and receiving messages from a model.
 * The resource-based API includes signals for the current messages, status, and control methods for sending and stopping messages.
 *
 * @public
 * @remarks
 * The `chatResource` function provides the most basic functionality for un-structured chats.  Unstructured chats include things like general chats and natural language controls.
 *
 * @param options - Configuration for the chat resource.
 * @returns An object with reactive signals and methods for interacting with the chat.
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 * @example
 * This example demonstrates how to use the `chatResource` function to create a simple chat component.
 *
 * ```ts
 * const chat = chatResource({
 *   system: 'hashbrowns should be covered and smothered',
 * });
 *
 * chat.sendMessage(\{ role: 'user', content: 'Write a short story about breakfast.' \});
 * ```
 */
export function chatResource<Tools extends Chat.AnyTool, State = unknown>(
  options: ChatResourceOptions<Tools, State>,
): ChatResourceRef<Tools, State> {
  const config = ɵinjectHashbrownConfig();
  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);
  const resolveTransport = () =>
    createTransport({
      transport: options.transport ?? config.transport,
      readBaseUrl: () =>
        options.apiUrl !== undefined
          ? readReactiveOption(options.apiUrl)
          : config.baseUrl,
      createMiddleware: () =>
        config.middleware?.map((middleware): Chat.Middleware => {
          return (requestInit) =>
            runInInjectionContext(injector, () => middleware(requestInit));
        }),
    });
  const collector = ɵinjectDevelopmentCollector();
  const runtime = createChatRuntime({
    system: readReactiveOption(options.system),
    state: options.state,
    messages: options.messages ? [...readSignalLike(options.messages)] : [],
    tools: options.tools?.map((tool) => bindToolToInjector(tool, injector)),
    debugName: options.debugName,
    transport: resolveTransport(),
    ui: false,
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
      system: readReactiveOption(options.system),
      tools: options.tools?.map((tool) => bindToolToInjector(tool, injector)),
      debugName: options.debugName,
      transport: resolveTransport(),
      ui: false,
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

  const rawValue = toNgSignal(
    runtime.messages,
    options.debugName && `${options.debugName}.rawValue`,
  );
  const subagents = toNgSignal(runtime.subagents);
  const pendingInterrupts = toNgSignal(runtime.pendingInterrupts);
  const isResuming = toNgSignal(runtime.isResuming);
  const state = toNgSignal(
    runtime.state,
    options.debugName && `${options.debugName}.state`,
  );
  const isReceiving = toNgSignal(
    runtime.isReceiving,
    options.debugName && `${options.debugName}.isReceiving`,
  );
  const isSending = toNgSignal(
    runtime.isSending,
    options.debugName && `${options.debugName}.isSending`,
  );
  const isGenerating = toNgSignal(
    runtime.isGenerating,
    options.debugName && `${options.debugName}.isGenerating`,
  );
  const isRunningToolCalls = toNgSignal(
    runtime.isRunningToolCalls,
    options.debugName && `${options.debugName}.isRunningToolCalls`,
  );
  const isLoading = toNgSignal(
    runtime.isLoading,
    options.debugName && `${options.debugName}.isLoading`,
  );
  const error = toNgSignal(
    runtime.error,
    options.debugName && `${options.debugName}.error`,
  );
  const sendingError = toNgSignal(
    runtime.sendingError,
    options.debugName && `${options.debugName}.sendingError`,
  );
  const generatingError = toNgSignal(
    runtime.generatingError,
    options.debugName && `${options.debugName}.generatingError`,
  );
  const lastAssistantMessage = toNgSignal(
    runtime.lastAssistantMessage,
    options.debugName && `${options.debugName}.lastAssistantMessage`,
  );
  const lastRunResult = toNgSignal(
    runtime.lastRunResult,
    options.debugName && `${options.debugName}.lastRunResult`,
  );
  const lastRunUsage = toNgSignal(
    runtime.lastRunUsage,
    options.debugName && `${options.debugName}.lastRunUsage`,
  );
  const lastRunFinishReason = toNgSignal(
    runtime.lastRunFinishReason,
    options.debugName && `${options.debugName}.lastRunFinishReason`,
  );
  const status = computed(
    (): ResourceStatus => {
      if (isLoading()) {
        return 'loading';
      }

      if (error()) {
        return 'error';
      }

      const hasAssistantMessage = rawValue().some(
        (message) => message.role === 'assistant',
      );

      if (hasAssistantMessage) {
        return 'resolved';
      }

      return 'idle';
    },
    { debugName: options.debugName && `${options.debugName}.status` },
  );
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

  function reload() {
    ɵassertRuntimeMessageSchedulingAllowed(runtime);
    const messages = rawValue();
    // Activities never count as the last message: they trail the turn that
    // produced them, so reload drops them along with that turn's answer.
    const lastIndex = messages.findLastIndex(
      (message) => message.role !== 'activity',
    );
    const lastMessage = messages[lastIndex];

    if (lastMessage?.role === 'assistant') {
      runtime.setMessages(messages.slice(0, lastIndex));

      return true;
    }

    return false;
  }

  function hasValue() {
    return (
      status() !== 'error' &&
      rawValue().some((message) => message.role === 'assistant')
    );
  }

  function sendMessage(message: Chat.UserMessageInput) {
    runtime.sendMessage(message);
  }

  function setMessages(messages: Chat.MessageInput<string, Tools>[]) {
    runtime.setMessages(messages);
  }

  function setState(nextState: State) {
    runtime.setState(nextState);
  }

  function stop(clearStreamingMessage = false) {
    runtime.stop(clearStreamingMessage);
  }

  return {
    subagents,
    pendingInterrupts,
    isResuming,
    resume: runtime.resume,
    recovery: toNgSignal(runtime.recovery),
    restoreConversation: runtime.restoreConversation,
    getRecoveryConfiguration: runtime.getRecoveryConfiguration,
    hasValue: hasValue as any,
    snapshot,
    status,
    state,
    isReceiving,
    isSending,
    isGenerating,
    isRunningToolCalls,
    isLoading,
    sendingError,
    lastRunResult,
    lastRunUsage,
    lastRunFinishReason,
    generatingError,
    reload,
    sendMessage,
    setMessages,
    setState,
    stop,
    value,
    error,
    lastAssistantMessage,
  };
}
