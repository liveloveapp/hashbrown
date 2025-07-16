# Simple Chat

This guide demonstrates how to build a simple chat experience using Hashbrown's React SDK.

---

## 1. Install Hashbrown React

```bash
npm install @hashbrownai/react @hashbrownai/core
```

---

## 2. Provide the Hashbrown Context

Wrap your app with the `HashbrownProvider` to configure the base API URL and any middleware:

```tsx
import { HashbrownProvider } from '@hashbrownai/react';

export function App() {
  return <HashbrownProvider url="https://api.hashbrown.ai/v1">{/* your app routes/components here */}</HashbrownProvider>;
}
```

---

## 3. Use the `useChat` Hook

The `useChat` hook manages chat state, message sending, and streaming. It is idiomatic to use it inside a functional component.

```tsx
import { useChat } from '@hashbrownai/react';

function Chat() {
  const { messages, sendMessage, isSending, isReceiving, error, stop } = useChat({
    model: 'gpt-4o',
    system: 'You are a helpful assistant.',
  });

  const [input, setInput] = React.useState('');

  const handleSend = () => {
    if (input.trim()) {
      sendMessage({ role: 'user', content: input });
      setInput('');
    }
  };

  return (
    <div>
      <div style={{ minHeight: 200, border: '1px solid #eee', padding: 8 }}>
        {messages.map((msg, i) => (
          <div key={i}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
        {isReceiving && <div>Assistant is typing...</div>}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} disabled={isSending} placeholder="Type your message..." />
      <button onClick={handleSend} disabled={isSending || !input.trim()}>
        Send
      </button>
      <button onClick={() => stop()} disabled={!isReceiving}>
        Stop
      </button>
      {error && <div style={{ color: 'red' }}>{error.message}</div>}
    </div>
  );
}
```

---

## 4. Full Example

```tsx
import React from 'react';
import { HashbrownProvider } from '@hashbrownai/react';
import Chat from './Chat';

export default function App() {
  return (
    <HashbrownProvider url="https://api.hashbrown.ai/v1">
      <Chat />
    </HashbrownProvider>
  );
}
```

---

## 5. Next Steps

- Explore [useStructuredChat](../api/useStructuredChat.md) for structured output.
- Add [tools](../recipe/tools.md) for function calling.
- See [UI chat](../recipe/ui-chat.md) for rich message rendering.

---

## Reference

- [`useChat` API](../api/useChat.md)
- [`HashbrownProvider` API](../api/HashbrownProvider.md)
