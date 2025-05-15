/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, Resource, Signal, Type } from '@angular/core';
import {
  Chat,
  createComponentSchema,
  ExposedComponent,
  s,
} from '@hashbrownai/core';
import { structuredChatResource } from './structured-chat-resource.fn';

export const TAG_NAME_REGISTRY = Symbol('θtagNameRegistry');

export type TagNameRegistry = {
  [tagName: string]: {
    props: Record<string, s.HashbrownType>;
    component: Type<object>;
  };
};

export type RenderableMessage = {
  [TAG_NAME_REGISTRY]: TagNameRegistry;
};

export const getTagNameRegistry = (
  message: Chat.Message<s.HashbrownType, Chat.AnyTool>,
): TagNameRegistry | undefined => {
  if (TAG_NAME_REGISTRY in message) {
    return message[TAG_NAME_REGISTRY] as TagNameRegistry;
  }

  return undefined;
};

const publicSchema = s.object('UI', {
  ui: s.streaming.array(
    'List of elements',
    s.object('Component', {
      $tagName: s.string(''),
      $props: s.object('', {}),
      get $children() {
        return s.array('', publicSchema);
      },
    }),
  ),
});

export type UiAssistantMessage<Tools extends Chat.AnyTool> =
  Chat.AssistantMessage<typeof publicSchema, Tools> & {
    [TAG_NAME_REGISTRY]: TagNameRegistry;
  };

export type UiUserMessage = Chat.UserMessage;

export type UiChatMessage<Tools extends Chat.AnyTool> =
  | UiAssistantMessage<Tools>
  | UiUserMessage;

export interface UiChatResourceRef<Tools extends Chat.AnyTool>
  extends Resource<UiChatMessage<Tools>[]> {
  sendMessage: (message: Chat.UserMessage) => void;
}
export function uiChatResource<Tools extends Chat.AnyTool>(args: {
  components: ExposedComponent<any>[];
  model: string | Signal<string>;
  prompt: string | Signal<string>;
  temperature?: number | Signal<number>;
  maxTokens?: number | Signal<number>;
  messages?: Chat.Message<string, Tools>[];
  tools?: Tools[];
  debugName?: string;
  debounce?: number;
}): UiChatResourceRef<Tools> {
  const internalSchema = s.object('UI', {
    ui: s.streaming.array(
      'List of elements',
      createComponentSchema(args.components),
    ),
  });

  const chat = structuredChatResource<typeof publicSchema, Tools>({
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    schema: internalSchema as s.HashbrownType as typeof publicSchema,
    tools: [...(args.tools ?? [])],
    prompt: args.prompt,
    debugName: args.debugName,
    debounce: args.debounce,
  });

  const value = computed(() => {
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
            args.components?.reduce((acc, component) => {
              acc[component.name] = {
                props: component.props ?? {},
                component: component.component,
              };
              return acc;
            }, {} as TagNameRegistry) ?? {},
        };
      }
      if (message.role === 'user') {
        return message;
      }

      throw new Error(`Unknown message role`);
    });
  });

  return {
    ...chat,
    hasValue: chat.hasValue as any,
    value,
  };
}
