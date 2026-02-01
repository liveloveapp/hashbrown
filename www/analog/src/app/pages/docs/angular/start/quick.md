---
title: 'Angular Quick Start: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Take your first steps with Hashbrown.'
---
# Angular Quick Start

<p class="subtitle">Take your first steps with Hashbrown.</p>

---

## Install

<hb-code-example header="terminal">

```sh
npm install @hashbrownai/{core,angular,openai} --save
```

</hb-code-example>

---

## Provider

<hb-code-example header="provide hashbrown">

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideHashbrown({
      baseUrl: '/api/chat',
    }),
  ],
};
```

</hb-code-example>

1. Import the @hashbrownai/angular!provideHashbrown:function function from `@hashbrownai/angular`.
2. Optionally specify options such as the `baseUrl` for chat requests.
3. Add the provider to your Angular application configuration.

<hb-expander title="Intercept requests using middleware">

You can also intercept requests to the Hashbrown adapter using a middleware pattern.

<hb-code-example header="middleware">

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideHashbrown({
      middleware: [
        function (request: RequestInit) {
          console.log({ request });
          return request;
        },
      ],
    }),
  ],
};
```

</hb-code-example>

1. The `middleware` option to the provider allows the developer to intercept Hashbrown requests.
2. Middleware functions can be async.
3. This is useful for appending headers, etc.

</hb-expander>

---

## Node Adapters

To get started, we recommend running a local express server following the Hashbrown adapter documentation.

- [OpenAI](/docs/angular/platform/openai)
- [Azure OpenAI](/docs/angular/platform/azure)
- [Anthropic](/docs/angular/platform/anthropic)
- [Amazon Bedrock](/docs/angular/platform/bedrock)
- [Google Gemini](/docs/angular/platform/google)
- [Writer](/docs/angular/platform/writer)
- [Ollama](/docs/angular/platform/ollama)

---

## The `chatResource()` Function

The @hashbrownai/angular!chatResource:function function from `@hashbrownai/angular` is the basic way to interact with the model.

<hb-code-example header="chatResource()">

```ts
chatResource({
  model: 'gpt-5',
  system: 'hashbrowns should be covered and smothered',
  messages: [{ role: 'user', content: 'Write a short story about breakfast.' }],
});
```

</hb-code-example>

1. First, we specify the `model`.
2. Second, we provide [system instructions](/docs/angular/concept/system-instructions).
3. Third, we send some initial `messages` to the model.

---

### `ChatResourceOptions`

| Option    | Type                                                                   | Required | Description                                                       |
| --------- | ---------------------------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| system    | string \| Signal<string>                                               | Yes      | System (assistant) prompt.                                        |
| model     | KnownModelIds \| Signal<KnownModelIds>                                 | Yes      | Model identifier to use.                                          |
| tools     | Tools[]                                                                | No       | Array of bound tools available to the chat.                       |
| messages  | Chat.Message<string, Tools>[] \| Signal<Chat.Message<string, Tools>[]> | No       | Initial list of chat messages.                                    |
| debounce  | number                                                                 | No       | Debounce interval in milliseconds between user inputs.            |
| debugName | string                                                                 | No       | Name used for debugging in logs and reactive signal labels.       |
| apiUrl    | string                                                                 | No       | Override for the API base URL (defaults to configured `baseUrl`). |

---

### `ChatResourceRef`

The @hashbrownai/angular!chatResource:function function returns a @hashbrownai/angular!ChatResourceRef:interface object that extends Angular's `Resource<Chat.Message<string, Tools>[]>` interface.

| Property                 | Type                                         | Description                                                                                                       |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `value()`                | `Signal<Chat.Message[]>`                     | The current chat messages (inherited from Resource).                                                              |
| `status()`               | `Signal<ResourceStatus>`                     | The current status of the resource: 'idle', 'loading', 'resolved', or 'error' (inherited from Resource).          |
| `isLoading()`            | `Signal<boolean>`                            | Whether the resource is currently loading (inherited from Resource).                                              |
| `hasValue()`             | `Signal<boolean>`                            | Whether the resource has any assistant messages (inherited from Resource).                                        |
| `error()`                | `Signal<Error \| undefined>`                 | Any error that occurred during the chat operation.                                                                |
| `lastAssistantMessage()` | `Signal<Chat.AssistantMessage \| undefined>` | The last assistant message in the chat.                                                                           |
| `sendMessage(message)`   | `(message: Chat.UserMessage) => void`        | Send a new user message to the chat.                                                                              |
| `stop(clear?)`           | `(clear?: boolean) => void`                  | Stop any currently-streaming message. Optionally removes the streaming message from state.                        |
| `reload()`               | `() => boolean`                              | Remove the last assistant response and re-send the previous user message. Returns true if a reload was performed. |

---

### API Reference

<hb-next-steps>
  <hb-next-step link="/api/angular/chatResource">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>chatResource()</h4>
      <p>See the resource documentation</p>
    </div>
  </hb-next-step>
  <hb-next-step link="/api/angular/ChatResourceOptions">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>ChatResourceOptions API</h4>
      <p>See all of the options</p>
    </div>
  </hb-next-step>
  <hb-next-step link="/api/angular/ChatResourceRef">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>ChatResourceRef API</h4>
      <p>See all of the properties and methods</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## Render the Model Response

<hb-code-example header="a short story about breakfast">

```ts
import { chatResource } from '@hashbrownai/angular';

@Component({
  template: `
    // 1. Render the content of each message
    @for (message of chat.value(); track $index) {
      <p>{{ message.content }}</p>
    }
  `,
})
export class App {
  // 2. Generate the messages from a prompt
  chat = chatResource({
    model: 'gpt-5',
    system: 'hashbrowns should be covered and smothered',
    messages: [
      { role: 'user', content: 'Write a short story about breakfast.' },
    ],
  });
}
```

</hb-code-example>

1. In the template, we render the content of each message.
2. The @hashbrownai/angular!chatResource:function function creates a new chat resource.
3. We use the `value()` signal to access the current messages in the chat.

---

## Send Messages

To send messages to the model, we can use the `sendMessage()` method.

<hb-code-example header="sendMessage()">

```ts
import { chatResource } from '@hashbrownai/angular';

@Component({
  template: `
    <div>
      <input
        type="text"
        [value]="userMessage()"
        (input)="userMessage.set($any($event.target).value)"
        (keydown.enter)="send()"
        placeholder="Prompt..."
      />
      <button (click)="send()">Send</button>
    </div>
    <div>
      @for (message of chat.value(); track $index) {
        <p>{{ message.content }}</p>
      }
    </div>
  `,
})
export class App {
  userMessage = input<string>('');
  chat = chatResource({
    model: 'gpt-5',
    debugName: 'chat',
    system: 'hashbrowns should be covered and smothered',
    messages: [
      { role: 'user', content: 'Write a short story about breakfast.' },
    ],
  });

  send() {
    if (this.userMessage().trim()) {
      this.chat.sendMessage({ role: 'user', content: this.userMessage() });
      this.userMessage.set('');
    }
  }
}
```

</hb-code-example>

1. We create an input field controlled by the `userMessage` signal for user input.
2. The `send()` method sends the user message to the chat resource using the `sendMessage()` method.
3. Angular renders the user message and the assistant response message.

---

## Debugging with Redux Devtools

Hashbrown streams LLM messages and internal actions to the [redux devtools](https://chromewebstore.google.com/detail/lmhkpmbekcpmknklioeibfkpmmfibljd).

<div style="padding:59.64% 0 0 0;position:relative; width:100%;"><iframe src="https://player.vimeo.com/video/1089272009?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown debugging"></iframe></div>

To enable debugging, specify the `debugName` option.

<hb-code-example header="debug">

```ts
chat = chatResource({
  debugName: 'chat',
});
```

</hb-code-example>

---

## Beyond Chat

Large language models are highly intelligent and capable of more than just text and chatbots.
With Hashbrown, you can expose your trusted, tested, and compliant components - in other words, you can generate user interfaces using your components as the building blocks!

<hb-next-steps>
  <hb-next-step link="concept/components">
    <div>
      <hb-components />
    </div>
    <div>
      <h4>Generate user interfaces</h4>
      <p>Expose Angular components to the LLM for generative UI.</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## Tool Calling

Tool calling enables the model to invoke callback function in your frontend web application code.
The functions you expose can either have no arguments or you can specify the required and optional arguments.
The model will choose if, and when, to invoke the function.

What can functions do?

- Expose application state to the model
- Allow the model to take an action
- Offer intelligent next actions for the user to take
- Automate user tasks

With Angular, all handler functions are executed in the injection context - this means that you can use the `inject()` function within the handler functions to inject services and dependencies.

<hb-next-steps>
  <hb-next-step link="concept/functions">
    <div>
      <hb-functions />
    </div>
    <div>
      <h4>Tool Calling</h4>
      <p>Provide callback functions to the LLM.</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## Streaming Responses

Streaming is baked into the core of Hashbrown.
With Skillet, our LLM-optimized schema language, you can use the `.streaming()` keyword to enable streaming with eager JSON parsing.

<hb-next-steps>
  <hb-next-step link="concept/streaming">
    <div>
      <hb-send />
    </div>
    <div>
      <h4>Streaming Responses</h4>
      <p>Use Skillet for built-in streaming and eager JSON parsing.</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## Run LLM-generated JS Code (Safely)

Hashbrown ships with a JavaScript runtime for safe execution of
LLM-generated code in the client.

<hb-next-steps>
  <hb-next-step link="concept/runtime">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>JavaScript Runtime</h4>
      <p>Safely execute JS code generated by the model in the browser.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
