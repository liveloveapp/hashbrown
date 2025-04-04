import {
  inject,
  Injector,
  runInInjectionContext,
  Signal,
  computed,
  signal,
  WritableSignal,
  effect,
  Resource,
  ResourceStatus,
  WritableResource,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import OpenAI from 'openai';
import {
  ChatMessage,
  AssistantMessage,
  ToolMessage,
  ChatCompletionChunk,
} from './types';
import { FetchService } from './fetch.service';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  concatMap,
  debounceTime,
  EMPTY,
  filter,
  from,
  map,
  Observable,
  of,
  Subject,
  takeUntil,
  tap,
  toArray,
} from 'rxjs';
import { FunctionParameters } from 'openai/resources';
import { BoundTool } from './create-tool.fn';
import { s } from './schema';

export interface ChatResource extends WritableResource<ChatMessage[]> {
  sendMessage: (message: ChatMessage | ChatMessage[]) => void;
}

/**
 * Chat resource configuration.
 */
export type ChatResourceConfig = {
  model: string | Signal<string>;
  temperature?: number | Signal<number>;
  tools?: BoundTool<string, any>[];
  maxTokens?: number | Signal<number>;
  messages?: ChatMessage[];
  responseFormat?: s.AnyType | Signal<s.AnyType>;
};

/**
 * Merges existing and new tool calls.
 *
 * @param existingCalls - The existing tool calls.
 * @param newCalls - The new tool calls to merge.
 * @returns The merged array of tool calls.
 */
function mergeToolCalls(
  existingCalls: AssistantMessage['tool_calls'] = [],
  newCalls: AssistantMessage['tool_calls'] = []
): AssistantMessage['tool_calls'] {
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
function updateMessagesWithDelta(
  messages: ChatMessage[],
  delta: Partial<ChatMessage>
): ChatMessage[] {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && lastMessage.role === 'assistant') {
    const updatedToolCalls = mergeToolCalls(
      lastMessage.tool_calls,
      (delta as AssistantMessage).tool_calls ?? []
    );
    const updatedMessage: ChatMessage = {
      ...lastMessage,
      content: (lastMessage.content ?? '') + (delta.content ?? ''),
      tool_calls: updatedToolCalls,
    };
    return [...messages.slice(0, -1), updatedMessage];
  } else if (delta.role === 'assistant') {
    return [
      ...messages,
      {
        role: 'assistant',
        content: delta.content ?? '',
        tool_calls: delta.tool_calls ?? [],
      },
    ];
  }
  return messages;
}

/**
 * Creates OpenAI tool definitions from the provided tools.
 *
 * @param tools - The list of tools from configuration.
 * @returns An array of tool definitions for the chat completion.
 */
function createToolDefinitions(
  tools: BoundTool<string, s.ObjectType<Record<string, s.AnyType>>>[] = []
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((boundTool): OpenAI.Chat.Completions.ChatCompletionTool => {
    const tool = boundTool.toTool();

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema as unknown as FunctionParameters,
        strict: true,
      },
    };
  });
}

/**
 * Processes a chat completion response by updating the messages.
 *
 * @param response - The response from the chat completion stream.
 * @param messages - The signal holding the messages array.
 */
function processChatResponse(
  response: ChatCompletionChunk,
  messagesSignal: WritableSignal<ChatMessage[]>
): void {
  response.choices.forEach((choice: ChatCompletionChunk['choices'][number]) => {
    messagesSignal.update((currentMessages) =>
      updateMessagesWithDelta(currentMessages, choice.delta as AssistantMessage)
    );
  });
}

/**
 * Finalizes a chat session by checking for tool calls.
 *
 * @param messages - The signal holding the messages array.
 * @param toolCallSubject - The subject to emit tool call messages.
 * @param isSending - The signal indicating sending status.
 * @param isReceiving - The signal indicating receiving status.
 */
function finalizeChat(
  messagesSignal: WritableSignal<ChatMessage[]>,
  toolCallSubject: Subject<AssistantMessage>,
  isSending: { set(val: boolean): void },
  isReceiving: { set(val: boolean): void }
): void {
  const currentMessages = messagesSignal();
  const lastMessage = currentMessages[currentMessages.length - 1];
  if (
    lastMessage &&
    lastMessage.role === 'assistant' &&
    lastMessage.tool_calls &&
    lastMessage.tool_calls.length > 0
  ) {
    toolCallSubject.next(lastMessage as AssistantMessage);
  }
  isSending.set(false);
  isReceiving.set(false);
}

/**
 * Processes an assistant message containing a tool call.
 *
 * @param message - The assistant message with a tool call.
 * @param configTools - The list of tools from configuration.
 * @param injector - The Angular injector.
 * @returns An observable that emits a tool message.
 */
function processToolCallMessage(
  message: AssistantMessage,
  configTools: BoundTool<string, any>[] = [],
  injector: Injector
): Observable<ToolMessage[]> {
  const toolCalls = message.tool_calls;

  if (!toolCalls) return EMPTY;

  return from(toolCalls).pipe(
    concatMap((toolCall) => {
      const tool = configTools.find((t) => t.name === toolCall.function.name);
      if (!tool) {
        throw new Error(`Tool ${toolCall.function.name} not found`);
      }

      const result = runInInjectionContext(injector, () =>
        (tool.handler as any)(
          (s.parse as any)(
            tool.schema as any,
            JSON.parse(toolCall.function.arguments)
          )
        )
      );

      return from(result).pipe(
        map(
          (result): ToolMessage => ({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: toolCall.id,
          })
        ),
        catchError((err): Observable<ToolMessage> => {
          return of({
            role: 'tool',
            content: JSON.stringify({ error: err.message }),
            tool_call_id: toolCall.id,
          });
        })
      );
    }),
    toArray()
  );
}

/**
 * Creates and returns a chat resource with reactive signals and message-handling functions.
 *
 * @param config - The chat resource configuration.
 * @returns An object with reactive signals and a sendMessage function.
 */
export function chatResource(config: ChatResourceConfig): ChatResource {
  const injector = inject(Injector);
  const fetchService = inject(FetchService);
  const messagesSignal = signal<ChatMessage[]>(config.messages || []);
  const isSending = signal(false);
  const isReceiving = signal(false);
  const error = signal<Error | null>(null);

  const toolDefinitions = createToolDefinitions(config.tools);
  const toolCallMessages$ = new Subject<AssistantMessage>();
  const abortSignal = new Subject<void>();
  const reloadSignal = new BehaviorSubject<true>(true);

  const computedModel = computed(() =>
    typeof config.model === 'string' ? config.model : config.model()
  );
  const computedTemperature = computed(() => {
    if (typeof config.temperature === 'number') {
      return config.temperature;
    }
    if (!config.temperature) {
      return undefined;
    }

    return config.temperature();
  });
  const computedMaxTokens = computed(() => {
    if (typeof config.maxTokens === 'number') {
      return config.maxTokens;
    }
    if (!config.maxTokens) {
      return undefined;
    }

    return config.maxTokens();
  });
  const computedResponseFormat = computed(() =>
    typeof config.responseFormat === 'function'
      ? config.responseFormat()
      : config.responseFormat
  );
  const serializedResponseFormat = computed(() => {
    const currentFormat = computedResponseFormat();

    if (currentFormat) {
      return s.toJsonSchema(currentFormat);
    }

    return undefined;
  });

  effect(() => {
    console.log('Current Messages', messagesSignal());
  });

  // Handle client messages and stream chat responses.
  combineLatest([toObservable(messagesSignal), reloadSignal.asObservable()])
    .pipe(
      debounceTime(150),
      filter(([messages]) => {
        const hasMessages = messages.length > 0;
        const lastMessageNeedsToBeSent =
          messages[messages.length - 1]?.role !== 'assistant' &&
          messages[messages.length - 1]?.role !== 'system';
        return hasMessages && lastMessageNeedsToBeSent;
      }),
      concatMap(([messages]) => {
        isSending.set(true);
        isReceiving.set(false);
        console.log('sending these messages', messages);
        return fetchService
          .streamChatCompletionWithTools('http://localhost:3000/chat', {
            model: computedModel(),
            messages: messages,
            tools: toolDefinitions,
            max_tokens: computedMaxTokens(),
            temperature: computedTemperature(),
            response_format: serializedResponseFormat(),
          })
          .pipe(
            catchError((err) => {
              error.set(err);
              return EMPTY;
            }),
            tap({
              next: (response) => {
                isSending.set(false);
                isReceiving.set(true);
                processChatResponse(response, messagesSignal);
              },
              error: (err) => {
                error.set(err);
              },
              complete: () => {
                finalizeChat(
                  messagesSignal,
                  toolCallMessages$,
                  isSending,
                  isReceiving
                );
              },
            }),
            takeUntil(abortSignal)
          );
      }),
      takeUntilDestroyed()
    )
    .subscribe();

  // Process tool call messages.
  toolCallMessages$
    .pipe(
      takeUntilDestroyed(),
      concatMap((message) =>
        processToolCallMessage(message, config.tools, injector)
      )
    )
    .subscribe((toolMessages) =>
      messagesSignal.update((currentMessages) => [
        ...currentMessages,
        ...toolMessages,
      ])
    );

  function sendMessage(message: ChatMessage | ChatMessage[]) {
    if (isSending() || isReceiving()) {
      throw new Error('Cannot send message while sending or receiving');
    }

    messagesSignal.update((currentMessages) => [
      ...currentMessages,
      ...(Array.isArray(message) ? message : [message]),
    ]);
  }

  function setMessages(newMessages: ChatMessage[]) {
    abortSignal.next();

    // Reset all state
    error.set(null);
    isSending.set(false);
    isReceiving.set(false);

    // Clear existing messages and set new ones
    messagesSignal.set(newMessages);
  }

  function updateMessages(updater: (messages: ChatMessage[]) => ChatMessage[]) {
    abortSignal.next();

    // Reset all state
    error.set(null);
    isSending.set(false);
    isReceiving.set(false);

    // Update messages
    messagesSignal.update(updater);
  }

  function hasValue(this: ChatResource) {
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
      abortSignal.next();
      reloadSignal.next(true);

      return true;
    }

    return false;
  }

  return {
    value: messagesSignal,
    status,
    isLoading,
    sendMessage,
    set: setMessages,
    update: updateMessages,
    error,
    hasValue: hasValue as any,
    reload,
    asReadonly: (): Resource<ChatMessage[]> => ({
      value: messagesSignal,
      status,
      isLoading,
      error,
      hasValue: hasValue as any,
      reload,
    }),
  };
}
