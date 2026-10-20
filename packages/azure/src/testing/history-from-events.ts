import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';

type ToolCall = { readonly id: string; readonly name: string };

/**
 * Builds the next run's AG-UI history from a run's captured events, the way a
 * client would: one reasoning message per reasoning item (with its summary,
 * encrypted value, and metadata), one assistant message carrying the streamed
 * text and every tool call (with metadata), then one tool result per call.
 *
 * Test-only helper shared by the aimock and live integration specs.
 *
 * @param previous - The messages sent to the run that produced `events`.
 * @param runId - The id of the run that produced `events`.
 * @param events - The run's AG-UI events.
 * @param toolResult - Produces the tool result content for each tool call.
 * @returns The previous messages followed by the run's messages.
 */
export function historyFromEvents(
  previous: readonly Message[],
  runId: string,
  events: readonly AGUIEvent[],
  toolResult: (toolCall: ToolCall) => string,
): Message[] {
  const reasoning: Message[] = events.flatMap((event) => {
    if (event.type !== EventType.REASONING_MESSAGE_START) {
      return [];
    }
    const encrypted = events.find(
      (candidate) =>
        candidate.type === EventType.REASONING_ENCRYPTED_VALUE &&
        candidate.entityId === event.messageId,
    );

    return [
      {
        id: event.messageId,
        role: 'reasoning',
        content: events
          .flatMap((candidate) =>
            candidate.type === EventType.REASONING_MESSAGE_CONTENT &&
            candidate.messageId === event.messageId
              ? [candidate.delta]
              : [],
          )
          .join(''),
        ...(encrypted?.type === EventType.REASONING_ENCRYPTED_VALUE
          ? { encryptedValue: encrypted.encryptedValue }
          : {}),
        metadata: event.metadata,
      },
    ];
  });

  const toolCalls = events.flatMap((event) =>
    event.type === EventType.TOOL_CALL_START
      ? [
          {
            id: event.toolCallId,
            type: 'function' as const,
            function: {
              name: event.toolCallName,
              arguments: events
                .flatMap((candidate) =>
                  candidate.type === EventType.TOOL_CALL_ARGS &&
                  candidate.toolCallId === event.toolCallId
                    ? [candidate.delta]
                    : [],
                )
                .join(''),
            },
            metadata: event.metadata,
          },
        ]
      : [],
  );

  const textStart = events.find(
    (event) => event.type === EventType.TEXT_MESSAGE_START,
  );
  const text = events
    .flatMap((event) =>
      event.type === EventType.TEXT_MESSAGE_CONTENT ? [event.delta] : [],
    )
    .join('');

  const assistant: Message = {
    id: `${runId}:assistant`,
    role: 'assistant',
    ...(text ? { content: text } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(textStart?.type === EventType.TEXT_MESSAGE_START
      ? { metadata: textStart.metadata }
      : {}),
  };

  const toolResults: Message[] = toolCalls.map((toolCall) => ({
    id: `${toolCall.id}:result`,
    role: 'tool',
    toolCallId: toolCall.id,
    content: toolResult({ id: toolCall.id, name: toolCall.function.name }),
  }));

  return [...previous, ...reasoning, assistant, ...toolResults];
}
