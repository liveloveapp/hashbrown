import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  ɵbuiltInToolLabel,
  ɵTOOL_STEP_METADATA_KEY,
  type ɵToolStep,
  type ɵToolStepSource,
} from '@hashbrownai/core';
import type OpenAI from 'openai';

type CodeItem = OpenAI.Responses.ResponseCodeInterpreterToolCall;
type StreamEvent = OpenAI.Responses.ResponseStreamEvent;
const PROVIDER = 'openai';

/** Immutable argument and result lifecycle for one provider execution. */
export interface CodeExecutionState {
  readonly startedAt: number;
  readonly code: string;
  readonly hasCode: boolean;
  readonly ended: boolean;
  /** Canonical signature of the last emitted JSON result. */
  readonly result?: string;
  readonly settledAt?: number;
}

/** A provider-local execution transition and its AG-UI frames. */
export interface CodeExecutionStep {
  readonly calls: ReadonlyMap<string, CodeExecutionState>;
  readonly events: readonly AGUIEvent[];
}

function step(
  status: 'running' | 'completed' | 'failed',
  startedAt: number,
  fields: Partial<ɵToolStep> = {},
): ɵToolStep {
  return {
    v: 1,
    kind: 'provider',
    provider: PROVIDER,
    builtin: 'code_execution',
    status,
    icon: 'run',
    label: ɵbuiltInToolLabel('code_execution', status, {}),
    startedAt,
    ...fields,
  };
}

function start(
  calls: ReadonlyMap<string, CodeExecutionState>,
  id: string,
  messageId: string,
): CodeExecutionStep {
  if (calls.has(id)) return { calls, events: [] };
  const startedAt = Date.now();
  return {
    calls: new Map(calls).set(id, {
      startedAt,
      code: '',
      hasCode: false,
      ended: false,
    }),
    events: [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: id,
        toolCallName: 'code_interpreter',
        parentMessageId: messageId,
        metadata: {
          [PROVIDER]: { itemId: id, itemType: 'code_interpreter_call' },
          [ɵTOOL_STEP_METADATA_KEY]: step('running', startedAt),
        },
      },
    ],
  };
}

function append(
  previous: CodeExecutionStep,
  id: string,
  code: string,
): CodeExecutionStep {
  const call = previous.calls.get(id);
  if (!call || call.ended || !code) return previous;
  const delta = `${call.hasCode ? '' : '{"code":"'}${JSON.stringify(code).slice(1, -1)}`;
  return {
    calls: new Map(previous.calls).set(id, {
      ...call,
      hasCode: true,
      code: call.code + code,
    }),
    events: [
      ...previous.events,
      { type: EventType.TOOL_CALL_ARGS, toolCallId: id, delta },
    ],
  };
}

function finalize(
  previous: CodeExecutionStep,
  id: string,
  code: string | null,
): CodeExecutionStep {
  const call = previous.calls.get(id);
  if (!call) return previous;
  if (
    code !== null &&
    (!code.startsWith(call.code) || (call.ended && code !== call.code))
  ) {
    throw new Error('Code execution protocol error');
  }
  if (call.ended) return previous;
  const next =
    code === null
      ? previous
      : append(previous, id, code.slice(call.code.length));
  const updated = next.calls.get(id) ?? call;
  // Empty native code is still known code, whereas null is unavailable.
  const closing = updated.hasCode ? '"}' : code === null ? '{}' : '{"code":""}';
  return {
    calls: new Map(next.calls).set(id, {
      ...updated,
      hasCode: updated.hasCode || code !== null,
      ended: true,
    }),
    events: [
      ...next.events,
      { type: EventType.TOOL_CALL_ARGS, toolCallId: id, delta: closing },
      { type: EventType.TOOL_CALL_END, toolCallId: id },
    ],
  };
}

function imageSources(item: CodeItem): ɵToolStepSource[] {
  return (item.outputs ?? []).flatMap((output, index) => {
    if (output.type !== 'image') return [];
    try {
      const url = new URL(output.url);
      return url.protocol === 'https:' || url.protocol === 'http:'
        ? [
            {
              id: `${item.id}:image:${index}`,
              kind: 'url' as const,
              title: output.url,
              href: output.url,
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
}

/** Compares wire JSON by value without changing output or native extensions. */
function resultSignature(content: string): string {
  const value: unknown = JSON.parse(content);
  return JSON.stringify(value, (_key: string, entry: unknown) =>
    entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : entry,
  );
}

function authoritative(
  previous: CodeExecutionStep,
  item: CodeItem,
): CodeExecutionStep {
  if (!['completed', 'failed', 'incomplete'].includes(item.status))
    return previous;
  const next = finalize(previous, item.id, item.code);
  const call = next.calls.get(item.id);
  if (!call) return next;
  const status = item.status === 'completed' ? 'completed' : 'failed';
  const error =
    status === 'failed'
      ? {
          message:
            item.status === 'incomplete'
              ? 'Code execution incomplete'
              : 'Code execution failed',
        }
      : undefined;
  const content = JSON.stringify({ ...item, ...(error ? { error } : {}) });
  const signature = resultSignature(content);
  if (call.result === signature) return next;
  const sources = imageSources(item);
  const settledAt = call.settledAt ?? Date.now();
  return {
    calls: new Map(next.calls).set(item.id, {
      ...call,
      result: signature,
      settledAt,
    }),
    events: [
      ...next.events,
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: item.id,
        messageId: `${item.id}:result`,
        content,
        metadata: {
          [ɵTOOL_STEP_METADATA_KEY]: step(status, call.startedAt, {
            settledAt,
            ...(error ? { error } : {}),
            ...(sources.length ? { sources } : {}),
          }),
        },
      },
    ],
  };
}

/**
 * Reconciles native execution events, including authoritative terminal output.
 *
 * @param calls - Previous immutable per-call lifecycle state.
 * @param event - Native Responses stream event.
 * @param messageId - Parent assistant message identity.
 * @returns Fresh lifecycle state and events, or undefined for unrelated events.
 * @internal
 */
export function mapCodeExecution(
  calls: ReadonlyMap<string, CodeExecutionState>,
  event: StreamEvent,
  messageId: string,
): CodeExecutionStep | undefined {
  switch (event.type) {
    case 'response.output_item.added':
    case 'response.output_item.done': {
      if (event.item.type !== 'code_interpreter_call') return undefined;
      const next = start(calls, event.item.id, messageId);
      return event.type === 'response.output_item.done'
        ? authoritative(next, event.item)
        : next;
    }
    case 'response.code_interpreter_call_code.delta':
      return append(
        start(calls, event.item_id, messageId),
        event.item_id,
        event.delta,
      );
    case 'response.code_interpreter_call_code.done':
      return finalize(
        start(calls, event.item_id, messageId),
        event.item_id,
        event.code,
      );
    case 'response.code_interpreter_call.in_progress':
    case 'response.code_interpreter_call.interpreting':
    case 'response.code_interpreter_call.completed':
      return start(calls, event.item_id, messageId);
    case 'response.completed':
    case 'response.incomplete':
    case 'response.failed':
      return (event.response.output ?? []).reduce<CodeExecutionStep>(
        (previous, item) => {
          if (item.type !== 'code_interpreter_call') return previous;
          const opened = start(previous.calls, item.id, messageId);
          const next = authoritative(opened, item);
          return {
            calls: next.calls,
            events: [...previous.events, ...next.events],
          };
        },
        { calls, events: [] },
      );
    default:
      return undefined;
  }
}
