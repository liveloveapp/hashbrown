# Angular Quick Start

hashbrown is an open source library for building meaningful AI experiences with modern Angular.

## Key Concepts

- **Headless**: build your UI how you want
- **Signal Based**: hashbrown uses signals for reactivity
- **Platform Agnostic**: use any [supported platform](/docs/angular/start/platforms)

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
- Angular v18+

In this quickstart, we'll be using OpenAI models.
So, grab an API key and follow along.

---

## Install

```sh
npm install @hashbrown/{core,angular,openai} --save
```

---

## Create Chat Resource

The @hashbrownai/angular!chatResource:function is the main resource for interacting with a Large Language Model (LLM) via text.
It provides a set of methods for sending and receiving messages, as well as managing the chat state.

<www-code-example header="chat-panel.component.ts">

```ts
@Component({
  selector: 'app-chat-panel',
  imports: [
    ComposerComponent,
    MessagesComponent
  ],
  template: `
    <app-chat-messages [messages]="chat.messages()"></app-chat-messages>
    <app-chat-composer
      (sendMessage)="chat.sendMessage({ role: 'user', content: $event })"
    ></app-chat-composer>
  `
})
export class ChatPanelComponent {
  chat = chatResource({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are a helpful assistant that can answer questions and help with tasks.'
      }
    ]
  });
}
```

</www-code-example>

Let's break this down:

- The @hashbrownai/angular!chatResource:function function creates a new AI chat resource.
- The `model` parameter specifies the model to use for the chat.
- The `messages` parameter is an array of messages that will be used to initialize the chat.
- We bind the `messages` signal value to the `messages` input of the `app-chat-messages` component.
- We invoke the `sendMessage` method of the `chat` resource to send a new message.
