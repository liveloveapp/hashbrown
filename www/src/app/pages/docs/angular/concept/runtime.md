# JS Runtime

<p class="subtitle">Safe execution of model generated JavaScript code in the browser.</p>

The JavaScript runtime opens up a lot of capabilities and opportunities.

- Data transformation and orchestration
- Charting and visualizations
- Executing a series of tasks on the client
- Reduce errors and hallucinations, especially for mathematical operations
- Agentic user interfaces

---

## How it Works

We use [QuickJS](https://bellard.org/quickjs/), a small and embeddable JavaScript engine, compiled to a WebAssembly module using emscripten. This enables you to safely execute code in a sandbox environment.

1. Define a runtime.
2. Provide async functions using the @hashbrownai/angular!createRuntimeFunction:function function that the model can execute in order to follow instructions and respond to a prompt.
3. Hashbrown generates instructions and TypeScript definitions for each function to inform the model of the function signature.
4. Provide the runtime to the model using the @hashbrownai/angular!createToolJavaScript:function function.
5. Add the JavaScript runtime to the `tools` available to the model.

---

## The `createRuntime()` Function

<hb-code-example header="create runtime">

```ts
import { createRuntime } from '@hashbrownai/angular';

runtime = createRuntime({
  functions: [],
});
```

</hb-code-example>

1. We define a `runtime` using `createRuntime()`, which takes a list of functions.
2. We'll learn about defining functions below.

---

## Running Code in the Runtime

With the runtime created, you can run JavaScript inside of the runtime:

<hb-code-example header="running code">

```ts
const result = await this.runtime.run('2 + 2', AbortSignal.timeout(1_000));

console.log(result);
```

</hb-code-example>

1. The runtime is asynchronous by default, and may take an arbitrary amount of time to complete.
2. We use the `await` keyword to await the result.
3. We must pass in an abort signal as the second parameter. We recommend using `AbortSignal.timeout` to control how long the provided script may run.
4. The `run` method will return a promise of whatever the evaluation result is.

---

## The `createRuntimeFunction()` Function

Define functions using the @hashbrownai/angular!createRuntimeFunction:function function.

| Option        | Type       | Description                                                                                             |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `name`        | `string`   | The name of the function that will be called in the JS runtime.                                         |
| `description` | `string`   | A description of the function, which will be used in the LLM prompt.                                    |
| `args`        | `Schema`   | The input schema for the function (optional). Used to validate the input arguments.                     |
| `result`      | `Schema`   | The result schema for the function (optional). Used to validate the return value.                       |
| `handler`     | `Function` | The function that will be executed in the JS runtime. Can be async and accepts an optional AbortSignal. |

---

## Create Runtime with Functions

Next, let's define several functions that are executable within the JS runtime.

<hb-code-example header="create runtime with functions">

```ts
import { createRuntime, createRuntimeFunction } from '@hashbrownai/angular';

// 1. Create the runtime
runtime = createRuntime({
  // 2. Define the functions
  functions: [
    // 3. Create a runtime function that returns application state
    createRuntimeFunction({
      name: 'getLights',
      description: 'Get the current lights',
      args: s.array(
        'The lights',
        s.object('A light', {
          id: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
      ),
      handler: () => this.smartHomeService.loadLights(),
    }),
    // 4. Create a runtime function that mutates application state
    createRuntimeFunction({
      name: 'addLight',
      description: 'Add a light',
      args: s.object('Add light input', {
        name: s.string('The name of the light'),
        brightness: s.number('The brightness of the light'),
      }),
      result: s.object('The light', {
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

</hb-code-example>

1. We import @hashbrownai/angular!createRuntime:function and @hashbrownai/angular!createRuntimeFunction:function from `@hashbrownai/angular`.
2. We define a `runtime`. Each function is defined using `createRuntimeFunction()`, which includes:
   - `name`: The name of the function.
   - `description`: A description of what the function does.
   - `args`: The input schema for the function (optional).
   - `result`: The output schema for the function (optional).
   - `handler`: The function that will be executed in the JS runtime, which can be async and accepts an optional `AbortSignal`.
3. The `handler` function is executed within the JS runtime, allowing you to run JavaScript code safely.
4. The `result` schema describes the function return signature.
5. The `args` schema describes the input arguments passed to the `handler` function.
6. The `handler` function is executed synchronously within the JS runtime, allowing for procedural code execution.

---

## The `createToolJavaScript()` Function

Provide the `runtime` to the `tools` collection using the @hashbrownai/angular!createToolJavaScript:function function.

<hb-code-example header="create tool">

```ts
import { createToolJavaScript } from '@hashbrownai/angular';

chat = uiChatResource({
  tools: [
    createToolJavaScript({
      runtime,
    }),
  ],
});
```

</hb-code-example>

1. Use the @hashbrownai/angular!createToolJavaScript:function function to create a JavaScript tool with the `runtime`.
2. The model will use the JavaScript tool to follow instructions and respond to prompts.

---

## Synchronous Execution

It's important to note that the `handler` functions are `async` when defined, but are executed synchronously within the runtime itself.

This enables the model to write procedural code that we believe improves the sucess rate of the model-generated code.

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
</hb-next-steps>
