---
title: 'Prompt Engineering: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown''s React SDK enables you to build advanced prompt-driven chat and completion UIs with full type safety and composability. This guide covers best practices for prompt engineering using the React SDK.'
---
# Prompt Engineering

Hashbrown's React SDK enables you to build advanced prompt-driven chat and completion UIs with full type safety and composability. This guide covers best practices for prompt engineering using the React SDK.

## System Prompts

The `system` prompt sets the context and behavior for the model. You provide it as a string when initializing chat or completion hooks.

```tsx
import { useChat } from '@hashbrownai/react';

const { messages, sendMessage } = useChat({
  model: 'gpt-4',
  system: `You are a helpful assistant. Answer concisely.`,
});
```

**Tips:**

- Be explicit about the assistant's persona and constraints.
- Use clear instructions for formatting, tone, or output structure.

## Message History

Hashbrown manages message history for you. Pass an initial message array to the `messages` option, or use the `setMessages` method to update it.

```tsx
import { useChat } from '@hashbrownai/react';

const initialMessages = [{ role: 'user', content: 'What is the capital of France?' }];

const { messages, setMessages } = useChat({
  model: 'gpt-4',
  system: 'You are a geography expert.',
  messages: initialMessages,
});
```

**Best Practices:**

- Include relevant prior messages for context.
- Limit history length to avoid exceeding model context windows.

## Structured Prompts

For structured outputs, use the `useStructuredChat` or `useStructuredCompletion` hooks with a schema.

```tsx
import { useStructuredChat } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

const outputSchema = s.object('City info', {
  name: s.string('City name'),
  country: s.string('Country'),
  population: s.integer('Population'),
});

const { messages, sendMessage } = useStructuredChat({
  model: 'gpt-4',
  system: 'Provide city information as structured data.',
  schema: outputSchema,
});
```

**Why use schemas?**

- Enforces output shape for reliable parsing.
- Enables type-safe UI rendering.

## Tool Use

Hashbrown supports tool calling ("tools"). Define tools with `useTool` and pass them to chat hooks.

```tsx
import { useTool, useChat } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

const getWeather = useTool({
  name: 'getWeather',
  description: 'Get weather for a city',
  args: s.object('Weather input', {
    city: s.string('City name'),
  }),
  handler: async ({ city }) => {
    // Call your weather API here
    return { temperature: 72 };
  },
});

const { messages, sendMessage } = useChat({
  model: 'gpt-4',
  system: 'You can call tools to fetch data.',
  tools: [getWeather],
});
```

**Tips:**

- Describe tool purpose and arguments clearly.
- Use schemas for tool arguments and results.

## UI-Driven Prompts

For rich, component-based outputs, use the `useUiChat` hook and expose React components.

```tsx
import { useUiChat, exposeComponent } from '@hashbrownai/react';

const CityCard = ({ name, country, population }: { name: string; country: string; population: number }) => (
  <div>
    <h2>{name}</h2>
    <p>{country}</p>
    <p>Population: {population}</p>
  </div>
);

const exposedCityCard = exposeComponent(CityCard, {
  name: 'CityCard',
  description: 'Displays city information',
  props: {
    name: s.string('name'),
    country: s.string('country'),
    population: s.number('population'),
  },
});

const { messages, sendMessage } = useUiChat({
  model: 'gpt-4',
  system: 'Render city info using the CityCard component.',
  components: [exposedCityCard],
});
```

**Best Practices:**

- Expose only safe, well-documented components.
- Use schemas to describe component props.

## Debugging Prompts

- Use the `debugName` option to label chat sessions for easier debugging.
- Inspect the `error` and `exhaustedRetries` fields from chat hooks for troubleshooting.

```tsx
const { error, exhaustedRetries } = useChat({
  model: 'gpt-4',
  system: 'You are a helpful assistant.',
  debugName: 'support-chat',
});
```

## Summary

- Set clear system prompts for model behavior.
- Manage message history for context.
- Use schemas for structured outputs and tool arguments.
- Expose React components for UI-driven outputs.
- Leverage debugging options for prompt iteration.

For more, see the [API Reference](../api/README.md) and [UI Components](./ui-components.md).
