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
import { Chat, fryHashbrown, s } from '@hashbrownai/core';
import { injectHashbrownConfig } from './provide-hashbrown.fn';
import { readSignalLike, toSignal } from './utils';

export interface StructuredChatResourceRef<Output, Tools extends Chat.AnyTool>
  extends Resource<Chat.Message<Output, Tools>[]> {
  sendMessage: (message: Chat.UserMessage) => void;
  resendMessages: () => void;
  setMessages: (messages: Chat.Message<Output, Tools>[]) => void;
}

export interface StructuredChatResourceOptions<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
  Output extends s.Infer<Schema> = s.Infer<Schema>,
> {
  model: string | Signal<string>;
  system: string | Signal<string>;
  schema: Schema;
  tools?: Tools[];
  messages?: Chat.Message<Output, Tools>[];
  debugName?: string;
  debounce?: number;
  retries?: number;
}

export function structuredChatResource<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
  Output extends s.Infer<Schema> = s.Infer<Schema>,
>(
  options: StructuredChatResourceOptions<Schema, Tools, Output>,
): StructuredChatResourceRef<Output, Tools> {
  const config = injectHashbrownConfig();
  const injector = inject(Injector);
  const hashbrown = fryHashbrown<Schema, Tools, Output>({
    apiUrl: config.baseUrl,
    middleware: config.middleware?.map((m): Chat.Middleware => {
      return (requestInit) =>
        runInInjectionContext(injector, () => m(requestInit));
    }),
    system: readSignalLike(options.system),
    model: readSignalLike(options.model),
    tools: options.tools,
    responseSchema: options.schema,
    debugName: options.debugName,
    emulateStructuredOutput: config.emulateStructuredOutput,
    debounce: options.debounce,
    retries: options.retries,
  });
  const value = toSignal(hashbrown.observeMessages);
  const isReceiving = toSignal(hashbrown.observeIsReceiving);
  const isSending = toSignal(hashbrown.observeIsSending);
  const isRunningToolCalls = toSignal(hashbrown.observeIsRunningToolCalls);
  const error = toSignal(hashbrown.observeError);

  const exhaustedRetries = toSignal(hashbrown.observeExhaustedRetries);

  const status = computed(() => {
    if (isReceiving() || isSending() || isRunningToolCalls()) {
      return ResourceStatus.Loading;
    }

    if (exhaustedRetries()) {
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

  function resendMessages() {
    hashbrown.resendMessages();
  }

  function setMessages(messages: Chat.Message<Output, Tools>[]) {
    hashbrown.setMessages(messages);
  }

  return {
    hasValue: hasValue as any,
    status,
    isLoading,
    reload,
    sendMessage,
    resendMessages,
    value,
    error,
    setMessages,
  };
}
