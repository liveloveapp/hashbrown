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
