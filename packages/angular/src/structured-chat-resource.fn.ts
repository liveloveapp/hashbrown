/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, Resource, ResourceStatus, Signal } from '@angular/core';
import { Chat, fryHashbrown, s } from '@hashbrownai/core';
import { injectHashbrownConfig } from './provide-hashbrown.fn';
import { readSignalLike, toSignal } from './utils';

export interface StructuredChatResourceRef<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
> extends Resource<Chat.Message<Schema, Tools>[]> {
  sendMessage: (message: Chat.UserMessage) => void;
}

export interface StructuredChatResourceOptions<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
> {
  model: string | Signal<string>;
  prompt: string | Signal<string>;
  schema: Schema;
  temperature?: number | Signal<number>;
  tools?: Tools[];
  maxTokens?: number | Signal<number>;
  messages?: Chat.Message<Schema, Tools>[];
  debugName?: string;
}

export function structuredChatResource<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
>(
  options: StructuredChatResourceOptions<Schema, Tools>,
): StructuredChatResourceRef<Schema, Tools> {
  const config = injectHashbrownConfig();
  const hashbrown = fryHashbrown<Schema, Tools>({
    apiUrl: config.baseUrl,
    prompt: readSignalLike(options.prompt),
    model: readSignalLike(options.model),
    temperature: options.temperature && readSignalLike(options.temperature),
    tools: options.tools,
    maxTokens: options.maxTokens && readSignalLike(options.maxTokens),
    responseSchema: options.schema,
    debugName: options.debugName,
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
