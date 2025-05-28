import type { ReactElement } from 'react';
import styles from './Messages.module.css';
import type { UiChatMessage } from '@hashbrownai/react';

interface MessagesProps {
  messages: UiChatMessage<any>[];
}

export default function Messages({ messages }: MessagesProps): ReactElement {
  return (
    <div className={styles.container}>
      {messages
        .filter(
          (message) =>
            message.role !== 'assistant' ||
            (message.role === 'assistant' && !!message.content),
        )
        .map((message, index) => (
          <div
            key={index}
            className={`${styles.message} ${
              message.role === 'assistant' ? styles.assistant : styles.user
            }`}
          >
            {message.role === 'assistant' && message.ui && (
              <div className={styles.ui}>{message.ui}</div>
            )}

            <div className="content">
              {message.role === 'user' && message.content}
            </div>
          </div>
        ))}
    </div>
  );
}
