import { createSelectionSchema, s } from '@hashbrownai/core';

/** Application-owned actions available to predictions and decisions. */
export type WorkbenchActionId = 'record' | 'review' | 'clarify';
/** Application-owned candidate view identifier. */
export type WorkbenchViewId = 'summary' | 'steps';
/** The actual SDK reference-selection callback, normalized for capture. */
export interface WorkbenchCitation {
  readonly id: string;
  readonly number: number;
  readonly url: string;
}
/** A bounded proposal for one application action. */
export interface WorkbenchPrediction {
  readonly actionId: WorkbenchActionId;
  readonly reason: string;
}
/** A structured completion for one explicit application context. */
export interface WorkbenchPredictions {
  readonly contextId: string;
  readonly suggestions: readonly WorkbenchPrediction[];
}
/** Immutable, framework-independent observations of the three recipe SDKs. */
export type WorkbenchRecipe =
  | { readonly kind: 'text'; readonly markdown: string }
  | {
      readonly kind: 'predictions';
      readonly contextId: string;
      readonly suggestions: readonly WorkbenchPrediction[];
    }
  | {
      readonly kind: 'selection';
      readonly selected: readonly WorkbenchViewId[];
      readonly confidence: number;
    };
/** Public labels for the app-owned action catalogue. */
export const workbenchActionLabels: Readonly<
  Record<WorkbenchActionId, string>
> = {
  record: 'Record the demo',
  review: 'Review the demo',
  clarify: 'Clarify progress',
};
/** Candidate contracts; implementations and plan props remain application-owned. */
export const workbenchSelectionOptions = [
  {
    id: 'summary',
    description:
      'Show the plan title and a brief overview of the two-step plan.',
  },
  {
    id: 'steps',
    description: 'Show the plan as an ordered list of its two steps.',
  },
] as const;
/** The same single-candidate questions used by both framework SDKs and the provider. */
export const workbenchSelectionSchema = createSelectionSchema(
  workbenchSelectionOptions,
  'one',
);
/** Minimum confidence required for explicitly applying a model-selected view. */
export const workbenchSelectionMinConfidence = 0.75;
/** Public documentation reference supplied directly by the app, without retrieval claims. */
export const workbenchMarkdownSource = 'https://hashbrown.dev';
/** Server-owned text policy, using the genuine chat protocol and browser context tool. */
export const workbenchTextSystem = `Before every answer call readContext exactly once. Explain the application-owned two-step plan in bounded Markdown: a heading, emphasis, and exactly two list items. End with the sentence "Read the supplied docs[^1]." so the inline citation is present. After a blank line, include exactly this footnote definition: [^1]: ${workbenchMarkdownSource}. Keep the first explanation under 120 words. On follow-up shorten it under 70 words while retaining the supplied citation. Do not claim retrieval, citation correctness, or application changes.`;
/** Server-owned completion policy; current input is an application snapshot, not chat history. */
export const workbenchPredictionsSystem =
  'Return the input contextId and zero to three unique catalogue action IDs record, review, clarify with concise nonempty reasons of at most 140 characters. Suggest record when the outline is ready, review when the demo is recorded, clarify when progress is unclear. Exclude all acceptedActions. Suggestions never apply actions. Do not call tools.';
/** Server-owned candidate-selection policy. */
export const workbenchSelectionSystem =
  'Choose summary for an overview and steps for an ordered list of the application-owned two-step plan. Choose only a supplied candidate. Selection does not apply the view; the user explicitly chooses it.';
/** Structured completion schema; application validation enforces bounds and uniqueness. */
export const workbenchPredictionsSchema = s.object(
  'Current-context predictive suggestions',
  {
    contextId: s.string('Copy the current input contextId exactly'),
    suggestions: s.array(
      'Zero to three unique suggestions excluding accepted actions',
      s.object('A catalogue action proposal', {
        actionId: s.enumeration('Application action', workbenchActionLabels),
        reason: s.string('Nonempty concise reason, at most 140 characters'),
      }),
    ),
  },
);
/** Explicit first and follow-up prompts used by both framework recipe clients. */
export const workbenchRecipePrompts = {
  'prose': [
    'Explain the current plan with a documentation citation.',
    'Make the explanation shorter.',
  ],
  predictions: [
    'The outline is ready. Suggest the next useful action.',
    'The demo is recorded. Suggest the next action, excluding accepted actions.',
  ],
  'ui-selection': [
    'Show an overview of the plan.',
    'Show the plan as ordered steps.',
  ],
} as const;
/** Validates the bounded prediction contract before any application write. */
export function isWorkbenchPredictions(
  value: unknown,
): value is WorkbenchPredictions {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw['contextId'] !== 'string' ||
    !raw['contextId'].trim() ||
    raw['contextId'].length > 100 ||
    !Array.isArray(raw['suggestions']) ||
    raw['suggestions'].length > 3
  )
    return false;
  const seen = new Set<string>();
  return raw['suggestions'].every((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const proposal = item as Record<string, unknown>;
    const id = proposal['actionId'];
    if (
      typeof id !== 'string' ||
      !Object.hasOwn(workbenchActionLabels, id) ||
      seen.has(id) ||
      typeof proposal['reason'] !== 'string' ||
      !proposal['reason'].trim() ||
      proposal['reason'].length > 140
    )
      return false;
    seen.add(id);
    return true;
  });
}
/** Validates plain recipe observations, never accepting framework elements or runtime objects. */
export function isWorkbenchRecipe(value: unknown): value is WorkbenchRecipe {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;
  if (raw['kind'] === 'text')
    return (
      typeof raw['markdown'] === 'string' && raw['markdown'].length <= 128_000
    );
  if (raw['kind'] === 'predictions') return isWorkbenchPredictions(value);
  return (
    raw['kind'] === 'selection' &&
    Array.isArray(raw['selected']) &&
    raw['selected'].length <= 1 &&
    raw['selected'].every(
      (id: unknown) => id === 'summary' || id === 'steps',
    ) &&
    typeof raw['confidence'] === 'number' &&
    Number.isFinite(raw['confidence']) &&
    raw['confidence'] >= 0 &&
    raw['confidence'] <= 1
  );
}
