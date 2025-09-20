---
title: 'Prompt Engineering: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Hashbrown''s Angular SDK enables you to build advanced prompt-driven chat and completion UIs with full type safety and composability. This guide covers best practices for prompt engineering using the Angular SDK.'
---
# Prompt Engineering

Hashbrown's Angular SDK enables you to build advanced prompt-driven chat and completion UIs with full type safety and composability. This guide covers best practices for prompt engineering using the Angular SDK.

## System Prompts

The `system` prompt sets the context and behavior for the model. You provide it as a string when initializing chat or completion services.

```typescript
import { HashbrownChatService } from '@hashbrownai/angular';

constructor(private chat: HashbrownChatService) {}

ngOnInit() {
  this.chat.initialize({
    model: 'gpt-4',
    system: `You are a helpful assistant. Answer concisely.`,
  });
}
```

**Tips:**

- Be explicit about the assistant's persona and constraints.
- Use clear instructions for formatting, tone, or output structure.

## Message History

Hashbrown manages message history for you. Pass an initial message array to the `messages` option when initializing, or use the `setMessages` method to update it.

```typescript
import { HashbrownChatService, ChatMessage } from '@hashbrownai/angular';

const initialMessages: ChatMessage[] = [
  { role: 'user', content: 'What is the capital of France?' }
];

constructor(private chat: HashbrownChatService) {}

ngOnInit() {
  this.chat.initialize({
    model: 'gpt-4',
    system: 'You are a geography expert.',
    messages: initialMessages,
  });
}

// To update messages later:
// this.chat.setMessages(newMessages);
```

**Best Practices:**

- Include relevant prior messages for context.
- Limit history length to avoid exceeding model context windows.

## Structured Prompts

For structured outputs, use the `HashbrownStructuredChatService` or `HashbrownStructuredCompletionService` with a schema.

```typescript
import { HashbrownStructuredChatService } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

const outputSchema = s.object('City info', {
  name: s.string('City name'),
  country: s.string('Country'),
  population: s.integer('Population'),
});

constructor(private structuredChat: HashbrownStructuredChatService) {}

ngOnInit() {
  this.structuredChat.initialize({
    model: 'gpt-4',
    system: 'Provide city information as structured data.',
    schema: outputSchema,
  });
}
```

**Why use schemas?**

- Enforces output shape for reliable parsing.
- Enables type-safe UI rendering.

## Tool Use

Hashbrown supports tool calling ("tools"). Define tools and pass them to chat services.

```typescript
import { HashbrownTool, HashbrownChatService } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

const getWeather: HashbrownTool = {
  name: 'getWeather',
  description: 'Get weather for a city',
  args: s.object('Weather input', {
    city: s.string('City name'),
  }),
  handler: async ({ city }) => {
    // Call your weather API here
    return { temperature: 72 };
  },
};

constructor(private chat: HashbrownChatService) {}

ngOnInit() {
  this.chat.initialize({
    model: 'gpt-4',
    system: 'You can call tools to fetch data.',
    tools: [getWeather],
  });
}
```

**Tips:**

- Describe tool purpose and arguments clearly.
- Use schemas for tool arguments and results.

## UI-Driven Prompts

For rich, component-based outputs, use the `HashbrownUiChatService` and expose Angular components.

```typescript
import { Component, Input } from '@angular/core';
import { exposeComponent } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

@Component({
  selector: 'app-city-card',
  template: `
    <div>
      <h2>{{ name }}</h2>
      <p>{{ country }}</p>
      <p>Population: {{ population }}</p>
    </div>
  `,
})
export class CityCardComponent {
  @Input() name!: string;
  @Input() country!: string;
  @Input() population!: number;
}

const exposedCityCard = exposeComponent(CityCardComponent, {
  name: 'CityCard',
  description: 'Displays city information',
  props: {
    name: s.string('name'),
    country: s.string('country'),
    population: s.number('population'),
  },
});

import { HashbrownUiChatService } from '@hashbrownai/angular';

constructor(private uiChat: HashbrownUiChatService) {}

ngOnInit() {
  this.uiChat.initialize({
    model: 'gpt-4',
    system: 'Render city info using the CityCard component.',
    components: [exposedCityCard],
  });
}
```

**Best Practices:**

- Expose only safe, well-documented components.
- Use schemas to describe component props.

## Debugging Prompts

- Use the `debugName` option to label chat sessions for easier debugging.
- Inspect the `error` and `exhaustedRetries` fields from chat services for troubleshooting.

```typescript
import { HashbrownChatService } from '@hashbrownai/angular';

constructor(private chat: HashbrownChatService) {}

ngOnInit() {
  this.chat.initialize({
    model: 'gpt-4',
    system: 'You are a helpful assistant.',
    debugName: 'support-chat',
  });

  // To access error and exhaustedRetries:
  // this.chat.error
  // this.chat.exhaustedRetries
}
```

## Summary

- Set clear system prompts for model behavior.
- Manage message history for context.
- Use schemas for structured outputs and tool arguments.
- Expose Angular components for UI-driven outputs.
- Leverage debugging options for prompt iteration.

For more, see the [API Reference](../api/README.md) and [UI Components](./ui-components.md).
