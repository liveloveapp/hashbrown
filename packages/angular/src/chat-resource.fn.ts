/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, Resource, ResourceStatus, Signal } from '@angular/core';
import { Chat, fryHashbrown } from '@hashbrownai/core';
import { injectHashbrownConfig } from './provide-hashbrown.fn';
import { readSignalLike, toSignal } from './utils';

export interface ChatResourceRef<Tools extends Chat.AnyTool>
  extends Resource<Chat.Message<string, Tools>[]> {
  sendMessage: (message: Chat.UserMessage) => void;
}

/**
 * Chat resource configuration.
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
 * @param options - The chat resource configuration.
 * @returns An object with reactive signals and a sendMessage function.
 */
export function chatResource<Tools extends Chat.AnyTool>(
  options: ChatResourceOptions<Tools>,
): ChatResourceRef<Tools> {
  const config = injectHashbrownConfig();
  const hashbrown = fryHashbrown<string, Tools>({
    apiUrl: config.baseUrl,
    prompt: readSignalLike(options.prompt),
    model: readSignalLike(options.model),
    temperature: options.temperature && readSignalLike(options.temperature),
    tools: options.tools,
    maxTokens: options.maxTokens && readSignalLike(options.maxTokens),
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
