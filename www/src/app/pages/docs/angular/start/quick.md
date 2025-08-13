# Angular Quick Start

Take you first steps with hashbrown.

---

## Install

```sh
npm install @hashbrownai/{core,angular,openai} --save
```

---

## Chat

Hashbrown builds on Angular's [Resource API](https://angular.dev/guide/signals/resource).

```ts
chatResource({
  model: 'gpt-5',
  debugMode: true,
  system: 'hashbrowns should be covered and smothered',
  messages: [{ role: 'user', content: 'Write a short story about breakfast.' }],
});
```

### Options

| Option    | Type                                                                   | Required | Description                                                       |
| --------- | ---------------------------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| system    | string \| Signal<string>                                               | Yes      | System (assistant) prompt.                                        |
| model     | KnownModelIds \| Signal<KnownModelIds>                                 | Yes      | Model identifier to use.                                          |
| tools     | Tools[]                                                                | No       | Array of bound tools available to the chat.                       |
| messages  | Chat.Message<string, Tools>[] \| Signal<Chat.Message<string, Tools>[]> | No       | Initial list of chat messages.                                    |
| debounce  | number                                                                 | No       | Debounce interval in milliseconds between user inputs.            |
| debugName | string                                                                 | No       | Name used for debugging in logs and reactive signal labels.       |
| apiUrl    | string                                                                 | No       | Override for the API base URL (defaults to configured `baseUrl`). |

### Create Chat Resource

The @hashbrownai/angular!chatResource:function is the basic resource for interacting with a Large Language Model (LLM) via text.
It provides a set of methods for sending and receiving messages, as well as managing the chat state.

<hb-code-example header="chat-panel.ts" run="/examples/angular/chat">

```ts
@Component({
  selector: 'app-chat',
  imports: [Composer, Messages],
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
export class ChatPanel {
  chat = chatResource({
    model: 'gpt-4o',
    system: 'You are a helpful assistant that can answer questions and help with tasks.',
  });

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
```

</hb-code-example>

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

## Debugging with Redux Devtools

hashbrown streams LLM messages and internal actions to the [redux devtools](https://chromewebstore.google.com/detail/lmhkpmbekcpmknklioeibfkpmmfibljd).
We find that this provides direct access to the state internals of hashbrown - enabling you to debug your AI-powered user experiences.

<div style="padding:59.64% 0 0 0;position:relative; width:100%;"><iframe src="https://player.vimeo.com/video/1089272009?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown debugging"></iframe></div>

To enable debugging, specify the optional `debugName` configuration.

<hb-code-example header="chat.component.ts">

```ts
chat = chatResource({
  debugName: 'chat',
});
```

</hb-code-example>

---

## Beyond Chat

Large language models are highly intelligent and capable of more than just text and chatbots.
With hashbrown, you can expose your trusted, tested, and compliant components - in other words, you can generate user interfaces using your components at the building blocks!

<hb-next-steps>
  <hb-next-step link="concept/components">
    <div>
      <hb-components />
    </div>
    <div>
      <h4>Generate user interface</h4>
      <p>Expose Angular components to the LLM for generative UI.</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## Function Calling

Function calling enables the model to invoke callback function in your frontend web application code.
The functions you expose can either have no arguments or you can specify the required and optional arguments.
The model will choose if, and when, to invoke the function.

What can functions do?

- Expose application state to the model
- Allow the model to take an action
- Offer intelligent next actions for the user to take
- Automate user tasks

With Angular, all handler functions are executed in the injection context - this means that you can use the `inject()` function within the handler functions to inject services and dependencies.

<hb-next-steps>
  <hb-next-step link="concept/system-instructions">
    <div>
      <hb-message />
    </div>
    <div>
      <h4>Text generation and Prompting</h4>
      <p>Learn more about prompt engineering and how to use the prompt template literal.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/functions">
    <div>
      <hb-functions />
    </div>
    <div>
      <h4>Call Functions</h4>
      <p>Provide callback functions to the LLM.</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## Streaming Responses

Streaming is baked into the core of hashbrown.
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
