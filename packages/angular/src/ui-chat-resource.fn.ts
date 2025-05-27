/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, Resource, Signal, Type } from '@angular/core';
import { Chat, s, θcomponents } from '@hashbrownai/core';
import { ExposedComponent } from './expose-component.fn';
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
  message: Chat.Message<UiChatSchema, Chat.AnyTool>,
): TagNameRegistry | undefined => {
  if (TAG_NAME_REGISTRY in message) {
    return message[TAG_NAME_REGISTRY] as TagNameRegistry;
  }

  return undefined;
};

export interface UiChatSchemaComponent {
  $tagName: string;
  $props: Record<string, any>;
  $children: UiChatSchemaComponent[];
}

/*
TODO:
for chat:
- add error display component
-- error-indicative styling
-- retry button?
- when being loaded from state, should not be, like, reapplied
-- also, retry button should not be available

for predictions (via action stream):
- - don't show error, just auto-retry
- if 3 failures in a row, warn user predictions is unavailable

for completion:
- don't show error, just auto-retry
- if 3 failures in a row, warn user completion is unavailable

for suggestions (e.g. scenes):
- don't show error, just auto-retry
- if 3 (configurable) failures in a row, warn user suggestions
  seem to be unavailable

Infrastructure for the above to make it easy to integrate:
- manual retry for chat
- auto retry for everything else w/ configurable limit
- a way to know retry limit has been reached

*/

export interface UiChatSchema {
  ui: UiChatSchemaComponent[];
}

export type UiAssistantMessage<Tools extends Chat.AnyTool> =
  Chat.AssistantMessage<UiChatSchema, Tools> & {
    [TAG_NAME_REGISTRY]: TagNameRegistry;
  };

export type UiUserMessage = Chat.UserMessage;
export type UiErrorMessage = Chat.ErrorMessage;

export type UiChatMessage<Tools extends Chat.AnyTool> =
  | UiAssistantMessage<Tools>
  | UiUserMessage
  | UiErrorMessage;

export interface UiChatResourceRef<Tools extends Chat.AnyTool>
  extends Resource<UiChatMessage<Tools>[]> {
  sendMessage: (message: Chat.UserMessage) => void;
  resendMessages: () => void;
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
      θcomponents.createComponentSchema(args.components),
    ),
  });

  const chat = structuredChatResource({
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    schema: internalSchema,
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
      if (message.role === 'error') {
        console.log('saw error message in ui-chat');
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
