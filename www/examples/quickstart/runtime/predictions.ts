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
