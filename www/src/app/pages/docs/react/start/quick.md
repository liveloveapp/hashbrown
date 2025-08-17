# React Quick Start

Hashbrown is an open source framework for building generative user interfaces in React.

## Key Concepts

- **Headless**: build your UI how you want
- **Hook Based**: Hashbrown uses React hooks for reactivity
- **[Platform Agnostic](/docs/react/start/platforms)**: use any supported LLM provider
- **[Streaming](/docs/react/concept/streaming)**: LLMs can be slow, so streaming is baked into the core
- **[Components](/docs/react/concept/components)**: generative UI using your trusted and tested React components
- **[Runtime](/docs/react/concept/runtime)**: safely execute LLM-generated JavaScript code in the client

---

## Prerequisites

- Node.js v18+
- React v18+

---

## OpenAI API Key

In this intro to Hashbrown, we'll be using OpenAI's Large Language Models.

To follow along, you'll need to

1. [Sign up for OpenAI's API](https://openai.com/api/)
2. [Create an organization and API Key](https://platform.openai.com/settings/organization/api-keys)
3. Copy the API Key so you have it handy
4. Follow the instructions in [the OpenAI Adapter docs](/docs/react/platform/openai) to setup a backend endpoint for Hashbrown to consume

---

## Install

```sh
npm install @hashbrownai/{core,react,openai} --save
```

---

## Creating the Chat Endpoint

Hashbrown's provider packages (in this case the OpenAI package) comes with _adapter functions_ that help you implement the API route Hashbrown's frontend code will consume. The adapter functions work in any JavaScript runtime that supports async iterators, including NodeJS and most edge runtimes.

Each implementation will be dependent on the API framework you are using. For example, if you are ussing Express, your API endpoing might look like the following:

```ts
import { HashbrownOpenAI } from '@hashbrownai/openai';

app.post('/chat', async (req, res) => {
  const stream = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    request: req.body,
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk);
  }

  res.end();
});
```

Hashbrown's adapter functions handle the following for you:

- **Streaming**: Hashbrown utilizes your LLM provider's streaming capabilities. Each chunk is encoded and yielded to you to write out as part of the response.
- **Error Handling**: Errors are encountered when communicating with your LLM provider are also handled and encoded, letting you consume error messages in your frontend code.
- **Normalization**: Hashbrown normalizes messages, tool calling, and schema across our supported LLM providers letting you use a single, consistent API.

## Configuring Your React App

You must provide the API endpoint to Hashbrown's React SDK:

````ts
export default function App({ children }) {
  return (
    <HashbrownProvider url="/api/chat">
      {children}
    </HashbrownProvider>
  )
}
```

## Create Chat Hook

The `useChat` hook from `@hashbrownai/react` is the basic way to interact with a Large Language Model (LLM) via text. It provides a set of methods for sending and receiving messages, as well as managing the chat state.

<www-code-example header="ChatPanel.tsx">

```tsx
import React, { useState, useCallback } from 'react';
import { useChat } from '@hashbrownai/react';

export function ChatPanel() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat({
    model: 'gpt-4.1',
    system: 'You are a helpful assistant that can answer questions and help with tasks.',
  });

  const handleSend = useCallback(
    (event: FormEvent) => {
      event.preventDefault();

      if (!text) return;

      sendMessage({ role: 'user', content: text });
      setInput('');
    },
    [input, sendMessage],
  );

  return (
    <div>
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role}>
            <p>{msg.content}</p>
          </div>
        ))}
      </div>

      <form className="composer" onSubmit={handleSend}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your message…" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
````

</www-code-example>

Let's break this down:

- The `useChat` hook creates a new chat instance.
- The `model` parameter specifies the model to use for the chat.
- The `messages` property contains the current chat history.
- The `sendMessage` function sends a user message to the LLM.

This creates a complete chat interface where:

1. Users can type and send messages
2. Messages are displayed in a scrollable list
3. The AI responds through the chat hook
4. The UI updates automatically as new messages arrive

The component uses React's state and hooks to stay in sync with the chat state.

---

## Debugging with Redux Devtools

Hashbrown streams LLM messages and internal actions to the [redux devtools](https://chromewebstore.google.com/detail/lmhkpmbekcpmknklioeibfkpmmfibljd).
We find that this provides direct access to the state internals of Hashbrown - enabling you to debug your AI-powered user experiences.

<div style="padding:59.64% 0 0 0;position:relative; width:100%;"><iframe src="https://player.vimeo.com/video/1089272009?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown debugging"></iframe></div>

To enable debugging, specify the optional `debugName` configuration.

<www-code-example header="ChatPanel.tsx">

```tsx
import { useChat } from '@hashbrownai/react';

const chat = useChat({
  model: 'gpt-4o',
  debugName: 'chat',
  system: 'You are a helpful assistant that can answer questions and help with tasks.',
});
```

</www-code-example>

---

## Tool Calling

Tool calling enables the LLM to invoke functions you have exposed to the LLM.
We also suggest reading the [OpenAI documentation for tool calling using the chat API](https://platform.openai.com/docs/guides/function-calling?api-mode=chat)

Some common use cases for tool calling include:

- Fetching additional data from your service layer
- Providing the LLM with the latest application state
- Enabling the LLM to mutate state or take action

<div style="padding:59.64% 0 0 0;position:relative;width:100%;"><iframe src="https://player.vimeo.com/video/1089272737?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown tool calling"></iframe></div>

Let's look at an example of tool calling using Hashbrown.

<www-code-example header="ChatPanel.tsx" run="/examples/react/function-calling">

```tsx
import React, { useState } from 'react';
import { useChat, useTool } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

function getUser() {
  // Replace with your auth logic
  return { id: 'user-1', name: 'Alice' };
}

function getLights() {
  // Replace with your data logic
  return Promise.resolve([
    { id: 'light-1', brightness: 75 },
    { id: 'light-2', brightness: 50 },
  ]);
}

function controlLight(input: { lightId: string; brightness: number }) {
  // Replace with your update logic
  return Promise.resolve({ success: true });
}

export function ChatPanel() {
  const [input, setInput] = useState('');
  const getUserTool = useTool({
    name: 'getUser',
    description: 'Get information about the current user',
    handler: getUser,
  });
  const getLightsTool = useTool({
    name: 'getLights',
    description: 'Get the current lights',
    handler: getLights,
  });
  const controlLightTool = useTool({
    name: 'controlLight',
    description: 'Control a light',
    schema: s.object('Control light input', {
      lightId: s.string('The id of the light'),
      brightness: s.number('The brightness of the light'),
    }),
    handler: controlLight,
  });

  const chat = useChat({
    model: 'gpt-4.1',
    system: 'You are a helpful assistant that can answer questions and help with tasks',
    tools: [getUserTool, getLightsTool, controlLightTool],
  });

  const handleSend = useCallback(
    (event: FormEvent) => {
      event.preventDefault();

      if (!text) return;

      sendMessage({ role: 'user', content: text });
      setInput('');
    },
    [input, sendMessage],
  );

  return (
    <div>
      <div className="messages">
        {chat.messages.map((message, idx) => (
          <div key={idx} className={message.role}>
            <p>{message.content}</p>
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={handleSend}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your message…" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

</www-code-example>

Let's review the key parts of this code:

- The `useChat` hook creates a new chat instance with the specified model and tools.
- The `tools` array contains functions that the LLM can call.
- The `useTool` hook defines a tool that the LLM can call, with a name, description, optional arguments, and handler function.
- The `handler` function is called when the LLM invokes the tool, allowing you to perform actions like fetching data or updating state.

---

## What is this schema language?

Skillet is Hashbrown's LLM-optimized schema language.

Why not use something like Zod?
We're glad you asked.

- Skillet is feature-restricted to the set of features that LLM providers support
- Skillet enables one-line streaming
- Skillet enables partial parsing
- Skillet is strongly typed

[Read more about how Skillet supports streaming responses](/docs/react/concept/streaming)

---

## Generate UI Components

To build on top of the chat resource, we can expose React components that the LLM can use to generate UI.
In this example, we'll use the `useUiChat` hook from `@hashbrownai/react`.

<div style="padding:59.64% 0 0 0;position:relative;width:100%;"><iframe src="https://player.vimeo.com/video/1089273215?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown structured output"></iframe></div>

<www-code-example header="ChatPanel.tsx" run="/examples/react/ui-chat">

```tsx
import React, { useState } from 'react';
import { useUiChat, exposeComponent, useTool } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import ReactMarkdown from 'react-markdown';

function LightComponent({ lightId }: { lightId: string }) {
  return <div>Light: {lightId}</div>;
}

function CardComponent({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

export function ChatPanel() {
  const [input, setInput] = useState('');

  const getUserTool = useTool({
    name: 'getUser',
    description: 'Get information about the current user',
    handler: () => ({ id: 'user-1', name: 'Alice' }),
  });
  const getLightsTool = useTool({
    name: 'getLights',
    description: 'Get the current lights',
    handler: async () => [
      { id: 'light-1', brightness: 75 },
      { id: 'light-2', brightness: 50 },
    ],
  });
  const controlLightTool = useTool({
    name: 'controlLight',
    description: 'Control a light',
    schema: s.object('Control light input', {
      lightId: s.string('The id of the light'),
      brightness: s.number('The brightness of the light'),
    }),
    handler: async (input) => {
      // update logic here
      return { success: true };
    },
  });

  const chat = useUiChat({
    model: 'gpt-4.1',
    system: 'You are a helpful assistant that can answer questions and help with tasks',
    tools: [getUserTool, getLightsTool, controlLightTool],
    components: [
      exposeComponent(ReactMarkdown, {
        name: 'markdown',
        description: 'Show markdown to the user',
        props: {
          children: s.streaming.string('The markdown content'),
        },
      }),
      exposeComponent(LightComponent, {
        name: 'light',
        description: 'Show a light to the user',
        props: {
          lightId: s.string('The id of the light'),
        },
      }),
      exposeComponent(CardComponent, {
        name: 'card,'
        description: 'Show a card to the user',
        children: 'any',
        props: {
          title: s.streaming.string('The title of the card'),
        },
      }),
    ],
  });

  const handleSend = useCallback(
    (event: FormEvent) => {
      event.preventDefault();

      if (!text) return;

      sendMessage({ role: 'user', content: text });
      setInput('');
    },
    [input, sendMessage],
  );

  return (
    <div>
      <div className="messages">
        {chat.messages.map((message, idx) => (
          <div key={idx} className={message.role}>
            {message.ui ? message.ui : <p>{message.content}</p>}
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={handleSend}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your message…" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

</www-code-example>

Let's focus on the new `components` property.

- The `components` property is an array of components that the LLM will use to generate UI.
- The `exposeComponent` function defines a component that the LLM can use, with a name, description, and props.
- The `props` property defines the properties that the component can accept, using the Skillet schema language.
- The `children` property allows the component to accept child components, enabling nested UI structures.
- The `useUiChat` hook creates a chat resource that can generate UI components based on the LLM's responses.

Did you catch the `streaming` keyword in the example above?

- We are streaming generated markdown from the LLM into our `MarkdownComponent`.
- We are streaming the card `title` property value.

---

## Next Steps

Now that you've seen the basics of Hashbrown, you can explore more advanced features and concepts:

- [Get started with writing system instructions](/docs/react/concept/system-instructions)
- [Use your React components for generative UI](/docs/react/concept/components)
- [Learn how to implement tool calling](/docs/react/concept/functions)
- [Learn more about streaming responses](/docs/react/concept/streaming)
