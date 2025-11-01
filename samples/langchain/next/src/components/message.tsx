'use client';

import { Chat } from '@hashbrownai/core';
import { UiChatMessage } from '@hashbrownai/react';
import { CircleAlert } from 'lucide-react';
import { Button } from './button';
import styles from './message.module.css';

const renderJsonValue = (value: UiChatMessage<Chat.AnyTool>['content']) => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return `${value ?? ''}`;
  }

  return JSON.stringify(value);
};

export const Message = ({
  message,
  onRetry,
}: {
  message: UiChatMessage<Chat.AnyTool>;
  onRetry: () => void;
}) => {
  const isAssistant = message.role === 'assistant';
  const isError = message.role === 'error';

  const onLeft = isAssistant || isError;

  if ((isAssistant || isError) && !message.content) {
    return null;
  }

  let messageClass = '';
  if (isAssistant) {
    messageClass = styles.messageAssistant;
  } else if (isError) {
    messageClass = styles.messageError;
  } else {
    messageClass = styles.messageUser;
  }

  return (
    <div
      className={`${styles.container} ${
        onLeft ? styles.containerLeft : styles.containerRight
      }`}
    >
      <div className={`${styles.message} ${messageClass}`}>
        {message.role === 'error' && (
          <div className={styles.errorContent}>
            <CircleAlert />
            {renderJsonValue(message.content)}
            <Button
              className={styles.retryButton}
              variant="ghost"
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        )}

        {message.role === 'assistant' && (
          <div className={styles.content}>{message.ui}</div>
        )}

        {message.role === 'user' && (
          <div className={styles.content}>{renderJsonValue(message.content)}</div>
        )}
      </div>
    </div>
  );
};
