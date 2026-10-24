import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';

/** Deterministic response endings used to verify the checked list clients. */
export type StructuredListOutcome =
  | 'success'
  | 'invalid'
  | 'failed'
  | 'partial'
  | 'empty'
  | 'truncated'
  | 'malformed';

/** Creates scripted list output; the recorder delays chunks independently. */
export function createStructuredListEvents(
  input: RunAgentInput,
  outcome: StructuredListOutcome,
): AGUIEvent[] {
  const started: AGUIEvent = {
    type: EventType.RUN_STARTED,
    threadId: input.threadId,
    runId: input.runId,
  };
  const finished: AGUIEvent = {
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
    ...(outcome === 'truncated'
      ? { metadata: { hashbrown: { finishReason: 'length' } } }
      : {}),
  };
  if (outcome === 'empty') return [started, finished];
  const messageId = `${input.runId}:list`;
  const chunks =
    outcome === 'malformed'
      ? ['{"items":[{"name":false,"quantity":"many"}]}']
      : [
          '{"items":[',
          `{"name":"Apples","quantity":${outcome === 'invalid' ? 0 : 2}}`,
          ...(outcome === 'partial' || outcome === 'truncated'
            ? []
            : [',{"name":"Bread","quantity":1}', ']}']),
        ];
  return [
    started,
    { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' },
    ...chunks.map((delta): AGUIEvent => ({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta,
    })),
    { type: EventType.TEXT_MESSAGE_END, messageId },
    outcome === 'failed' || outcome === 'partial'
      ? {
          type: EventType.RUN_ERROR,
          message: 'The scripted run failed before completion.',
        }
      : finished,
  ];
}
