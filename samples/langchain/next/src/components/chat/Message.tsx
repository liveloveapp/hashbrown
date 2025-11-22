'use client';

import { ToolMessage } from '@ag-ui/client';
import { useAgent, useRenderToolCall } from '@copilotkitnext/react';
import { type Chat } from '@hashbrownai/core';
import {
  UiAssistantMessage,
  UiChatMessage,
  UiUserMessage,
} from '@hashbrownai/react';
import { useMemo } from 'react';
import MagicTextRenderer from './MagicTextRenderer';
import styles from './Message.module.css';

interface MessageProps {
  message: UiChatMessage<Chat.AnyTool>;
}

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
}: {
  message: UiAssistantMessage<Chat.AnyTool>;
}) {
  const { agent: researchPlanAgent } = useAgent({ agentId: 'plan' });
  const renderToolCall = useRenderToolCall();

  const lastAssistantMessage = useMemo(
    () => researchPlanAgent.messages.findLast((m) => m.role === 'assistant'),
    [researchPlanAgent.messages],
  );

  const toolMessages = useMemo(
    () =>
      researchPlanAgent.messages.filter(
        (m): m is ToolMessage => m.role === 'tool',
      ),
    [researchPlanAgent.messages],
  );

  return (
    <div className={`${styles.message} ${styles.messageAssistant}`}>
      {message.ui}
      {lastAssistantMessage?.toolCalls?.map((toolCall) => {
        const toolMessage = toolMessages.find(
          (m) => m.toolCallId === toolCall.id,
        );
        return renderToolCall({
          toolCall,
          toolMessage,
        });
      })}
    </div>
  );
}

function UserMessage({ message }: { message: UiUserMessage }) {
  if (
    typeof message.content === 'string' &&
    message.content.trim().length > 0
  ) {
    return (
      <div className={`${styles.message} ${styles.messageUser}`}>
        <MagicTextRenderer
          text={message.content}
          unit="word"
          fragmentDuration={500}
        />
      </div>
    );
  }

  return null;
}

function Message({ message }: MessageProps) {
  const onLeft = isAssistant(message);

  if (!isUser(message) && !isAssistant(message)) {
    return null;
  }

  return (
    <div
      className={`${styles.container} ${
        onLeft ? styles.containerLeft : styles.containerRight
      }`}
    >
      {isUser(message) && <UserMessage message={message} />}
      {isAssistant(message) && <AssistantMessage message={message} />}
    </div>
  );
}

Message.displayName = 'Message';

export default Message;
