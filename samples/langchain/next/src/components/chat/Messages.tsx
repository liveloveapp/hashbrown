'use client';

import { type Chat } from '@hashbrownai/core';
import { UiChatMessage } from '@hashbrownai/react';
import { useEffect, useRef } from 'react';
import Message, {
  type RemoteAgentMessage,
  type RenderToolCall,
} from './Message';
import styles from './Messages.module.css';
import { ScrollArea } from './ScrollArea';
import Steps, { type Step } from './Steps';

interface MessagesProps {
  messages: UiChatMessage<Chat.AnyTool>[];
  remoteAgentIsRunning?: boolean;
  steps?: Step[];
  remoteAgentMessages?: RemoteAgentMessage[];
  renderToolCall?: RenderToolCall;
}

function Messages({
  messages,
  remoteAgentIsRunning,
  steps,
  remoteAgentMessages,
  renderToolCall,
}: MessagesProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        '[data-radix-scroll-area-viewport]',
      ) as HTMLElement | null;
      if (scrollContainer) {
        requestAnimationFrame(() => {
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior: 'smooth',
          });
        });
      }
    }
  }, [messages]);

  return (
    <div className={styles.container}>
      <ScrollArea className={styles.scrollArea} ref={scrollAreaRef}>
        <div className={styles.messages}>
          {messages.map((message, index) => (
            <Message
              key={index}
              message={message}
              remoteAgentMessages={remoteAgentMessages}
              renderToolCall={renderToolCall}
            />
          ))}
        </div>
        {remoteAgentIsRunning && (
          <div className={styles.steps}>
            <Steps steps={steps} />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

Messages.displayName = 'Messages';

export default Messages;
