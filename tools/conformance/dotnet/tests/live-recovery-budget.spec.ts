import {
  createReleaseRecoveryBudget,
  drainRecoveryCleanup,
} from '../harness/live-recovery-budget';

const request = { signal: new AbortController().signal, maxOutputTokens: 384 };

test('counts failed credential acquisition before work and cannot reset the original worker cap', async () => {
  const budget = createReleaseRecoveryBudget();
  const scenario = budget.reserveScenario('react-openai-key', 'cold-restore');
  let attempts = 0;

  try {
    await expect(
      scenario.dispatch('original', request, async () => {
        attempts++;
        expect(budget.snapshot().dispatchedCalls).toBe(1);
        throw new Error('acquisition failed');
      }),
    ).rejects.toThrow('acquisition failed');
    await expect(
      scenario.dispatch('original', request, async () => {
        attempts++;
      }),
    ).rejects.toThrow('RECOVERY_WORKER_CALL_CAP');

    expect(attempts).toBe(1);
    expect(scenario.snapshot().dispatchedCalls).toBe(1);
  } finally {
    scenario.dispose();
    budget.dispose();
  }
});

test('replacement gets only two attempts and shares the original sixty-second deadline', async () => {
  let now = 0;
  const budget = createReleaseRecoveryBudget({ now: () => now });
  const scenario = budget.reserveScenario('angular-azure-cli', 'cold-restore');
  let attempts = 0;

  try {
    await scenario.dispatch('original', request, async () => {
      attempts++;
    });
    now = 59_999;
    await scenario.dispatch('replacement', request, async () => {
      attempts++;
    });
    now = 60_000;
    await expect(
      scenario.dispatch('replacement', request, async () => {
        attempts++;
      }),
    ).rejects.toThrow('RECOVERY_SCENARIO_DEADLINE');

    expect(attempts).toBe(2);
    expect(budget.snapshot()).toEqual({
      reservedCalls: 39,
      dispatchedCalls: 2,
    });
  } finally {
    scenario.dispose();
    budget.dispose();
  }
});

test('does not allow parallel scenario owners or reservation reuse after disposal', () => {
  const budget = createReleaseRecoveryBudget();
  const scenario = budget.reserveScenario('react-openai-key', 'cold-restore');

  try {
    expect(() =>
      budget.reserveScenario('angular-openai-key', 'cold-restore'),
    ).toThrow('RECOVERY_SCENARIO_ACTIVE');
    scenario.dispose();
    expect(() =>
      budget.reserveScenario('react-openai-key', 'cold-restore'),
    ).toThrow('RECOVERY_SCENARIO_DUPLICATE');
    const next = budget.reserveScenario('angular-openai-key', 'cold-restore');

    expect(next.maxCalls).toBe(3);
    next.dispose();
  } finally {
    budget.dispose();
  }
});

test('unused allowance cannot fund a third replacement call or a second preflight', async () => {
  const budget = createReleaseRecoveryBudget();
  const scenario = budget.reserveScenario(
    'react-azure-key',
    'result-reconciliation',
  );
  let attempts = 0;

  try {
    await scenario.dispatch('replacement', request, async () => {
      attempts++;
    });
    await scenario.dispatch('replacement', request, async () => {
      attempts++;
    });
    await expect(
      scenario.dispatch('replacement', request, async () => {
        attempts++;
      }),
    ).rejects.toThrow('RECOVERY_WORKER_CALL_CAP');
    scenario.dispose();
    const preflight = budget.reservePreflight('azure-cli-chat');
    await preflight.dispatch(request, async () => {
      attempts++;
    });
    await expect(
      preflight.dispatch(request, async () => {
        attempts++;
      }),
    ).rejects.toThrow('RECOVERY_PREFLIGHT_CALL_CAP');

    expect(attempts).toBe(3);
    preflight.dispose();
  } finally {
    budget.dispose();
  }
});

test('rejects output-token overrides before entering provider work', async () => {
  const budget = createReleaseRecoveryBudget();
  const scenario = budget.reserveScenario('react-openai-key', 'cold-restore');
  let attempts = 0;

  try {
    for (const maxOutputTokens of [385, 0, -1, NaN, 1.5])
      await expect(
        scenario.dispatch(
          'original',
          { ...request, maxOutputTokens },
          async () => {
            attempts++;
          },
        ),
      ).rejects.toThrow('RECOVERY_OUTPUT_TOKEN_CAP');

    expect(attempts).toBe(0);
    expect(budget.snapshot().dispatchedCalls).toBe(0);
  } finally {
    budget.dispose();
  }
});

test('disposal cannot release serial ownership until already-entered cooperative work unwinds', async () => {
  const budget = createReleaseRecoveryBudget();
  const scenario = budget.reserveScenario('react-openai-key', 'cold-restore');
  let release!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const work = scenario.dispatch('original', request, async () => held);

  scenario.dispose();

  expect(() =>
    budget.reserveScenario('angular-openai-key', 'cold-restore'),
  ).toThrow('RECOVERY_SCENARIO_ACTIVE');
  release();
  await work;
  const next = budget.reserveScenario('angular-openai-key', 'cold-restore');
  next.dispose();
  budget.dispose();
});

test('the final scenario cannot report success after provider work or cleanup crossed its deadline', async () => {
  let now = 0;
  const budget = createReleaseRecoveryBudget({ now: () => now });
  const scenario = budget.reserveScenario(
    'angular-azure-cli',
    'result-reconciliation',
  );

  try {
    await expect(
      scenario.dispatch('original', request, async () => {
        now = 60_000;
        return 'late';
      }),
    ).rejects.toThrow('RECOVERY_SCENARIO_DEADLINE');
    expect(() => scenario.assertActive()).toThrow('RECOVERY_SCENARIO_DEADLINE');
    expect(scenario.remainingMs()).toBe(0);
  } finally {
    scenario.dispose();
    budget.dispose();
  }
});

test('one absolute invocation deadline includes qualification, final case and postflight', () => {
  let now = 0;
  const budget = createReleaseRecoveryBudget({ now: () => now });

  try {
    now = 899_999;
    expect(budget.remainingMs()).toBe(1);
    const scenario = budget.reserveScenario(
      'angular-azure-cli',
      'result-reconciliation',
    );
    expect(scenario.remainingMs()).toBe(1);
    now = 900_000;
    expect(() => scenario.assertActive()).toThrow('RECOVERY_RUN_DEADLINE');
    expect(() => budget.assertActive()).toThrow('RECOVERY_RUN_DEADLINE');
    expect(() => budget.reservePreflight('azure-cli-chat')).toThrow(
      'RECOVERY_RUN_DEADLINE',
    );
    scenario.dispose();
  } finally {
    budget.dispose();
  }
});

test('cleanup remains attempted and bounded after run cancellation', async () => {
  jest.useFakeTimers();
  const budget = createReleaseRecoveryBudget();
  const close = jest.fn(() => new Promise<void>(() => undefined));
  budget.dispose();

  try {
    const cleanup = drainRecoveryCleanup(close);
    const result = expect(cleanup).rejects.toThrow('RECOVERY_CLEANUP_DEADLINE');
    await jest.advanceTimersByTimeAsync(5000);
    await result;

    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});
