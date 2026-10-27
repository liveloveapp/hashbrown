import { setTimeout as delay } from 'node:timers/promises';
import {
  nativeStats,
  waitForLiveApprovalPhase,
  waitForLiveNativeCompletion,
} from '../harness/live-browser-fixture';
import { LIVE_ASSERTION_TIMEOUT_MS } from '../harness/live-wait-policy';
import { LIVE_BUDGET_MANIFEST } from '../harness/live-budget';
import { nativeApprovalUnitEvidence } from './fixtures/live-native-approval';

for (const kind of ['native', 'approval'] as const) {
  test(`${kind} completion accepts legitimate eleven second acquisition within the hard scenario cap`, async () => {
    const stats = nativeStats(nativeApprovalUnitEvidence().stats);
    const start = performance.now();
    const fixture = {
      stats: async () =>
        performance.now() - start < 11_000
          ? {
              ...stats,
              stage: 'acquiring',
              wire: stats.wire.map((fact) => ({ ...fact, status: 0 })),
            }
          : stats,
    };

    const completed =
      kind === 'native'
        ? await waitForLiveNativeCompletion(fixture, 3)
        : await waitForLiveApprovalPhase(fixture, 3);

    expect(completed).toEqual(stats);
  }, 20_000);

  test(`${kind} completion retains a finite linked deadline for a hung stats operation`, async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => realTimeout(20));
    const fixture = {
      stats: async (signal?: AbortSignal) => {
        await delay(60_000, undefined, { signal });
        return nativeStats(nativeApprovalUnitEvidence().stats);
      },
    };

    try {
      const outcome =
        kind === 'native'
          ? waitForLiveNativeCompletion(fixture, 3)
          : waitForLiveApprovalPhase(fixture, 3);

      await expect(outcome).rejects.toThrow();
      expect(timeout).toHaveBeenCalledWith(30_000);
    } finally {
      timeout.mockRestore();
    }
  });

  test(`${kind} completion rejects a terminal failed state immediately`, async () => {
    const stats = {
      ...nativeStats(nativeApprovalUnitEvidence().stats),
      stage: 'failed',
    };
    const start = performance.now();
    const fixture = { stats: async () => stats };

    const outcome =
      kind === 'native'
        ? waitForLiveNativeCompletion(fixture, 3)
        : waitForLiveApprovalPhase(fixture, 3);

    await expect(outcome).rejects.toThrow('LIVE_NATIVE_COMPLETION_FAILED');
    expect(performance.now() - start).toBeLessThan(1_000);
  });
}

test('shared assertion deadline remains inside unchanged hard scenario, call, token and run caps', () => {
  expect(LIVE_ASSERTION_TIMEOUT_MS).toBe(30_000);
  expect(LIVE_ASSERTION_TIMEOUT_MS).toBeLessThan(
    LIVE_BUDGET_MANIFEST.scenarioTimeoutMs,
  );
  expect(LIVE_BUDGET_MANIFEST).toMatchObject({
    scenarioTimeoutMs: 60_000,
    runTimeoutMs: 900_000,
    reservedCalls: 123,
    maxRunCalls: 128,
    maxScenarioCalls: 4,
    maxOutputTokens: 384,
  });
});

test('approval completion rejects malformed proof before waiting', async () => {
  const stats = {
    ...nativeStats(nativeApprovalUnitEvidence().stats),
    nativeApprovalAdmissions: undefined,
  };
  const start = performance.now();

  const outcome = waitForLiveApprovalPhase({ stats: async () => stats }, 3);

  await expect(outcome).rejects.toThrow('LIVE_APPROVAL_PROOF_INVALID');
  expect(performance.now() - start).toBeLessThan(1_000);
});
