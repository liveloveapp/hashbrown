import { TransportError } from '../transport';
import {
  createLogicalRunRetryState,
  decideLogicalRunFailure,
  startLogicalRunAttempt,
} from './logical-run-retry-policy';

test('creates the initial retry state without changing the retries value', () => {
  const retries = 3;

  const state = createLogicalRunRetryState(retries);

  expect(state).toEqual({ retries, attempt: 0 });
});

test('starts the first attempt with the exact attempt context', () => {
  const state = createLogicalRunRetryState(2);

  const started = startLogicalRunAttempt(state);

  expect(started).toEqual({
    state: { retries: 2, attempt: 1 },
    context: { attempt: 1, maxAttempts: 3 },
  });
});

test('does not mutate the input state when starting an attempt', () => {
  const state = Object.freeze({ retries: 2, attempt: 0 });

  const started = startLogicalRunAttempt(state);

  expect(state).toEqual({ retries: 2, attempt: 0 });
  expect(started.state).not.toBe(state);
});

test('returns sequential retry states for sequential attempts', () => {
  const initialState = createLogicalRunRetryState(2);

  const first = startLogicalRunAttempt(initialState);
  const second = startLogicalRunAttempt(first.state);
  const third = startLogicalRunAttempt(second.state);

  expect(first.state).toEqual({ retries: 2, attempt: 1 });
  expect(second.state).toEqual({ retries: 2, attempt: 2 });
  expect(third.state).toEqual({ retries: 2, attempt: 3 });
  expect(first.context).toEqual({ attempt: 1, maxAttempts: 3 });
  expect(second.context).toEqual({ attempt: 2, maxAttempts: 3 });
  expect(third.context).toEqual({ attempt: 3, maxAttempts: 3 });
});

test('retries an ordinary error before stopping after the final attempt', () => {
  const error = new Error('send failed');
  const initialState = createLogicalRunRetryState(1);
  const first = startLogicalRunAttempt(initialState);
  const second = startLogicalRunAttempt(first.state);

  const retryDecision = decideLogicalRunFailure(first.state, error);
  const stopDecision = decideLogicalRunFailure(second.state, error);

  expect(retryDecision).toEqual({ kind: 'retry' });
  expect(stopDecision).toEqual({
    kind: 'stop',
    exhaustedRetries: true,
  });
});

test('stops immediately for a non-retryable transport error', () => {
  const error = new TransportError('invalid request', { retryable: false });
  const state = startLogicalRunAttempt(createLogicalRunRetryState(3)).state;

  const decision = decideLogicalRunFailure(state, error);

  expect(decision).toEqual({
    kind: 'stop',
    exhaustedRetries: false,
  });
});

test('retries a retryable transport error before the final attempt', () => {
  const error = new TransportError('temporarily unavailable', {
    retryable: true,
  });
  const state = startLogicalRunAttempt(createLogicalRunRetryState(2)).state;

  const decision = decideLogicalRunFailure(state, error);

  expect(decision).toEqual({ kind: 'retry' });
});

test('stops with zero retries without reporting exhaustion', () => {
  const error = new Error('send failed');
  const state = startLogicalRunAttempt(createLogicalRunRetryState(0)).state;

  const decision = decideLogicalRunFailure(state, error);

  expect(decision).toEqual({
    kind: 'stop',
    exhaustedRetries: false,
  });
});

test.each([
  { label: 'negative', retries: -1 },
  { label: 'fractional', retries: 0.5 },
  { label: 'NaN', retries: Number.NaN },
  { label: 'positive infinity', retries: Number.POSITIVE_INFINITY },
  { label: 'negative infinity', retries: Number.NEGATIVE_INFINITY },
  { label: 'unsafe integer', retries: Number.MAX_SAFE_INTEGER + 1 },
])('normalizes $label retries to zero', ({ retries }) => {
  const error = new Error('send failed');

  const state = createLogicalRunRetryState(retries);
  const started = startLogicalRunAttempt(state);
  const decision = decideLogicalRunFailure(started.state, error);

  expect(state).toEqual({ retries: 0, attempt: 0 });
  expect(started).toEqual({
    state: { retries: 0, attempt: 1 },
    context: { attempt: 1, maxAttempts: 1 },
  });
  expect(decision).toEqual({
    kind: 'stop',
    exhaustedRetries: false,
  });
});

test('does not mutate the error when deciding a failure', () => {
  const error = Object.freeze(
    new TransportError('invalid request', {
      retryable: false,
      status: 400,
      code: 'INVALID_REQUEST',
    }),
  );
  const state = startLogicalRunAttempt(createLogicalRunRetryState(2)).state;

  decideLogicalRunFailure(state, error);

  expect(error).toMatchObject({
    message: 'invalid request',
    retryable: false,
    status: 400,
    code: 'INVALID_REQUEST',
  });
});
