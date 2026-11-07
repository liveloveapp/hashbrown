import { expect, test } from '@playwright/test';
import { runDeterministicReleaseRecoveryControls } from '../harness/live-recovery-controls';

// These are genuine owned-worker/browser controls with a deterministic model endpoint, never live cloud evidence.
test('both frameworks cold restore and adopt genuinely committed Completed results on replacement workers', async ({
  browser,
}) => {
  const result = await runDeterministicReleaseRecoveryControls(
    browser,
    process.env,
  );

  expect(result.kind).toBe('deterministic-control');
  expect(result.cases).toHaveLength(4);
  expect(result.cases.every((entry) => entry.cleanup === 'passed')).toBe(true);
  expect(result.actualNativeCalls).toBe(12);
});

test('missing real native usage fails an actual owned-worker journey without reporting a passed case', async ({
  browser,
}) => {
  await expect(
    runDeterministicReleaseRecoveryControls(
      browser,
      process.env,
      'missing-usage',
    ),
  ).rejects.toThrow('RECOVERY_CONTROL_REJECTED:missing-usage');
});

test('a physical Publishing row and unfinished native teardown cannot certify post-commit loss', async ({
  browser,
}) => {
  const result = await runDeterministicReleaseRecoveryControls(
    browser,
    process.env,
    'hold-finalization',
  );

  expect(result.kind).toBe('deterministic-control');
  expect(result.blockedCommitObserved).toBe(true);
  expect(result.cases).toHaveLength(1);
});

for (const mutation of [
  'reused-worker',
  'missing-drain',
  'schema-reset',
  'handler-replay',
  'effect-replay',
  'wrong-original-result',
  'missing-original-result',
  'duplicate-original-call',
  'duplicate-original-result',
  'late-dispatch',
  'malformed-completed-history',
  'read-induced-work',
  'cleanup-crash',
] as const)
  test(`actual worker control rejects ${mutation} at its independent guard`, async ({
    browser,
  }) => {
    await expect(
      runDeterministicReleaseRecoveryControls(browser, process.env, mutation),
    ).rejects.toThrow(`RECOVERY_CONTROL_REJECTED:${mutation}`);
  });
