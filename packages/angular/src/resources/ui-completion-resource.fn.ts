/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, Resource, Signal } from '@angular/core';
import { Chat, KnownModelIds, s, SystemPrompt, ɵui } from '@hashbrownai/core';
import { ExposedComponent } from '../utils/expose-component.fn';
import { structuredCompletionResource } from './structured-completion-resource.fn';
import {
  TAG_NAME_REGISTRY,
  TagNameRegistry,
  UiAssistantMessage,
  UiChatMessage,
} from '../utils/ui-chat.helpers';
import { readSignalLike } from '../utils';

/**
 * @public
 */
export type UiCompletionMessageOutput = s.ObjectType<{
  ui: s.ArrayType<s.ObjectType<ɵui.ComponentTreeSchema>>;
}>;

/**
 * Options for the UI completion resource.
 *
 * @public
 */
export interface UiCompletionResourceOptions<Input> {
  /**
   * The components to use for the UI completion resource.
   */
  components: ExposedComponent<any>[];

  /**
   * The model to use for the UI completion resource.
   */
  model: KnownModelIds;

  /**
   * The system prompt to use for the UI completion resource.
   */
  system: string | Signal<string> | SystemPrompt | Signal<SystemPrompt>;

  /**
   * The input to the UI completion resource.
   */
  input: Signal<Input | null | undefined>;

  /**
   * The tools to use for the UI completion resource.
   */
  tools?: Chat.AnyTool[];

  /**
   * The debug name for the UI completion resource.
   */
  debugName?: string;

  /**
   * The debounce time for the UI completion resource.
   */
  debounce?: number;

  /**
   * The API URL to use for the UI completion resource.
   */
  apiUrl?: string;

  /**
   * The number of retries for the UI completion resource.
   */
  retries?: number;
}

/**
 * A reference to the UI completion resource.
 *
 * @public
 */
export interface UiCompletionResourceRef extends Resource<UiChatMessage<any> | null> {
  /**
   * Stops any currently-streaming message.
   *
   * @param clearStreamingMessage - Whether the currently-streaming message should be removed from state.
   */
  stop: (clearStreamingMessage?: boolean) => void;

  /**
   * Reloads the resource.
   *
   * @returns Whether the resource was reloaded.
   */
  reload: () => boolean;

  /**
   * Indicates whether the underlying completion call is currently sending a message.
   */
  isSending: Signal<boolean>;

  /**
   * Indicates whether the underlying completion call is currently receiving tokens.
   */
  isReceiving: Signal<boolean>;
}

/**
 * Creates a UI completion resource.
 *
 * @public
 * @param args - The arguments for the UI completion resource.
 * @returns The UI completion resource.
 */
export function uiCompletionResource<Input>(
  args: UiCompletionResourceOptions<Input>,
): UiCompletionResourceRef {
  const flattenedComponents = computed(() =>
    ɵui.flattenComponents(args.components),
  );
  const internalSchema = s.object('UI', {
    ui: s.streaming.array(
      'List of elements',
      ɵui.createComponentSchema(args.components),
    ),
  });
  const systemAsString = computed(() => {
    const system = readSignalLike(args.system);
    if (typeof system === 'string') {
      return system;
    }
    const result = system.compile(args.components, internalSchema);
    if (system.diagnostics.length > 0) {
      throw new Error(
        `System prompt has ${system.diagnostics.length} errors: \n\n${system.diagnostics.map((d) => d.message).join('\n\n')}`,
      );
    }
    return result;
  });

  const completion = structuredCompletionResource({
    model: args.model,
    schema: internalSchema,
    tools: [...(args.tools ?? [])],
    system: systemAsString,
    input: args.input,
    debugName: args.debugName,
    debounce: args.debounce,
    apiUrl: args.apiUrl,
    retries: args.retries,
  });

  const value = computed(
    () => {
      const output = completion.value();

      if (!output) {
        return null;
      }

      const tagNameRegistry = Array.from(flattenedComponents().values()).reduce(
        (acc, component) => {
          acc[component.name] = {
            props: component.props ?? {},
            component: component.component,
          };
          return acc;
        },
        {} as TagNameRegistry,
      );

      // Create a UI message similar to assistant message structure
      const message: UiChatMessage<any> = {
        role: 'assistant',
        content: output,
        [TAG_NAME_REGISTRY]: tagNameRegistry,
      };

      return message;
    },
    { debugName: args.debugName && `${args.debugName}.value` },
  );

  const status = completion.status;
  const error = completion.error;
  const isLoading = completion.isLoading;
  const reload = completion.reload;
  const stop = completion.stop;

  function hasValue(this: UiCompletionResourceRef) {
    return Boolean(value());
  }

  return {
    value,
    status,
    error,
    isLoading,
    isSending: completion.isSending,
    isReceiving: completion.isReceiving,
    reload,
    stop,
    hasValue: hasValue as any,
  };
}
