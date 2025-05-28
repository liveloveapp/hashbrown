/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-empty-interface */
import { computed, effect, Resource, Signal } from '@angular/core';
import { Chat, s } from '@hashbrownai/core';
import { SignalLike } from './types';
import { structuredChatResource } from './structured-chat-resource.fn';

export interface StructuredCompletionResourceRef<Output>
  extends Resource<Output | null> {}

export interface StructuredCompletionResourceOptions<
  Input,
  Schema extends s.HashbrownType,
> {
  model: string;
  input: Signal<Input | null | undefined>;
  schema: Schema;
  system: SignalLike<string>;
  tools?: Chat.AnyTool[];
  debugName?: string;
}

export function structuredCompletionResource<
  Input,
  Schema extends s.HashbrownType,
  Output extends s.Infer<Schema> = s.Infer<Schema>,
>(
  options: StructuredCompletionResourceOptions<Input, Schema>,
): StructuredCompletionResourceRef<Output> {
  const { model, input, schema, system, tools, debugName } = options;

  const resource = structuredChatResource<Schema, Chat.AnyTool, Output>({
    model,
    system,
    schema,
    tools,
    debugName,
    retries: 3,
  });

  effect(() => {
    const _input = input();

    if (!_input) {
      return;
    }

    resource.setMessages([
      {
        role: 'user',
        content: typeof _input === 'string' ? _input : JSON.stringify(_input),
      },
    ]);
  });

  const value = computed(() => {
    const lastMessage = resource.value()[resource.value().length - 1];
    if (
      lastMessage &&
      lastMessage.role === 'assistant' &&
      lastMessage.content &&
      lastMessage.content !== null
    ) {
      return lastMessage.content;
    }
    return null;
  });

  const status = resource.status;
  const error = resource.error;
  const isLoading = resource.isLoading;
  const reload = resource.reload;

  function hasValue(this: StructuredCompletionResourceRef<Output>) {
    return Boolean(value());
  }

  return {
    value,
    status,
    error,
    isLoading,
    reload,
    hasValue: hasValue as any,
  };
}
