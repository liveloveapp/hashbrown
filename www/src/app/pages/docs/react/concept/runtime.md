# JS Runtime

Hashbrown ships with a JavaScript runtime for safe execution of LLM-generated code in the client.

We use [QuickJS](https://bellard.org/quickjs/), a small and embeddable JavaScript engine, compiled to a WebAssembly module using emscripten. This enables you to safely execute code in a sandbox environment.

There are many use cases for the JS runtime. Here are a few:

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

## Defining Runtime

The first step is to define a `runtime`.

<www-code-example header="runtime.tsx">

```tsx
import { useRuntime } from '@hashbrownai/react';

const runtime = useRuntime({
  functions: [],
});
```

</www-code-example>

Let's review the code above:

- We define a `runtime` using the `useRuntime()` hook, which takes a list of functions.
- We'll learn next about defining functions.

---

## Running Code in the Runtime

With the runtime created, you can run JavaScript inside of the runtime:

```ts
const result = await runtime.run('2 + 2', AbortSignal.timeout(1000));

console.log(result);
```

Here's what's happening:

- The runtime is asynchronous by default, and may take an arbitrary amount of time to complete.
- We use the `await` keyword to await the result.
- We must pass in an abort signal as the second parameter. We recommend using `AbortSignal.timeout` to control how long the provided script may run.
- The `run` method will return a promise of whatever the evaluation result is.

---

## Define Functions

The Hashbrown JS runtime has the capability to define functions using the `useRuntimeFunction` hook.

**Options**

| Name          | Type                  | Description                                                                        |
| ------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `name`        | `string`              | The name of the function that will be called in the JS runtime.                    |
| `description` | `string`              | A description of the function, which will be used in the LLM prompt.               |
| `args`        | `Schema`              | The args schema for the function, which will be used to validate the args.         |
| `result`      | `Schema`              | The result schema for the function, which will be used to validate the result.     |
| `handler`     | `(input: any) => any` | The function that will be executed in the JS runtime. It can be an async function. |
| `deps`        | `DependencyList`      | React dependency array for memoization.                                            |

Next, let's define several functions that are callable within the JS runtime.

It's important to note that the `handler` functions are `async` when defined, but are executed synchronously within the runtime itself. This enables the LLM to write procedural code that improves the success rate of the LLM-generated JS code.

<www-code-example header="runtime.tsx">

```tsx
import { useRuntime, useRuntimeFunction } from '@hashbrownai/react';
import * as s from '@hashbrownai/core';
import { useMemo } from 'react';

const getLights = useRuntimeFunction({
  name: 'getLights',
  description: 'Get the current lights',
  args: s.array(
    'The lights',
    s.object('A light', {
      id: s.string('The id of the light'),
      brightness: s.number('The brightness of the light'),
    })
  ),
  handler: () => smartHomeService.loadLights(),
  deps: [smartHomeService],
});

const addLight = useRuntimeFunction({
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
    const light = await smartHomeService.addLight(input);
    return light;
  },
  deps: [smartHomeService],
});

const runtime = useRuntime({
  functions: useMemo(() => [getLights, addLight], [getLights, addLight]),
});
```

</www-code-example>

---

## Providing the Tool

Similar to [function calling](/docs/react/concept/functions), the JS runtime is provided to a Hashbrown chat hook as a member of the `tools` array.

<www-code-example header="chat.tsx">

```tsx
import { useToolJavaScript } from '@hashbrownai/react';

const jsTool = useToolJavaScript({
  runtime,
});

const chat = useUiChat({
  model: 'gpt-4.1',
  tools: [jsTool],
  components: [], // your exposed components here
  system: 'You are a helpful assistant.',
});
```

</www-code-example>

Let's quickly review the code above:

- We create a `useUiChat()` hook and provide the `model` and `tools`.
- We use `useToolJavaScript()` to create a JavaScript tool, passing the `runtime` we defined earlier.
- This tool will be available to the LLM for executing JavaScript code.
