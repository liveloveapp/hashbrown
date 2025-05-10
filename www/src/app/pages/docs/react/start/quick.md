# React Quick Start

Hashbrown for React is an open source library for building meaningful AI experiences with React.

## Key Concepts

- Headless: build your UI how you want.
- Hook Based: hashbrown uses hooks for managing message state and streaming updates into your app.
- Platform Agnostic: use any supported platform or model.

## Capabilities

- Expose components that are dynamically rendered by the AI
- Provide application state to the AI
- Provide JavaScript functions that the AI can execute
- Interact with the AI via text
- Stream messages to your users
- Safely execute JavaScript code written by the AI

---

# Getting Started

This quick start guide will help you:

- Setup a hashbrown endpoint.
- Integrate hashbrown into your React application.

⚠️ You will need an OpenAI API key for this tutorial

⚠️ `@hashbrownai` requires Node.js v18+ and React v18+

---

## Endpoint Setup

In order to secure your API key, an endpoint is required by hashbrown to proxy calls to your chosen vendor. The example in this guide uses the OpenAI vendor client, but hashbrown provides packages for multiple vendors.

### Installation

```sh
npm install @hashbrownai/core @hashbrownai/openai
```

### Endpoint Example

The below example will setup an express server and endpoint at `http://localhost:3000/chat`.
Set `OPENAI_API_KEY` and the endpoint is ready to provide responses to hashbrown in your React application.

<www-code-example header="server.ts">

```ts
import { Chat } from '@hashbrownai/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import cors from 'cors';
import express from 'express';

// Fill in your OpenAI API key here.
const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY';

const app = express();

app.use(express.json());
app.use(cors());

app.listen(3000, 'localhost', () => {
  console.log(`[ ready ] http://localhost:3000`);
});

app.post('/chat', async (req, res) => {
  const request = req.body as Chat.CompletionCreateParams;

  const stream = HashbrownOpenAI.stream.text(OPENAI_API_KEY, request);

  res.header('Content-Type', 'text/plain');
  for await (const chunk of stream) {
    res.write(JSON.stringify(chunk));
  }
  res.end();
});
```

</www-code-example>

---

## React Setup

### Installation

```sh
npm install @hashbrownai/react
```

### The @hashbrownai/react!HashbrownProvider:function Provider

The @hashbrownai/react!HashbrownProvider:function provider manages context for the various hooks hashbrown provides. In the simplest application, it can be wrapped around your `<App/>`.

```tsx
<HashbrownProvider url="http://localhost:3000/chat">
  <App />
</HashbrownProvider>
```

With this setup, all components in the application can use hashbrowns hooks.

### The @hashbrownai/react!useChat:function Hook

The @hashbrownai/react!useChat:function function is the main resource for interacting with a Large Language Model (LLM) via text.
It provides a set of methods for sending and receiving messages, as well as managing the chat state.

```tsx
const { messages, sendMessage } = useChat({
  model: 'gpt-4o',
  messages: [
    {
      role: 'system',
      content: 'You are a helpful assistant that can answer questions and help with tasks.',
    },
  ],
});
```

Calling the hook is your opportunity to choose a model, set initial messages, etc. and retrieve the handles that your components will use to provide rich AI features inside your React application.

### Simple Chat Component

In the example below, we create a simple `ChatComponent`.

We call the @hashbrownai/react!useChat:function hook which provides initial configuration and exposes `messages` and `sendMessage`. This allows the component to read the current messages in the chat and to send a new message to the AI.

<www-code-example header="chat-component.tsx">

```tsx
import { useChat } from '@hashbrownai/react';
import { useState } from 'react';

export const ChatComponent = () => {
  // call the useChat hook to setup the chat and get access to the
  // messages and sendMessage
  const { messages, sendMessage } = useChat({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that can answer questions and help with tasks.',
      },
    ],
  });

  const [draft, setDraft] = useState<string>('');

  const handleClick = () => {
    sendMessage({
      role: 'user',
      content: draft,
    });
    setDraft('');
  };

  return (
    <div>
      {/* Button and input to send a test message. */}
      <input onChange={(e) => setDraft(e.target.value)} value={draft} />
      <button onClick={handleClick}>Send Test</button>

      <ul>
        {/* Render all the messages in the chat. */}
        {messages.map((message, index) => (
          <li key={index}>{message.content}</li>
        ))}
      </ul>
    </div>
  );
};
```

</www-code-example>

---

## Next Steps

With the above setup, you have a basic chat application. We will have more documentation and examples soon.

You can begin to explore tool and component integrations or prediction capabilities by extending @hashbrownai/react!useChat:function through the other hooks such as @hashbrownai/react!useUiChat:function and @hashbrownai/react!useCompletion:function.
