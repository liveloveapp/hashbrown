import type { ReactElement } from 'react';
import styles from './Messages.module.css';
import type { UiChatMessage } from '@hashbrownai/react';

interface MessagesProps {
  messages: UiChatMessage<any>[];
}

export function Messages({ messages }: MessagesProps): ReactElement {
  return (
    <div className={styles.container}>
      {messages.map((message) => {
        switch (message.role) {
          case 'user':
            return <div className={styles.chatMessage}>{message.content}</div>;
          case 'assistant':
            return <div className={styles.chatMessage}>{message.content}</div>;
        }
      })}
    </div>
  );
}
