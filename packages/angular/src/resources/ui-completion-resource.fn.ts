/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, Resource, Signal } from '@angular/core';
import {
  Chat,
  s,
  SystemPrompt,
  type TransportOrFactory,
} from '@hashbrownai/core';
import { ExposedComponent } from '../utils/expose-component.fn';
import { structuredCompletionResource } from './structured-completion-resource.fn';
import { readReactiveOption } from '../utils';
import {
  TAG_NAME_REGISTRY,
  UiAssistantMessage,
} from '../utils/ui-chat.helpers';
import { ReactiveOption } from '../utils/types';
import { UiChatMessageOutput } from './ui-chat-resource.fn';
import { createUiKit, type UiKitInput } from '../utils/ui-kit.fn';
import { createResourceSnapshot } from './create-resource-snapshot.fn';

/**
 * Options for the UI completion resource.
 *
 * @public
 * @typeParam Input - The type of completion input.
 * @typeParam Tools - The set of tool definitions available to the completion.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface UiCompletionResourceOptions<
  Input,
  Tools extends Chat.AnyTool = Chat.AnyTool,
  State = unknown,
> {
  /**
   * The components to use for the UI completion resource.
   */
  components: UiKitInput<ExposedComponent<any>>[];
  /**
   * Optional prompt-based UI examples to include in the wrapper schema description.
   */
  examples?: SystemPrompt;

  /**
   * The signal that produces the input for the completion.
   */
  input: Signal<Input | null | undefined>;

  /**
   * The system prompt to use for the UI completion resource.
   */
  system: ReactiveOption<string | SystemPrompt>;

  /** The initial shared agent state. */
  state?: State;

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
  apiUrl?: ReactiveOption<string>;

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

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: ReactiveOption<string | undefined>;
}

/**
 * A reference to the UI completion resource.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the completion.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface UiCompletionResourceRef<
  Tools extends Chat.AnyTool,
  State = unknown,
> extends Resource<UiAssistantMessage<Tools> | null> {
  /** The currently visible shared agent state. */
  readonly state: Signal<State | undefined>;
  /** Replace shared agent state without starting a generation. */
  setState(state: State): void;
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
 * @typeParam Input - The type of completion input.
 * @typeParam Tools - The set of tool definitions available to the completion.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export function uiCompletionResource<
  Input,
  Tools extends Chat.AnyTool = Chat.AnyTool,
  State = unknown,
>(
  options: UiCompletionResourceOptions<Input, Tools, State>,
): UiCompletionResourceRef<Tools, State> {
  const uiKit = createUiKit<ExposedComponent<any>>({
    components: options.components,
    examples: options.examples,
  });
  const internalSchema = uiKit.schema;
  const systemAsString = computed(() => {
    const system = readReactiveOption(options.system);

    if (typeof system === 'string') {
      return system;
    }

    const result = system.compile(uiKit.components, internalSchema);

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
    s.Infer<UiChatMessageOutput>,
    State
  >({
    input: options.input,
    schema: internalSchema,
    system: systemAsString,
    state: options.state,
    tools: options.tools,
    debugName: options.debugName,
    apiUrl: options.apiUrl,
    retries: options.retries,
    debounce: options.debounce,
    transport: options.transport,
    ui: true,
    threadId: options.threadId,
  });

  const value = computed(
    (): UiAssistantMessage<Tools> | null => {
      const content = completion.value();

      if (!content) {
        return null;
      }

      const tagNameRegistry = uiKit.tagNameRegistry ?? {};

      return {
        role: 'assistant',
        content,
        toolCalls: [],
        [TAG_NAME_REGISTRY]: tagNameRegistry,
      };
    },
    { debugName: options.debugName && `${options.debugName}.value` },
  );
  const snapshot = createResourceSnapshot(
    value,
    completion.status,
    completion.error,
    options.debugName && `${options.debugName}.snapshot`,
  );

  function hasValue(this: UiCompletionResourceRef<Tools, State>) {
    return completion.status() !== 'error' && value() !== null;
  }

  return {
    state: completion.state,
    setState: completion.setState,
    value,
    snapshot,
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
