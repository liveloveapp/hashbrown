# Choosing Model

Hashbrown's Angular SDK supports a variety of LLM providers and models. You can specify the model to use by passing the `model` option to any of the Angular composables, such as `useChat`, `useCompletion`, `useStructuredChat`, or `useStructuredCompletion`.

## Supported Providers

- **OpenAI** (e.g., `gpt-4o`, `gpt-4.1`)
- **Google** (e.g., `gemini-pro`)
- **Writer** (e.g., `palmyra-x-002`)
- **Azure** (OpenAI-compatible)

## Specifying a Model

You must provide a model ID as the `model` option. This can be a string literal or a variable. For OpenAI, Google, and Writer, you can use the model IDs as documented by each provider.

```typescript
import { useChat } from '@hashbrownai/angular';

@Component({
  selector: 'app-chat',
  template: `
    <!-- Render chat UI here -->
  `
})
export class ChatComponent {
  chat = useChat({
    model: 'gpt-4.1', // OpenAI model
    system: 'You are a helpful assistant.',
  });

  // Access chat.messages, chat.sendMessage(), chat.isSending, chat.error
}
```

## Azure OpenAI

For Azure, use the deployment name as the model ID. You must also configure the API endpoint and authentication via the `HashbrownProvider`:

```typescript
import { Component } from '@angular/core';
import { HashbrownProvider, useChat } from '@hashbrownai/angular';

@Component({
  selector: 'app-root',
  template: `
    <hashbrown-provider [url]="azureUrl">
      <app-chat></app-chat>
    </hashbrown-provider>
  `
})
export class AppComponent {
  azureUrl = 'https://your-azure-endpoint.openai.azure.com/openai/deployments/your-deployment-name/chat/completions?api-version=2023-03-15-preview';
}

@Component({
  selector: 'app-chat',
  template: `
    <!-- Render chat UI here -->
  `
})
export class ChatComponent {
  chat = useChat({
    model: 'your-deployment-name', // Azure deployment name
    system: 'You are a helpful assistant.',
  });
}
```

## Google Gemini

For Google Gemini, use the model ID as provided by Google (e.g., `gemini-pro`).

```typescript
import { useChat } from '@hashbrownai/angular';

@Component({
  selector: 'app-chat',
  template: `
    <!-- Render chat UI here -->
  `
})
export class ChatComponent {
  chat = useChat({
    model: 'gemini-pro',
    system: 'You are a helpful assistant.',
  });
}
```

## Writer

For Writer, use the model ID as provided by Writer (e.g., `palmyra-x-002`).

```typescript
import { useChat } from '@hashbrownai/angular';

@Component({
  selector: 'app-chat',
  template: `
    <!-- Render chat UI here -->
  `
})
export class ChatComponent {
  chat = useChat({
    model: 'palmyra-x-002',
    system: 'You are a helpful assistant.',
  });
}
```

## Model Option Reference

- `model: string` — The model or deployment name to use. See your provider's documentation for available models.

> **Note:** Some providers may require additional configuration, such as API keys or custom endpoints. Refer to the provider's documentation and the `HashbrownProvider` for details.
