/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, Resource, Signal } from '@angular/core';
import { Chat, KnownModelIds, s, ɵcomponents } from '@hashbrownai/core';
import { ExposedComponent } from '../utils/expose-component.fn';
import { structuredChatResource } from './structured-chat-resource.fn';
import {
  TAG_NAME_REGISTRY,
  TagNameRegistry,
  UiChatMessage,
} from '../utils/ui-chat.helpers';

type UiChatMessageOutput = s.ObjectType<{
  ui: s.ArrayType<s.ObjectType<ɵcomponents.ComponentTreeSchema>>;
}>;

/**
 * Options for the UI chat resource.
 */
export interface UiChatResourceOptions<Tools extends Chat.AnyTool> {
  /**
   * The components to use for the UI chat resource.
   */
  components: ExposedComponent<any>[];
  /**
   * The model to use for the UI chat resource.
   */
  model: KnownModelIds;
  /**
   * The system prompt to use for the UI chat resource.
   */
  system: string | Signal<string>;
  /**
   * The initial messages for the UI chat resource.
   */
  messages?: Chat.Message<s.Infer<UiChatMessageOutput>, Tools>[];
  /**
   * The tools to use for the UI chat resource.
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
}

/**
 * A reference to the UI chat resource.
 */
export interface UiChatResourceRef<Tools extends Chat.AnyTool>
  extends Resource<UiChatMessage<Tools>[]> {
  sendMessage: (message: Chat.UserMessage) => void;
  resendMessages: () => void;
  /**
   * Stops any currently-streaming message.
   * @param clearStreamingMessage Whether the currently-streaming message should be removed from state.
   */
  stop: (clearStreamingMessage?: boolean) => void;
}

/**
 * Creates a UI chat resource.
 *
 * @param args - The arguments for the UI chat resource.
 * @returns The UI chat resource.
 */
export function uiChatResource<Tools extends Chat.AnyTool>(
  args: UiChatResourceOptions<Tools>,
): UiChatResourceRef<Tools> {
  const flattenedComponents = computed(() =>
    ɵcomponents.flattenComponents(args.components),
  );
  const internalSchema = s.object('UI', {
    ui: s.streaming.array(
      'List of elements',
      ɵcomponents.createComponentSchema(args.components),
    ),
  });

  const chat = structuredChatResource({
    model: args.model,
    schema: internalSchema,
    tools: [...(args.tools ?? [])],
    system: args.system,
    messages: [...(args.messages ?? [])],
    debugName: args.debugName,
    debounce: args.debounce,
    apiUrl: args.apiUrl,
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
            [TAG_NAME_REGISTRY]:
              Array.from(flattenedComponents().values()).reduce(
                (acc, component) => {
                  acc[component.name] = {
                    props: component.props ?? {},
                    component: component.component,
                  };
                  return acc;
                },
                {} as TagNameRegistry,
              ) ?? {},
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

  return {
    ...chat,
    hasValue: chat.hasValue as any,
    value,
  };
}
