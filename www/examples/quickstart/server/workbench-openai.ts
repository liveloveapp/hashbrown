import {
  traceWorkbenchInstructions,
  type WorkbenchInstructionsTrace,
} from '../runtime/workbench-onboarding';
import type { AGUIEvent, RunAgentInput } from '@ag-ui/core';
import { EventType } from '@ag-ui/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import type { WorkbenchLessonId } from '../runtime/workbench-lessons';
import type { WorkbenchTransformationTrace } from '../runtime/workbench-transformation';
import {
  traceWorkbenchTransformation,
  transformWorkbenchRequest,
  workbenchTransformContext,
} from './workbench-transform';

/** Builds the shared real adapter boundary used by the local host and live verifier. */
export function createWorkbenchOpenAIStream(options: {
  readonly apiKey: string;
  readonly model: string;
  readonly baseURL?: string;
}) {
  return async function* (
    input: RunAgentInput,
    signal: AbortSignal,
    lessonId?: WorkbenchLessonId,
  ): AsyncIterable<AGUIEvent> {
    let trace: WorkbenchTransformationTrace | undefined;
    let instructions: WorkbenchInstructionsTrace | undefined;
    const events = HashbrownOpenAI.stream.text({
      ...options,
      input,
      signal,
      transformRequestOptions: async (mapped) => {
        const before = { ...mapped, max_output_tokens: 2048 };
        if (lessonId === 'system-instructions')
          instructions = traceWorkbenchInstructions(mapped);
        if (lessonId !== 'request-transformation') return before;
        const after = await transformWorkbenchRequest(
          before,
          workbenchTransformContext,
        );
        trace = traceWorkbenchTransformation(before, after);
        return after;
      },
    });
    const iterator = events[Symbol.asyncIterator]();
    try {
      while (!signal.aborted) {
        const next = await iterator.next();
        if (signal.aborted) break;
        if (instructions) {
          const value = instructions;
          instructions = undefined;
          yield {
            type: EventType.CUSTOM,
            name: 'workbench.system-instructions',
            value,
          };
          if (signal.aborted) break;
        }
        if (trace) {
          const value = trace;
          trace = undefined;
          yield {
            type: EventType.CUSTOM,
            name: 'workbench.request-transformation',
            value,
          };
          if (signal.aborted) break;
        }
        if (next.done) break;
        yield next.value;
      }
    } finally {
      await iterator.return?.();
    }
  };
}
