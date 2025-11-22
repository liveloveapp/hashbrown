import { type Chat as HashbrownChat } from '@hashbrownai/core';
import { useUiChat } from '@hashbrownai/react';
import { ReactElement, useCallback } from 'react';
import styles from './Chat.module.css';
import ChatInput from './ChatInput';
import Messages from './Messages';

interface ChatProps {
  agent: ReturnType<typeof useUiChat<HashbrownChat.AnyTool>>;
  isRunning?: boolean;
  onStop?: () => void;
}

function Chat({ agent, isRunning, onStop }: ChatProps): ReactElement {
  const onSubmit = useCallback(
    (content: string) => {
      agent.sendMessage({ role: 'user', content });
    },
    [agent],
  );

  return (
    <div className={styles.container}>
      <Messages messages={agent.messages} />
      <ChatInput isRunning={isRunning} onSubmit={onSubmit} onStop={onStop} />
    </div>
  );
}

Chat.displayName = 'Chat';

export default Chat;
