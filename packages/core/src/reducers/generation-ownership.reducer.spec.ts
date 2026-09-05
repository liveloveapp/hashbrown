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
