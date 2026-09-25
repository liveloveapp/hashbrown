---
title: 'Choosing a Model: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Choose and configure the provider model on your AG-UI server while keeping Hashbrown Angular clients provider-independent.'
---

# Choosing a Model

Hashbrown Angular clients send AG-UI run requests to your configured endpoint. The server adapter chooses the provider and model, so resources such as `chatResource`, `completionResource`, `structuredChatResource`, and `structuredCompletionResource` do not accept a `model` option.

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

```ts
import { chatResource } from '@hashbrownai/angular';

@Component({
  selector: 'app-chat',
  template: `<!-- Render chat.value() and call chat.sendMessage(...). -->`,
})
export class ChatComponent {
  chat = chatResource({
    system: 'You are a helpful assistant.',
  });
}
```

## Route Between Models

If an application needs multiple models, expose separate AG-UI endpoints or choose the model in trusted server logic. Configure an alternate endpoint with `provideHashbrown`, the resource's `apiUrl` option, or a custom transport. Do not send provider credentials or unrestricted model identifiers from the browser.

See the provider guides for server configuration:

- [OpenAI](/docs/angular/platform/openai)
- [Azure OpenAI](/docs/angular/platform/azure)
- [Anthropic](/docs/angular/platform/anthropic)
- [Amazon Bedrock](/docs/angular/platform/bedrock)
- [Google Gemini](/docs/angular/platform/google)
- [Ollama](/docs/angular/platform/ollama)
