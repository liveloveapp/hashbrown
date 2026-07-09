---
title: 'Generative UI with React Components: Hashbrown React Docs'
meta:
  - name: description
    content: 'Expose trusted , tested , and compliant components to the model.'
---
# Generative UI with React Components

<p class="subtitle">Expose <strong>trusted</strong>, <strong>tested</strong>, and <strong>compliant</strong> components to the model.</p>

---

## The `exposeComponent()` Function

The @hashbrownai/react!exposeComponent:function function exposes React components to the LLM that can be generated.
Let's first look at how this function works.

<hb-code-example header="expose component">

```ts
import { exposeComponent } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { Markdown } from './Markdown';

exposeComponent(Markdown, {
  description: 'Show markdown to the user',
  name: 'Markdown',
  props: {
    data: s.string('The markdown content'),
  },
});
```

</hb-code-example>

Let's break down the example above:

1. `Markdown` is the React component that we want to expose.
2. `description` is a human-readable description of the component that will be used by the model to understand what the component does.
3. `name` is the stable component reference for the model.
4. `props` is an object that defines the props that the component accepts. In this case, it accepts a single prop called `data`, which is a string representing the markdown content to be displayed.
5. The `s.string()` function is used to define the type of the prop.

We should mention here that Skillet, our LLM-optimized schema language, is **type safe**.

- The `data` prop is expected to be a `string` type.
- The schema specified is a `string()`.
- If the schema does not match the React component's prop type, you'll see an error in both your editor and when you attempt to build the application.

You can also show component props with Standard JSON Schema objects (the `~standard` spec, e.g. Zod/ArkType). Hashbrown normalizes these to Skillet (draft-07) for streaming and validation. Unsupported keywords throw at runtime.

---

## Streaming with Skillet

Streaming generative user interfaces is baked into the core of Hashbrown.
Hashbrown ships with an LLM-optimized schema language called Skillet.

Skillet supports streaming for:

- arrays
- objects
- strings

Let's update the previous example to support **streaming** of the markdown string into the `Markdown` component.

<hb-code-example header="enable streaming">

```ts
exposeComponent(Markdown, {
  description: 'Show markdown to the user',
  props: {
    data: s.streaming.string('The markdown content'),
  },
});
```

</hb-code-example>

The `s.streaming.string()` function is used to define the type of the prop, indicating that it can be a string that will be streamed in chunks.

<hb-next-steps>
  <hb-next-step link="/concept/streaming">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>Streaming Docs</h4>
      <p>Learn more about streaming with Skillet</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## Children

When exposing components, you can also define the `children` that the component can accept.

<hb-code-example header="children">

```ts
exposeComponent(LightList, {
  description: 'Show a list of lights to the user',
  props: {
    title: s.string('The name of the list'),
  },
  children: 'any',
});
```

</hb-code-example>

In the example above, we're allowing `any` children to be rendered within the `LightList` component using the `children` prop.

However, if we wanted to explicitly limit the children that the model can generate, we can provide an array of exposed components.

<hb-code-example header="children">

```ts
exposeComponent(LightList, {
  description: 'Show a list of lights to the user',
  props: {
    title: s.string('The name of the list'),
  },
  children: [
    exposeComponent(Light, {
      description: 'Show a light to the user',
      props: {
        lightId: s.string('The id of the light'),
      },
    }),
  ],
}),
```

</hb-code-example>

In the example above, the `LightList` children is limited to the `Light` component.

---

## The `useUiChat()` Hook

<hb-code-example header="expose components to the model">

```ts
import { useUiChat, exposeComponent } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { Markdown } from './Markdown';

// 1. Create the UI chat hook
const chat = useUiChat({
  // 2. Specify the collection of exposed components
  components: [
    // 3. Expose the Markdown component to the model
    exposeComponent(Markdown, {
      description: 'Show markdown to the user',
      props: {
        data: s.streaming.string('The markdown content'),
      },
    }),
  ],
});
```

</hb-code-example>

1. The @hashbrownai/react!useUiChat:function hook is used to create a UI chat instance.
2. The `components` option defines the collection of exposed components that the model can choose to render in the application.
3. The @hashbrownai/react!exposeComponent:function function creates an exposed component.

---

### `UiChatOptions`

| Option         | Type                                  | Required | Description                                   |
| -------------- | ------------------------------------- | -------- | --------------------------------------------- |
| `components`   | `ExposedComponent<any>[]`             | Yes      | The components to use for the UI chat hook    |
| `model`        | `KnownModelIds`                       | Yes      | The model to use for the UI chat hook         |
| `system`       | `string`                              | Yes      | The system prompt to use for the UI chat hook |
| `messages`     | `Chat.Message<UiChatSchema, Tools>[]` | No       | The initial messages for the UI chat hook     |
| `tools`        | `Tools[]`                             | No       | The tools to use for the UI chat hook         |
| `debugName`    | `string`                              | No       | The debug name for the UI chat hook           |
| `debounceTime` | `number`                              | No       | The debounce time for the UI chat hook        |

---

### API Reference

<hb-next-steps>
  <hb-next-step link="/api/react/useUiChat">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>useUiChat() API</h4>
      <p>See the full hook</p>
    </div>
  </hb-next-step>
  <hb-next-step link="/api/react/UiChatOptions">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>UiChatOptions API</h4>
      <p>See the options</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## Render User Interface

Assistant messages produced by `useUiChat()` include a `ui` property containing rendered React elements.

<hb-code-example header="render">

```tsx
<div className="assistant">{message.ui}</div>
```

</hb-code-example>

---

## Render Last Assistant Message

If you only want to render the last assistant message, `useUiChat()` provides a `lastAssistantMessage` value.

<hb-code-example header="render last message">

```tsx
function UI() {
  const chat = useUiChat({
    components: [
      exposeComponent(Markdown, { props: { data: s.string('md') } }),
    ],
  });

  const message = chat.lastAssistantMessage;

  return message ? <div className="assistant">{message.ui}</div> : null;
}
```

</hb-code-example>

1. We render the last assistant message using the `lastAssistantMessage` value.
2. The `ui` property contains the rendered React elements generated by the model.
3. The @hashbrownai/react!useUiChat:function hook creates a new chat instance with the exposed components.

---

## Render All Messages with Components

If you are building a chat-like experience, you likely want to iterate over all `messages` and render the generated text _and_ components.

<hb-code-example header="render all messages">

```tsx
function Messages({ chat }: { chat: ReturnType<typeof useUiChat> }) {
  return (
    <>
      {chat.messages.map((message, idx) => {
        switch (message.role) {
          case 'user':
            return (
              <div className="chat-message user" key={idx}>
                <p>{message.content}</p>
              </div>
            );
          case 'assistant':
            return (
              <div className="chat-message assistant" key={idx}>
                {message.ui}
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
```

</hb-code-example>

1. We iterate over the messages in the chat using `Array.prototype.map`.
2. The `switch` statement is used to determine the role of the message (either `user` or `assistant`).
3. For user messages, we display the text content.
4. For assistant messages, we render the UI elements using the `ui` property.
5. The `ui` property contains the React elements that match the components defined via `exposeComponent()`.
6. These elements are derived from the model's response using the schema built from your exposed components.

---

## The `prompt` Tagged Template Literal

Providing examples in the system instructions enables few-shot prompting.
Hashbrown provides the `prompt` tagged template literal for generative UI for better instruction following.

<hb-code-example header="prompt with ui">

```ts
useUiChat({
  // 1. Use the prompt tagged template literal
  system: prompt`
    ### ROLE & TONE

    You are **Smart Home Assistant**, a friendly and concise AI assistant for a
    smart home web application.

    - Voice: clear, helpful, and respectful.
    - Audience: users controlling lights and scenes via the web interface.

    ### RULES

    1. **Never** expose raw data or internal code details.
    2. For commands you cannot perform, **admit it** and suggest an alternative.
    3. For actionable requests (e.g., changing light settings), **precede** any
      explanation with the appropriate tool call.

    ### EXAMPLES

    <user>Hello</user>
    <assistant>
      <ui>
        <app-markdown data="How may I assist you?" />
      </ui>
    </assistant>
  `,
  components: [
    exposeComponent(MarkdownComponent, { ... })
  ]
});
```

</hb-code-example>

The `prompt` tagged template literal will parse the content inside of the `<ui>` brackets and do the following for you:

1. Validate that the examples match the list of components provided to the model.
2. Validate that the component props have been set correctly based on their schema definitions.
3. Convert the example into Hashbrown's underlying JSON representation.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="concept/structured-output">
    <div>
      <hb-database-cog />
    </div>
    <div>
      <h4>Get structured data from models</h4>
      <p>Use Skillet schema to describe model responses.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/runtime">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>Execute LLM-generated JS in the browser (safely)</h4>
      <p>Use Hashbrown's JavaScript runtime for complex and mathematical operations.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
