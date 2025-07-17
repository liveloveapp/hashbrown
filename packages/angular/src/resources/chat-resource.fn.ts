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
import { Chat, fryHashbrown, KnownModelIds } from '@hashbrownai/core';
import { ɵinjectHashbrownConfig } from '../providers/provide-hashbrown.fn';
import { readSignalLike, toNgSignal } from '../utils/signals';

/**
 * Represents the reactive chat resource, including current messages and control methods.
 *
 * @interface ChatResourceRef
 * @template Tools
 * @extends {Resource<Chat.Message<string, Tools>[]>}
 * @property {(message: Chat.UserMessage) => void} sendMessage - Send a new user message to the chat.
 * @property {() => boolean} reload - Remove the last assistant response and re-send the previous user message. Returns true if a reload was performed.
 */
export interface ChatResourceRef<Tools extends Chat.AnyTool>
  extends Resource<Chat.Message<string, Tools>[]> {
  sendMessage: (message: Chat.UserMessage) => void;
  /**
   * Stops any currently-streaming message.
   * @param clearStreamingMessage Whether the currently-streaming message should be removed from state.
   */
  stop: (clearStreamingMessage?: boolean) => void;
  reload: () => boolean;
  lastAssistantMessage: Signal<
    Chat.AssistantMessage<string, Tools> | undefined
  >;
}

/**
 * Configuration options for the chat resource.
 *
 * @interface ChatResourceOptions
 * @template Tools
 * @property {string | Signal<string>} system - The system (assistant) prompt.
 * @property {string | Signal<string>} model - The model identifier to use for the chat.
 * @property {Tools[]} [tools] - Optional array of bound tools available to the chat.
 * @property {Chat.Message<string, Tools>[] | Signal<Chat.Message<string, Tools>[]>} [messages] - Optional initial list of chat messages.
 * @property {number} [debounce] - Optional debounce interval in milliseconds between user inputs.
 * @property {string} [debugName] - Optional name used for debugging in logs.
 * @property {string} [apiUrl] - Optional override for the API base URL.
 */
export interface ChatResourceOptions<Tools extends Chat.AnyTool> {
  /**
   * The system prompt to use for the chat.
   */
  system: string | Signal<string>;
  /**
   * The model to use for the chat.
   */
  model: KnownModelIds | Signal<KnownModelIds>;
  /**
   * The tools to use for the chat.
   */
  tools?: Tools[];
  /**
   * The initial messages for the chat.
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
}

/**
 * Creates a chat resource for managing LLM-driven conversations.
 *
 * @template Tools
 * @param {ChatResourceOptions<Tools>} options - Configuration for the chat resource.
 * @returns {ChatResourceRef<Tools>} An object with reactive signals and methods for interacting with the chat.
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
    tools: options.tools,
    emulateStructuredOutput: config.emulateStructuredOutput,
    debugName: options.debugName,
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
  const isRunningToolCalls = toNgSignal(
    hashbrown.isRunningToolCalls,
    options.debugName && `${options.debugName}.isRunningToolCalls`,
  );
  const error = toNgSignal(
    hashbrown.error,
    options.debugName && `${options.debugName}.error`,
  );
  const lastAssistantMessage = toNgSignal(
    hashbrown.lastAssistantMessage,
    options.debugName && `${options.debugName}.lastAssistantMessage`,
  );

  const status = computed(
    (): ResourceStatus => {
      if (isReceiving() || isSending() || isRunningToolCalls()) {
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

  const isLoading = computed(
    () => {
      return isReceiving() || isSending() || isRunningToolCalls();
    },
    { debugName: options.debugName && `${options.debugName}.isLoading` },
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
    isLoading,
    reload,
    sendMessage,
    stop,
    value,
    error,
    lastAssistantMessage,
  };
}
