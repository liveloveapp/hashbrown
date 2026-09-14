import { internalActions } from '../actions';
import { initialInterruptsState, reducer } from './interrupts.reducer';

test('ignores stale resume release and acknowledgement identities', () => {
  const batch = Object.freeze({
    id: 'batch',
    interrupts: Object.freeze([{ id: 'approval', reason: 'approval' }]),
  });
  const claimed = {
    ...initialInterruptsState,
    pending: batch,
    claimId: 'claim',
    generationId: 'claim',
  };

  const released = reducer(
    claimed,
    internalActions.resumeSettled({ generationId: 'old', outcome: 'failed' }),
  );
  const acknowledged = reducer(
    claimed,
    internalActions.resumeAcknowledged({
      generationId: 'claim',
      claimId: 'old',
    }),
  );

  expect(released).toBe(claimed);
  expect(acknowledged).toBe(claimed);
});

test('retains pre-start ownership but requires recovery after acknowledgement', () => {
  const pending = Object.freeze({
    id: 'batch',
    interrupts: Object.freeze([{ id: 'approval', reason: 'approval' }]),
  });
  const claimed = {
    ...initialInterruptsState,
    pending,
    claimId: 'claim',
    generationId: 'claim',
  };

  const released = reducer(
    claimed,
    internalActions.resumeSettled({ generationId: 'claim', outcome: 'failed' }),
  );
  const acknowledged = reducer(
    claimed,
    internalActions.resumeAcknowledged({
      generationId: 'claim',
      claimId: 'claim',
    }),
  );
  const failed = reducer(
    acknowledged,
    internalActions.resumeSettled({ generationId: 'claim', outcome: 'failed' }),
  );

  expect(released.pending).toBe(pending);
  expect(released.recoveryRequired).toBe(false);
  expect(released.claimId).toBeUndefined();
  expect(acknowledged.pending).toBeUndefined();
  expect(failed.recoveryRequired).toBe(true);
  expect(failed.generationId).toBeUndefined();
});

test('publishes only the currently owned generation and attempt', () => {
  const pending = Object.freeze({
    id: 'batch',
    interrupts: Object.freeze([{ id: 'approval', reason: 'approval' }]),
  });
  const started = reducer(
    undefined,
    internalActions.logicalGenerationStarted({ generationId: 'generation' }),
  );
  const attempting = reducer(
    started,
    internalActions.generationAttemptClaimed({
      generationId: 'generation',
      attemptId: 'attempt',
    }),
  );

  const stale = reducer(
    attempting,
    internalActions.interruptsPublished({
      generationId: 'generation',
      attemptId: 'old',
      batch: pending,
    }),
  );
  const published = reducer(
    attempting,
    internalActions.interruptsPublished({
      generationId: 'generation',
      attemptId: 'attempt',
      batch: pending,
    }),
  );

  expect(stale).toBe(attempting);
  expect(published.pending).toBe(pending);
});

test('late attempts cannot reclaim a settled generation', () => {
  const started = reducer(
    undefined,
    internalActions.logicalGenerationStarted({ generationId: 'generation' }),
  );
  const settled = reducer(
    started,
    internalActions.logicalGenerationSettled({ generationId: 'generation' }),
  );

  const late = reducer(
    settled,
    internalActions.generationAttemptClaimed({
      generationId: 'generation',
      attemptId: 'late',
    }),
  );

  expect(late).toBe(settled);
});
