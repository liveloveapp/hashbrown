import { computed, Signal, Type } from '@angular/core';
import {
  Chat,
  ComponentTree,
  createComponentSchema,
  ExposedComponent,
  s,
} from '@hashbrownai/core';
import { ChatResource, chatResource } from './chat-resource.fn';
import { BoundTool } from './create-tool.fn';

export type TagNameRegistry = {
  [tagName: string]: {
    props: Record<string, s.HashbrownType>;
    component: Type<object>;
  };
};

export type RenderableMessage = {
  content: ComponentTree[];
  tags: TagNameRegistry;
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace RichChat {
  export type AssistantMessage = {
    role: 'assistant';
    content: ComponentTree[];
    tags: TagNameRegistry;
  };

  export type ToolCallMessage = {
    role: 'tool';
    name: string;
    callId: string;
    isPending: boolean;
    result?: unknown;
    error?: string;
  };

  export type Message =
    | RichChat.ToolCallMessage
    | RichChat.AssistantMessage
    | Chat.UserMessage
    | Chat.SystemMessage;
}

export interface RichChatResource extends ChatResource {
  messages: Signal<RichChat.Message[]>;
}

export function richChatResource(args: {
  components: ExposedComponent<any>[];
  model: string | Signal<string>;
  temperature?: number | Signal<number>;
  maxTokens?: number | Signal<number>;
  messages?: Chat.Message[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: BoundTool<string, any>[];
}): RichChatResource {
  const ui = s.object('UI', {
    ui: s.streaming.array(
      'List of elements',
      createComponentSchema(args.components),
    ),
  });

  const chat = chatResource({
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    responseFormat: ui,
    messages: [
      {
        role: 'system',
        content: `
        You are chatbot chatting with a human on my web app. Please be
        curteuous, helpful, and friendly. Try to answer all questions
        to the best of your ability. Keep answers concise and to the point.

        Today's date is ${new Date().toLocaleDateString()}.

        NEVER use ANY newline strings such as "\\n" or "\\\\n" in your response.
        `,
      },
    ],
    tools: [...(args.tools ?? [])],
  });

  const messages = computed(() => {
    const messages = chat.value();

    return messages.flatMap((message): RichChat.Message[] => {
      if (message.role === 'tool') {
        return [];
      }
      if (message.role === 'assistant') {
        const toolCalls = message.tool_calls ?? [];

        if (toolCalls.length === 0) {
          let content: s.Infer<typeof ui> | undefined;

          try {
            content = s.parse(ui, JSON.parse(message.content ?? ''));
          } catch (error) {
            // console.error(error);
            return [];
          }

          if (!content) {
            return [];
          }

          const renderableMessage: RenderableMessage = {
            content: content.ui,
            tags:
              args.components?.reduce((acc, component) => {
                acc[component.name] = {
                  props: component.props ?? {},
                  component: component.component,
                };
                return acc;
              }, {} as TagNameRegistry) ?? {},
          };

          const simpleMessage: RichChat.AssistantMessage = {
            role: 'assistant',
            ...renderableMessage,
          };
          return [simpleMessage];
        }
        const toolCallMessages = toolCalls.flatMap(
          (toolCall): Array<RichChat.ToolCallMessage> => {
            const toolCallMessage = messages.find(
              (t): t is Chat.ToolMessage =>
                t.role === 'tool' && t.tool_call_id === toolCall.id,
            );
            const content = toolCallMessage?.content;
            const result =
              content && content.type === 'success'
                ? content.content
                : undefined;
            const error =
              content && content.type === 'error' ? content.error : undefined;

            return [
              {
                role: 'tool',
                result,
                error,
                name: toolCall.function.name,
                callId: toolCall.id,
                isPending: result === undefined,
              },
            ];
          },
        );

        return toolCallMessages;
      }
      if (message.role === 'user') {
        return [message];
      }
      if (message.role === 'system') {
        return [];
      }

      throw new Error(`Unknown message role`);
    });
  });

  return {
    ...chat,
    messages,
  };
}
