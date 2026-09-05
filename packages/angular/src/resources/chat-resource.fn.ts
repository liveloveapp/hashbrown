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
  createChatRuntime,
  type TransportOrFactory,
} from '@hashbrownai/core';
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
   * Send a new user message to the chat.
   *
   * @param message - The user message to send.
   */
  sendMessage: (message: Chat.UserMessage) => void;

  /**
   * Replace the current chat message history.
   *
   * @param messages - The new array of chat messages.
   */
  setMessages: (messages: Chat.Message<string, Tools>[]) => void;

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
    Chat.Message<string, Tools>[] | Signal<Chat.Message<string, Tools>[]>;

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

  const optionsEffect = effect(() => {
    runtime.updateOptions({
      system: readReactiveOption(options.system),
      tools: options.tools?.map((tool) => bindToolToInjector(tool, injector)),
      debugName: options.debugName,
      transport: resolveTransport(),
      ui: false,
      ...(options.threadId !== undefined
        ? { threadId: readReactiveOption(options.threadId) }
        : {}),
    });
  });

  const teardown = runtime.start();

  destroyRef.onDestroy(() => {
    teardown();
    optionsEffect.destroy();
  });

  const rawValue = toNgSignal(
    runtime.messages,
    options.debugName && `${options.debugName}.rawValue`,
  );
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
    const messages = rawValue();
    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.role === 'assistant') {
      runtime.setMessages(messages.slice(0, -1));

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

  function sendMessage(message: Chat.UserMessage) {
    runtime.sendMessage(message);
  }

  function setMessages(messages: Chat.Message<string, Tools>[]) {
    runtime.setMessages(messages);
  }

  function setState(nextState: State) {
    runtime.setState(nextState);
  }

  function stop(clearStreamingMessage = false) {
    runtime.stop(clearStreamingMessage);
  }

  return {
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
