---
title: 'Tool Calling: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Give the model access to your application state and enable the model to take action.'
---
# Tool Calling

<p class="subtitle">Give the model access to your application state and enable the model to take action.</p>

Tool calling (or function calling) in Hashbrown provides an intuitive approach to describing the tools that the model has access to.

- Execute a function in Angular's injection context.
- Return data to the model from state or an Angular service.

---

## Demo

<div style="padding:59.64% 0 0 0;position:relative;width:100%;"><iframe src="https://player.vimeo.com/video/1089272737?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown tool calling"></iframe></div>

---

## How it Works

When you define a tool using Hashbrown's @hashbrownai/angular!createTool:function function the model can choose to use the tool to follow instructions and respond to prompts.

1. Provide the tool to the model using the `tools` property.
2. When the model receives a user message, it will analyze the message and determine if it needs to call any of the provided tools.
3. If the model decides to call a function, it will invoke the function with the required arguments.
4. The function is executed within Angular's injection context
5. Return the result that is sent back to the LLM.

---

## The `createTool()` Function

<hb-code-example header="createTool">

```ts
import { createTool } from '@hashbrownai/angular';

createTool({
  name: 'getUser',
  description: 'Get information about the current user',
  handler: (): Promise<User> => {
    const authService = inject(AuthService);
    return authService.getUser();
  },
});
```

</hb-code-example>

1. Use the @hashbrownai/angular!createTool:function function to define a function that the LLM can call.
2. The `name` property is the name of the function that the LLM will call.
3. The `description` property is a description of what the function does. This is used by the LLM to determine if it should call the function.
4. The `handler` property is the function that will be called when the LLM invokes the function. This is where you can perform any logic you need, such as fetching data from a service or performing a task. The function is invoked with an `AbortSignal` and is expected to return a `Promise`.

---

### `CreateToolOptions`

| Option        | Type                        | Required | Description                                     |
| ------------- | --------------------------- | -------- | ----------------------------------------------- |
| `name`        | `string`                    | Yes      | The name of the function that the LLM will call |
| `description` | `string`                    | Yes      | Description of what the function does           |
| `schema`      | `s.HashbrownType \| object` | No       | Schema defining the function arguments          |
| `handler`     | `Function`                  | Yes      | The function to execute when called             |

---

### API Reference

<hb-next-steps>
  <hb-next-step link="/api/angular/createTool">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>createTool() API</h4>
      <p>See the function signature</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

#### Handler Signatures

**With `input` Arguments:**

<hb-code-example header="handler">

```ts
handler: (input: s.Infer<Schema>, abortSignal: AbortSignal) => Promise<Result>;
```

</hb-code-example>

**Without `input` Arguments:**

<hb-code-example header="handler">

```ts
handler: (abortSignal: AbortSignal) => Promise<Result>;
```

</hb-code-example>

---

## Providing the Tools

Provide the `tools` when using Hashbrown's resource-based APIs.

<hb-code-example header="tools">

```ts
@Component({
  selector: 'app-chat',
  providers: [LightsStore],
  template: ` <!-- omitted for brevity - full code in stackblitz example --> `,
})
export class ChatComponent {
  lightsStore = inject(LightsStore);

  chat = chatResource({
    // 1. Specify the tools collection using createTool() function
    tools: [
      //2. The getUser() function returns authenticated user information to model
      createTool({
        name: 'getUser',
        description: 'Get information about the current user',
        handler: () => {
          const authService = inject(AuthService);
          return authService.getUser();
        },
      }),
      // 3. The getLights() function returns application state to the model
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: async () => this.lightsStore.entities(),
      }),
      // 4. The controlLight() function enables the model to mutate state
      createTool({
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

</hb-code-example>

Let's review the code above.

1. First, we define the `tools` array in the `chatResource` configuration.
2. We use the @hashbrownai/angular!createTool:function function to define each tool.
3. The `getUser()` function returns the authenticated user information to the model.
4. The `getLights()` function returns application state to the model.
5. The `controlLight()` function enables the model to mutate application state.

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
  <hb-next-step link="concept/components">
    <div>
      <hb-components />
    </div>
    <div>
      <h4>Generate user interfaces</h4>
      <p>Expose Angular components to the LLM for generative UI.</p>
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
