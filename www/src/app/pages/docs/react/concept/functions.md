# Tool Calling

<p class="subtitle">Give the model access to your application state and enable the model to take action.</p>

Tool calling (or function calling) in Hashbrown provides an intuitive approach to describing the tools that the model has access to.

- Execute a function in your React component scope.
- Return data to the model from state or a service.

---

## Demo

<div style="padding:59.64% 0 0 0;position:relative;width:100%;"><iframe src="https://player.vimeo.com/video/1089272737?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown tool calling"></iframe></div>

---

## How it Works

When you define a tool using Hashbrown's @hashbrownai/react!useTool:function hook the model can choose to use the tool to follow instructions and respond to prompts.

1. Provide the tool to the model using the `tools` property.
2. When the model receives a user message, it will analyze the message and determine if it needs to call any of the provided tools.
3. If the model decides to call a function, it will invoke the function with the required arguments.
4. The function executes within your React component and hook scope.
5. Return the result that is sent back to the LLM.

---

## The `useTool()` Hook

<hb-code-example header="useTool">

```ts
import { useTool } from '@hashbrownai/react';

useTool({
  name: 'getUser',
  description: 'Get information about the current user',
  handler: async (abortSignal) => {
    return await fetchUser({ signal: abortSignal });
  },
  deps: [fetchUser],
});
```

</hb-code-example>

1. Use the @hashbrownai/react!useTool:function hook to define a function that the LLM can call.
2. The `name` property is the name of the function that the LLM will call.
3. The `description` property is a description of what the function does. This is used by the LLM to determine if it should call the function.
4. The `handler` property is the function that will be called when the LLM invokes the function. The function is invoked with an `AbortSignal` and is expected to return a `Promise`.
5. The `deps` property is an array of dependencies that are used to memoize the handler function. This is similar to how you would use `useCallback` in React.

---

### `UseToolOptions`

| Option        | Type                   | Required | Description                                                                    |
| ------------- | ---------------------- | -------- | ------------------------------------------------------------------------------ |
| `name`        | `string`               | Yes      | The name of the function that the LLM will call                                |
| `description` | `string`               | Yes      | Description of what the function does                                          |
| `schema`      | `s.HashbrownType`      | No       | Schema defining the function arguments                                         |
| `handler`     | `Function`             | Yes      | The function to execute when called                                            |
| `deps`        | `React.DependencyList` | Yes      | Dependencies used to memoize the handler; pass like you would to `useCallback` |

---

### API Reference

<hb-next-steps>
  <hb-next-step link="/api/react/useTool">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>useTool() API</h4>
      <p>See the hook signature</p>
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

Provide the `tools` when using Hashbrown's hooks-based APIs.

<hb-code-example header="tools">

```tsx
import { useChat, useTool } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

export function ChatComponent() {
  // 1. The getUser() function returns authenticated user information to model
  const getUser = useTool({
    name: 'getUser',
    description: 'Get information about the current user',
    handler: async (abortSignal) => fetchUser({ signal: abortSignal }),
    deps: [fetchUser],
  });

  // 2. The getLights() function returns application state to the model
  const getLights = useTool({
    name: 'getLights',
    description: 'Get the current lights',
    handler: async () => getLightsFromStore(),
    deps: [getLightsFromStore],
  });

  // 3. The controlLight() function enables the model to mutate state
  const controlLight = useTool({
    name: 'controlLight',
    description: 'Control a light',
    schema: s.object('Control light input', {
      lightId: s.string('The id of the light'),
      brightness: s.number('The brightness of the light'),
    }),
    handler: async (input, abortSignal) =>
      updateLight(input.lightId, { brightness: input.brightness }, abortSignal),
    deps: [updateLight],
  });

  // 4. Specify the `tools` collection
  const chat = useChat({
    tools: [getUser, getLights, controlLight],
  });

  return null;
}
```

</hb-code-example>

Let's review the code above.

1. We use the @hashbrownai/react!useTool:function hook to define each tool.
2. We provide the collection of `tools` to the model.

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
      <p>Expose React components to the LLM for generative UI.</p>
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
