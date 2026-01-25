/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, Resource, Signal } from '@angular/core';
import {
  Chat,
  type ComponentTreeSchema,
  type ModelInput,
  s,
  SystemPrompt,
  type TransportOrFactory,
} from '@hashbrownai/core';
import { ExposedComponent } from '../utils/expose-component.fn';
import { structuredChatResource } from './structured-chat-resource.fn';
import {
  TAG_NAME_REGISTRY,
  UiAssistantMessage,
  UiChatMessage,
} from '../utils/ui-chat.helpers';
import { readSignalLike, SignalLike } from '../utils';
import { createUiKit, type UiKitInput } from '../utils/ui-kit.fn';

/**
 * @public
 */
export type UiChatMessageOutput = s.ObjectType<{
  ui: s.ArrayType<ComponentTreeSchema>;
}>;

/**
 * Options for the UI chat resource.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 */
export interface UiChatResourceOptions<Tools extends Chat.AnyTool> {
  /**
   * The components to use for the UI chat resource.
   */
  components: UiKitInput<ExposedComponent<any>>[];

  /**
   * The model to use for the UI chat resource.
   */
  model: ModelInput;

  /**
   * The system prompt to use for the UI chat resource.
   */
  system: string | Signal<string> | SystemPrompt | Signal<SystemPrompt>;

  /**
   * The initial messages for the UI chat resource.
   *
   * @typeParam Tools - The set of tool definitions available to the chat.
   */
  messages?: Chat.Message<s.Infer<UiChatMessageOutput>, Tools>[];

  /**
   * The tools to use for the UI chat resource.
   *
   * @typeParam Tools - The set of tool definitions available to the chat.
   */
  tools?: Tools[];

  /**
   * The debug name for the UI chat resource.
   */
  debugName?: string;

  /**
   * The debounce time for the UI chat resource.
   */
  debounce?: number;

  /**
   * The API URL to use for the UI chat resource.
   */
  apiUrl?: string;

  /**
   * Custom transport override for the UI chat resource.
   */
  transport?: TransportOrFactory;

  /**
   * Optional thread identifier used to load or continue an existing conversation.
   */
  threadId?: SignalLike<string | undefined>;
}

/**
 * A reference to the UI chat resource.
 *
 * @public
 */
export interface UiChatResourceRef<Tools extends Chat.AnyTool>
  extends Resource<UiChatMessage<Tools>[]> {
  /**
   * Send a new user message to the chat.
   *
   * @param message - The user message to send.
   */
  sendMessage: (message: Chat.UserMessage) => void;

  /**
   * Cause current messages to be resent.  Can be used after an error in chat.
   */
  resendMessages: () => void;

  /**
   * Stops any currently-streaming message.
   *
   * @param clearStreamingMessage - Whether the currently-streaming message should be removed from state.
   */
  stop: (clearStreamingMessage?: boolean) => void;

  /**
   * The last assistant message for the UI chat resource.
   */
  lastAssistantMessage: Signal<UiAssistantMessage<Tools> | undefined>;
}

/**
 * Creates a UI chat resource.
 *
 * @public
 * @param args - The arguments for the UI chat resource.
 * @returns The UI chat resource.
 */
export function uiChatResource<Tools extends Chat.AnyTool>(
  args: UiChatResourceOptions<Tools>,
): UiChatResourceRef<Tools> {
  const uiKit = createUiKit<ExposedComponent<any>>({
    components: args.components,
  });
  const internalSchema = s.object('UI', {
    ui: s.streaming.array('List of elements', uiKit.schema),
  });
  const systemAsString = computed(() => {
    const system = readSignalLike(args.system);
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

  const chat = structuredChatResource({
    model: args.model,
    schema: internalSchema,
    tools: [...(args.tools ?? [])],
    system: systemAsString,
    messages: [...(args.messages ?? [])],
    debugName: args.debugName,
    debounce: args.debounce,
    apiUrl: args.apiUrl,
    transport: args.transport,
    ui: true,
    threadId: args.threadId,
  });

  const value = computed(
    () => {
      const messages = chat.value();

      return messages.map((message): UiChatMessage<Tools> => {
        if (message.role === 'assistant') {
          const content = message.content as
            | s.Infer<typeof internalSchema>
            | ''
            | undefined;

          if (!content) {
            return {
              ...message,
              [TAG_NAME_REGISTRY]: {},
            };
          }

          return {
            ...message,
            [TAG_NAME_REGISTRY]: uiKit.tagNameRegistry ?? {},
          };
        }
        if (message.role === 'user') {
          return message;
        }
        if (message.role === 'error') {
          return message;
        }

        throw new Error(`Unknown message role`);
      });
    },
    { debugName: args.debugName && `${args.debugName}.value` },
  );

  const lastAssistantMessage = computed(() => {
    return value().findLast((message) => message.role === 'assistant');
  });

  return {
    ...chat,
    hasValue: chat.hasValue as any,
    value,
    lastAssistantMessage,
  };
}
