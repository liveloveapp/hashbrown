# Generative UI with Angular Components

Angular developers can expose **trusted**, **compliant**, **authoratative** components to a large language model (LLM) that is capable of rendering the exposed components into the web application at runtime.

---

## Exposing Angular Components

The @hashbrownai/angular!exposeComponent:function function exposes Angular components to the LLM that can be generated.
Let's first look at how this function works.

<www-code-example header="chat.component.ts">

```ts
exposeComponent(MarkdownComponent, {
  description: 'Show markdown to the user',
  input: {
    data: s.streaming.string('The markdown content'),
  },
});
```

</www-code-example>

Let's break down the example above:

- `MarkdownComponent` is the Angular component that we want to expose.
- `description` is a human-readable description of the component that will be used by the LLM to understand what the component does.
- `input` is an object that defines the inputs that the component accepts. In this case, it accepts a single input called `data`, which is a streaming string representing the markdown content to be displayed.
- The `s.streaming.string()` function is used to define the type of the input, indicating that it can be a string that will be streamed in chunks.

A note on the `streaming` keyword: this is a Skillet-specific keyword that indicates that the input can be streamed in chunks, which is useful for large content like markdown.
You can [learn more about streaming with Skillet](/docs/angular/concept/streaming).

---

## Children

When exposing components, you can also define the `children` that the component can accept.

<www-code-example header="chat.component.ts">

```ts
exposeComponent(LightListComponent, {
  description: 'Show a list of lights to the user',
  input: {
    title: s.string('The name of the list'),
  },
  children: 'any',
});
```

</www-code-example>

In the example above, we're allowing `any` children to be rendered within the `LightListComponent` using the `&lt;ng-content&gt;` element.

---

## Chat Example

Now, let's look at creating a `uiChatResource()`.

<www-code-example header="chat.component.ts">

```ts
chat = uiChatResource({
  model: 'gpt-4.1',
  debugName: 'ui-chat',
  system: `You are a helpful assistant for a smart home app.`,
  components: [
    exposeComponent(MarkdownComponent, {
      description: 'Show markdown to the user',
      input: {
        data: s.streaming.string('The markdown content'),
      },
    }),
    exposeComponent(LightComponent, {
      description: `
        This option shows a light to the user, with a dimmer for them to control the light.
        Always prefer this option over printing a light's name. 
        Always prefer putting these in a list.
      `,
      input: {
        lightId: s.string('The id of the light'),
      },
    }),
    exposeComponent(LightListComponent, {
      description: 'Show a list of lights to the user',
      input: {
        title: s.string('The name of the list'),
      },
      children: 'any',
    }),
    exposeComponent(SceneComponent, {
      description: 'Show a scene to the user',
      input: {
        sceneId: s.string('The id of the scene'),
      },
    }),
  ],
});
```

</www-code-example>

Let's break this down:

- `uiChatResource()` is a function that creates a chat resource that can be used to interact with the LLM.
- `model` is the LLM model that will be used for the chat.
- `debugName` is the Redux DevTools name for the chat resource, which is useful for debugging.
- `system` is the system prompt that provides context to the LLM about what it should do.
- `components` is an array of components that are exposed to the LLM, allowing it to use them in its responses.
- Each component is defined using the `exposeComponent()` function, which includes a description and input schema for the component.
- The `children` property allows the component to accept any children, which can be rendered within the component.
- The `LightComponent`, `LightListComponent`, and `SceneComponent` are examples of components that can be used in the chat.
- The `MarkdownComponent` is used to display markdown content in the chat.

---

## Rendering Components

Now, let's look at how we can render the messages using the `<hb-render-message>` component.

<www-code-example header="chat.component.ts">

```ts
@Component({
  template: `
    @for (message of chat.value(); track $index) {
      @switch (message.role) {
        @case ('user') {
          <div class="chat-message user">
            <p>{{ message.content }}</p>
          </div>
        }
        @case ('assistant') {
          <div class="chat-message assistant">
            @if (message.content) {
              <hb-render-message [message]="message" />
            }
          </div>
        }
      }
    }
  `,
})
export class MessagesComponent {}
```

</www-code-example>

Let's learn how the `MessagesComponent` above works.

- The `MessagesComponent` is responsible for rendering the chat messages.
- It uses the `@for` directive to iterate over the messages in the chat resource.
- The `@switch` directive is used to determine the role of the message (either 'user' or 'assistant').
- For user messages, it simply displays the content in a `<p>` tag.
- For assistant messages, it uses the `<hb-render-message>` component to render the message content.
- The `<hb-render-message>` component is responsible for rendering the exposed components based on the message content.
- The `message` input is passed to the `<hb-render-message>` component, which will handle rendering the components defined in the chat resource.

---

## Conclusion

In this guide, we explored how to expose Angular components to a large language model (LLM) using the @hashbrownai/angular!exposeComponent:function function.
We also looked at how to create a chat resource that can interact with the LLM and render the exposed components in a web application.
