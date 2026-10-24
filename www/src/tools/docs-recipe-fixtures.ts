import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import type { Decision } from '@hashbrownai/core';

/** Deterministic endings and validation cases for the recipe browser checks. */
export type RecipeOutcome =
  | 'success'
  | 'failed'
  | 'partial'
  | 'truncated'
  | 'empty'
  | 'no-answer'
  | 'invalid'
  | 'duplicates'
  | 'stale'
  | 'malformed'
  | 'unsafe';

/** A short authored response, streamed through the real Magic Text renderers. */
export const magicMarkdown =
  '## A small packing list\n\nBring **a passport** and a charger.\n\n- Passport\n- Charger\n\nSee setup details[^docs].\n\n[^docs]: Hashbrown docs https://hashbrown.dev';

/** Streams scripted text with explicit run lifecycle events and provider metadata. */
export function createRecipeTextEvents(
  input: RunAgentInput,
  text: string,
  outcome: RecipeOutcome,
): AGUIEvent[] {
  const start: AGUIEvent = {
    type: EventType.RUN_STARTED,
    threadId: input.threadId,
    runId: input.runId,
  };
  const finish: AGUIEvent = {
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
    ...(outcome === 'truncated'
      ? { metadata: { hashbrown: { finishReason: 'length' } } }
      : {}),
  };
  if (outcome === 'no-answer') return [start, finish];
  const messageId = `${input.runId}:reply`;
  const content =
    outcome === 'partial' ? text.slice(0, Math.ceil(text.length / 2)) : text;
  return [
    start,
    { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' },
    ...Array.from(content.match(/.{1,24}/gs) ?? [], (delta): AGUIEvent => ({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta,
    })),
    { type: EventType.TEXT_MESSAGE_END, messageId },
    outcome === 'failed' || outcome === 'partial'
      ? {
          type: EventType.RUN_ERROR,
          message: 'The scripted response failed before completion.',
        }
      : finish,
  ];
}

/** Echoes the actual completion snapshot so stale-result checks use real identities. */
export function createPredictionEvents(
  input: RunAgentInput,
  outcome: RecipeOutcome,
): AGUIEvent[] {
  const user = [...input.messages]
    .reverse()
    .find((message) => message.role === 'user');
  if (typeof user?.content !== 'string')
    throw new Error('Expected a JSON completion input');
  const snapshot = JSON.parse(user.content) as {
    contextId: string;
    context: string;
  };
  if (typeof snapshot.contextId !== 'string')
    throw new Error('Missing prediction context identity');
  const items =
    snapshot.context === 'hiking'
      ? ['water', 'sunscreen']
      : ['passport', 'charger'];
  const reasons: Record<string, string> = {
    passport: 'Keep your travel document ready.',
    charger: 'Keep your phone charged on the trip.',
    water: 'Bring water for the trail.',
    sunscreen: 'Plan for time outdoors.',
  };
  const suggestions =
    outcome === 'empty'
      ? []
      : items.map((itemId) => ({
          itemId,
          reason: outcome === 'invalid' ? '' : reasons[itemId],
        }));
  const output =
    outcome === 'malformed'
      ? {
          contextId: snapshot.contextId,
          suggestions: [{ itemId: 'unknown', reason: 'Not in the catalog.' }],
        }
      : {
          contextId:
            outcome === 'stale' ? 'an-old-context' : snapshot.contextId,
          suggestions:
            outcome === 'duplicates'
              ? [suggestions[0], suggestions[0], suggestions[1]]
              : suggestions,
        };
  return createRecipeTextEvents(input, JSON.stringify(output), outcome);
}

/** Returns the protocol response for the client's real compiled choice question. */
export function createSelectionResponse(
  request: Decision.Request,
  pick: string,
  confidence: number,
): Decision.Response {
  const entries = Object.entries(request.questions);
  if (entries.length !== 1 || entries[0][1].type !== 'choice')
    throw new Error('Expected one compiled choice question');
  const [id, question] = entries[0];
  if (question.type !== 'choice' || !Object.hasOwn(question.options, pick))
    throw new Error('Unknown fixture candidate');
  const ids = Object.keys(question.options);
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: { [id]: pick },
    meta: {
      [id]: {
        confidence,
        probabilities: Object.fromEntries(
          ids.map((option) => [
            option,
            option === pick ? confidence : (1 - confidence) / (ids.length - 1),
          ]),
        ),
      },
    },
  };
}
