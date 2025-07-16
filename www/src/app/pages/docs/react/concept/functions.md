# Function Calling

Function calling with a Large Language Model (LLM) is a powerful feature that allows you to define functions that the LLM can call.
The LLM will determine if and when a function is called.

There are many use cases for function calling.
Here are a few that we've implemented in our React applications:

- Providing data to the LLM from React state or a service.
- Performing tasks on behalf of the user.
- Dispatching actions that are AI scoped to perform tasks or provide suggestions.

---

## Demo

<div style="padding:59.64% 0 0 0;position:relative;width:100%;"><iframe src="https://player.vimeo.com/video/1089272737?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown function calling"></iframe></div>

---

## Defining a Tool

Hashbrown provides the `useTool` hook from `@hashbrownai/react` for defining functions that the LLM can invoke.

<www-code-example header="useTools.ts">

```ts
import { useTool } from '@hashbrownai/react';

export default function Chat() {
  export const getUserTool = useTool({
    name: 'getUser',
    description: 'Get information about the current user',
    deps: [fetchUser],
    handler: async (abortSignal) => {
      // Replace with your user fetching logic
      return await fetchUser({ signal: abortSignal });
    },
  });
}
```

</www-code-example>

Let's break down the example above:

- `name`: The name of the function that the LLM will call.
- `description`: A description of what the function does. This is used by the LLM to determine if it should call the function.
- `handler`: The function that will be called when the LLM invokes the function. This is where you can perform any logic you need, such as fetching data from a service or performing a task. The function is invoked with an `AbortSignal` and is expected to return a `Promise` of the `Result`.
- `deps`: The dependencies referenced in the `handler` function, like you would pass to `useCallback`

The method signature for a `handler` is:

```ts
(abortSignal: AbortSignal) => Promise<Result>;
```

---

## Tools with Arguments

Hashbrown's `useTool` hook enables React developers to define functions that require arguments by specifying the `schema`. The LLM will invoke the function with the specified arguments.

We'll be using Skillet - hashbrown's LLM-optimized schema language - for defining the function arguments.
Let's look at an example function that enables the LLM to control the lights in our smart home client application.

<www-code-example header="useTools.ts">

```ts
import { useTool } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

export const controlLight = useTool({
  name: 'controlLight',
  description: 'Control a light',
  schema: s.object('Control light input', {
    lightId: s.string('The id of the light'),
    brightness: s.number('The brightness of the light'),
  }),
  handler: async (input, abortSignal) => {
    // Replace with your update logic
    return await updateLight(input.lightId, { brightness: input.brightness }, abortSignal);
  },
});
```

</www-code-example>

Let's review the code above.

- `name`: The name of the function that the LLM will call.
- `description`: A description of what the function does. This is used by the LLM to determine if it should call the function.
- `schema`: The schema that defines the arguments that the function requires. This is where you can define the input parameters for the function using Skillet.
- `handler`: The function that will be called when the LLM invokes the function. This is where you can perform any logic you need, such as fetching data from a service or performing a task. The function is invoked with the input arguments and an `AbortSignal`, and is expected to return a `Promise` of the `Result`.

In this example, we expect that the `input` will be an object with the properties `lightId` and `brightness`, which are defined in the `schema`.

Note that the `input` arguments are strongly-typed based on the provided schema.

The method signature for a `handler` is:

```ts
(input: Input, abortSignal: AbortSignal) => Promise<Result>;
```

---

## Providing the Tools

The next step is to provide the `tools` when using hashbrown's React hooks-based APIs.

<www-code-example header="ChatComponent.tsx" run="/examples/react/function-calling">

```tsx
import React from 'react';
import { useChat } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { getUser, getLights, controlLight } from './useTools';

export function ChatComponent() {
  const chat = useChat({
    model: 'gpt-4.1',
    system: 'You are a helpful assistant that can answer questions and help with tasks',
    tools: [getUser, getLights, controlLight],
  });

  const sendMessage = (message: string) => {
    chat.sendMessage({ role: 'user', content: message });
  };

  // ... render chat UI, messages, etc.
}
```

</www-code-example>

Let's review the code above.

- First, we define the `tools` array and pass it to the `useChat` hook.
- We use the `useTool` hook to define the functions that the LLM can call.
- The `handler` functions are defined to perform the necessary logic, such as fetching data from services or updating the state.
- Finally, we can use the `sendMessage` method to send a message to the LLM, which can then invoke the defined functions as needed.

## Conclusion

Function calling is a powerful feature that allows you to define functions that the LLM can invoke.
By using hashbrown's `useTool` hook, you can easily define functions with or without arguments that the LLM can call.
