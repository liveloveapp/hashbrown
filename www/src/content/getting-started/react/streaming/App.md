```tsx
import { useChat, useTool } from '@hashbrownai/react';

export function App() {
  const { user } = getAuth();

  const getUser = useTool({
    name: 'getUser',
    description: 'Get information about the current user',
    handler: async () => {
      return user;
    },
    deps: [user],
  });

  const { messages, sendMessage } = useChat({
    model: 'gpt-5',
    system: `
      You are a helpful assistant that can answer questions and help with tasks.
    `,
    tools: [getUser],
  });

  const onSendMessage = (text: string) => {
    sendMessage({ role: 'user', content: text });
  };

  return (
    <div>
      <Messages messages={messages} />
      <Composer onSendMessage={onSendMessage} />
    </div>
  );
}
```
