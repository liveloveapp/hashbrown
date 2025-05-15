/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computed,
  inject,
  Injector,
  Resource,
  ResourceStatus,
  runInInjectionContext,
  Signal,
} from '@angular/core';
import { Chat, ChatMiddleware, fryHashbrown } from '@hashbrownai/core';
import { injectHashbrownConfig } from './provide-hashbrown.fn';
import { readSignalLike, toSignal } from './utils';

export interface ChatResourceRef<Tools extends Chat.AnyTool>
  extends Resource<Chat.Message<string, Tools>[]> {
  sendMessage: (message: Chat.UserMessage) => void;
}

/**
 * Chat resource configuration.
 *
 * @remarks The `ChatResourceOptions` interface defines the options for configuring the chat resource.
 *
 * @typedef {object} ChatResourceOptions
 * @param {string | Signal<string>} model - The model to use for the chat.
 * @param {number | Signal<number>} [temperature] - The temperature for the chat.
 * @param {BoundTool<string, any>[] | Signal<BoundTool<string, any>[]>} [tools] - The tools to use for the chat.
 * @param {number | Signal<number>} [maxTokens] - The maximum number of tokens for the chat.
 * @param {Chat.Message[] | Signal<Chat.Message[]>} [messages] - The initial messages for the chat.
 * @param {number} [debounceTime] - The debounce time for the chat.
 * @param {s.HashbrownType | Signal<s.HashbrownType>} [θresponseFormat] - The response format for the chat.
 */
export interface ChatResourceOptions<Tools extends Chat.AnyTool> {
  prompt: string | Signal<string>;
  model: string | Signal<string>;
  temperature?: number | Signal<number>;
  tools?: Tools[];
  maxTokens?: number | Signal<number>;
  messages?:
    | Chat.Message<string, Tools>[]
    | Signal<Chat.Message<string, Tools>[]>;
  debounce?: number;
}

/**
 * Creates and returns a chat resource with reactive signals and message-handling functions.
 *
 * @description
 * The `chatResource` function creates a chat resource that manages the state of chat messages, tools, and the structured response format configurations.
 * It provides a reactive interface for sending messages and handling responses with the LLM.
 * The `chatResource` function is the simplest way to communicate with the LLM via text.
 * The other resources exposed by hashbrown build on top of `chatResource` and provide additional functionality.
 *
 * @example
 * ```typescript
 * import { chatResource } from '@hashbrownai/angular';
 *
 * @Component({
 *    template: `
 *      <app-simple-chat-message [messages]="chat.value()" />
 *      <app-chat-composer (sendMessage)="sendMessage($event)" />
 *    `,
 * }) export class AppComponent {
 *   chat = chatResource({
 *     model: 'gpt-4o',
 *     messages: [
 *       {
 *         role: 'system',
 *         content:
 *           'You are a helpful guide for hashbrown, which enables Angular developers to build joyful and meaningful AI-powered experiences in their web apps.'
 *        },
 *     ]
 *   });
 *
 *   sendMessage() {
 *     this.chat.sendMessage({
 *       role: 'user',
 *       content: 'What is hashbrown?'
 *     });
 *   }
 * }
 * ```
 *
 * @param options - The configuration options for the chat resource.
 *
 * @returns An object with reactive signals and a sendMessage function.
 */
export function chatResource<Tools extends Chat.AnyTool>(
  options: ChatResourceOptions<Tools>,
): ChatResourceRef<Tools> {
  const config = injectHashbrownConfig();
  const injector = inject(Injector);
  const hashbrown = fryHashbrown<string, Tools>({
    apiUrl: config.baseUrl,
    middleware: config.middleware?.map((m): ChatMiddleware => {
      return (requestInit) =>
        runInInjectionContext(injector, () => m(requestInit));
    }),
    prompt: readSignalLike(options.prompt),
    model: readSignalLike(options.model),
    temperature: options.temperature && readSignalLike(options.temperature),
    tools: options.tools,
    maxTokens: options.maxTokens && readSignalLike(options.maxTokens),
    emulateStructuredOutput: config.emulateStructuredOutput,
  });
  const value = toSignal(hashbrown.observeMessages);
  const isReceiving = toSignal(hashbrown.observeIsReceiving);
  const isSending = toSignal(hashbrown.observeIsSending);
  const isRunningToolCalls = toSignal(hashbrown.observeIsRunningToolCalls);
  const error = toSignal(hashbrown.observeError);

  const status = computed(() => {
    if (isReceiving() || isSending() || isRunningToolCalls()) {
      return ResourceStatus.Loading;
    }

    if (error()) {
      return ResourceStatus.Error;
    }

    const hasAssistantMessage = value().some(
      (message) => message.role === 'assistant',
    );

    if (hasAssistantMessage) {
      return ResourceStatus.Resolved;
    }

    return ResourceStatus.Idle;
  });

  const isLoading = computed(() => {
    return isReceiving() || isSending() || isRunningToolCalls();
  });

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

  return {
    hasValue: hasValue as any,
    status,
    isLoading,
    reload,
    sendMessage,
    value,
    error,
  };
}
