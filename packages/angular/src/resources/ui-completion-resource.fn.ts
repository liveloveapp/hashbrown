/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, Resource, Signal } from '@angular/core';
import {
  Chat,
  type ModelInput,
  s,
  SystemPrompt,
  type TransportOrFactory,
  ɵui,
} from '@hashbrownai/core';
import { ExposedComponent } from '../utils/expose-component.fn';
import { structuredCompletionResource } from './structured-completion-resource.fn';
import { readSignalLike } from '../utils';
import {
  TAG_NAME_REGISTRY,
  TagNameRegistry,
  UiAssistantMessage,
} from '../utils/ui-chat.helpers';
import { SignalLike } from '../utils/types';
import { UiChatMessageOutput } from './ui-chat-resource.fn';

/**
 * Options for the UI completion resource.
 *
 * @public
 */
export interface UiCompletionResourceOptions<
  Input,
  Tools extends Chat.AnyTool = Chat.AnyTool,
> {
  /**
   * The components to use for the UI completion resource.
   */
  components: ExposedComponent<any>[];

  /**
   * The signal that produces the input for the completion.
   */
  input: Signal<Input | null | undefined>;

  /**
   * The model to use for the UI completion resource.
   */
  model: ModelInput;

  /**
   * The system prompt to use for the UI completion resource.
   */
  system: string | Signal<string> | SystemPrompt | Signal<SystemPrompt>;

  /**
   * The tools to use for the UI completion resource.
   */
  tools?: Tools[];

  /**
   * The debug name for the UI completion resource.
   */
  debugName?: string;

  /**
   * The API URL to use for the UI completion resource.
   */
  apiUrl?: string;

  /**
   * The number of retries for the UI completion resource.
   */
  retries?: number;

  /**
   * The debounce time for the UI completion resource.
   */
  debounce?: number;

  /**
   * Custom transport override for the UI completion resource.
   */
  transport?: TransportOrFactory;
}

/**
 * A reference to the UI completion resource.
 *
 * @public
 */
export interface UiCompletionResourceRef<Tools extends Chat.AnyTool>
  extends Resource<UiAssistantMessage<Tools> | null> {
  /**
   * Indicates whether the underlying completion call is currently sending a request.
   */
  isSending: Signal<boolean>;
  /**
   * Indicates whether the underlying completion call is currently receiving data.
   */
  isReceiving: Signal<boolean>;
  /**
   * Reloads the completion.
   *
   * @returns Whether the completion was reloaded.
   */
  reload: () => boolean;
  /**
   * Stops any currently streaming response.
   *
   * @param clearStreamingMessage - Whether to clear the current streaming response.
   */
  stop: (clearStreamingMessage?: boolean) => void;
}

/**
 * Creates a UI completion resource that returns UI assistant messages.
 *
 * @public
 * @param options - The options for the UI completion resource.
 * @returns The UI completion resource.
 */
export function uiCompletionResource<
  Input,
  Tools extends Chat.AnyTool = Chat.AnyTool,
>(
  options: UiCompletionResourceOptions<Input, Tools>,
): UiCompletionResourceRef<Tools> {
  const flattenedComponents = computed(() =>
    ɵui.flattenComponents(options.components),
  );
  const internalSchema = s.object('UI', {
    ui: s.streaming.array(
      'List of elements',
      ɵui.createComponentSchema(options.components),
    ),
  });
  const systemAsString = computed(() => {
    const system = readSignalLike(
      options.system as SignalLike<string | SystemPrompt>,
    );

    if (typeof system === 'string') {
      return system;
    }

    const result = system.compile(options.components, internalSchema);

    if (system.diagnostics.length > 0) {
      throw new Error(
        `System prompt has ${system.diagnostics.length} errors: \n\n${system.diagnostics.map((d) => d.message).join('\n\n')}`,
      );
    }

    return result;
  });

  const completion = structuredCompletionResource<
    Input,
    typeof internalSchema,
    s.Infer<UiChatMessageOutput>
  >({
    model: options.model,
    input: options.input,
    schema: internalSchema,
    system: systemAsString,
    tools: options.tools,
    debugName: options.debugName,
    apiUrl: options.apiUrl,
    retries: options.retries,
    debounce: options.debounce,
    transport: options.transport,
    ui: true,
  });

  const value = computed(
    (): UiAssistantMessage<Tools> | null => {
      const content = completion.value();

      if (!content) {
        return null;
      }

      const tagNameRegistry =
        Array.from(flattenedComponents().values()).reduce((acc, component) => {
          acc[component.name] = {
            props: component.props ?? {},
            component: component.component,
          };
          return acc;
        }, {} as TagNameRegistry) ?? {};

      return {
        role: 'assistant',
        content,
        toolCalls: [],
        [TAG_NAME_REGISTRY]: tagNameRegistry,
      };
    },
    { debugName: options.debugName && `${options.debugName}.value` },
  );

  function hasValue(this: UiCompletionResourceRef<Tools>) {
    return value() !== null;
  }

  return {
    value,
    status: completion.status,
    error: completion.error,
    isLoading: completion.isLoading,
    reload: completion.reload,
    stop: completion.stop,
    isSending: completion.isSending,
    isReceiving: completion.isReceiving,
    hasValue: hasValue as any,
  };
}
