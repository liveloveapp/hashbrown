---
title: 'Structured output: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Generate typed data, review the result, and apply it explicitly.'
---

# Structured output

Let's turn **“Add 2 apples and 1 loaf of bread”** into a shopping list. The model returns JSON with item names and quantities. Our application displays a draft, checks its rules, and waits for us to apply it.

<hb-docs-demo demo="structured-form">
</hb-docs-demo>

## Before we start

Use the endpoint and provider configuration from the [Quickstart](/docs/angular/start/quick). Read [Skillet schemas](/docs/angular/concept/schema) for the response shape. This example uses `structuredChatResource()` to request data that our own interface renders.

Keep `runtime/shopping-list.ts` beside the `react` and `angular` example directories. If you copy the files into your app, update the shared file import to match your layout.

## Describe the response

Our response has one `items` array. Each item has a string `name` and integer `quantity`. Hashbrown parses the model's response with this schema and exposes typed assistant content.

We use `s.streaming.array` around ordinary `s.object` items. That lets complete items appear before the whole list finishes. [Streaming](/docs/angular/concept/streaming) explains where to place the streaming markers.

The shared file also checks our application's rules: 1–10 items, names with 1–80 characters after trimming, and quantities from 1–20. A value can match the schema and still fail these rules. For example, zero is an integer, but it is not a useful quantity in this list.

<hb-expander title="Complete runtime/shopping-list.ts">

<hb-code-example header="runtime/shopping-list.ts">

```ts
import { s } from '@hashbrownai/core';

/** Streams complete shopping-list items while withholding unfinished objects. */
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

Create the component below, then connect it to your configured application. Import the standalone `StructuredList` component into your root component and render `<app-structured-list />`. Keep `provideHashbrown()` in your application configuration.

Enter the request and select **Generate draft**. The event handler sends one user message. Editing the input alone does not start a request, and rendering the component does not send one.

The example starts a fresh model conversation for each draft. We want each request to describe a replacement list; previous drafts are not additional instructions. Use a continuing structured chat when your feature needs follow-up turns.

<hb-expander title="Complete angular/src/app/structured-list.ts">

<hb-code-example header="angular/src/app/structured-list.ts">

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { structuredChatResource } from '@hashbrownai/angular';
import {
  getApplicableShoppingList,
  type ShoppingList,
  shoppingListSchema,
} from '../../../runtime/shopping-list';

/** Generates a reviewable draft and applies a validated copy to local state. */
@Component({
  selector: 'app-structured-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Turn a request into a shopping list</h1>
      <label for="shopping-request">Shopping request</label>
      <textarea
        id="shopping-request"
        [value]="prompt()"
        (input)="prompt.set($any($event.target).value)"
      ></textarea>
      <nav aria-label="Draft actions">
        <button
          type="button"
          [disabled]="!prompt().trim() || busy()"
          (click)="generate()"
        >
          Generate draft
        </button>
        <button
          type="button"
          [disabled]="!busy() || request()?.cancelled"
          (click)="cancel()"
        >
          Cancel
        </button>
        <button type="button" [disabled]="!candidate()" (click)="apply()">
          Apply list
        </button>
      </nav>
      <p role="status">{{ status() }}</p>
      <p>
        List rules: 1–10 items, names of 1–80 characters, quantities from 1–20.
      </p>
      <h2>Draft list</h2>
      <ul data-testid="draft-list">
        @for (item of draft()?.items ?? []; track $index) {
          <li>{{ item.quantity }} × {{ item.name }}</li>
        }
      </ul>
      <h2>Applied list</h2>
      <ul data-testid="applied-list">
        @for (item of applied()?.items ?? []; track $index) {
          <li>{{ item.quantity }} × {{ item.name }}</li>
        }
      </ul>
      <p>
        The applied list is saved only in this component. Refreshing clears it.
      </p>
    </main>
  `,
})
export class StructuredList {
  protected readonly prompt = signal('Add 2 apples and 1 loaf of bread.');
  protected readonly request = signal<
    { id: string; cancelled: boolean } | undefined
  >(undefined);
  protected readonly applied = signal<ShoppingList | undefined>(undefined);
  private readonly chat = structuredChatResource({
    schema: shoppingListSchema,
    system:
      'Turn the request into a shopping list. Use 1–10 items, names of 1–80 characters, and integer quantities from 1–20.',
  });
  protected readonly busy = computed(
    () => this.chat.isSending() || this.chat.isLoading(),
  );
  protected readonly draft = computed(
    () => this.chat.lastAssistantMessage()?.content,
  );
  protected readonly candidate = computed(() =>
    getApplicableShoppingList(this.run()),
  );
  protected readonly status = computed(() => {
    if (this.request()?.cancelled)
      return 'Generation cancelled. Generate another draft to continue.';
    if (this.chat.error())
      return 'Could not generate a valid draft. Try generating again.';
    if (this.busy())
      return 'Generating draft. Complete items appear as they arrive.';
    if (
      this.chat.lastRunFinishReason() &&
      this.chat.lastRunFinishReason() !== 'stop'
    )
      return 'Generation ended before a complete draft. Generate another draft.';
    if (this.candidate())
      return 'Draft ready. Review the items, then apply the list.';
    if (this.request())
      return 'Draft does not meet the list rules. Generate another draft.';
    return 'Describe your list, then generate a draft.';
  });

  protected generate(): void {
    const next = { id: crypto.randomUUID(), cancelled: false };
    this.request.set(next);
    // This component generates independent lists, so each request replaces its history.
    this.chat.setMessages([
      { id: next.id, role: 'user', content: this.prompt() },
    ]);
  }

  protected cancel(): void {
    const request = this.request();
    if (!request) return;
    this.request.set({ ...request, cancelled: true });
    this.chat.stop();
  }

  protected apply(): void {
    // Revalidate at the event boundary, after any synchronous Generate or Cancel.
    const list = getApplicableShoppingList(this.run());
    if (list) this.applied.set(list);
  }

  private run() {
    return {
      requestId: this.request()?.id,
      cancelled: this.request()?.cancelled ?? false,
      messages: this.chat.error() ? [] : this.chat.value(),
      isSending: this.chat.isSending(),
      isReceiving: this.chat.isReceiving(),
      isGenerating: this.chat.isGenerating(),
      isLoading: this.chat.isLoading(),
      error: this.chat.error(),
      finishReason: this.chat.lastRunFinishReason(),
    };
  }
}
```

</hb-code-example>

</hb-expander>

## Read the typed content

The latest assistant message carries the parsed response in `content`. Before a response is available, there may be no assistant message. During generation, the list can grow as complete items arrive.

Keep the **Draft list** separate from the **Applied list**. Showing generated data is useful feedback; it does not mean the run has finished or the user has accepted it.

<img src="/video/docs/structured-form-result.png" alt="The draft contains two apples and one loaf of bread. After explicit review and Apply list, the same items appear in the separate applied list." width="920" height="564" loading="lazy" />

## Apply a completed result

**Apply list** becomes available only for a new, completed draft that passes our validation. The handler checks again before copying its items into application state. Starting another generation or selecting **Cancel** makes the draft ineligible immediately, including while the request is waiting to send.

A failed request keeps the previously applied list. A cancelled request cannot be applied, even if it already displayed complete items. A replacement request without a new assistant answer cannot reuse the previous draft.

This example updates local component state. It does not buy anything, write to a server, or save across a refresh. Validate and authorize any real server write separately.

## Keep the endpoint schema intact

Hashbrown sends the response schema in `RunAgentInput.forwardedProps.hashbrown.responseSchema`. The [provider adapter](/docs/angular/start/platforms) uses it to request the appropriate output from its model, while the client parses the streamed text events.

If you customize the endpoint, preserve the response schema for this feature. The [secured text-only endpoint example](/docs/angular/recipes/public-endpoint) deliberately removes browser-supplied schemas as part of its different policy; adapt that policy explicitly for structured data or UI. Hashbrown does not add an `output` tool to request structured output.

## When the draft is not usable

| What we see                          | What to do                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| A request error                      | Check the endpoint, credentials and provider response in [Debugging](/docs/angular/concept/debugging), then generate again. |
| A list outside the application rules | Make the request more specific, then generate another draft.                                                                |
| A cancelled run                      | Generate a fresh draft before applying.                                                                                     |
| No assistant answer                  | Inspect the endpoint events; a finished run alone does not supply a list.                                                   |

Skillet also accepts its supported Standard JSON Schema inputs. See [schema inputs and constraints](/docs/angular/concept/schema) before substituting another schema library.

## Next steps

Continue with [Streaming](/docs/angular/concept/streaming) to see why completed items appear progressively. Then use [Natural language forms](/docs/angular/recipes/natural-language-to-structured-data) to connect review and validation to your application's form. For model-selected components, continue with [Exposing components](/docs/angular/concept/components).
