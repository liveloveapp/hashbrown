import type OpenAI from 'openai';
import { mapInput } from './openai-input';
import { type OpenAIReasoningOption, resolveReasoning } from './reasoning';
import type { OpenAIBuiltInTools, OpenAIHashbrownRunAgentInput } from './types';

/**
 * Builds the stateless, streaming Responses API request for an AG-UI run.
 *
 * Tools become strict function tools, `responseSchema` becomes
 * `text.format`, and `reasoning` (with encrypted reasoning content) is sent
 * only when it resolves for the model. Built-in tools are appended after the
 * function tools, and each one adds the `include` entries its steps need;
 * `include` merges with the reasoning include. Optional keys are omitted
 * entirely.
 *
 * @param input - The AG-UI run input.
 * @param model - The model or deployment name.
 * @param reasoning - The developer-provided reasoning option, if any.
 * @param builtInTools - The provider-run tools to turn on, if any.
 */
export function createOpenAIRequestOptions(
  input: OpenAIHashbrownRunAgentInput,
  model: string,
  reasoning: OpenAIReasoningOption | undefined,
  builtInTools?: OpenAIBuiltInTools,
): OpenAI.Responses.ResponseCreateParamsStreaming {
  const resolvedReasoning = resolveReasoning(model, reasoning);
  const responseSchema = input.forwardedProps?.hashbrown?.responseSchema;
  const webSearch = builtInTools?.webSearch;
  const codeExecution = builtInTools?.codeExecution;
  const functionTools = input.tools.map(
    (tool): OpenAI.Responses.FunctionTool => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters:
        tool.parameters === undefined
          ? null
          : (structuredClone(tool.parameters) as Record<string, unknown>),
      strict: true,
    }),
  );
  const tools: OpenAI.Responses.Tool[] = [
    ...functionTools,
    ...(webSearch
      ? [
          {
            type: 'web_search' as const,
            ...(webSearch === true ? {} : structuredClone(webSearch)),
          },
        ]
      : []),
    ...(codeExecution
      ? [
          {
            type: 'code_interpreter' as const,
            ...(codeExecution === true
              ? { container: { type: 'auto' as const } }
              : structuredClone(codeExecution)),
          },
        ]
      : []),
  ];
  const include: OpenAI.Responses.ResponseIncludable[] = [
    ...(resolvedReasoning ? (['reasoning.encrypted_content'] as const) : []),
    ...(webSearch ? (['web_search_call.action.sources'] as const) : []),
    ...(codeExecution ? (['code_interpreter_call.outputs'] as const) : []),
  ];

  return {
    stream: true,
    model,
    store: false,
    input: mapInput(input.messages),
    ...(tools.length > 0 ? { tools } : {}),
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
    ...(resolvedReasoning ? { reasoning: resolvedReasoning } : {}),
    ...(include.length > 0 ? { include } : {}),
  };
}
