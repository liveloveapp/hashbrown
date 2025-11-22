'use client';

import { useAgent } from '@copilotkitnext/react';
import { type Chat } from '@hashbrownai/core';
import { UiChatMessage } from '@hashbrownai/react';
import { useEffect, useRef } from 'react';
import Message from './Message';
import styles from './Messages.module.css';
import { ScrollArea } from './ScrollArea';
import Steps from './Steps';
interface MessagesProps {
  messages: UiChatMessage<Chat.AnyTool>[];
}

function Messages({ messages }: MessagesProps) {
  const { agent: remoteAgent } = useAgent({
    agentId: 'plan',
    updates: ['OnStateChanged' as any],
  });
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
            <Message key={index} message={message} />
          ))}
        </div>
        {remoteAgent.isRunning && (
          <div className={styles.steps}>
            <Steps />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

Messages.displayName = 'Messages';

export default Messages;
