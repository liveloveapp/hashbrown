/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computed,
  effect,
  inject,
  Injector,
  isSignal,
  linkedSignal,
  Resource,
  ResourceStatus,
  runInInjectionContext,
  Signal,
  signal,
  untracked,
} from '@angular/core';
import { Chat, generateNextMessage, s } from '@hashbrownai/core';
import { BoundTool } from './create-tool.fn';
import { injectHashbrownConfig } from './provide-hashbrown.fn';

export interface ChatResourceRef extends Resource<Chat.Message[]> {
  sendMessage: (message: Chat.UserMessage | Chat.UserMessage[]) => void;
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
export interface ChatResourceOptions {
  model: string | Signal<string>;
  temperature?: number | Signal<number>;
  tools?: BoundTool<string, any>[] | Signal<BoundTool<string, any>[]>;
  maxTokens?: number | Signal<number>;
  messages?: Chat.Message[] | Signal<Chat.Message[]>;
  debounceTime?: number;
  /**
   * @internal
   */
  θresponseFormat?: s.HashbrownType | Signal<s.HashbrownType>;
}

/**
 * Merges existing and new tool calls.
 *
 * @param existingCalls - The existing tool calls.
 * @param newCalls - The new tool calls to merge.
 * @returns The merged array of tool calls.
 */
function mergeToolCalls(
  existingCalls: Chat.AssistantMessage['tool_calls'] = [],
  newCalls: Chat.AssistantMessage['tool_calls'] = [],
): Chat.AssistantMessage['tool_calls'] {
  const merged = [...existingCalls];
  newCalls.forEach((newCall) => {
    const index = merged.findIndex((call) => call.index === newCall.index);
    if (index !== -1) {
      const existing = merged[index];
      merged[index] = {
        ...existing,
        function: {
          ...existing.function,
          arguments:
            existing.function.arguments + (newCall.function.arguments ?? ''),
        },
      };
    } else {
      merged.push(newCall);
    }
  });
  return merged;
}

/**
 * Updates the messages array with an incoming assistant delta.
 *
 * @param messages - The current messages array.
 * @param delta - The incoming message delta.
 * @returns The updated messages array.
 */
export function updateMessagesWithDelta(
  message: Chat.Message | null,
  delta: Partial<Chat.Message>,
): Chat.Message | null {
  if (message && message.role === 'assistant') {
    const updatedToolCalls = mergeToolCalls(
      message.tool_calls,
      (delta as Chat.AssistantMessage).tool_calls ?? [],
    );
    const updatedMessage: Chat.Message = {
      ...message,
      content: (message.content ?? '') + (delta.content ?? ''),
      tool_calls: updatedToolCalls,
    };
    return updatedMessage;
  } else if (delta.role === 'assistant') {
    return {
      role: 'assistant',
      content: delta.content ?? '',
      tool_calls: delta.tool_calls ?? [],
    };
  }
  return message;
}

/**
 * Creates OpenAI tool definitions from the provided tools.
 *
 * @param tools - The list of tools from configuration.
 * @returns An array of tool definitions for the chat completion.
 */
function createToolDefinitions(
  tools: BoundTool<
    string,
    s.ObjectType<Record<string, s.HashbrownType>>
  >[] = [],
): Chat.Tool[] {
  return tools.map((boundTool): Chat.Tool => boundTool.toTool());
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
export function chatResource(options: ChatResourceOptions): ChatResourceRef {
  const injector = inject(Injector);
  const config = injectHashbrownConfig();
  const debounceTime = options.debounceTime ?? 150;
  const providedMessages = computed((): Chat.Message[] => {
    if (isSignal(options.messages)) {
      return options.messages() ?? [];
    }
    return options.messages ?? [];
  });
  const providedTools = computed((): BoundTool<string, any>[] => {
    if (isSignal(options.tools)) {
      return options.tools() ?? [];
    }
    return options.tools ?? [];
  });
  const toolDefinitions = computed((): Chat.Tool[] =>
    createToolDefinitions(providedTools()),
  );
  const nonStreamingMessages = linkedSignal(providedMessages);
  const streamingMessages = signal<Chat.Message | null>(null);
  const messages = computed((): Chat.Message[] => {
    const _streamingMessage = streamingMessages();
    const _nonStreamingMessages = nonStreamingMessages();

    return [
      ..._nonStreamingMessages,
      ...(_streamingMessage ? [_streamingMessage] : []),
    ];
  });
  const isSending = signal(false);
  const isReceiving = signal(false);
  const error = signal<Error | null>(null);
  const model = computed(() =>
    typeof options.model === 'string' ? options.model : options.model(),
  );
  const temperature = computed(() => {
    if (isSignal(options.temperature)) {
      return options.temperature();
    }

    return options.temperature;
  });
  const maxTokens = computed(() => {
    if (isSignal(options.maxTokens)) {
      return options.maxTokens();
    }

    return options.maxTokens;
  });
  const responseFormat = computed((): s.HashbrownType | undefined => {
    const responseFormat = options.θresponseFormat;

    if (isSignal(responseFormat)) {
      return responseFormat();
    }

    return responseFormat;
  });
  let abortFn: (() => void) | null = null;

  effect((onCleanup) => {
    const lastMessage =
      nonStreamingMessages()[nonStreamingMessages().length - 1];
    const needsToSendMessage =
      lastMessage &&
      (lastMessage.role === 'user' || lastMessage.role === 'tool');
    const needsToBeDebounced = lastMessage && lastMessage.role === 'user';

    if (!needsToSendMessage) return;

    const abortController = new AbortController();

    abortFn = () => {
      streamingMessages.set(null);
      abortController.abort();
    };

    onCleanup(abortFn);

    (async () => {
      isSending.set(true);

      if (needsToBeDebounced) {
        await new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            resolve(undefined);
          }, debounceTime);

          abortController.signal.addEventListener('abort', () =>
            clearTimeout(timeoutId),
          );
        });
      }

      if (abortController.signal.aborted) return;

      let _streamingMessage: Chat.Message | null = null;

      const onChunk = (chunk: Chat.CompletionChunk) => {
        if (abortController.signal.aborted) return;

        isReceiving.set(true);
        isSending.set(false);

        if (!chunk.choices || !chunk.choices[0]) {
          return;
        }

        _streamingMessage = updateMessagesWithDelta(
          _streamingMessage,
          chunk.choices[0].delta as Chat.Message,
        );

        streamingMessages.set(_streamingMessage);
      };

      const onError = (err: Error) => {
        if (abortController.signal.aborted) return;

        isSending.set(false);
        isReceiving.set(false);
        error.set(err);
      };

      const onComplete = () => {
        if (abortController.signal.aborted) return;

        isSending.set(false);
        isReceiving.set(false);
        nonStreamingMessages.update((currentMessages) => {
          if (_streamingMessage) {
            return [...currentMessages, _streamingMessage];
          }
          return currentMessages;
        });
        streamingMessages.set(null);
      };

      try {
        for await (const chunk of generateNextMessage({
          apiUrl: config.baseUrl,
          middleware: [],
          abortSignal: abortController.signal,
          fetchImplementation: window.fetch.bind(window),
          model: untracked(model),
          temperature: untracked(temperature),
          tools: untracked(toolDefinitions),
          maxTokens: untracked(maxTokens),
          responseFormat: untracked(responseFormat),
          messages: nonStreamingMessages(),
        })) {
          onChunk(chunk);
        }
        onComplete();
      } catch (err) {
        onError(err as Error);
      }
    })();
  });

  effect(
    () => {
      const lastMessage =
        nonStreamingMessages()[nonStreamingMessages().length - 1];

      if (!lastMessage || lastMessage.role !== 'assistant') {
        return;
      }

      const toolCalls = lastMessage.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        return;
      }

      const toolCallResults = untracked(() => {
        const tools = providedTools();

        return toolCalls.map((toolCall) => {
          const tool = tools.find((t) => t.name === toolCall.function.name);

          if (!tool) {
            return Promise.reject(
              new Error(`Tool ${toolCall.function.name} not found`),
            );
          }

          try {
            const args = s.parse(
              tool.schema,
              JSON.parse(toolCall.function.arguments),
            );

            return Promise.resolve(
              runInInjectionContext(injector, () => tool.handler(args)),
            );
          } catch (error) {
            return Promise.reject(error);
          }
        });
      });

      Promise.allSettled(toolCallResults).then((result) => {
        const toolMessages: Chat.ToolMessage[] = toolCalls.map(
          (toolCall, index) => ({
            role: 'tool',
            content: result[index],
            tool_call_id: toolCall.id,
            tool_name: toolCall.function.name,
          }),
        );
        nonStreamingMessages.update((currentMessages) => [
          ...currentMessages,
          ...toolMessages,
        ]);
      });
    },
    {
      debugName: 'tool-call-effect',
    },
  );

  function sendMessage(message: Chat.Message | Chat.Message[]) {
    if (isSending() || isReceiving()) {
      throw new Error('Cannot send message while sending or receiving');
    }

    nonStreamingMessages.update((currentMessages) => [
      ...currentMessages,
      ...(Array.isArray(message) ? message : [message]),
    ]);
  }

  function hasValue(this: ChatResourceRef) {
    return true;
  }

  const isLoading = computed(() => isSending() || isReceiving());
  const status = computed(() => {
    if (isLoading()) {
      return ResourceStatus.Loading;
    }

    if (error()) {
      return ResourceStatus.Error;
    }

    return ResourceStatus.Idle;
  });

  function reload() {
    if (isLoading()) {
      abortFn?.();

      return true;
    }

    return false;
  }

  effect(() => {
    console.log('Current Messages', messages());
  });

  return {
    value: messages,
    status,
    isLoading,
    sendMessage,
    error,
    hasValue: hasValue as any,
    reload,
  };
}
