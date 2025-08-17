# Function Calling

Function calling with a Large Language Model (LLM) is a powerful feature that allows you to define functions that the LLM can call.
The LLM will determine if and when a function is called.

There are many use cases for function calling.
Here are few that we've implemented in our Angular applications:

- Providing data to the LLM from state or an Angular service.
- Performing tasks on behalf of the user.
- Dispatching NgRx actions that are AI scoped that perform tasks or provide suggestions.

---

## Demo

<div style="padding:59.64% 0 0 0;position:relative;width:100%;"><iframe src="https://player.vimeo.com/video/1089272737?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown function calling"></iframe></div>

---

## How it Works

When you define a function using hashbrown's @hashbrownai/angular!createTool:function function, the LLM can call that function when it determines that it is necessary to fulfill the user's request.

1. Provide the function to the LLM using the `tools` property.
2. When the LLM receives a user message, it will analyze the message and determine if it needs to call any of the provided functions.
3. If the LLM decides to call a function, it will invoke the function with the required arguments.
4. The function is executed within Angular's injection context
5. Return the result that is sent back to the LLM.

---

## The `createTool()` Function

<hb-code-example header="createTool">

```ts
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

### Options

| Option        | Type                        | Required | Description                                     |
| ------------- | --------------------------- | -------- | ----------------------------------------------- |
| `name`        | `string`                    | Yes      | The name of the function that the LLM will call |
| `description` | `string`                    | Yes      | Description of what the function does           |
| `schema`      | `s.HashbrownType \| object` | No       | Schema defining the function arguments          |
| `handler`     | `Function`                  | Yes      | The function to execute when called             |

#### Handler Function Signatures

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

## Providing the Functions

Provide the `tools` when using hashbrown's resource-based APIs.

<hb-code-example header="app.ts">

```ts
@Component({
  selector: 'app-chat',
  providers: [LightsStore],
  template: ` <!-- omitted for brevity - full code in stackblitz example --> `,
})
export class ChatComponent {
  lightsStore = inject(LightsStore);

  chat = chatResource({
    model: 'gpt-5',
    system:
      'You are a helpful assistant that can answer questions and help with tasks',
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
2. We use the @hashbrownai/angular!createTool:function function to define the functions that the LLM can call.
3. The `handler` functions are defined to perform the necessary logic, such as fetching data from services or updating the state.
4. Finally, we can use the `sendMessage` method to send a message to the LLM, which can then invoke the defined functions as needed.

---

## Example

[Run the function calling example in Stackblitz](/examples/angular/function-calling)

A few notes:

- First, you will need an OpenAI API Key.
- Try the prompt: `"Who am I?"`. That will invoke the `getUser` function.
- Try the prompt: `"Show me all the lights"`. This will invoke the `getLights` function.
- Try the prompt: `"Turn off all lights"`. This will invoke the `controlLights` function.

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
      <h4>Generate user interface</h4>
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
