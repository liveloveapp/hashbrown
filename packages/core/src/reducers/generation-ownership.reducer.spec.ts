import { apiActions, internalActions } from '../actions';
import {
  initialGenerationOwnershipState,
  reducer,
} from './generation-ownership.reducer';

test('claims one generation and one attempt at a time', () => {
  const generation = reducer(
    initialGenerationOwnershipState,
    internalActions.logicalGenerationStarted({ generationId: 'generation-1' }),
  );

  const attempt = reducer(
    generation,
    internalActions.generationAttemptClaimed({
      generationId: 'generation-1',
      attemptId: 'attempt-1',
    }),
  );

  expect(attempt).toEqual({
    generationId: 'generation-1',
    attemptId: 'attempt-1',
  });
});

test('ignores stale attempt and generation settlements', () => {
  let state = reducer(
    initialGenerationOwnershipState,
    internalActions.logicalGenerationStarted({ generationId: 'generation-2' }),
  );
  state = reducer(
    state,
    internalActions.generationAttemptClaimed({
      generationId: 'generation-2',
      attemptId: 'attempt-2',
    }),
  );

  const afterStaleAttempt = reducer(
    state,
    internalActions.generationAttemptReleased({
      generationId: 'generation-1',
      attemptId: 'attempt-1',
    }),
  );
  const afterStaleGeneration = reducer(
    afterStaleAttempt,
    internalActions.logicalGenerationSettled({ generationId: 'generation-1' }),
  );

  expect(afterStaleGeneration).toBe(state);
});

test('releases only the matching attempt and generation', () => {
  let state = reducer(
    initialGenerationOwnershipState,
    internalActions.logicalGenerationStarted({ generationId: 'generation-1' }),
  );
  state = reducer(
    state,
    internalActions.generationAttemptClaimed({
      generationId: 'generation-1',
      attemptId: 'attempt-1',
    }),
  );

  state = reducer(
    state,
    internalActions.generationAttemptReleased({
      generationId: 'generation-1',
      attemptId: 'attempt-1',
    }),
  );
  const settled = reducer(
    state,
    internalActions.logicalGenerationSettled({ generationId: 'generation-1' }),
  );

  expect(state).toEqual({ generationId: 'generation-1', attemptId: undefined });
  expect(settled).toBe(initialGenerationOwnershipState);
});

test('does not release ownership for public terminal actions', () => {
  let state = reducer(
    initialGenerationOwnershipState,
    internalActions.logicalGenerationStarted({ generationId: 'generation-1' }),
  );
  state = reducer(
    state,
    internalActions.generationAttemptClaimed({
      generationId: 'generation-1',
      attemptId: 'attempt-1',
    }),
  );

  const afterSuccess = reducer(
    state,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: 'done', toolCallIds: [] },
      toolCalls: [],
    }),
  );
  const afterError = reducer(
    afterSuccess,
    apiActions.generateMessageError(new Error('failed')),
  );

  expect(afterError).toBe(state);
});

test('reserves exact tool objects before marking them as running', () => {
  const toolCall = {
    id: 'call-1',
    name: 'lookup',
    arguments: '{}',
    status: 'pending' as const,
  };
  let state = reducer(
    initialGenerationOwnershipState,
    internalActions.logicalGenerationStarted({ generationId: 'generation-1' }),
  );

  state = reducer(
    state,
    internalActions.toolTurnReserved({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
      toolCalls: [toolCall],
    }),
  );
  const claimed = reducer(
    state,
    internalActions.toolTurnStarted({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
    }),
  );

  expect(state.toolTurn).toEqual({
    toolTurnId: 'tool-turn-1',
    toolCalls: [toolCall],
    runningToolCallIds: [],
  });
  expect(state.toolTurn?.toolCalls[0]).toBe(toolCall);
  expect(claimed.toolTurn?.runningToolCallIds).toEqual(['call-1']);
});

test('replacement generation invalidates an old reserved tool turn', () => {
  const toolCall = {
    id: 'call-1',
    name: 'lookup',
    arguments: '{}',
    status: 'pending' as const,
  };
  let state = reducer(
    initialGenerationOwnershipState,
    internalActions.logicalGenerationStarted({ generationId: 'generation-1' }),
  );
  state = reducer(
    state,
    internalActions.toolTurnReserved({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
      toolCalls: [toolCall],
    }),
  );

  const replaced = reducer(
    state,
    internalActions.logicalGenerationStarted({ generationId: 'generation-2' }),
  );
  const staleClaim = reducer(
    replaced,
    internalActions.toolTurnStarted({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
    }),
  );

  expect(replaced).toEqual({
    generationId: 'generation-2',
    attemptId: undefined,
    toolTurn: undefined,
  });
  expect(staleClaim).toBe(replaced);
});
