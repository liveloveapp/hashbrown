import type { Reasoning, ReasoningEffort } from 'openai/resources/shared';

/**
 * Controls the `reasoning` request parameter for Azure OpenAI reasoning models.
 *
 * - `true` marks the deployment as a reasoning model, whatever its name, and
 *   requests `{ summary: 'auto' }` with encrypted reasoning content.
 * - `false` sends no `reasoning` parameter.
 * - An object is sent as given; a missing `summary` defaults to `'auto'`.
 * - When omitted, Hashbrown guesses from the deployment name: names that
 *   start with `o` and a digit or `gpt-5` or later, other than `-chat`
 *   variants, request `{ summary: 'auto' }` and others send nothing. A deployment name need not
 *   reveal its model, so set this option for a reasoning deployment whose name
 *   does not match. `effort` is never set unless provided here.
 *
 * @public
 */
export type AzureReasoningOption =
  | boolean
  | {
      effort?: ReasoningEffort;
      summary?: 'auto' | 'concise' | 'detailed' | null;
    };

const REASONING_MODEL = /^(o\d|gpt-(?:[5-9]|\d{2,})(?!\d))/i;
const CHAT_MODEL = /-chat(?:-|$)/i;

/**
 * Whether a model name denotes an Azure OpenAI reasoning model: `o` followed by a
 * digit, or `gpt-` with a major version of 5 or later (case-insensitive).
 * `-chat` variants such as `gpt-5-chat-latest` are not reasoning models.
 *
 * @param model - The model or deployment name.
 */
export function isReasoningModel(model: string): boolean {
  return REASONING_MODEL.test(model) && !CHAT_MODEL.test(model);
}

/**
 * Resolves the `reasoning` request parameter for a model and option.
 *
 * @param model - The model or deployment name.
 * @param option - The developer-provided reasoning option, if any.
 * @returns The `reasoning` parameter to send, or `undefined` to send none.
 */
export function resolveReasoning(
  model: string,
  option: AzureReasoningOption | undefined,
): Reasoning | undefined {
  if (option === false) return undefined;
  if (option === true) return { summary: 'auto' };
  if (option === undefined) {
    return isReasoningModel(model) ? { summary: 'auto' } : undefined;
  }

  return {
    ...option,
    summary: option.summary === undefined ? 'auto' : option.summary,
  };
}
