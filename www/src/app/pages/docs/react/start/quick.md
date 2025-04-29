# React Quick Start

hashbrown is an open source library for building meaningful AI experiences with React.

## Key Concepts

- Headless: build your UI how you want.
- Hook Based: hashbrown uses hooks for managing message state and streaming updates into your app.
- Platform Agnostic: use any supported platform or model.

---

## Capabilities

- Expose components that are dynamically rendered by the AI
- Provide application state to the AI
- Provide JavaScript functions that the AI can execute
- Interact with the AI via text
- Stream messages to your users
- Safely execute JavaScript code written by the AI

---

## Prerequisites

- Node.js v18+
- React v18+

In this quickstart, we'll be using OpenAI models.
So, grab an API key and follow along.

---

## Install

```sh
npm install @hashbrown/core @hashbrown/angular
```

---

## The @hashbrownai/react!useChat:function Hook

The @hashbrownai/react!useChat:function function is the main resource for interacting with a Large Language Model (LLM) via text.
It provides a set of methods for sending and receiving messages, as well as managing the chat state.

<www-code-example header="main.ts">

```ts
const { sendMessage } = useChat({
  model: 'gpt-4o',
  messages: [
    {
      role: 'system',
      content:
        'You are a helpful assistant that can answer questions and help with tasks.',
    },
  ]
});

sendMessage({ role: 'user ', content: 'Show all lights' });
```

</www-code-example>
