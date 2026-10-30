import { s } from '@hashbrownai/core';
import type { WorkbenchSnapshot } from './workbench';
import type { WorkbenchLesson } from './workbench-lessons';
import {
  workbenchActionLabels,
  workbenchPredictionsSchema,
  workbenchSelectionMinConfidence,
  workbenchSelectionOptions,
  workbenchSelectionSchema,
} from './workbench-recipes';

// Core-free so the timeline (and the capture publisher) can label events.
export { workbenchRecipeEventLabel } from './workbench-recipe-labels';

/** Checks visual availability against the same request, revision and terminal outcome as recipe writes. */
export function canUseWorkbenchRecipe(
  snapshot: WorkbenchSnapshot,
  messageId: string,
): boolean {
  if (
    snapshot.cursor !== null ||
    snapshot.status !== 'complete' ||
    snapshot.frame?.messages.at(-1)?.id !== messageId
  )
    return false;
  const origin = snapshot.events.find((event) =>
    event.messages.some(
      (message) => message.id === messageId && message.recipe,
    ),
  );
  if (
    !origin ||
    origin.turn !== snapshot.turn ||
    origin.application.revision !== snapshot.application.revision
  )
    return false;
  const terminal = [...snapshot.events]
    .reverse()
    .find((event) => event.turn === snapshot.turn && event.kind === 'complete');
  const payload = terminal?.payload;
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('finishReason' in payload) ||
    payload.finishReason !== 'stop'
  )
    return false;
  const recipe = snapshot.frame?.recipe;
  return (
    recipe?.kind === 'predictions' ||
    !!(
      recipe?.kind === 'selection' &&
      recipe.selected.length === 1 &&
      recipe.confidence >= workbenchSelectionMinConfidence
    )
  );
}

/** Lesson-specific inspector values, derived only from immutable captured data and app-owned contracts. */
export interface WorkbenchRecipeInspection {
  readonly heading: string;
  readonly value: unknown;
  readonly detailHeading: string;
  readonly detail: unknown;
}

/** Presents recipe contracts and observations while leaving requests, state and raw events in the shared shell. */
export function workbenchRecipeInspection(
  snapshot: WorkbenchSnapshot,
  format: WorkbenchLesson['format'] | undefined,
  tab: string,
): WorkbenchRecipeInspection | undefined {
  if (
    !['text', 'predictions', 'selection'].includes(format ?? '') ||
    ['Requests', 'State'].includes(tab)
  )
    return undefined;
  const frame = snapshot.frame;
  const recipe = frame?.recipe;
  if (format === 'text')
    return {
      heading: tab === 'UI' ? 'Magic Text renderer' : 'Streamed Markdown',
      value:
        tab === 'UI'
          ? {
              renderer: 'Magic Text',
              input: 'Assistant Markdown string',
              generatesComponentProps: false,
              source: 'The supplied documentation reference',
            }
          : frame?.json ||
            (recipe?.kind === 'text'
              ? recipe.markdown
              : 'Waiting for Markdown'),
      detailHeading: frame?.citation
        ? 'Selected reference'
        : 'Parser and request outcome',
      detail: frame?.citation ?? {
        isComplete: frame ? frame.status !== 'loading' : true,
        outcome: frame?.status ?? snapshot.status,
        note: 'Parser finalization does not prove that the request succeeded.',
      },
    };
  if (format === 'predictions')
    return {
      heading:
        tab === 'Schema'
          ? 'Suggestion contract'
          : tab === 'UI'
            ? 'Application action catalogue'
            : 'Current-context completion',
      value:
        tab === 'Schema'
          ? s.toJsonSchema(workbenchPredictionsSchema)
          : tab === 'UI'
            ? { catalogue: workbenchActionLabels, appliesAutomatically: false }
            : frame?.json || 'Waiting for completion JSON',
      detailHeading: 'Validated suggestions',
      detail:
        recipe?.kind === 'predictions'
          ? {
              contextId: recipe.contextId,
              suggestions: recipe.suggestions,
              dismissed: frame?.dismissedPredictions ?? [],
              accepted: frame?.application.acceptedActions ?? [],
              canApply:
                snapshot.cursor === null &&
                canUseWorkbenchRecipe(
                  snapshot,
                  frame?.messages.at(-1)?.id ?? '',
                ),
            }
          : null,
    };
  return {
    heading:
      tab === 'Schema'
        ? 'Candidate selection contract'
        : tab === 'UI'
          ? 'Application-owned candidates'
          : 'Whole UI decision',
    value:
      tab === 'Schema'
        ? s.toJsonSchema(workbenchSelectionSchema)
        : tab === 'UI'
          ? {
              candidates: workbenchSelectionOptions,
              plan: frame?.application.plan ?? snapshot.application.plan,
              generatedProps: false,
            }
          : frame?.json || 'Waiting for a complete decision',
    detailHeading: 'SDK selection and confidence',
    detail:
      recipe?.kind === 'selection'
        ? {
            selected: recipe.selected,
            confidence: recipe.confidence,
            minimumConfidence: workbenchSelectionMinConfidence,
            appliedView: frame?.application.selectedView ?? null,
            writesAutomatically: false,
          }
        : null,
  };
}

/** Reads dismissal at the selected cursor while retaining the original turn's presentation in live history. */
export function wasWorkbenchPredictionDismissed(
  snapshot: WorkbenchSnapshot,
  messageId: string,
  actionId: string,
): boolean {
  const visible = snapshot.events.slice(
    0,
    (snapshot.cursor ?? snapshot.events.length - 1) + 1,
  );
  const origin = visible.find((event) =>
    event.messages.some(
      (message) =>
        message.id === messageId && message.recipe?.kind === 'predictions',
    ),
  );
  return (
    !!origin &&
    visible.some(
      (event) =>
        event.turn === origin.turn &&
        event.kind === 'dismiss' &&
        !!event.payload &&
        typeof event.payload === 'object' &&
        'dismissed' in event.payload &&
        event.payload.dismissed === actionId,
    )
  );
}

/** Associates acceptance with its originating proposal rather than a later action sharing the same catalogue ID. */
export function wasWorkbenchPredictionAccepted(
  snapshot: WorkbenchSnapshot,
  messageId: string,
  actionId: string,
): boolean {
  const visible = snapshot.events.slice(
    0,
    (snapshot.cursor ?? snapshot.events.length - 1) + 1,
  );
  const origin = visible.find((event) =>
    event.messages.some(
      (message) =>
        message.id === messageId && message.recipe?.kind === 'predictions',
    ),
  );
  return (
    !!origin &&
    visible.some(
      (event) =>
        event.turn === origin.turn &&
        event.kind === 'choose' &&
        !!event.payload &&
        typeof event.payload === 'object' &&
        'actionId' in event.payload &&
        event.payload.actionId === actionId,
    )
  );
}
