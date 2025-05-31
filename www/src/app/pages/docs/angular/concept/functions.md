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

## Example

[Run the function calling example in Stackblitz](/examples/angular/function-calling)

A few notes:

- First, you will need an OpenAI API key.
- Try the prompt: `"Who am I?"`. That will invoke the `getUser` function.
- Try the prompt: `"Show me all the lights"`. This will invoke the `getLights` function.
- Try the prompt: `"Turn off all lights"`. This will invoke the `controlLights` function.

---

## Defining a Function

Hashbrown provides the @hashbrownai/angular!createTool:function function for defining functions that the LLM can invoke.

<www-code-example header="chat.component.ts">

```ts
createTool({
  name: 'getUser',
  description: 'Get information about the current user',
  handler: () => {
    const authService = inject(AuthService);
    return authService.getUser();
  },
}),
```

</www-code-example>

Let's break down the example above:

- `name`: The name of the function that the LLM will call.
- `description`: A description of what the function does. This is used by the LLM to determine if it should call the function.
- `handler`: The function that will be called when the LLM invokes the function. This is where you can perform any logic you need, such as fetching data from a service or performing a task. The function is invoked with an `AbortSignal` and is expected to return a `Promse` of the `Result`.

The method signature for a `handler` is:

```ts
(abortSignal: AbortSignal) => Promise<Result>;
```

---

## Functions with Arguments

hashbrown's @hashbrownai/angular!createToolWithArgs:function enables Angular developers to define functions that require arguments by specifying the `schema`.

Of course, we'll be using Skillet - hasbrown's LLM-optimized schema language - for defining the function arguments.
Let's look at an example function that enables the LLM to control the lights in our smart home client application.

<www-code-example header="chat.component.ts">

```ts
createToolWithArgs({
  name: 'controlLight',
  description: 'Control a light',
  schema: s.object('Control light input', {
    lightId: s.string('The id of the light'),
    brightness: s.number('The brightness of the light'),
  }),
  handler: (input) =>
    lastValueFrom(
      this.smartHomeService.controlLight(input.lightId, input.brightness).pipe(
        tap((light) => {
          this.store.dispatch(
            ChatAiActions.controlLight({
              lightId: light.id,
              brightness: light.brightness,
            }),
          );
        }),
      ),
    ),
});
```

</www-code-example>

Let's review the code above.

- `name`: The name of the function that the LLM will call.
- `description`: A description of what the function does. This is used by the LLM to determine if it should call the function.
- `schema`: The schema that defines the arguments that the function requires. This is where you can define the input parameters for the function using Skillet.
- `handler`: The function that will be called when the LLM invokes the function. This is where you can perform any logic you need, such as fetching data from a service or performing a task. The function is invoked with an `AbortSignal` and is expected to return a `Promise` of the `Result`.

In this example, we expect that the `input` will be an object with the properties `lightId` and `brightness`, which are defined in the `schema`.
We're using NgRx for dispatching an action to update the state of the application with the new light brightness.

---

## Providing the Functions

The next step is to provide the `tools` when using hashbrown's resource-based APIs.

<www-code-example header="chat.component.ts" run="/examples/angular/function-calling">

```ts
@Component({
  selector: 'app-chat',
  providers: [LightsStore],
  template: ` <!-- omitted for brevity - full code in stackblitz example --> `,
})
export class ChatComponent {
  lightsStore = inject(LightsStore);

  chat = chatResource({
    model: 'gpt-4.1',
    prompt: 'You are a helpful assistant that can answer questions and help with tasks',
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
      createToolWithArgs({
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

</www-code-example>

Let's review the code above.

- First, we define the `tools` array in the `chatResource` configuration.
- We use the @hashbrownai/angular!createTool:function and @hashbrownai/angular!createToolWithArgs:function functions to define the functions that the LLM can call.
- The `handler` functions are defined to perform the necessary logic, such as fetching data from services or updating the state.
- Finally, we can use the `sendMessage` method to send a message to the LLM, which can then invoke the defined functions as needed.

## Conclusion

Function calling is a powerful feature that allows you to define functions that the LLM can invoke.
By using hashbrown's @hashbrownai/angular!createTool:function and @hashbrownai/angular!createToolWithArgs:function functions, you can easily define functions with or without arguments that the LLM can call.
