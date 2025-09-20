---
title: 'Generative UI with Angular Components: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Expose trusted , tested , and compliant components to the model.'
---
# Generative UI with Angular Components

<p class="subtitle">Expose <strong>trusted</strong>, <strong>tested</strong>, and <strong>compliant</strong> components to the model.</p>

---

## The `exposeComponent()` Function

The @hashbrownai/angular!exposeComponent:function function exposes Angular components to the LLM that can be generated.
Let's first look at how this function works.

<hb-code-example header="expose component">

```ts
import { exposeComponent } from '@hashbrownai/angular';

exposeComponent(MarkdownComponent, {
  description: 'Show markdown to the user',
  input: {
    data: s.string('The markdown content'),
  },
});
```

</hb-code-example>

Let's break down the example above:

1. `MarkdownComponent` is the Angular component that we want to expose.
2. `description` is a human-readable description of the component that will be used by the LLM to understand what the component does.
3. `input` is an object that defines the inputs that the component accepts. In this case, it accepts a single input called `data`, which is a string representing the markdown content to be displayed.
4. The `s.string()` function is used to define the type of the input.

We should mention here that Skillet, our LLM-optimized schema language, is **type safe**.

- The `data` input is expected to be a `string` type.
- The schema specified is a `string()`.
- If the schema does not match the Angular component's input type, you'll see an error in both your editor and when you attempt to build the application.

---

## Streaming with Skillet

Streaming generative user interfaces is baked into the core of Hashbrown.
Hashbrown ships with an LLM-optimized schema language called Skillet.

Skillet supports streaming for:

- arrays
- objects
- strings

Let's update the previous example to support streaming of the markdown string into the `Markdown` component.

<hb-code-example header="enable streaming">

```ts
exposeComponent(MarkdownComponent, {
  description: 'Show markdown to the user',
  input: {
    data: s.streaming.string('The markdown content'),
  },
});
```

</hb-code-example>

The `s.streaming.string()` function is used to define the type of the input, indicating that it can be a string that will be streamed in chunks.

A note on the `streaming` keyword: this is a Skillet-specific keyword that indicates that the input can be streamed in chunks, which is useful for large content like markdown.

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
exposeComponent(LightListComponent, {
  description: 'Show a list of lights to the user',
  input: {
    title: s.string('The name of the list'),
  },
  children: 'any',
});
```

</hb-code-example>

In the example above, we're allowing `any` children to be rendered within the `LightListComponent` using the `&lt;ng-content&gt;` element.

However, if we wanted to explicitly limit the children that the model can generate, we can provide an array of exposed components.

<hb-code-example header="children">

```ts
exposeComponent(LightListComponent, {
  description: 'Show a list of lights to the user',
  input: {
    title: s.string('The name of the list'),
    icon: LightListIconSchema,
  },
  children: [
    exposeComponent(LightComponent, {
      description: 'Show a light to the user',
      input: {
        lightId: s.string('The id of the light'),
        icon: LightIconSchema,
      },
    }),
  ],
}),
```

</hb-code-example>

In the example above, the `LightListComponent` children is limited to the `LightComponent`.

---

## The `uiChatResource()` Function

<hb-code-example header="expose components to the model">

```ts
// 1. Create the UI chat resource
chat = uiChatResource({
  // 2. Specify the collection of exposed components
  components: [
    // 3. Expose the MarkdownComponent to th emodel
    exposeComponent(MarkdownComponent, {
      description: 'Show markdown to the user',
      input: {
        data: s.streaming.string('The markdown content'),
      },
    }),
  ],
});
```

</hb-code-example>

1. The @hashbrownai/angular!uiChatResource:function function is used to create a UI chat resource.
2. The `components` option defines the collection of exposed components that the model can choose to render in the application.
3. The @hashbrownai/angular!exposeComponent:function function creates and exposed component.

---

### `UiChatResourceOptions`

| Option       | Type                                                  | Required | Description                                       |
| ------------ | ----------------------------------------------------- | -------- | ------------------------------------------------- |
| `components` | `ExposedComponent<any>[]`                             | Yes      | The components to use for the UI chat resource    |
| `model`      | `KnownModelIds`                                       | Yes      | The model to use for the UI chat resource         |
| `system`     | `string \| Signal<string>`                            | Yes      | The system prompt to use for the UI chat resource |
| `messages`   | `Chat.Message<s.Infer<UiChatMessageOutput>, Tools>[]` | No       | The initial messages for the UI chat resource     |
| `tools`      | `Tools[]`                                             | No       | The tools to use for the UI chat resource         |
| `debugName`  | `string`                                              | No       | The debug name for the UI chat resource           |
| `debounce`   | `number`                                              | No       | The debounce time for the UI chat resource        |
| `apiUrl`     | `string`                                              | No       | The API URL to use for the UI chat resource       |

---

### API Reference

<hb-next-steps>
  <hb-next-step link="/api/angular/uiChatResource">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>uiChatResource() API</h4>
      <p>See the full resource</p>
    </div>
  </hb-next-step>
  <hb-next-step link="/api/angular/UiChatResourceOptions">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>UiChatResourceOptions API</h4>
      <p>See the options</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## Render User Interface

The `&lt;hb-render-message&gt;` Angular component renders an assistant message that contains the user interface schema.

<hb-code-example header="render">

```ts
<hb-render-message [message]="message" />
```

</hb-code-example>

---

## Render Last Assistant Message

If you only want to render the <em>last</em> assistant message, Hashbrown provides the `lastAssistantMessage` Signal.

<hb-code-example header="render last message">

```ts
@Component({

  // 1. Render the last assistant message
  template: `
    @let message = chat.lastAssistantMessage();
    @if (message) {
      <hb-render-message [message]="message" />
    }
  `,
})
export class UI {

  // 2. Create the UI chat resource specifying the exposed components
  chat = uiChatResource({
    components: [
      exposeComponent(ChartComponent, { ... })
    ]
  })
}
```

</hb-code-example>

1. We render the last assistant message using the `lastAssistantMessage` signal.
2. The `&lt;hb-render-message&gt;` requires the `message` to render.
3. The @hashbrownai/angular!uiChatResource:function function creates a new resource with the exposed components.

---

## Render All Message with Components

If you building a chat-like experience, you likely want to iterate over all of the `messages` and render the generated text _and_ components.

<hb-code-example header="render all messages">

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
export class Chat {}
```

</hb-code-example>

1. We use Angular's `@for` control-flow syntax to iterate over the messages in the chat resource `value()` signal.
2. The `@switch` control-flow is used to determine the role of the message (either 'user' or 'assistant').
3. For user messages, it simply displays the content in a paragraph tag.
4. For assistant messages, it uses the @hashbrownai/angular!RenderMessageComponent:class component to render the message content.
5. The @hashbrownai/angular!RenderMessageComponent:class component is responsible for rendering the exposed components based on the message content.
6. The `message` input is passed to the @hashbrownai/angular!RenderMessageComponent:class component, which will handle rendering the components defined in the chat resource.

---

## The `prompt` Tagged Template Literal

Providing examples in the system instructions enables few-shot prompting.
Hashbrown provides the `prompt` tagged template literal for generative UI for better instruction following.

<hb-code-example header="prompt with ui">

```ts
uiChatResource({
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
2. Validate that the component input values have been set correctly based on their schema definitions.
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
