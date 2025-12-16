/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computed,
  DestroyRef,
  inject,
  Injector,
  Resource,
  ResourceStatus,
  runInInjectionContext,
  Signal,
} from '@angular/core';
import {
  Chat,
  fryHashbrown,
  type ModelInput,
  type TransportOrFactory,
} from '@hashbrownai/core';
import { ɵinjectHashbrownConfig } from '../providers/provide-hashbrown.fn';
import { readSignalLike, toNgSignal } from '../utils/signals';
import { SignalLike } from '../utils/types';
import { bindToolToInjector } from '../utils/create-tool.fn';

/**
 * Represents the reactive chat resource, including current messages and control methods.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @param sendMessage - Send a new user message to the chat.
 * @param reload - Remove the last assistant response and re-send the previous user message. Returns true if a reload was performed.
 */
export interface ChatResourceRef<Tools extends Chat.AnyTool>
  extends Resource<Chat.Message<string, Tools>[]> {
  /** Indicates whether the chat is currently receiving tokens. */
  isReceiving: Signal<boolean>;
  /** Indicates whether the chat is currently sending a user message. */
  isSending: Signal<boolean>;
  /** Indicates whether the chat is currently generating assistant output. */
  isGenerating: Signal<boolean>;
  /** Indicates whether the chat is running tool calls. */
  isRunningToolCalls: Signal<boolean>;
  /** Aggregate loading flag across transport, generation, tool calls, and thread load/save. */
  isLoading: Signal<boolean>;
  /** Indicates whether a thread load request is in flight. */
  isLoadingThread: Signal<boolean>;
  /** Indicates whether a thread save request is in flight. */
  isSavingThread: Signal<boolean>;
  /** Transport/request error before generation frames arrive. */
  sendingError: Signal<Error | undefined>;
  /** Error emitted during generation frames. */
  generatingError: Signal<Error | undefined>;
  /** Thread loading error, if present. */
  threadLoadError: Signal<{ error: string; stacktrace?: string } | undefined>;
  /** Thread saving error, if present. */
  threadSaveError: Signal<{ error: string; stacktrace?: string } | undefined>;
  /**
   * Send a new user message to the chat.
   *
   * @param message - The user message to send.
   */
  sendMessage: (message: Chat.UserMessage) => void;

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
 * @param model - The model identifier to use for the chat.
 * @param tools - Optional array of bound tools available to the chat.
 * @param messages - Optional initial list of chat messages.
 * @param debounce - Optional debounce interval in milliseconds between user inputs.
 * @param debugName - Optional name used for debugging in logs.
 * @param apiUrl - Optional override for the API base URL.
 */
export interface ChatResourceOptions<Tools extends Chat.AnyTool> {
  /**
   * The system prompt to use for the chat.
   */
  system: string | Signal<string>;

  /**
   * The model to use for the chat.
   */
  model: ModelInput | Signal<ModelInput>;

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
    | Chat.Message<string, Tools>[]
    | Signal<Chat.Message<string, Tools>[]>;

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
  apiUrl?: string;

  /**
   * Custom transport to use for this chat resource.
   */
  transport?: TransportOrFactory;

  /**
   * Optional thread identifier used to load or continue an existing conversation.
   */
  threadId?: SignalLike<string | undefined>;
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
 * @example
 * This example demonstrates how to use the `chatResource` function to create a simple chat component.
 *
 * ```ts
 * const chat = chatResource({
 *   system: 'hashbrowns should be covered and smothered',
 *   model: 'gpt-5',
 * });
 *
 * chat.sendMessage(\{ role: 'user', content: 'Write a short story about breakfast.' \});
 * ```
 */
export function chatResource<Tools extends Chat.AnyTool>(
  options: ChatResourceOptions<Tools>,
): ChatResourceRef<Tools> {
  const config = ɵinjectHashbrownConfig();
  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);
  const hashbrown = fryHashbrown({
    apiUrl: options.apiUrl ?? config.baseUrl,
    middleware: config.middleware?.map((m): Chat.Middleware => {
      return (requestInit) =>
        runInInjectionContext(injector, () => m(requestInit));
    }),
    system: readSignalLike(options.system),
    model: readSignalLike(options.model),
    tools: options.tools?.map((tool) => bindToolToInjector(tool, injector)),
    emulateStructuredOutput: config.emulateStructuredOutput,
    debugName: options.debugName,
    transport: options.transport ?? config.transport,
    ui: false,
    threadId: readSignalLike(options.threadId),
  });

  const teardown = hashbrown.sizzle();

  destroyRef.onDestroy(() => teardown());

  const value = toNgSignal(
    hashbrown.messages,
    options.debugName && `${options.debugName}.value`,
  );
  const isReceiving = toNgSignal(
    hashbrown.isReceiving,
    options.debugName && `${options.debugName}.isReceiving`,
  );
  const isSending = toNgSignal(
    hashbrown.isSending,
    options.debugName && `${options.debugName}.isSending`,
  );
  const isGenerating = toNgSignal(
    hashbrown.isGenerating,
    options.debugName && `${options.debugName}.isGenerating`,
  );
  const isRunningToolCalls = toNgSignal(
    hashbrown.isRunningToolCalls,
    options.debugName && `${options.debugName}.isRunningToolCalls`,
  );
  const isLoading = toNgSignal(
    hashbrown.isLoading,
    options.debugName && `${options.debugName}.isLoading`,
  );
  const error = toNgSignal(
    hashbrown.error,
    options.debugName && `${options.debugName}.error`,
  );
  const sendingError = toNgSignal(
    hashbrown.sendingError,
    options.debugName && `${options.debugName}.sendingError`,
  );
  const generatingError = toNgSignal(
    hashbrown.generatingError,
    options.debugName && `${options.debugName}.generatingError`,
  );
  const lastAssistantMessage = toNgSignal(
    hashbrown.lastAssistantMessage,
    options.debugName && `${options.debugName}.lastAssistantMessage`,
  );
  const isLoadingThread = toNgSignal(
    hashbrown.isLoadingThread,
    options.debugName && `${options.debugName}.isLoadingThread`,
  );
  const isSavingThread = toNgSignal(
    hashbrown.isSavingThread,
    options.debugName && `${options.debugName}.isSavingThread`,
  );
  const threadLoadError = toNgSignal(
    hashbrown.threadLoadError,
    options.debugName && `${options.debugName}.threadLoadError`,
  );
  const threadSaveError = toNgSignal(
    hashbrown.threadSaveError,
    options.debugName && `${options.debugName}.threadSaveError`,
  );

  const status = computed(
    (): ResourceStatus => {
      if (isLoading()) {
        return 'loading';
      }

      if (error()) {
        return 'error';
      }

      const hasAssistantMessage = value().some(
        (message) => message.role === 'assistant',
      );

      if (hasAssistantMessage) {
        return 'resolved';
      }

      return 'idle';
    },
    { debugName: options.debugName && `${options.debugName}.status` },
  );

  function reload() {
    const lastMessage = value()[value().length - 1];

    if (lastMessage.role === 'assistant') {
      hashbrown.setMessages(value().slice(0, -1));

      return true;
    }

    return false;
  }

  function hasValue() {
    return value().some((message) => message.role === 'assistant');
  }

  function sendMessage(message: Chat.UserMessage) {
    hashbrown.sendMessage(message);
  }

  function stop(clearStreamingMessage = false) {
    hashbrown.stop(clearStreamingMessage);
  }

  return {
    hasValue: hasValue as any,
    status,
    isReceiving,
    isSending,
    isGenerating,
    isRunningToolCalls,
    isLoading,
    isLoadingThread,
    isSavingThread,
    sendingError,
    generatingError,
    threadLoadError,
    threadSaveError,
    reload,
    sendMessage,
    stop,
    value,
    error,
    lastAssistantMessage,
  };
}
