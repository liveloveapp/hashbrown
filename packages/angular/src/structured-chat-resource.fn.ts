/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, isSignal, Resource, Signal, signal } from '@angular/core';
import { chatResource } from './chat-resource.fn';
import { Chat, s, Tater } from '@hashbrownai/core';
import { BoundTool } from './create-tool.fn';

export interface StructuredChatResourceRef<T extends s.HashbrownType>
  extends Resource<Chat.Message<s.Infer<T>>[]> {
  sendMessage: (message: Chat.UserMessage | Chat.UserMessage[]) => void;
}

export interface StructuredChatResourceOptions<T extends s.HashbrownType> {
  model: string | Signal<string>;
  temperature?: number | Signal<number>;
  tools?: BoundTool<string, any>[] | Signal<BoundTool<string, any>[]>;
  maxTokens?: number | Signal<number>;
  messages?: Chat.Message<s.Infer<T>>[] | Signal<Chat.Message<s.Infer<T>>[]>;
  debounceTime?: number;
  responseFormat: T | Signal<T>;
}

function stringifyMessage<T extends s.HashbrownType>(
  message: Chat.Message<s.Infer<T>>,
): Chat.Message<string> {
  if (message.role === 'assistant') {
    return {
      ...message,
      content: message.content ? JSON.stringify(message.content) : undefined,
    };
  }
  return message;
}

export function structuredChatResource<T extends s.HashbrownType>(
  options: StructuredChatResourceOptions<T>,
): StructuredChatResourceRef<T> {
  const { responseFormat: providedResponseFormat, messages, ...rest } = options;
  const responseFormat = isSignal(providedResponseFormat)
    ? providedResponseFormat
    : signal(providedResponseFormat);
  const stringifiedMessages = computed(() => {
    const providedMessages = isSignal(messages) ? messages() : messages;

    if (!providedMessages) return [];

    return providedMessages.map(stringifyMessage);
  });

  const chat = chatResource({
    ...rest,
    messages: messages ? stringifiedMessages : undefined,
    θresponseFormat: responseFormat,
  });

  const parsedMessages = computed(() => {
    return chat.value().reduce(
      (acc, message) => {
        if (message.role === 'assistant' && message.content) {
          try {
            const streamParser = new Tater.StreamSchemaParser(responseFormat());
            const streamResult = streamParser.parse(message.content);
            acc.push({ ...message, content: streamResult });
          } catch (error) {
            // Do nothing for right now
          }
        } else {
          acc.push(message);
        }
        return acc;
      },
      [] as Chat.Message<s.Infer<T>>[],
    );
  });

  return {
    ...chat,
    value: parsedMessages,
  };
}
