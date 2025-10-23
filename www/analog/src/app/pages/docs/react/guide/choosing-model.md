---
title: 'Choosing Model: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown''s React SDK supports a variety of LLM providers and models. You can specify the model to use by passing the model option to any of the React hooks, such as useChat, useCompletion, useStructuredChat, or useStructuredCompletion.'
---
# Choosing Model

Hashbrown's React SDK supports a variety of LLM providers and models. You can specify the model to use by passing the `model` option to any of the React hooks, such as `useChat`, `useCompletion`, `useStructuredChat`, or `useStructuredCompletion`.

## Supported Providers

- **OpenAI** (e.g., `gpt-4o`, `gpt-4.1`)
- **Google** (e.g., `gemini-pro`)
- **Writer** (e.g., `palmyra-x-002`)
- **Azure** (OpenAI-compatible)

## Specifying a Model

You must provide a model ID as the `model` option. This can be a string literal or a variable. For OpenAI, Google, and Writer, you can use the model IDs as documented by each provider.

```tsx
import { useChat } from '@hashbrownai/react';

const ChatComponent = () => {
  const { messages, sendMessage, isSending, error } = useChat({
    model: 'gpt-4.1', // OpenAI model
    system: 'You are a helpful assistant.',
  });

  // ...render chat UI
};
```

## Azure OpenAI

For Azure, use the deployment name as the model ID. You must also configure the API endpoint and authentication via the `HashbrownProvider`:

```tsx
import { HashbrownProvider, useChat } from '@hashbrownai/react';

const App = () => (
  <HashbrownProvider url="https://your-azure-endpoint.openai.azure.com/openai/deployments/your-deployment-name/chat/completions?api-version=2023-03-15-preview">
    <ChatComponent />
  </HashbrownProvider>
);

const ChatComponent = () => {
  const { messages, sendMessage } = useChat({
    model: 'your-deployment-name', // Azure deployment name
    system: 'You are a helpful assistant.',
  });
  // ...
};
```

## Google Gemini

For Google Gemini, use the model ID as provided by Google (e.g., `gemini-pro`).

```tsx
const { messages, sendMessage } = useChat({
  model: 'gemini-pro',
  system: 'You are a helpful assistant.',
});
```

## Writer

For Writer, use the model ID as provided by Writer (e.g., `palmyra-x-002`).

```tsx
const { messages, sendMessage } = useChat({
  model: 'palmyra-x-002',
  system: 'You are a helpful assistant.',
});
```

## Model Option Reference

- `model: string` — The model or deployment name to use. See your provider's documentation for available models.

> **Note:** Some providers may require additional configuration, such as API keys or custom endpoints. Refer to the provider's documentation and the `HashbrownProvider` for details.
