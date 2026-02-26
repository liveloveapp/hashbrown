'use client';

import { type Chat } from '@hashbrownai/core';
import {
  UiAssistantMessage,
  UiChatMessage,
  UiUserMessage,
} from '@hashbrownai/react';
import {
  type AIMessage as LangGraphAIMessage,
  type Message as LangGraphMessage,
  type ToolMessage as LangGraphToolMessage,
} from '@langchain/langgraph-sdk';
import { ReactNode, useMemo } from 'react';
import {
  type AssistantMessage as AgUiAssistantMessage,
  type Message as AgUiMessage,
  type ToolCall,
  type ToolMessage,
} from '@ag-ui/core';
import MagicTextRenderer from './MagicTextRenderer';
import styles from './Message.module.css';

type LangGraphToolCall = NonNullable<LangGraphAIMessage['tool_calls']>[number];
export type RemoteToolCall = ToolCall;
export type RemoteAgentMessage = LangGraphMessage | AgUiMessage;
export type RemoteToolMessage = LangGraphToolMessage | ToolMessage;
export type RemoteAssistantMessage =
  | LangGraphAIMessage
  | AgUiAssistantMessage;
export type RenderToolCall = (props: {
  toolCall: ToolCall;
  toolMessage?: ToolMessage;
}) => ReactNode;

interface MessageProps {
  message: UiChatMessage<Chat.AnyTool>;
  remoteAgentMessages?: RemoteAgentMessage[];
  renderToolCall?: RenderToolCall;
}

const safeJsonStringify = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '';
  }
};

const hasStringProp = (value: unknown, key: string) =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>)[key] === 'string';

export function isLangGraphMessage(
  message: unknown,
): message is LangGraphMessage {
  return hasStringProp(message, 'type');
}

export function isAgUiMessage(message: unknown): message is AgUiMessage {
  return hasStringProp(message, 'role');
}

export function isLangGraphAssistantMessage(
  message: RemoteAgentMessage | undefined,
): message is LangGraphAIMessage {
  return isLangGraphMessage(message) && message.type === 'ai';
}

export function isAgUiAssistantMessage(
  message: RemoteAgentMessage | undefined,
): message is AgUiAssistantMessage {
  return isAgUiMessage(message) && message.role === 'assistant';
}

export function isLangGraphToolMessage(
  message: RemoteAgentMessage | undefined,
): message is LangGraphToolMessage {
  return isLangGraphMessage(message) && message.type === 'tool';
}

export function isAgUiToolMessage(
  message: RemoteAgentMessage | undefined,
): message is ToolMessage {
  return isAgUiMessage(message) && message.role === 'tool';
}

export function isAssistantMessage(
  message: RemoteAgentMessage | undefined,
): message is RemoteAssistantMessage {
  return (
    isLangGraphAssistantMessage(message) || isAgUiAssistantMessage(message)
  );
}

export function isToolMessage(
  message: RemoteAgentMessage | undefined,
): message is RemoteToolMessage {
  return isLangGraphToolMessage(message) || isAgUiToolMessage(message);
}

const toToolCall = (
  toolCall: LangGraphToolCall,
  index: number,
): ToolCall => ({
  id: toolCall.id ?? `tool_call_${index}`,
  type: 'function',
  function: {
    name: toolCall.name,
    arguments:
      typeof toolCall.args === 'string'
        ? toolCall.args
        : safeJsonStringify(toolCall.args),
  },
});

const getToolCalls = (
  assistantMessage: RemoteAssistantMessage | undefined,
): ToolCall[] => {
  if (!assistantMessage) {
    return [];
  }

  if (isAgUiAssistantMessage(assistantMessage)) {
    return assistantMessage.toolCalls ?? [];
  }

  return assistantMessage.tool_calls?.map(toToolCall) ?? [];
};

const toAgUiToolMessage = (message: RemoteToolMessage): ToolMessage => {
  if (isAgUiToolMessage(message)) {
    return message;
  }

  return {
    id: message.id ?? message.tool_call_id,
    role: 'tool',
    content:
      typeof message.content === 'string'
        ? message.content
        : safeJsonStringify(message.content),
    toolCallId: message.tool_call_id,
  };
};

function isUser(
  message: UiChatMessage<Chat.AnyTool>,
): message is UiUserMessage {
  return message.role === 'user';
}

function isAssistant(
  message: UiChatMessage<Chat.AnyTool>,
): message is UiAssistantMessage<Chat.AnyTool> {
  return message.role === 'assistant';
}

function AssistantMessage({
  message,
  remoteAgentMessages,
  renderToolCall,
}: {
  message: UiAssistantMessage<Chat.AnyTool>;
  remoteAgentMessages?: RemoteAgentMessage[];
  renderToolCall?: RenderToolCall;
}) {
  const { lastAssistantMessage, toolMessages } = useMemo(() => {
    if (!renderToolCall || !remoteAgentMessages) {
      return {
        lastAssistantMessage: undefined,
        toolMessages: [] as ToolMessage[],
      };
    }

    const lastAssistant = [...remoteAgentMessages]
      .reverse()
      .find(isAssistantMessage);

    const tools = remoteAgentMessages
      .filter(isToolMessage)
      .map((toolMessage) => toAgUiToolMessage(toolMessage));

    return {
      lastAssistantMessage: lastAssistant,
      toolMessages: tools,
    };
  }, [remoteAgentMessages, renderToolCall]);

  const toolCalls = getToolCalls(lastAssistantMessage);

  return (
    <div className={`${styles.container} ${styles.containerLeft}`}>
      <div className={`${styles.message} ${styles.messageAssistant}`}>
        {message.ui}
        {renderToolCall &&
          toolCalls.map((toolCall) => {
            const toolMessage = toolMessages.find(
              (m) => m.toolCallId === toolCall.id,
            );
            if (!toolMessage) {
              return null;
            }
            return renderToolCall({
              toolCall,
              toolMessage,
            });
          })}
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: UiUserMessage }) {
  if (
    typeof message.content === 'string' &&
    message.content.trim().length > 0
  ) {
    return (
      <div className={`${styles.container} ${styles.containerRight}`}>
        <div className={`${styles.message} ${styles.messageUser}`}>
          <MagicTextRenderer
            text={message.content}
            unit="word"
            fragmentDuration={500}
          />
        </div>
      </div>
    );
  }

  return null;
}

function Message({
  message,
  remoteAgentMessages,
  renderToolCall,
}: MessageProps) {
  if (!isUser(message) && !isAssistant(message)) {
    return null;
  }

  return (
    <>
      {isUser(message) && <UserMessage message={message} />}
      {isAssistant(message) && (
        <AssistantMessage
          message={message}
          remoteAgentMessages={remoteAgentMessages}
          renderToolCall={renderToolCall}
        />
      )}
    </>
  );
}

Message.displayName = 'Message';

export default Message;
