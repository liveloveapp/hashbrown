---
title: 'Choosing a Model: Hashbrown React Docs'
meta:
  - name: description
    content: 'Choose and configure the provider model on your AG-UI server while keeping Hashbrown React clients provider-independent.'
---

# Choosing a Model

Hashbrown React clients send AG-UI run requests to your configured endpoint. The server adapter chooses the provider and model, so hooks such as `useChat`, `useCompletion`, `useStructuredChat`, and `useStructuredCompletion` do not accept a `model` option.

## Select the Model on the Server

Configure the model when you create the provider adapter:

```ts
import { HashbrownOpenAI } from '@hashbrownai/openai';

const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
  request,
});
```

The client remains unchanged when the server switches models or providers:

```tsx
import { useChat } from '@hashbrownai/react';

export function Chat() {
  const chat = useChat({
    system: 'You are a helpful assistant.',
  });

  // Render chat.messages and call chat.sendMessage(...).
}
```

## Route Between Models

If an application needs multiple models, expose separate AG-UI endpoints or choose the model in trusted server logic. Point a hook at an alternate endpoint with a nested `HashbrownProvider` or a custom transport. Do not send provider credentials or unrestricted model identifiers from the browser.

See the provider guides for server configuration:

- [OpenAI](/docs/react/platform/openai)
- [Azure OpenAI](/docs/react/platform/azure)
- [Anthropic](/docs/react/platform/anthropic)
- [Amazon Bedrock](/docs/react/platform/bedrock)
- [Google Gemini](/docs/react/platform/google)
- [Ollama](/docs/react/platform/ollama)
