import type { Reasoning, ReasoningEffort } from 'openai/resources/shared';

/**
 * Controls the `reasoning` request parameter for Azure OpenAI reasoning models.
 *
 * - `false` sends no `reasoning` parameter.
 * - An object is sent as given; a missing `summary` defaults to `'auto'`.
 * - When omitted, reasoning models request `{ summary: 'auto' }` and other
 *   models send nothing. `effort` is never set unless provided here.
 *
 * @public
 */
export type AzureReasoningOption =
  | false
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
  if (option === undefined) {
    return isReasoningModel(model) ? { summary: 'auto' } : undefined;
  }

  return {
    ...option,
    summary: option.summary === undefined ? 'auto' : option.summary,
  };
}
