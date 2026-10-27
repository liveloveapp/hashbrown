import type { RunAgentInput } from '@ag-ui/core';
import type { ResponseCreateParamsStreaming } from 'openai/resources/responses/responses';
import { isWorkbenchPlan } from '../runtime/workbench';
import type { WorkbenchLessonId } from '../runtime/workbench-lessons';

function validContext(content: string): boolean {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const context = value as Record<string, unknown>;
    return (
      Object.keys(context).every(
        (key) => key === 'revision' || key === 'plan',
      ) &&
      Number.isSafeInteger(context['revision']) &&
      Number(context['revision']) >= 0 &&
      (context['plan'] === null || isWorkbenchPlan(context['plan']))
    );
  } catch {
    return false;
  }
}

function hasCurrentContext(input: RunAgentInput): boolean {
  const latestUser = input.messages.reduce(
    (latest, message, index) => (message.role === 'user' ? index : latest),
    -1,
  );
  if (latestUser < 0) return false;
  const calls = new Set<string>();
  for (const message of input.messages.slice(latestUser + 1)) {
    if (message.role === 'assistant') {
      for (const call of message.toolCalls ?? []) {
        if (call.type === 'function' && call.function.name === 'readContext')
          calls.add(call.id);
      }
    }
    if (
      message.role === 'tool' &&
      calls.has(message.toolCallId) &&
      message.error === undefined &&
      typeof message.content === 'string' &&
      validContext(message.content)
    )
      return true;
  }
  return false;
}

/** Requires a real current-turn context read before UI generation, preserving all other mapped provider options. */
export function applyWorkbenchUiToolPolicy(
  options: ResponseCreateParamsStreaming,
  input: RunAgentInput,
  lessonId?: WorkbenchLessonId,
): ResponseCreateParamsStreaming {
  if (lessonId !== 'ui-kits' && lessonId !== 'ui-chatbot') return options;
  return {
    ...options,
    tool_choice: hasCurrentContext(input)
      ? 'none'
      : { type: 'function', name: 'readContext' },
    parallel_tool_calls: false,
  };
}
