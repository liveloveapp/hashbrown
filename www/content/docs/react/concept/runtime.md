---
title: 'JS Runtime: Hashbrown React Docs'
meta:
  - name: description
    content: 'Run JavaScript in QuickJS with explicitly exposed application functions.'
---

# JS Runtime

Let's calculate a basket total. Our application provides three items; JavaScript running in QuickJS adds their prices and returns **4,200 cents ($42.00)**. Then we'll try browser access, reject invalid arguments, and run the calculation again.

<hb-docs-demo demo="javascript-runtime">
</hb-docs-demo>

## Before we start

Start with the [React Quickstart](/docs/react/start/quick). This example uses the same client packages. QuickJS ships with `@hashbrownai/core` and loads lazily when you first run code. The direct example does not call a model or need an API key.

Keep the shared `runtime` directory beside the `react` and `angular` example directories. The imports below use that layout. If you copy this into an existing app, put the shared file in your source tree and update its import path.

## Expose a read-only basket

Create `runtime/basket.ts`:

<hb-expander title="Complete runtime/basket.ts">

<hb-code-example header="runtime/basket.ts">

```ts
import { s } from '@hashbrownai/core';

/** Describes the model-facing input; the handler still validates it. */
export const basketArgs = s.object('Read the USD basket', {
  currency: s.literal('USD'),
});

/** Describes the basket snapshot returned to the script. */
export const basketResult = s.object('A read-only basket snapshot', {
  currency: s.literal('USD'),
  items: s.array(
    'Basket items',
    s.object('An item', {
      name: s.string('Product name'),
      priceCents: s.number('Integer price in cents'),
    }),
  ),
});

/** Reads a fresh basket snapshot after explicitly validating untrusted arguments. */
export function readBasket(input: unknown): s.Infer<typeof basketResult> {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).length !== 1 ||
    !('currency' in input) ||
    input.currency !== 'USD'
  ) {
    throw new TypeError('Expected exactly { currency: "USD" }.');
  }

  return {
    currency: 'USD',
    items: [
      { name: 'Coffee', priceCents: 1800 },
      { name: 'Tea', priceCents: 1400 },
      { name: 'Chocolate', priceCents: 1000 },
    ],
  };
}

/** Scripts used by both framework examples; host calls appear synchronous in QuickJS. */
export const runtimeScripts = {
  calculate: `const basket = readBasket({ currency: 'USD' });
({
  currency: basket.currency,
  itemCount: basket.items.length,
  totalCents: basket.items.reduce((total, item) => total + item.priceCents, 0),
});`,
  browser: 'document.title;',
  invalid: "readBasket({ currency: 'EUR' });",
};
```

</hb-code-example>

</hb-expander>

A few things to note:

- Prices use integer cents. We add `1800 + 1400 + 1000` before formatting the amount for display.
- `readBasket` accepts `unknown` and checks the argument itself. It accepts exactly one `currency` field with the value `USD`.
- Each call returns a new snapshot. The script does not receive a reference to application state.
- `basketArgs` and `basketResult` describe the function's contract to the model and provide TypeScript guidance. The current QuickJS bridge does **not automatically validate arguments or results** against these schemas. Validate untrusted inputs in the host handler and validate external data before returning it.

The handler executes in your host application, outside QuickJS. It retains your application's privileges. A function that reads account data or writes to an API must enforce its own authorization and validation. Only expose capabilities the script should be able to call.

## Run the script

Create `src/RuntimeDemo.tsx`:

<hb-expander title="Complete src/RuntimeDemo.tsx">

<hb-code-example header="src/RuntimeDemo.tsx">

```tsx
import { useState } from 'react';
import { useRuntime, useRuntimeFunction } from '@hashbrownai/react';
import {
  basketArgs,
  basketResult,
  readBasket,
  runtimeScripts,
} from '../../runtime/basket';

/** Runs visible JavaScript in QuickJS with one explicitly validated host capability. */
export function RuntimeDemo() {
  const [code, setCode] = useState(runtimeScripts.calculate);
  const [output, setOutput] = useState(
    'Run the script to calculate the basket total.',
  );
  const [running, setRunning] = useState(false);
  const read = useRuntimeFunction({
    name: 'readBasket',
    description: 'Read the current basket in USD. Prices are integer cents.',
    args: basketArgs,
    result: basketResult,
    handler: async (input) => readBasket(input),
    deps: [],
  });
  const runtime = useRuntime({ functions: [read], timeout: 1_000 });

  async function run() {
    setRunning(true);
    try {
      const response: unknown = await runtime.run(
        code,
        AbortSignal.timeout(2_000),
      );
      setOutput(JSON.stringify(response, null, 2));
    } catch (error) {
      setOutput(
        JSON.stringify(
          { error: error instanceof Error ? error.message : String(error) },
          null,
          2,
        ),
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <h1>JavaScript runtime</h1>
      <p>Read three basket items, then calculate the total inside QuickJS.</p>
      <p>
        The only exposed host function is readBasket. It validates the currency
        before returning a snapshot.
      </p>
      <nav aria-label="Script presets">
        <button
          type="button"
          disabled={running}
          onClick={() => setCode(runtimeScripts.calculate)}
        >
          Calculate basket total
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => setCode(runtimeScripts.browser)}
        >
          Try browser access
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => setCode(runtimeScripts.invalid)}
        >
          Try invalid arguments
        </button>
      </nav>
      <label htmlFor="runtime-code">JavaScript code</label>
      <textarea
        id="runtime-code"
        rows={9}
        value={code}
        disabled={running}
        onChange={(event) => setCode(event.target.value)}
      />
      <button type="button" disabled={running} onClick={() => void run()}>
        Run in sandbox
      </button>
      {running && <p role="status">Running in QuickJS...</p>}
      <h2>Result or error</h2>
      <pre aria-live="polite" data-testid="runtime-output">
        {output}
      </pre>
      <p>
        Each run starts with a fresh context. Choose another script and run
        again after an error.
      </p>
    </main>
  );
}
```

</hb-code-example>

</hb-expander>

Replace the `App` import in the Quickstart's `src/main.tsx` with `RuntimeDemo`, then render `<RuntimeDemo />` inside the existing `HashbrownProvider`.

We use @hashbrownai/react!useRuntimeFunction:hook to expose `readBasket`, then @hashbrownai/react!useRuntime:hook to create the runtime. The handler is async in the host. Inside the script, `readBasket(...)` appears synchronous: the QuickJS bridge waits for the host call before continuing execution.

Click **Run in sandbox**. The JavaScript editor shows the exact code submitted to `runtime.run`. Its last expression becomes the result:

```json
{
  "result": {
    "currency": "USD",
    "itemCount": 3,
    "totalCents": 4200
  }
}
```

`run` returns a promise for a wrapper: `{ result: value }` on successful evaluation, or `{ error: details }` for a QuickJS evaluation error. Check the wrapper before using the value. The component also catches rejected promises, such as initialization or host failures, and displays an error message.

## Try a failure, then recover

Choose **Try browser access**, then **Run in sandbox**. The script evaluates `document.title`. QuickJS has no browser `document`, so the output contains an error. Browser globals such as `window` and `fetch` are also unavailable in this context; a host function can still provide access to host resources if you expose it.

Next, choose **Try invalid arguments** and run again. `readBasket({ currency: 'EUR' })` reaches our host handler and fails its explicit currency check. The error is visible in the output. The schema declaration alone would not enforce this check.

Choose **Calculate basket total** and run once more. The result is 4,200 cents again. An earlier failed run does not prevent the next calculation.

## Context lifetime and cancellation

Each call to `runtime.run` creates a new QuickJS runtime and context. Variables from one run do not persist into another run. Keep application data in your application and expose a function to read the data each script needs.

The example configures `timeout: 1_000` and passes `AbortSignal.timeout(2_000)` to `run`. Hashbrown combines the caller's signal with the runtime timeout. QuickJS checks that signal through its interrupt handler, which can interrupt JavaScript loops. The signal is also passed to exposed host handlers. When a handler performs asynchronous work, forward it to operations such as `fetch` that support cancellation.

The configured runtime timeout is its execution deadline. A caller’s timer-based AbortSignal also depends on the browser event loop; a shorter caller timeout cannot be relied on to interrupt synchronous code before that event loop can run. Keep the runtime deadline bounded rather than relying only on a caller timer.

These timeouts do not forcibly stop arbitrary host code, roll back side effects, or set a memory limit. Keep handlers narrow and bounded. QuickJS is an execution boundary for the submitted script; it is not a substitute for host validation, server authorization, or application resource limits.

## Let a model call the runtime

The direct example is useful for understanding execution without a model in the loop. To let a model submit scripts, wrap the runtime with @hashbrownai/react!useToolJavaScript:hook and include the returned tool in a chat's `tools` collection.

This optional helper uses the same basket contract. It requires the Quickstart's provider configuration and chat endpoint:

<hb-expander title="Complete src/useBasketChat.ts">

<hb-code-example header="src/useBasketChat.ts">

```ts
import {
  useChat,
  useRuntime,
  useRuntimeFunction,
  useToolJavaScript,
} from '@hashbrownai/react';
import { basketArgs, basketResult, readBasket } from '../../runtime/basket';

/** Creates a text chat with a JavaScript tool for basket calculations. */
export function useBasketChat() {
  const read = useRuntimeFunction({
    name: 'readBasket',
    description: 'Read the USD basket. Prices are integer cents.',
    args: basketArgs,
    result: basketResult,
    handler: async (input) => readBasket(input),
    deps: [],
  });
  const runtime = useRuntime({ functions: [read], timeout: 1_000 });
  const javascript = useToolJavaScript({ runtime });

  return useChat({
    system:
      'Use javascript to calculate basket totals. Each call starts fresh. Return the total in USD.',
    tools: [javascript],
  });
}
```

</hb-code-example>

</hb-expander>

Call `useBasketChat()` at the top level of your React component and use its messages and `sendMessage` method as with `useChat`. The model receives the exposed function descriptions and type signatures. The `javascript` tool passes its generated code to `runtime.run` and returns the result/error wrapper to the model. Each tool call still gets a fresh context.

For data transformation, start with read-only functions like this one. Add mutation capabilities only when their handlers can enforce the same rules as the rest of your application.

## Next steps

<hb-next-steps>
  <hb-next-step link="concept/structured-output">
    <div><hb-database-cog /></div>
    <div><h4>Get structured data from models</h4><p>Use Skillet schemas to describe model responses.</p></div>
  </hb-next-step>
  <hb-next-step link="concept/components">
    <div><hb-components /></div>
    <div><h4>Generate user interfaces</h4><p>Expose React components for generative UI.</p></div>
  </hb-next-step>
</hb-next-steps>
