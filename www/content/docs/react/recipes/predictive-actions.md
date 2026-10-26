---
title: 'Predictive suggestions: Hashbrown React Docs'
meta:
  - name: description
    content: 'Suggest useful packing items from application context, then wait for the user to accept or dismiss each one.'
---

# Predictive suggestions

Let's help someone pack for a trip. They choose a city or hiking context, and the model suggests useful items. We display those suggestions beside the packing list. **Only Accept adds an item.**

<hb-docs-demo demo="predictive-suggestions">
</hb-docs-demo>

## Before we start

Use the endpoint and provider setup from the [Quickstart](/docs/react/start/quick). Read [Structured output](/docs/react/concept/structured-output) for the schema and validation pattern. Here we use `useStructuredCompletion()` to generate a new result when an explicit context snapshot changes.

Keep `runtime/predictions.ts` beside the `react` and `angular` directories below, or adjust the shared import to match your project. The endpoint is the Quickstart's `/api/chat`; this recipe needs no additional server route.

The recording runs the checked clients with scripted AG-UI responses and presentation styles. Both frameworks are verified; React supplies the capture. A live model can produce different suggestions. Accept and Dismiss change local state only, and refreshing clears the list.

## Give the model a small catalog

Our application owns four item names: Passport, Phone charger, Water bottle and Sunscreen. The model returns an `itemId` from that catalog and a short reason. It does not write a product name, call a purchase tool or change our list.

The response also echoes `contextId`. Each request gets a fresh ID, including repeated requests for the same trip type. That gives us a direct way to reject an answer from an earlier context.

The schema uses an ordinary `s.array`. We wait for the complete response before offering any action. A valid empty array means there are no new suggestions; it is a useful result, not an error.

<hb-code-example header="Response shape">

```json
{
  "contextId": "the-current-request-id",
  "suggestions": [
    { "itemId": "passport", "reason": "Keep your travel document close." }
  ]
}
```

</hb-code-example>

Matching a schema is only the first check. Our helper requires the current context, an idle successful run, at most four suggestions and reasons with 1–140 characters after trimming. It rejects an invalid response as a whole. It removes duplicates and items already packed or dismissed.

<hb-expander title="Complete runtime/predictions.ts">

<hb-code-example header="runtime/predictions.ts">

```ts
import { s } from '@hashbrownai/core';

/** Application-owned names for the only items the model may suggest. */
export const packingCatalog = {
  passport: 'Passport',
  charger: 'Phone charger',
  water: 'Water bottle',
  sunscreen: 'Sunscreen',
} as const;

/** A trusted packing catalog identifier. */
export type PackingItemId = keyof typeof packingCatalog;

/** One explicit context change, captured independently of later local edits. */
export interface PredictionInput {
  readonly contextId: string;
  readonly context: 'city' | 'hiking';
  readonly currentItemIds: readonly PackingItemId[];
}

/** Structured output remains a proposal until the application validates it. */
export const predictionsSchema = s.object(
  'Packing suggestions for one context',
  {
    contextId: s.string('Echo the input contextId exactly'),
    suggestions: s.array(
      'Zero to four useful items not already in currentItemIds',
      s.object('A proposed catalog item', {
        itemId: s.enumeration('An application-owned packing item ID', [
          'passport',
          'charger',
          'water',
          'sunscreen',
        ]),
        reason: s.string('A plain reason of 1–140 characters'),
      }),
    ),
  },
);

/** A validated suggestion with a trusted ID and a bounded plain-text reason. */
export type PackingSuggestion = s.Infer<
  typeof predictionsSchema
>['suggestions'][number];

/** Runtime and local state checked again at every Accept event. */
export interface PredictionRun {
  readonly input: PredictionInput | null;
  readonly output: unknown;
  readonly appliedItemIds: readonly PackingItemId[];
  readonly hiddenItemIds: readonly PackingItemId[];
  readonly cancelled: boolean;
  readonly isSending: boolean;
  readonly isReceiving: boolean;
  readonly isGenerating: boolean;
  readonly isLoading: boolean;
  readonly error?: unknown;
  readonly finishReason?: string;
}

/** Returns only settled, current, valid suggestions, independently of input data. */
export function getApplicableSuggestions(
  run: PredictionRun,
): PackingSuggestion[] | undefined {
  if (
    !run.input ||
    run.cancelled ||
    run.error ||
    run.isSending ||
    run.isReceiving ||
    run.isGenerating ||
    run.isLoading ||
    (run.finishReason !== undefined && run.finishReason !== 'stop')
  )
    return undefined;
  const output = run.output;
  // Compare the application context before trusting output, including during debounce.
  if (
    typeof output !== 'object' ||
    output === null ||
    !('contextId' in output) ||
    output.contextId !== run.input.contextId ||
    !('suggestions' in output) ||
    !Array.isArray(output.suggestions) ||
    output.suggestions.length > 4
  )
    return undefined;
  const validated: PackingSuggestion[] = [];
  for (const item of output.suggestions) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.itemId !== 'string' ||
      !Object.hasOwn(packingCatalog, item.itemId) ||
      typeof item.reason !== 'string'
    )
      return undefined;
    const reason = item.reason.trim();
    if (reason.length < 1 || reason.length > 140) return undefined;
    const itemId = item.itemId as PackingItemId;
    if (
      run.input.currentItemIds.includes(itemId) ||
      run.appliedItemIds.includes(itemId) ||
      run.hiddenItemIds.includes(itemId) ||
      validated.some((suggestion) => suggestion.itemId === itemId)
    )
      continue;
    validated.push({ itemId, reason });
  }
  return validated;
}

/** Revalidates an explicit choice and returns a new local packing list. */
export function acceptPrediction(
  run: PredictionRun,
  itemId: PackingItemId,
): PackingItemId[] | undefined {
  const suggestions = getApplicableSuggestions(run);
  if (!suggestions?.some((suggestion) => suggestion.itemId === itemId))
    return undefined;
  return [...run.appliedItemIds, itemId];
}
```

</hb-code-example>

</hb-expander>

## Capture context once per request

Choose **Suggest city items**. The component captures the trip type, a fresh `contextId` and a copy of the current item IDs. That input stays unchanged while we accept or dismiss suggestions.

This separation matters. If accepting an item changed the completion input automatically, every acceptance could trigger another model call. Instead, a new request starts only when we choose a context again. In your app, that explicit event might be a route change, an edited form or an opened panel. Debounce frequent changes and keep a stable snapshot between those events.

In `react/src/App.tsx`, import `PredictiveSuggestions` from `./PredictiveSuggestions` and render `<PredictiveSuggestions />`. Keep the configured `HashbrownProvider` in `react/src/main.tsx`.

<hb-expander title="Complete react/src/PredictiveSuggestions.tsx">

<hb-code-example header="react/src/PredictiveSuggestions.tsx">

```tsx
import { useRef, useState } from 'react';
import { useStructuredCompletion } from '@hashbrownai/react';
import {
  acceptPrediction,
  getApplicableSuggestions,
  packingCatalog,
  type PackingItemId,
  type PredictionInput,
  predictionsSchema,
} from '../../runtime/predictions';

/** Suggests trusted packing items after an explicit change of trip context. */
export function PredictiveSuggestions() {
  const [input, setInput] = useState<PredictionInput | null>(null);
  const [local, setLocal] = useState({
    cancelled: false,
    appliedItemIds: [] as PackingItemId[],
    hiddenItemIds: [] as PackingItemId[],
  });
  const current = useRef({ input, ...local });
  const completion = useStructuredCompletion({
    input,
    schema: predictionsSchema,
    system:
      'Suggest packing items for the supplied city or hiking context. Echo contextId exactly. Choose only catalog IDs passport, charger, water, sunscreen. Return zero to four items not in currentItemIds, each with a plain reason of 1–140 characters. An empty suggestions array is valid.',
  });
  const run = {
    input,
    ...local,
    output: completion.output,
    isSending: completion.isSending,
    isReceiving: completion.isReceiving,
    isGenerating: completion.isGenerating,
    isLoading: completion.isLoading,
    error: completion.error,
    finishReason: completion.lastRunFinishReason,
  };
  const suggestions = getApplicableSuggestions(run);
  const busy =
    run.isSending || run.isReceiving || run.isGenerating || run.isLoading;
  const status = local.cancelled
    ? 'Suggestions cancelled. Choose a context to try again.'
    : completion.error
      ? 'Could not generate suggestions. Choose a context to try again.'
      : busy
        ? 'Finding suggestions. Your packing list stays unchanged.'
        : completion.lastRunFinishReason &&
            completion.lastRunFinishReason !== 'stop'
          ? 'Generation ended before a complete result. Choose a context to try again.'
          : suggestions
            ? suggestions.length
              ? 'Suggestions ready. Accept or dismiss each item.'
              : 'No new suggestions. Choose a context to generate again.'
            : input
              ? 'Waiting for a complete valid result for this context. Choose a context to retry.'
              : 'Choose a trip context to request suggestions.';

  function suggest(context: PredictionInput['context']) {
    const nextInput: PredictionInput = {
      contextId: crypto.randomUUID(),
      context,
      currentItemIds: [...current.current.appliedItemIds],
    };
    const nextLocal = {
      cancelled: false,
      appliedItemIds: current.current.appliedItemIds,
      hiddenItemIds: [],
    };
    // Invalidate immediately, before effects submit the replacement input.
    current.current = { input: nextInput, ...nextLocal };
    if (busy) completion.stop();
    setLocal(nextLocal);
    setInput(nextInput);
  }

  function cancel() {
    const nextLocal = { ...current.current, cancelled: true };
    current.current = { ...nextLocal, input: null };
    setLocal({
      cancelled: true,
      appliedItemIds: nextLocal.appliedItemIds,
      hiddenItemIds: nextLocal.hiddenItemIds,
    });
    setInput(null);
    if (busy) completion.stop();
  }

  function accept(itemId: PackingItemId) {
    // Recheck fresh local state, including another Accept, Cancel or context click.
    const appliedItemIds = acceptPrediction(
      { ...run, ...current.current },
      itemId,
    );
    if (!appliedItemIds) return;
    const next = { ...current.current, appliedItemIds };
    current.current = next;
    setLocal({
      cancelled: next.cancelled,
      appliedItemIds,
      hiddenItemIds: next.hiddenItemIds,
    });
  }

  function dismiss(itemId: PackingItemId) {
    const fresh = getApplicableSuggestions({ ...run, ...current.current });
    if (!fresh?.some((suggestion) => suggestion.itemId === itemId)) return;
    const next = {
      ...current.current,
      hiddenItemIds: [...current.current.hiddenItemIds, itemId],
    };
    current.current = next;
    setLocal({
      cancelled: next.cancelled,
      appliedItemIds: next.appliedItemIds,
      hiddenItemIds: next.hiddenItemIds,
    });
  }

  return (
    <main>
      <h1>Suggest items for your packing list</h1>
      <nav aria-label="Trip context">
        <button type="button" onClick={() => suggest('city')}>
          Suggest city items
        </button>
        <button type="button" onClick={() => suggest('hiking')}>
          Suggest hiking items
        </button>
        <button
          type="button"
          disabled={!input || local.cancelled}
          onClick={cancel}
        >
          Cancel
        </button>
      </nav>
      <p role="status">{status}</p>
      <h2>Suggested items</h2>
      <ul data-testid="suggestions">
        {suggestions?.map((item) => (
          <li key={`${input?.contextId}:${item.itemId}`}>
            <strong>{packingCatalog[item.itemId]}</strong>: {item.reason}{' '}
            <button type="button" onClick={() => accept(item.itemId)}>
              Accept
            </button>{' '}
            <button type="button" onClick={() => dismiss(item.itemId)}>
              Dismiss
            </button>
          </li>
        ))}
      </ul>
      <h2>Packing list</h2>
      <ul data-testid="packing-list">
        {local.appliedItemIds.map((itemId) => (
          <li key={itemId}>{packingCatalog[itemId]}</li>
        ))}
      </ul>
      <p>
        Accept and Dismiss change only local state. Choose a context to request
        fresh suggestions. Refreshing clears your packing list.
      </p>
    </main>
  );
}
```

</hb-code-example>

</hb-expander>

## Review the suggestions

1. Choose **Suggest city items**. The status changes while the model works, and the packing list stays empty.
2. Wait for the completed suggestions. Choose **Accept** beside Passport; it appears in the separate packing list.
3. Choose **Dismiss** beside Phone charger. That suggestion disappears. Neither action starts another request.
4. Choose **Suggest hiking items** to request a new set using the current packing list. Accept Water bottle; Passport stays packed and Sunscreen remains a suggestion.

<img src="/video/docs/predictive-suggestions-result.png" alt="Passport and Water bottle appear in the packing list after explicit acceptance. Sunscreen remains a suggestion. Phone charger was dismissed; accepting or dismissing did not make another model request." width="920" height="424" loading="lazy" />

The names in both lists come from `packingCatalog`. The generated reason renders as plain text. We do not ask for a confidence percentage: a model-generated number is not a calibrated probability that an item is useful. The user can inspect the reason and decide.

## Recheck the choice when it happens

`acceptPrediction()` validates the current run again at the click. It compares the context and current list before returning a new array. A result that was acceptable when rendered can become stale before someone clicks it.

The React component keeps the latest event state in a ref so a second quick action sees the first change immediately. The Angular component reads signals at the event boundary. Both invalidate earlier output as soon as we choose a new context, before the replacement request begins.

**Cancel** invalidates the current context and stops an active completion. It preserves accepted items. A failure, known non-success finish reason, malformed output or missing response also leaves the packing list unchanged. Choose a context again to recover. Even complete-looking JSON is not actionable while the run is still generating or after it fails.

For a server-backed action, send the selected ID to your own endpoint and check authentication, authorization, current state and duplicate submissions there. The example's context check protects local interaction state; it does not authorize a purchase or reserve inventory.

## Next steps

Use [UI selection](/docs/react/recipes/ui-selection) when the model should choose a view with application-owned props. Use [Decisions](/docs/react/concept/decisions) for a bounded classification question, or the [`useStructuredCompletion` reference](/api/react/useStructuredCompletion) for the complete completion API.
