import type { ResponseCreateParamsStreaming } from 'openai/resources/responses/responses';
import type {
  WorkbenchRequestSummary,
  WorkbenchTransformationTrace,
} from '../runtime/workbench-transformation';

/** Public workspace context owned by the canonical server, never supplied by the browser. */
export const workbenchTransformContext = Object.freeze({
  workspace: 'canonical-docs',
  policy:
    'Workspace canonical-docs: propose a concise two-step plan using only the trusted SummaryCard and readContext tool. A proposal never changes application state; the user must explicitly accept it.',
});

/** Adds public server-owned instructions without changing any other mapped request field. */
export async function transformWorkbenchRequest(
  options: ResponseCreateParamsStreaming,
  context: typeof workbenchTransformContext,
): Promise<ResponseCreateParamsStreaming> {
  return {
    ...options,
    instructions: [options.instructions, context.policy]
      .filter(Boolean)
      .join('\n\n'),
  };
}

/** Selects only public mapped request fields appropriate for the browser inspector. */
export function summarizeWorkbenchRequest(
  options: ResponseCreateParamsStreaming,
): WorkbenchRequestSummary {
  return {
    model: options.model ?? null,
    instructions: options.instructions ?? null,
    toolNames: (options.tools ?? []).map((tool) =>
      'name' in tool ? tool.name : tool.type,
    ),
    responseFormat: structuredClone(options.text?.format ?? null),
    store: options.store,
    include: options.include ? [...options.include] : options.include,
    maxOutputTokens: options.max_output_tokens,
  };
}

/** Records preservation of the actual mapped fields around the server transform. */
export function traceWorkbenchTransformation(
  before: ResponseCreateParamsStreaming,
  after: ResponseCreateParamsStreaming,
): WorkbenchTransformationTrace {
  return {
    before: summarizeWorkbenchRequest(before),
    after: summarizeWorkbenchRequest(after),
    preserved: Object.fromEntries(
      [
        'model',
        'tools',
        'text',
        'store',
        'include',
        'reasoning',
        'max_output_tokens',
        'input',
      ].map((key) => [
        key,
        JSON.stringify(before[key as keyof typeof before]) ===
          JSON.stringify(after[key as keyof typeof after]),
      ]),
    ),
  };
}
