```tsx
import { Chat } from '@hashbrownai/core';

type MessagesProps = {
  messages: Chat.Message<string, Chat.AnyTool>[];
};

export function Messages({ messages }: MessagesProps) {
  return (
    <div>
      {messages.map((message, index) => {
        switch (message.role) {
          case 'user':
            return (
              <div key={index} className="chat-message user">
                <p>{message.content}</p>
              </div>
            );
          case 'assistant':
            return (
              <div key={index} className="chat-message assistant">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
```
