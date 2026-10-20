import type OpenAI from 'openai';
import { mapInput } from './openai-input';
import { type OpenAIReasoningOption, resolveReasoning } from './reasoning';
import type { OpenAIHashbrownRunAgentInput } from './types';

/**
 * Builds the stateless, streaming Responses API request for an AG-UI run.
 *
 * Tools become strict function tools, `responseSchema` becomes
 * `text.format`, and `reasoning` (with encrypted reasoning content) is sent
 * only when it resolves for the model. Optional keys are omitted entirely.
 *
 * @param input - The AG-UI run input.
 * @param model - The model or deployment name.
 * @param reasoning - The developer-provided reasoning option, if any.
 */
export function createOpenAIRequestOptions(
  input: OpenAIHashbrownRunAgentInput,
  model: string,
  reasoning: OpenAIReasoningOption | undefined,
): OpenAI.Responses.ResponseCreateParamsStreaming {
  const resolvedReasoning = resolveReasoning(model, reasoning);
  const responseSchema = input.forwardedProps?.hashbrown?.responseSchema;

  return {
    stream: true,
    model,
    store: false,
    input: mapInput(input.messages),
    ...(input.tools.length > 0
      ? {
          tools: input.tools.map((tool): OpenAI.Responses.FunctionTool => ({
            type: 'function',
            name: tool.name,
            description: tool.description,
            parameters:
              tool.parameters === undefined
                ? null
                : (structuredClone(tool.parameters) as Record<string, unknown>),
            strict: true,
          })),
        }
      : {}),
    ...(responseSchema
      ? {
          text: {
            format: {
              type: 'json_schema' as const,
              name: 'schema',
              schema: structuredClone(responseSchema) as Record<
                string,
                unknown
              >,
              strict: true,
            },
          },
        }
      : {}),
    ...(resolvedReasoning
      ? {
          reasoning: resolvedReasoning,
          include: ['reasoning.encrypted_content' as const],
        }
      : {}),
  };
}
