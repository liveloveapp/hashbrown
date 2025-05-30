/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, effect, Resource, Signal } from '@angular/core';
import { Chat, s } from '@hashbrownai/core';
import { SignalLike } from '../utils/types';
import { structuredChatResource } from './structured-chat-resource.fn';

/**
 * A reference to the structured completion resource.
 */
export interface StructuredCompletionResourceRef<Output>
  extends Resource<Output | null> {
  reload: () => boolean;
}

/**
 * Options for the structured completion resource.
 */
export interface StructuredCompletionResourceOptions<
  Input,
  Schema extends s.HashbrownType,
> {
  /**
   * The model to use for the structured completion resource.
   */
  model: string;
  /**
   * The input to the structured completion resource.
   */
  input: Signal<Input | null | undefined>;
  /**
   * The schema to use for the structured completion resource.
   */
  schema: Schema;
  /**
   * The system prompt to use for the structured completion resource.
   */
  system: SignalLike<string>;
  /**
   * The tools to use for the structured completion resource.
   */
  tools?: Chat.AnyTool[];
  /**
   * The debug name for the structured completion resource.
   */
  debugName?: string;
  /**
   * The API URL to use for the structured completion resource.
   */
  apiUrl?: string;
}

/**
 * Creates a structured completion resource.
 *
 * @param options - The options for the structured completion resource.
 * @returns The structured completion resource.
 */
export function structuredCompletionResource<
  Input,
  Schema extends s.HashbrownType,
  Output extends s.Infer<Schema> = s.Infer<Schema>,
>(
  options: StructuredCompletionResourceOptions<Input, Schema>,
): StructuredCompletionResourceRef<Output> {
  const { model, input, schema, system, tools, debugName, apiUrl } = options;

  const resource = structuredChatResource<Schema, Chat.AnyTool, Output>({
    model,
    system,
    schema,
    tools,
    debugName,
    retries: 3,
    apiUrl,
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
