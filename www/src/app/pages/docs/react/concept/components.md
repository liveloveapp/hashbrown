# Generative UI with React Components

React developers can expose **trusted**, **compliant**, **authoratative** components to a large language model (LLM) that is capable of rendering the exposed components into the web application at runtime.

---

## Exposing React Components

The @hashbrownai/react!exposeComponent:function function exposes React components to the LLM that can be generated.
Let's first look at how this function works.

<www-code-example header="RichChatPanel.ts">

```ts
exposeComponent(MarkdownComponent, {
  name: 'MarkdownComponent',
  description: 'Show markdown content to the user',
  props: {
    content: s.streaming.string('The content of the markdown'),
  },
});
```

</www-code-example>

Let's break down the example above:

- `MarkdownComponent` is the React component that we want to expose.
- `name` is a human-readable name of the component that will be used by the LLM to understand what the component does.
- `description` is a human-readable description of the component that will be used by the LLM to understand what the component does.
- `props` is an object that defines the properties that the component accepts. In this case, it accepts a single property called `content`, which is a streaming string representing the markdown content to be displayed.
- The `s.streaming.string()` function is used to define the type of the property, indicating that it can be a string that will be streamed in chunks.

A note on the `streaming` keyword: this is a Skillet-specific keyword that indicates that the input can be streamed in chunks, which is useful for large content like markdown.
You can [learn more about streaming with Skillet](/docs/react/concept/streaming).

---

## Children

When exposing components, you can also define the `children` that the component can accept.

<www-code-example header="RichChatPanel.ts">

```ts
exposeComponent(CardComponent, {
  name: 'CardComponent',
  description: 'Show a card with children components to the user',
  children: 'any',
  props: {
    title: s.string('The title of the card'),
    description: s.streaming.string('The description of the card'),
  },
}),
```

</www-code-example>

In the example above, we're allowing `any` children to be rendered within the `CardComponent`.

---

## Chat Example

Now, let's look at using the @hashbrownai/react!useUiChat:function hook.

<www-code-example header="RichChatPanel.ts">

```ts
const { messages, sendMessage } = useUiChat({
  model: 'gpt-4o',
  system: `
    You are a smart home assistant. 
    You can control the lights in the house. 
    You should not stringify (aka escape) function arguments
  `,
  components: [
    exposeComponent(LightChatComponent, {
      name: 'LightChatComponent',
      description: 'A component that lets the user control a light',
      props: {
        lightId: s.string('The id of the light'),
      },
    }),
    exposeComponent(MarkdownComponent, {
      name: 'MarkdownComponent',
      description: 'Show markdown content to the user',
      props: {
        content: s.streaming.string('The content of the markdown'),
      },
    }),
    exposeComponent(CardComponent, {
      name: 'CardComponent',
      description: 'Show a card with children components to the user',
      children: 'any',
      props: {
        title: s.string('The title of the card'),
        description: s.streaming.string('The description of the card'),
      },
    }),
  ],
});
```

</www-code-example>

Let's break this down:

- `useUiChat` is a hook that allows you to interact with the LLM and send messages.
- `model` is the model that you want to use for the chat. In this case, we're using `gpt-4o`.
- `system` is a system prompt that provides context to the LLM about what it should do. In this case, we're telling it that it is a smart home assistant and can control lights.
- `components` is an array of components that you want to expose to the LLM. Each component is defined using the `exposeComponent` function, which we discussed earlier.
- `messages` is an array of messages that have been sent and received in the chat.
- `sendMessage` is a function that allows you to send a message to the LLM.

---

## Rendering Components

To render the components, use the `ui` property of the `message` for assistant messages.

<www-code-example header="RichChatPanel.ts">

```ts
function Messages() {
  // code omitted for brevity

  return (
    {messages.map((message) => {
      switch (message.role) {
        case 'assistant':
          return <div>{message.ui}</div>;
        case 'user':
          return <div>{message.content}</div>
        default:
          return null
      }
    })}
  );
}
```

</www-code-example>

---

## Conclusion

In this guide, we explored how to expose React components to a large language model (LLM) using the @hashbrownai/react!exposeComponent:function function.
We also looked at the @hashbrownai/react!useUiChat:function hook that can interact with the LLM and render the exposed components in a web application.
