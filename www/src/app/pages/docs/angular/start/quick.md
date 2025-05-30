# Angular Quick Start

hashbrown is an open source library for building meaningful AI experiences with modern Angular.

## Key Concepts

- **Headless**: build your UI how you want
- **Signal Based**: hashbrown uses signals for reactivity
- **Platform Agnostic**: use any [supported platform](/docs/angular/start/platforms)

---

## Prerequisites

- Node.js v18+
- Angular v20+

---

## OpenAI API Key

In this intro to hashbrown, we'll be using OpenAI's Large Language Models.

To follow along, you'll need to

1. [Sign up for OpenAI's API](https://openai.com/api/)
2. [Create an organization and API Key](https://platform.openai.com/settings/organization/api-keys)
3. Copy the API key so you have it handy
4. Follow the instructions in [the OpenAI Adapter docs](/docs/angular/platform/openai) to setup a backend endpoint for hashbrown to concsume

---

## Install

```sh
npm install @hashbrown/{core,angular,openai} --save
```

---

## Create Chat Resource

The @hashbrownai/angular!chatResource:function is the main resource for interacting with a Large Language Model (LLM) via text.
It provides a set of methods for sending and receiving messages, as well as managing the chat state.

<www-code-example header="chat.component.ts" run="/examples/angular/chat">

```ts
@Component({
  selector: 'app-chat',
  imports: [ComposerComponent, MessagesComponent],
  template: `
    <div class="messages">
      @for (message of chat.value(); track $index) {
        @switch (message.role) {
          @case ('user') {
            <div class="user">
              <p>{{ message.content }}</p>
            </div>
          }
          @case ('assistant') {
            <div class="assistant">
              <p>{{ message.content }}</p>
            </div>
          }
        }
      }
    </div>
    <app-composer (sendMessage)="sendMessage($event)" />
  `,
})
export class ChatPanelComponent {
  chat = chatResource({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that can answer questions and help with tasks.',
      },
    ],
  });

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
```

</www-code-example>

Let's break this down:

- The @hashbrownai/angular!chatResource:function function creates a new AI chat resource.
- The `model` parameter specifies the model to use for the chat.
- The `messages` parameter is an array of messages that will be used to initialize the chat.
- The `sendMessage` function sends a user message to the LLM.

This creates a complete chat interface where:

1. Users can type and send messages
2. Messages are displayed in a scrollable list
3. The AI responds through the chat resource
4. The UI updates automatically as new messages arrive

The component uses Angular's built-in template syntax and signal-based reactivity to stay in sync with the chat state.

---

## Function Calling

In this guide, we'll show you the basics of function calling.
Please note, function calling works _best_ today using OpenAI's models.

Function calling enables the LLM to invoke functions you have exposed to the LLM.
We also suggest reading the [OpenAI documentation for function calling using the chat API](https://platform.openai.com/docs/guides/function-calling?api-mode=chat)

Some common use cases for function calling include:

- Fetching additional data from your service layer
- Provide the LLM with the latest application state
- Enable the LLM to mutate state or take action

Let's look at an example of function calling using hashbrown.

<www-code-example header="chat.component.ts" run="/examples/angular/function-calling">

```ts
@Component({
  selector: 'app-chat',
  providers: [LightsStore],
  template: ` <!-- omitted for brevity - full code in stackblitz example --> `,
})
export class ChatComponent {
  lightsStore = inject(LightsStore);

  chat = chatResource({
    model: 'gpt-4.1',
    prompt: 'You are a helpful assistant that can answer questions and help with tasks',
    tools: [
      createTool({
        name: 'getUser',
        description: 'Get information about the current user',
        handler: () => {
          const authService = inject(AuthService);
          return authService.getUser();
        },
      }),
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: async () => this.lightsStore.entities(),
      }),
      createToolWithArgs({
        name: 'controlLight',
        description: 'Control a light',
        schema: s.object('Control light input', {
          lightId: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        handler: async (input) =>
          this.lightsStore.updateLight(input.lightId, {
            brightness: input.brightness,
          }),
      }),
    ],
  });

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
```

</www-code-example>

Let's review the key parts of this code:

- The @hashbrownai/angular!chatResource:function function creates a new chat resource with the specified model and tools.
- The `tools` array contains functions that the LLM can call.
- The `createTool` function defines a tool that the LLM can call, with a name, description, and handler function.
- The `createToolWithArgs` function defines a tool that takes arguments, with a schema for the input.
- The `handler` function is called when the LLM invokes the tool, allowing you to perform actions like fetching data or updating state.

---

## What is this schema language?

Skillet is hashbrown's LLM-optimized schema language.

Why not use something like Zod?
We're glad you asked.

- Skillet limits schema based on an LLM's capability. In other words, it works as you expect.
- Skillet enables one-line streaming
- Skillet enables partial parsing

[Read more about how Skillet supports streaming responses](/docs/angular/concept/streaming)

---

## Generate UI Components

To build on top of the chat resource, we can expose Angular components that the LLM can use to generate UI.
In this example, we'll use the @hashbrownai/angular!uiChatResource:function function.

<www-code-example header="chat.component.ts" run="/examples/angular/ui-chat">

```ts
@Component({
  selector: 'app-chat',
  imports: [ComposerComponent, MessagesComponent],
  providers: [LightsStore],
  template: `
    <app-messages [messages]="chat.value()" />
    <app-composer (sendMessage)="sendMessage($event)" />
  `,
})
export class ChatComponent {
  lightsStore = inject(LightsStore);

  chat = uiChatResource({
    model: 'gpt-4.1',
    prompt: 'You are a helpful assistant that can answer questions and help with tasks',
    components: [
      exposeComponent(MarkdownComponent, {
        name: 'markdown',
        description: 'Show markdown to the user',
        props: {
          data: s.streaming.string('The markdown content'),
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
        name: 'card',
        description: 'Show a card to the user',
        children: 'any',
        props: {
          title: s.streaming.string('The title of the card'),
        },
      }),
    ],
    tools: [
      createTool({
        name: 'getUser',
        description: 'Get information about the current user',
        handler: () => {
          const authService = inject(AuthService);
          return authService.getUser();
        },
      }),
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: async () => this.lightsStore.entities(),
      }),
      createToolWithArgs({
        name: 'controlLight',
        description: 'Control a light',
        schema: s.object('Control light input', {
          lightId: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        handler: async (input) =>
          this.lightsStore.updateLight(input.lightId, {
            brightness: input.brightness,
          }),
      }),
    ],
  });

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
```

</www-code-example>

Let's focus on the new `components` property.

- The `components` property is an array of components that the LLM can use to generate UI.
- The `exposeComponent` function defines a component that the LLM can use, with a name, description, and props.
- The `props` property defines the properties that the component can accept, using the Skillet schema language.
- The `children` property allows the component to accept child components, enabling nested UI structures.
- The `uiChatResource` function creates a chat resource that can generate UI components based on the LLM's responses.

---

## Structured Output

Structured output allows the LLM to return data in a structured format.

Just think.
Large Language Models are _incredibly_ powerful at natural language and text generation.
Using this power, Angular developers can leverage the LLM to generate structured data that can be used in their applications.

In this example, we'll use the @hashbrownai/angular!structuredChatResource:function function to generate structured data.

<www-code-example header="chat.component.ts" run="/examples/angular/structured-output">

```ts
@Component({
  selector: 'app-chat',
  imports: [ComposerComponent, MessagesComponent],
  providers: [LightsStore],
  template: `
    <app-messages [messages]="chat.value()" />
    <app-composer (sendMessage)="sendMessage($event)" />
  `,
})
export class ChatComponent {
  lightsStore = inject(LightsStore);

  chat = structuredChatResource({
    model: 'gpt-4.1',
    debugName: 'lights-chat',
    prompt: `
      Please return a JSON object that contains the lights that the user mentions.
    `,
    output: s.object('Output', {
      lights: s.array(
        s.object('Light', {
          id: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
      ),
    }),
    tools: [
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: async () => this.lightsStore.entities(),
      }),
    ],
  });

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
```

</www-code-example>

Let's take a look at using the @hashbrownai/angular!structuredChatResource:function resource.

- The `structuredChatResource` function creates a chat resource that can generate structured data.
- The `output` property defines the structure of the data that the LLM will return, using the Skillet schema language.
- The `debugName` property is used to identify the chat resource in the redux devtools.
- The `tools` property defines the tools that the LLM can use to fetch data or perform actions.

When the LLM generates a response, it will return data in the structured format defined by the `output` property.

Here is what the LLM will return based on the response format specified:

```json
{
  "lights": [
    {
      "id": "light-1",
      "brightness": 75
    },
    {
      "id": "light-2",
      "brightness": 50
    }
  ]
}
```

---

## Next Steps

Now that you've seen the basics of hashbrown, you can explore more advanced features and concepts:

- [Function Calling](/docs/angular/concept/functions)
- [Streaming Responses](/docs/angular/concept/streaming)
