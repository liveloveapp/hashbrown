---
title: 'Structured output: Hashbrown React Docs'
meta:
  - name: description
    content: 'Generate typed data, review the result, and apply it explicitly.'
---

# Structured output

Let's turn **“Add 2 apples and 1 loaf of bread”** into a shopping list. The model returns JSON with item names and quantities. Our application displays a draft, checks its rules, and waits for us to apply it.

<hb-docs-demo demo="structured-form">
</hb-docs-demo>

## Before we start

Use the endpoint and provider configuration from the [Quickstart](/docs/react/start/quick). Read [Skillet schemas](/docs/react/concept/schema) for the response shape. This example uses `useStructuredChat()` to request data that our own interface renders.

Keep `runtime/shopping-list.ts` beside the `react` and `angular` example directories. If you copy the files into your app, update the shared file import to match your layout.

## Describe the response

Our response has one `items` array. Each item has a string `name` and integer `quantity`. Hashbrown parses the model's response with this schema and exposes typed assistant content.

We use `s.streaming.array` around ordinary `s.object` items. That lets items appear once their required field values resolve, before the whole list finishes. [Streaming](/docs/react/concept/streaming) explains where to place the streaming markers.

The shared file also checks our application's rules: 1–10 items, names with 1–80 characters after trimming, and quantities from 1–20. A value can match the schema and still fail these rules. For example, zero is an integer, but it is not a useful quantity in this list.

<hb-expander title="Complete runtime/shopping-list.ts">

<hb-code-example header="runtime/shopping-list.ts">

```ts
import { s } from '@hashbrownai/core';

/** Streams shopping-list items once their required field values resolve. */
export const shoppingListSchema = s.object('A shopping list draft', {
  items: s.streaming.array(
    'The requested shopping items',
    s.object('A complete shopping item', {
      name: s.string('The product name'),
      quantity: s.integer('How many to add'),
    }),
  ),
});

/** A shopping list after parsing; application rules still require validation. */
export type ShoppingList = s.Infer<typeof shoppingListSchema>;

/** Runtime state needed to authorize applying one explicitly requested draft. */
export interface ShoppingListRun {
  readonly requestId: string | undefined;
  readonly cancelled: boolean;
  readonly messages: readonly {
    readonly id?: string;
    readonly role: string;
    readonly content?: unknown;
  }[];
  readonly isSending: boolean;
  readonly isReceiving: boolean;
  readonly isGenerating: boolean;
  readonly isLoading: boolean;
  readonly error?: unknown;
  readonly finishReason?: string;
}

/** Returns a trimmed, independent copy when all application rules pass. */
export function validateShoppingList(input: unknown): ShoppingList | undefined {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('items' in input) ||
    !Array.isArray(input.items)
  )
    return undefined;
  if (input.items.length < 1 || input.items.length > 10) return undefined;
  const items: ShoppingList['items'] = [];
  for (const item of input.items) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.name !== 'string' ||
      !Number.isInteger(item.quantity)
    )
      return undefined;
    const name = item.name.trim();
    if (
      name.length < 1 ||
      name.length > 80 ||
      item.quantity < 1 ||
      item.quantity > 20
    )
      return undefined;
    items.push({ name, quantity: item.quantity });
  }
  return { items };
}

/** Revalidates a fresh answer only after its runtime settles without failure. */
export function getApplicableShoppingList(
  run: ShoppingListRun,
): ShoppingList | undefined {
  // isSending covers the debounce window before aggregate isLoading becomes true.
  if (
    !run.requestId ||
    run.cancelled ||
    run.error ||
    run.isSending ||
    run.isReceiving ||
    run.isGenerating ||
    run.isLoading ||
    (run.finishReason !== undefined && run.finishReason !== 'stop')
  )
    return undefined;
  const reversedMessages = [...run.messages].reverse();
  const userIndex = reversedMessages.findIndex(
    (message) => message.role === 'user',
  );
  if (userIndex < 0 || reversedMessages[userIndex].id !== run.requestId)
    return undefined;
  const answer = reversedMessages
    .slice(0, userIndex)
    .find((message) => message.role === 'assistant');
  return validateShoppingList(answer?.content);
}
```

</hb-code-example>

</hb-expander>

## Generate a draft

Create the component below, then connect it to your configured application. Render `StructuredList` inside `HashbrownProvider` in place of the Quickstart `App`.

Enter the request and select **Generate draft**. The event handler sends one user message. Editing the input alone does not start a request, and rendering the component does not send one.

The example starts a fresh model conversation for each draft. We want each request to describe a replacement list; previous drafts are not additional instructions. Use a continuing structured chat when your feature needs follow-up turns.

<hb-expander title="Complete react/src/StructuredList.tsx">

<hb-code-example header="react/src/StructuredList.tsx">

```tsx
import { useRef, useState } from 'react';
import { useStructuredChat } from '@hashbrownai/react';
import {
  getApplicableShoppingList,
  type ShoppingList,
  shoppingListSchema,
} from '../../runtime/shopping-list';

/** Generates a reviewable draft and applies a validated copy to local state. */
export function StructuredList() {
  const [prompt, setPrompt] = useState('Add 2 apples and 1 loaf of bread.');
  const [request, setRequest] = useState<{ id: string; cancelled: boolean }>();
  const currentRequest = useRef(request);
  const [applied, setApplied] = useState<ShoppingList>();
  const chat = useStructuredChat({
    schema: shoppingListSchema,
    system:
      'Turn the request into a shopping list. Use 1–10 items, names of 1–80 characters, and integer quantities from 1–20.',
  });
  const run = {
    requestId: request?.id,
    cancelled: request?.cancelled ?? false,
    messages: chat.messages,
    isSending: chat.isSending,
    isReceiving: chat.isReceiving,
    isGenerating: chat.isGenerating,
    isLoading: chat.isLoading,
    error: chat.error,
    finishReason: chat.lastRunFinishReason,
  };
  const candidate = getApplicableShoppingList(run);
  const busy = chat.isSending || chat.isLoading;
  const draft = chat.lastAssistantMessage?.content;
  const status = request?.cancelled
    ? 'Generation cancelled. Generate another draft to continue.'
    : chat.error
      ? 'Could not generate a valid draft. Try generating again.'
      : busy
        ? 'Generating draft. Complete items appear as they arrive.'
        : chat.lastRunFinishReason && chat.lastRunFinishReason !== 'stop'
          ? 'Generation ended before a complete draft. Generate another draft.'
          : candidate
            ? 'Draft ready. Review the items, then apply the list.'
            : request
              ? 'Draft does not meet the list rules. Generate another draft.'
              : 'Describe your list, then generate a draft.';

  function generate() {
    const next = { id: crypto.randomUUID(), cancelled: false };
    currentRequest.current = next;
    setRequest(next);
    // This component generates independent lists, so each request replaces its history.
    chat.setMessages([{ id: next.id, role: 'user', content: prompt }]);
  }
  function cancel() {
    if (!currentRequest.current) return;
    const next = { ...currentRequest.current, cancelled: true };
    currentRequest.current = next;
    setRequest(next);
    chat.stop();
  }
  function apply() {
    // Recheck at the event boundary; Generate and Cancel invalidate synchronously.
    const list = getApplicableShoppingList({
      ...run,
      requestId: currentRequest.current?.id,
      cancelled: currentRequest.current?.cancelled ?? false,
    });
    if (list) setApplied(list);
  }

  return (
    <main>
      <h1>Turn a request into a shopping list</h1>
      <label htmlFor="shopping-request">Shopping request</label>
      <textarea
        id="shopping-request"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <nav aria-label="Draft actions">
        <button
          type="button"
          disabled={!prompt.trim() || busy}
          onClick={generate}
        >
          Generate draft
        </button>
        <button
          type="button"
          disabled={!busy || request?.cancelled}
          onClick={cancel}
        >
          Cancel
        </button>
        <button type="button" disabled={!candidate} onClick={apply}>
          Apply list
        </button>
      </nav>
      <p role="status">{status}</p>
      <p>
        List rules: 1–10 items, names of 1–80 characters, quantities from 1–20.
      </p>
      <h2>Draft list</h2>
      <ul data-testid="draft-list">
        {draft?.items?.map((item, index) => (
          <li key={index}>
            {item.quantity} × {item.name}
          </li>
        ))}
      </ul>
      <h2>Applied list</h2>
      <ul data-testid="applied-list">
        {applied?.items.map((item, index) => (
          <li key={index}>
            {item.quantity} × {item.name}
          </li>
        ))}
      </ul>
      <p>
        The applied list is saved only in this component. Refreshing clears it.
      </p>
    </main>
  );
}
```

</hb-code-example>

</hb-expander>

## Read the typed content

The latest assistant message carries the parsed response in `content`. Before a response is available, there may be no assistant message. During generation, the list can grow as item names and quantities resolve, even before an item’s closing brace arrives. These values are a preview of the response.

Keep the **Draft list** separate from the **Applied list**. Showing generated data is useful feedback; it does not mean the run has finished or the user has accepted it.

<img src="/video/docs/structured-form-result.png" alt="The draft contains two apples and one loaf of bread. After explicit review and Apply list, the same items appear in the separate applied list." width="920" height="564" loading="lazy" />

## Apply a completed result

**Apply list** becomes available only for a new, completed draft that passes our validation. The handler checks again before copying its items into application state. Starting another generation or selecting **Cancel** makes the draft ineligible immediately, including while the request is waiting to send.

A failed request keeps the previously applied list. A cancelled request cannot be applied, even if it already displayed items. A replacement request without a new assistant answer cannot reuse the previous draft.

This example updates local component state. It does not buy anything, write to a server, or save across a refresh. Validate and authorize any real server write separately.

## Keep the endpoint schema intact

Hashbrown sends the response schema in `RunAgentInput.forwardedProps.hashbrown.responseSchema`. The [provider adapter](/docs/react/start/platforms) uses it to request the appropriate output from its model, while the client parses the streamed text events.

If you customize the endpoint, preserve the response schema for this feature. The [secured text-only endpoint example](/docs/react/recipes/public-endpoint) deliberately removes browser-supplied schemas as part of its different policy; adapt that policy explicitly for structured data or UI. Hashbrown does not add an `output` tool to request structured output.

## When the draft is not usable

| What we see                          | What to do                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| A request error                      | Check the endpoint, credentials and provider response in [Debugging](/docs/react/concept/debugging), then generate again. |
| A list outside the application rules | Make the request more specific, then generate another draft.                                                              |
| A cancelled run                      | Generate a fresh draft before applying.                                                                                   |
| No assistant answer                  | Inspect the endpoint events; a finished run alone does not supply a list.                                                 |

Skillet also accepts its supported Standard JSON Schema inputs. See [schema inputs and constraints](/docs/react/concept/schema) before substituting another schema library.

## Next steps

Continue with [Streaming](/docs/react/concept/streaming) to see why resolved item values appear progressively. Then use [Natural language forms](/docs/react/recipes/natural-language-to-structured-data) to connect review and validation to your application's form. For model-selected components, continue with [Exposing components](/docs/react/concept/components).
