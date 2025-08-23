# Generative UI with React Components

React developers can expose components to a large language model (LLM), allowing the LLM to render the exposed components at runtime.

---

## Exposing React Components

The @hashbrownai/react!exposeComponent:function function exposes React components to the LLM that can be generated.
Let's first look at how this function works.

```ts
import { exposeComponent } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { Markdown } from './Markdown';

exposeComponent(Markdown, {
  description: 'Show markdown to the user',
  props: {
    data: s.string('The markdown content'),
  },
});
```

Let's break down the example above:

- `Markdown` is the React component that we want to expose.
- `description` is a human-readable description of the component that will be used by the LLM to understand what the component does.
- `props` is an object that defines the props that the component accepts. In this case, it accepts a single prop called `data`, which is a string representing the markdown content to be displayed.
- The `s.string()` function is used to define the type of the prop.

We should mention here that Skillet, our LLM-optimized schema language, is **type safe**.

- The `data` prop is expected to be a `string` type.
- The schema specified is a `string()`.
- If the schema does not match the React component's prop type, you'll see an error in both your editor and when you attempt to build the application.

---

## Streaming

Streaming generative user interfaces is baked into the core of Hashbrown.
Hashbrown ships with an LLM-optimized schema language called Skillet.

Skillet supports streaming for:

- arrays
- objects
- strings

Let's update the previous example to stream the markdown string into the `Markdown` component:

```ts
exposeComponent(Markdown, {
  description: 'Show markdown to the user',
  props: {
    data: s.streaming.string('The markdown content'),
  },
});
```

The `s.streaming.string()` function is used to define the type of the prop, indicating that it can be a string that will be streamed in chunks.

A note on the `streaming` keyword: this is a Skillet-specific keyword that indicates that the prop can be streamed in chunks, which is useful for large content like markdown.
You can [learn more about streaming with Skillet](/docs/react/concept/streaming).

---

## Children

When exposing components, you can also define the `children` that the component can accept.

```ts
exposeComponent(LightList, {
  description: 'Show a list of lights to the user',
  props: {
    title: s.string('The name of the list'),
  },
  children: 'any',
});
```

In the example above, we're allowing `any` children to be rendered within the `LightList` component using the `children` prop.

However, if we wanted to explicitly limit the children that the LLM can generate, we can provide an array of exposed components.

```ts
exposeComponent(LightList, {
  description: 'Show a list of lights to the user',
  props: {
    title: s.string('The name of the list'),
    icon: LightListIconSchema,
  },
  children: [
    exposeComponent(Light, {
      description: 'Show a light to the user',
      props: {
        lightId: s.string('The id of the light'),
        icon: LightIconSchema,
      },
    }),
  ],
});
```

In the example above, the `LightList` children is limited to the `Light` component.

Note that LLM providers have limitations around _schema depth_ (usually no more than six or seven levels of depth). Each component consumes 2-3 levels of schema, with props potentially consuming more. This may limit your ability to provide explicit children for components.

---

## Chat Example

Now, let's look at creating a `useUiChat()` hook to generate React components in our application.

```ts
import { useUiChat, exposeComponent } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { Markdown } from './Markdown';
import { Light } from './Light';
import { LightList } from './LightList';
import { Scene } from './Scene';

const chat = useUiChat({
  model: 'gpt-4.1',
  debugName: 'ui-chat',
  system: `You are a helpful assistant for a smart home app.`,
  components: [
    exposeComponent(Markdown, {
      description: 'Show markdown to the user',
      props: {
        data: s.streaming.string('The markdown content'),
      },
    }),
    exposeComponent(Light, {
      description: `
      This option shows a light to the user, with a dimmer for them to control the light.
      Always prefer this option over printing a light's name.
      Always prefer putting these in a list.
    `,
      props: {
        lightId: s.string('The id of the light'),
      },
    }),
    exposeComponent(LightList, {
      description: 'Show a list of lights to the user',
      props: {
        title: s.string('The name of the list'),
      },
      children: 'any',
    }),
    exposeComponent(Scene, {
      description: 'Show a scene to the user',
      props: {
        sceneId: s.string('The id of the scene'),
      },
    }),
  ],
});
```

Let's break this down:

- `useUiChat()` is a hook that creates a chat resource that can be used to interact with the LLM.
- `model` is the LLM model that will be used for the chat.
- `debugName` is the Redux DevTools name for the chat resource, which is useful for debugging.
- `system` is the system prompt that provides context to the LLM about what it should do.
- `components` is an array of components that are exposed to the LLM, allowing it to use them in its responses.
- Each component is defined using the `exposeComponent()` function, which includes a description and prop schema for the component.
- The `children` property allows the component to accept any children, which can be rendered within the component.
- The `Light`, `LightList`, and `Scene` components are examples of components that can be used in the chat.
- The `Markdown` component is used to display markdown content in the chat.

---

## Rendering Components

Now, let's look at how we can render the messages using the output of the `useUiChat()` hook.

```tsx
import React from 'react';

function Messages({ chat }) {
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

Let's learn how the `Messages` component above works.

- The `Messages` component is responsible for rendering the chat messages.
- It iterates over the messages in the chat resource returned by `useUiChat()`.
- The `switch` statement is used to determine the role of the message (either 'user' or 'assistant').
- For user messages, it simply displays the content in a paragraph tag.
- For assistant messages, it renders the UI elements generated by the LLM using the `ui` property of the message.
- The `ui` property contains the rendered React elements based on the message content and the exposed components.

---

## Conclusion

In this guide, we explored how to expose React components to a large language model (LLM) using the `@hashbrownai/react` `exposeComponent` function.
We also looked at how to create a chat resource that can interact with the LLM and render the exposed components in a web application.
