import { apiActions, internalActions } from '../actions';
import { Chat } from '../models';
import { reducer } from './tool-calls.reducer';

test('records tool results for a stopped tool turn', () => {
  const toolCall: Chat.Internal.ToolCall = {
    id: 'tool-call-1',
    name: 'lookup',
    arguments: '{}',
    status: 'pending',
  };
  const pendingState = reducer(
    undefined,
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: '',
        toolCallIds: [toolCall.id],
      },
      toolCalls: [toolCall],
    }),
  );
  const cancellation = new Error('Tool execution cancelled');
  cancellation.name = 'AbortError';

  const settledState = reducer(
    pendingState,
    internalActions.toolTurnSettled({
      continuation: 'stop',
      toolCalls: [toolCall],
      toolMessages: [
        {
          role: 'tool',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: { status: 'rejected', reason: cancellation },
        },
      ],
    }),
  );

  expect(settledState.entities[toolCall.id]).toEqual({
    ...toolCall,
    status: 'done',
    result: { status: 'rejected', reason: cancellation },
  });
});

test('does not settle a replacement tool call with the same id', () => {
  const original: Chat.Internal.ToolCall = {
    id: 'tool-call-1',
    name: 'lookup',
    arguments: '{"turn":"original"}',
    status: 'pending',
  };
  const replacement: Chat.Internal.ToolCall = {
    ...original,
    arguments: '{"turn":"replacement"}',
  };
  const replacementState = reducer(
    undefined,
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: '',
        toolCallIds: [replacement.id],
      },
      toolCalls: [replacement],
    }),
  );

  const settledState = reducer(
    replacementState,
    internalActions.toolTurnSettled({
      continuation: 'stop',
      toolCalls: [original],
      toolMessages: [
        {
          role: 'tool',
          toolCallId: original.id,
          toolName: original.name,
          content: {
            status: 'rejected',
            reason: new Error('Tool execution cancelled'),
          },
        },
      ],
    }),
  );

  expect(settledState.entities[replacement.id]).toBe(replacement);
});
