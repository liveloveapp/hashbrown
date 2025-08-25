# React Quick Start

<p class="subtitle">Take your first steps with Hashbrown.</p>

---

## Install

<hb-code-example header="terminal">

```sh
npm install @hashbrownai/{core,react,openai} --save
```

</hb-code-example>

---

## Provider

<hb-code-example header="provide hashbrown">

```ts
export function Providers() {
  return (
    <HashbrownProvider url={url}>
      {children}
    </HashbrownProvider>
  )
}
```

</hb-code-example>

1. Import the @hashbrownai/react!HashbrownProvider:function component from `@hashbrownai/react`.
2. Optionally specify options such as the `url` for chat requests.
3. Add the provider to your React application.

<hb-expander title="Intercept requests using middleware">

You can also intercept requests to the Hashbrown adapter using a middleware pattern.

<hb-code-example header="middleware">

```tsx
export function Providers() {
  const middleware = [
    function (request: RequestInit) {
      console.log({ request });
      return request;
    },
  ];

  return (
    <HashbrownProvider url={url} middleware={middleware}>
      {children}
    </HashbrownProvider>
  );
}
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
- [Google Gemini](/docs/angular/platform/google)
- [Writer](/docs/angular/platform/writer)

---

## The `useChat()` Hook

The @hashbrownai/react!useChat:function hook from `@hashbrownai/react` is the basic way to interact with the model.
It provides a set of methods for sending and receiving messages, as well as managing the chat state.

<hb-code-example header="useChat()">

```ts
useChat({
  model: 'gpt-5',
  system: 'hashbrowns should be covered and smothered',
  messages: [{ role: 'user', content: 'Write a short story about breakfast.' }],
});
```

</hb-code-example>

1. First, we specify the `model`.
2. Second, we provide [system instructions](/docs/react/concept/system-instructions).
3. Third, we send some initial messages to the model.

---

### `UseChatOptions`

| Property       | Type                            | Required | Default | Description                                                        |
| -------------- | ------------------------------- | -------- | ------- | ------------------------------------------------------------------ |
| `model`        | `KnownModelIds`                 | Yes      | -       | The LLM model to use for the chat.                                 |
| `system`       | `string`                        | Yes      | -       | The system message to use for the chat.                            |
| `messages`     | `Chat.Message<string, Tools>[]` | No       | `[]`    | The initial messages for the chat.                                 |
| `tools`        | `Tools[]`                       | No       | `[]`    | The tools to make available for the chat.                          |
| `debounceTime` | `number`                        | No       | `150`   | The debounce time between sends to the endpoint (in milliseconds). |
| `retries`      | `number`                        | No       | `0`     | Number of retries if an error is received.                         |
| `debugName`    | `string`                        | No       | -       | The name of the hook, useful for debugging in Redux DevTools.      |

---

### `UseChatResult`

The @hashbrownai/react!useChat:function hook returns a @hashbrownai/react!UseChatResult:interface object.

| Property                | Type                                                | Description                                                                                                       |
| ----------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `messages`              | `Chat.Message<string, Tools>[]`                     | The current chat messages.                                                                                        |
| `sendMessage(message)`  | `(message: Chat.UserMessage) => void`               | Send a new user message to the chat.                                                                              |
| `setMessages(messages)` | `(messages: Chat.Message<string, Tools>[]) => void` | Update the chat messages.                                                                                         |
| `stop(clear?)`          | `(clear?: boolean) => void`                         | Stop any currently-streaming message. Optionally removes the streaming message from state.                        |
| `reload()`              | `() => boolean`                                     | Remove the last assistant response and re-send the previous user message. Returns true if a reload was performed. |
| `error`                 | `Error \| undefined`                                | Any error that occurred during the chat operation.                                                                |
| `isReceiving`           | `boolean`                                           | Whether the chat is receiving a response.                                                                         |
| `isSending`             | `boolean`                                           | Whether the chat is sending a response.                                                                           |
| `isRunningToolCalls`    | `boolean`                                           | Whether the chat is running tool calls.                                                                           |
| `exhaustedRetries`      | `boolean`                                           | Whether the current request has exhausted retries.                                                                |
| `lastAssistantMessage`  | `Chat.AssistantMessage<string, Tools> \| undefined` | The last assistant message.                                                                                       |

---

### API Reference

<hb-next-steps>
  <hb-next-step link="/api/react/useChat">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>useChat() API</h4>
      <p>See the hook documentation</p>
    </div>
  </hb-next-step>
  <hb-next-step link="/api/react/UseChatOptions">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>UseChatOptions API</h4>
      <p>See all of the options</p>
    </div>
  </hb-next-step>
  <hb-next-step link="/api/react/UseChatResult">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>UseChatResult API</h4>
      <p>See all of the properties and methods</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

### Render the Model Response

<hb-code-example header="a short story about breakfast">

```tsx
import { useChat } from '@hashbrownai/react';

export function App() {
  // 1. Generate the messages from a prompt
  const { messages } = useChat({
    model: 'gpt-5',
    system: 'hashbrowns should be covered and smothered',
    messages: [
      { role: 'user', content: 'Write a short story about breakfast.' },
    ],
  });

  // 2. Render the content of each message
  return (
    <>
      {messages.map((message, i) => (
        <p key={i}>{message.content}</p>
      ))}
    </>
  );
}
```

</hb-code-example>

1. The @hashbrownai/react!useChat:function hook creates a new chat instance.
2. We destructure the response object and set the `messages` constant.
3. We return the JSX to render the content of each message.

This creates a basic chat interface where messages are displayed automatically.

---

## Send Messages

To send messages to the model, we can use the `sendMessage()` method.

<hb-code-example header="sendMessage()">

```tsx
import { useState } from 'react';
import { useChat } from '@hashbrownai/react';

export function App() {
  const [userMessage, setUserMessage] = useState('');
  const { messages, sendMessage } = useChat({
    model: 'gpt-5',
    debugName: 'chat',
    system: 'hashbrowns should be covered and smothered',
  });

  const handleSend = () => {
    if (userMessage.trim()) {
      sendMessage({ role: 'user', content: userMessage });
      setUserMessage('');
    }
  };

  return (
    <div>
      <div>
        <input
          type="text"
          value={userMessage}
          onChange={(e) => setUserMessage(e.target.value)}
          placeholder="Prompt..."
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend}>Send</button>
      </div>
      <div>
        {messages.map((message, i) => (
          <p key={i}>{message.content}</p>
        ))}
      </div>
    </div>
  );
}
```

</hb-code-example>

1. We create an input field controlled by `userMessage` state for user input.
2. The `handleSend()` function sends the user message to the chat using `sendMessage()`.
3. React renders the user message and the assistant response message.

---

## Debugging with Redux Devtools

Hashbrown streams LLM messages and internal actions to the [redux devtools](https://chromewebstore.google.com/detail/lmhkpmbekcpmknklioeibfkpmmfibljd).

<div style="padding:59.64% 0 0 0;position:relative; width:100%;"><iframe src="https://player.vimeo.com/video/1089272009?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown debugging"></iframe></div>

To enable debugging, specify the `debugName` option.

<hb-code-example header="debug">

```tsx
import { useChat } from '@hashbrownai/react';

const chat = useChat({
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
      <p>Expose React components to the LLM for generative UI.</p>
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
