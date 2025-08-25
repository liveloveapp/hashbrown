# Building a Chatbot with Generative UI and Tool Calling in React

This guide walks you step-by-step through building a modern chatbot in React using Hashbrown. You'll learn how to:

- Set up a chat interface with streaming responses
- Expose tools (function calls) for the LLM to use
- Enable generative UI: let the LLM render your React components
- Combine all these for a rich, interactive chatbot experience

---

## Before You Start

**Prerequisites:**

- Familiarity with React and functional components
- Node.js and npm installed
- An OpenAI API key (or another supported LLM provider)

**Install Hashbrown and dependencies:**

```sh
npm install @hashbrownai/react @hashbrownai/core @hashbrownai/openai react-markdown
```

---

## 1. Set Up the Hashbrown Provider

Wrap your app with `HashbrownProvider` to configure the API endpoint and context:

```tsx
import { HashbrownProvider } from '@hashbrownai/react';

export function App() {
  return (
    <HashbrownProvider url="https://api.hashbrown.ai/v1">
      {/* Your routes/components here */}
    </HashbrownProvider>
  );
}
```

---

## 2. Create a Basic Chat Interface

Start with a simple chat using the `useChat` hook. This manages message state and streaming.

```tsx
import React, { useState, useCallback } from 'react';
import { useChat } from '@hashbrownai/react';

export function ChatPanel() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, isReceiving } = useChat({
    model: 'gpt-4o',
    system:
      'You are a helpful assistant that can answer questions and help with tasks.',
  });

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    sendMessage({ role: 'user', content: input });
    setInput('');
  }, [input, sendMessage]);

  return (
    <div>
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role}>
            <p>{msg.content}</p>
          </div>
        ))}
        {isReceiving && <div>Assistant is typing...</div>}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message…"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

---

## 3. Add Tool Calling

Allow the LLM to call your backend functions ("tools"). Define each tool with `useTool` and pass them to the chat hook.

### Example: Exposing Tools

```tsx
import { useTool } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

// Example tool: get user info
const getUserTool = useTool({
  name: 'getUser',
  description: 'Get information about the current user',
  handler: () => ({ id: 'user-1', name: 'Alice' }),
});

// Example tool: get lights
const getLightsTool = useTool({
  name: 'getLights',
  description: 'Get the current lights',
  handler: async () => [
    { id: 'light-1', brightness: 75 },
    { id: 'light-2', brightness: 50 },
  ],
});

// Example tool: control a light
const controlLightTool = useTool({
  name: 'controlLight',
  description: 'Control a light',
  schema: s.object('Control light input', {
    lightId: s.string('The id of the light'),
    brightness: s.number('The brightness of the light'),
  }),
  handler: async (input) => {
    // Replace with your update logic
    return { success: true };
  },
});
```

### Pass Tools to the Chat Hook

```tsx
import { useChat } from '@hashbrownai/react';

const chat = useChat({
  model: 'gpt-4o',
  system:
    'You are a helpful assistant that can answer questions and help with tasks.',
  tools: [getUserTool, getLightsTool, controlLightTool],
});
```

**How it works:**

- The LLM can now choose to call these tools in response to user input.
- Tool calls and results are handled automatically by Hashbrown.

---

## 4. Enable Generative UI (LLM-Driven React Components)

Let the LLM render your React components by exposing them with `exposeComponent` and using `useUiChat`.

### Step 1: Define Components to Expose

```tsx
import ReactMarkdown from 'react-markdown';
import { exposeComponent } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

// Expose a Markdown renderer
const MarkdownComponent = exposeComponent(ReactMarkdown, {
  name: 'markdown',
  description: 'Show markdown to the user',
  props: {
    children: s.streaming.string('The markdown content'),
  },
});

// Expose a Light component
function LightComponent({ lightId }) {
  return <div>Light: {lightId}</div>;
}
const ExposedLightComponent = exposeComponent(LightComponent, {
  name: 'light',
  description: 'Show a light to the user',
  props: {
    lightId: s.string('The id of the light'),
  },
});

// Expose a Card component
function CardComponent({ title, children }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
const ExposedCardComponent = exposeComponent(CardComponent, {
  name: 'card',
  description: 'Show a card to the user',
  props: {
    title: s.streaming.string('The title of the card'),
  },
  children: 'any',
});
```

### Step 2: Use `useUiChat` with Tools and Components

```tsx
import { useUiChat } from '@hashbrownai/react';

const chat = useUiChat({
  model: 'gpt-4o',
  system:
    'You are a helpful assistant that can answer questions and help with tasks.',
  tools: [getUserTool, getLightsTool, controlLightTool],
  components: [MarkdownComponent, ExposedLightComponent, ExposedCardComponent],
});
```

### Step 3: Render Messages with UI

```tsx
function Messages({ chat }) {
  return (
    <>
      {chat.messages.map((message, idx) => (
        <div key={idx} className={message.role}>
          {message.ui ? message.ui : <p>{message.content}</p>}
        </div>
      ))}
    </>
  );
}
```

---

## 5. Putting It All Together: Full Chatbot Example

Below is a full example combining chat, tool calling, and generative UI.

```tsx
import React, { useState } from 'react';
import {
  HashbrownProvider,
  useUiChat,
  useTool,
  exposeComponent,
} from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import ReactMarkdown from 'react-markdown';

function LightComponent({ lightId }) {
  return <div>Light: {lightId}</div>;
}

function CardComponent({ title, children }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

export default function App() {
  // Define tools
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

  // Expose components
  const MarkdownComponent = exposeComponent(ReactMarkdown, {
    name: 'markdown',
    description: 'Show markdown to the user',
    props: {
      children: s.streaming.string('The markdown content'),
    },
  });
  const ExposedLightComponent = exposeComponent(LightComponent, {
    name: 'light',
    description: 'Show a light to the user',
    props: {
      lightId: s.string('The id of the light'),
    },
  });
  const ExposedCardComponent = exposeComponent(CardComponent, {
    name: 'card',
    description: 'Show a card to the user',
    props: {
      title: s.streaming.string('The title of the card'),
    },
    children: 'any',
  });

  // Set up chat
  const [input, setInput] = useState('');
  const chat = useUiChat({
    model: 'gpt-4o',
    system:
      'You are a helpful assistant that can answer questions and help with tasks.',
    tools: [getUserTool, getLightsTool, controlLightTool],
    components: [
      MarkdownComponent,
      ExposedLightComponent,
      ExposedCardComponent,
    ],
  });

  const handleSend = () => {
    if (input.trim()) {
      chat.sendMessage({ role: 'user', content: input });
      setInput('');
    }
  };

  return (
    <HashbrownProvider url="https://api.hashbrown.ai/v1">
      <div className="messages">
        {chat.messages.map((message, idx) => (
          <div key={idx} className={message.role}>
            {message.ui ? message.ui : <p>{message.content}</p>}
          </div>
        ))}
      </div>
      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type your message..."
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </HashbrownProvider>
  );
}
```

---

## 6. Tips for Prompt Engineering and System Instructions

- Use the `system` prompt to set the assistant's role and rules. Be explicit about what the assistant can do, and provide examples if needed.
- For tool calling, describe each tool clearly and use Skillet schemas for arguments.
- For generative UI, expose only safe, well-documented components. Use schemas to describe props and children.
- Use the `debugName` option for easier debugging with Redux DevTools.

---

## 7. Next Steps

- [Learn more about Skillet schemas](../concept/schema.md)
- [Explore streaming and partial parsing](../concept/streaming.md)
- [See advanced prompt engineering](../guide/prompt-engineering.md)
- [Check out the sample smart home app](https://github.com/liveloveapp/hashbrown/tree/main/samples/smart-home/client-react)

---

## Troubleshooting

- **No response from the assistant?** Check your API key and model configuration.
- **Tool not called?** Ensure the tool's name, description, and schema match the intended use.
- **UI not rendering?** Make sure your exposed components are included in the `components` array and their schemas match the props.

---

## Summary

With Hashbrown, you can build a chatbot that:

- Streams LLM responses in real time
- Lets the LLM call your backend functions
- Renders dynamic, LLM-driven React UI

This unlocks powerful, interactive AI experiences in your React apps.
