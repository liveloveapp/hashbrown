'use client';

import { Chat } from '@hashbrownai/core';
import { UiAssistantMessage } from '@hashbrownai/react';
import { useEffect, useRef } from 'react';
import { Message } from './message';
import { ScrollArea } from './scrollarea';
import styles from './ui-chat.module.css';

export const UiChat = ({
  message,
  onRetry,
}: {
  message?: UiAssistantMessage<Chat.AnyTool>;
  onRetry: () => void;
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when message changes
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
  }, [message]);

  return (
    <div className={styles.container}>
      <ScrollArea className={styles.scrollArea} ref={scrollAreaRef}>
        <div className={styles.messagesContainer}>
          {message && <Message message={message} onRetry={onRetry} />}
        </div>
      </ScrollArea>
    </div>
  );
};
