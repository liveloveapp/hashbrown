# JS Runtime

hashbrown ships with a JavaScript runtime for safe execution of LLM-generated code in the client.

We use [QuickJS](https://bellard.org/quickjs/), a small and embeddable Javascript engine, that is compiled to a WebAssembly module using emscripten.
This enables you to safely execute code in a sandbox environment.

There are many use cases for the JS runtime. Here are a few.

- Data transformation and orchestration
- Charting and visualizations
- Executing a series of tasks on the client
- Reduce errors and hallucinations, especially for mathematical operations
- Dynamic exploration of code, fixing bugs, and vibe coding

---

## JS Runtime Benefits

Overall, we believe that the JS runtime provides:

- Improved client performance
- Decreased LLM costs
- Precision of calculations
- Vibe coding

---

## Install

First, install the hashbrown JavaScript tool.

```sh
npm install @hashbrownai/tool-javascript
```

Next, install the QuickJS WebAssembly variant:

```sh
npm install @jitl/quickjs-singlefile-browser-debug-asyncify
```

---

## Defining Runtime

The next step is to define a `runtime`.

<www-code-example header="chat.component.ts">

```ts
import variant from '@jitl/quickjs-singlefile-browser-debug-asyncify';

runtime = defineAsyncRuntime({
  loadVariant: () => Promise.resolve(variant),
  functions: [],
});
```

</www-code-example>

Let's review the code above:

- We import the QuickJS variant from `@jitl/quickjs-singlefile-browser-debug-asyncify`.
- We define a `runtime` using `defineAsyncRuntime()`, which takes a `loadVariant` function that returns the QuickJS variant.
- We'll learn next about defining functions.

---

## Define Functions

The hashbrown JS runtime has the capability to define functions using `defineFunction` and `defineFunctionWithArgs` functions.

**Options**

| Name          | Type                  | Description                                                                        |
| ------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `name`        | `string`              | The name of the function that will be called in the JS runtime.                    |
| `description` | `string`              | A description of the function, which will be used in the LLM prompt.               |
| `input`       | `Schema`              | The input schema for the function, which will be used to validate the input.       |
| `output`      | `Schema`              | The output schema for the function, which will be used to validate the output.     |
| `handler`     | `(input: any) => any` | The function that will be executed in the JS runtime. It can be an async function. |

Next, let's define several functions that are callable within the JS runtime.

It's important to note that the `handler` functions are `async` when defined, but are executed synchronously within the runtime itself.
This enables the LLM to write procedural code that improves the sucess rate of the LLM-generated JS code.

<www-code-example header="chat.component.ts">

```ts
import variant from '@jitl/quickjs-singlefile-browser-debug-asyncify';

runtime = defineAsyncRuntime({
  loadVariant: () => Promise.resolve(variant),
  functions: [
    defineFunction({
      name: 'getLights',
      description: 'Get the current lights',
      output: s.array(
        'The lights',
        s.object('A light', {
          id: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
      ),
      handler: () => this.smartHomeService.loadLights(),
    }),
    defineFunctionWithArgs({
      name: 'addLight',
      description: 'Add a light',
      input: s.object('Add light input', {
        name: s.string('The name of the light'),
        brightness: s.number('The brightness of the light'),
      }),
      output: s.object('The light', {
        id: s.string('The id of the light'),
        brightness: s.number('The brightness of the light'),
      }),
      handler: async (input) => {
        const light = await this.smartHomeService.addLight(input);
        return light;
      },
    }),
  ],
});
```

</www-code-example>

Let's review each of the functions defined above.

---

## Providing the Tool

Similar to [function calling](/docs/angular/concept/functions), the JS runtime is provided to a hashbrown resource function as a member of the `tools` array.

<www-code-example header="chat.component.ts">

```ts
chat = uiChatResource({
  model: 'gpt-4.1',
  tools: [
    createToolJavaScript({
      runtime: this.runtime,
    }),
  ],
});
```

</www-code-example>

Let's quickly review the code above:

- We create a `uiChatResource()` and provide the `model` and `tools`.
- We use `createToolJavaScript()` to create a JavaScript tool, passing the `runtime` we defined earlier.
- This tool will be available to the LLM for executing JavaScript code.
