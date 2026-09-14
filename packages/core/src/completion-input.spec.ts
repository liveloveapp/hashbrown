import { ɵreconcileCompletionInput } from './completion-input';

const idle = {
  threadEpoch: 0,
  successfulResumes: 0,
  recoveryRequired: false,
  isResuming: false,
  pending: false,
};

test('completion reconciliation preserves submitted input until a successful resume settlement', () => {
  const submitted = ɵreconcileCompletionInput(undefined, 'A', idle, true).state;
  const paused = ɵreconcileCompletionInput(
    submitted,
    'B',
    { ...idle, pending: true },
    true,
  ).state;

  const idleWithoutSuccess = ɵreconcileCompletionInput(paused, 'C', idle, true);
  const success = ɵreconcileCompletionInput(
    paused,
    'C',
    { ...idle, successfulResumes: 1 },
    true,
  );

  expect(idleWithoutSuccess.send).toBe(false);
  expect(success.send).toBe(true);
  expect(success.state.input).toBe('C');
  expect(paused.input).toBe('A');
  expect(submitted).toEqual({ threadEpoch: 0, input: 'A', hasInput: true });
});

test('completion reconciliation preserves object identity rather than structural equality', () => {
  const input = { query: 'A' };
  const submitted = ɵreconcileCompletionInput(
    undefined,
    input,
    idle,
    true,
  ).state;

  const same = ɵreconcileCompletionInput(submitted, input, idle, true);
  const equivalent = ɵreconcileCompletionInput(
    submitted,
    { ...input },
    idle,
    true,
  );

  expect(same.send).toBe(false);
  expect(equivalent.send).toBe(true);
});

test('an ineligible ordinary input preserves subsequent input-change behavior', () => {
  const submitted = ɵreconcileCompletionInput<string | null>(
    undefined,
    'A',
    idle,
    true,
  ).state;
  const cleared = ɵreconcileCompletionInput(submitted, null, idle, false);

  const restored = ɵreconcileCompletionInput(cleared.state, 'A', idle, true);

  expect(cleared.send).toBe(false);
  expect(restored.send).toBe(true);
});

test('a new thread discards prior input and resume ownership without a thread cache', () => {
  const submitted = ɵreconcileCompletionInput(undefined, 'A', idle, true).state;
  const paused = ɵreconcileCompletionInput(
    submitted,
    'A',
    { ...idle, pending: true },
    true,
  ).state;

  const replacement = ɵreconcileCompletionInput(
    paused,
    'A',
    { ...idle, threadEpoch: 1 },
    true,
  );
  const repeated = ɵreconcileCompletionInput(
    replacement.state,
    'A',
    { ...idle, threadEpoch: 1 },
    true,
  );

  expect(replacement.send).toBe(true);
  expect(repeated.send).toBe(false);
});
