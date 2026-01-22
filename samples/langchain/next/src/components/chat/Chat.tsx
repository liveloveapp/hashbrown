import { type Chat as HashbrownChat } from '@hashbrownai/core';
import { useUiChat } from '@hashbrownai/react';
import { ReactElement, useCallback } from 'react';
import styles from './Chat.module.css';
import ChatInput from './ChatInput';
import {
  type RemoteAgentMessage,
  type RenderToolCall,
} from './Message';
import Messages from './Messages';
import { type Step } from './Steps';

interface ChatProps {
  agent: ReturnType<typeof useUiChat<HashbrownChat.AnyTool>>;
  isRunning?: boolean;
  onStop?: () => void;
  remoteAgentIsRunning?: boolean;
  remoteAgentSteps?: Step[];
  remoteAgentMessages?: RemoteAgentMessage[];
  renderToolCall?: RenderToolCall;
}

function Chat({
  agent,
  isRunning,
  onStop,
  remoteAgentIsRunning,
  remoteAgentSteps,
  remoteAgentMessages,
  renderToolCall,
}: ChatProps): ReactElement {
  const onSubmit = useCallback(
    (content: string) => {
      agent.sendMessage({ role: 'user', content });
    },
    [agent],
  );

  return (
    <div className={styles.container}>
      <Messages
        messages={agent.messages}
        remoteAgentIsRunning={remoteAgentIsRunning}
        steps={remoteAgentSteps}
        remoteAgentMessages={remoteAgentMessages}
        renderToolCall={renderToolCall}
      />
      <ChatInput isRunning={isRunning} onSubmit={onSubmit} onStop={onStop} />
    </div>
  );
}

Chat.displayName = 'Chat';

export default Chat;
