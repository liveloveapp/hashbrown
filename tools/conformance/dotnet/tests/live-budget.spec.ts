import {
  createLiveBudget,
  LIVE_BUDGET_MANIFEST,
  withLiveDeadline,
} from '../harness/live-budget';

test('reserves the immutable six-project manifest and three preflights within safety maxima', () => {
  const budget = createLiveBudget();

  expect(LIVE_BUDGET_MANIFEST.groups.map((group) => group.calls)).toEqual([
    1, 1, 2, 2, 2, 3, 3, 2, 4,
  ]);
  expect(LIVE_BUDGET_MANIFEST.reservedCalls).toBe(123);
  expect(LIVE_BUDGET_MANIFEST.maxRunCalls).toBe(128);
  expect(LIVE_BUDGET_MANIFEST.maxOutputTokens).toBe(384);
  expect(Object.isFrozen(LIVE_BUDGET_MANIFEST.groups[0])).toBe(true);
  expect(budget.snapshot().dispatchedCalls).toBe(0);
});

test('rejects duplicate and invalid scenario reservations and exhausted preflights', () => {
  const budget = createLiveBudget();
  budget.reserveScenario('react-openai-key', 'streaming-plain');

  expect(() =>
    budget.reserveScenario('react-openai-key', 'streaming-plain'),
  ).toThrow('LIVE_SCENARIO_DUPLICATE');
  expect(() => budget.reserveScenario('unknown', 'streaming-plain')).toThrow(
    'LIVE_SCENARIO_INVALID',
  );
  expect(() => budget.reserveScenario('react-openai-key', 'unknown')).toThrow(
    'LIVE_SCENARIO_INVALID',
  );
  budget.reservePreflight('openai-responses');
  budget.reservePreflight('azure-responses');
  budget.reservePreflight('azure-cli-chat');
  expect(() => budget.reservePreflight('azure-cli-chat')).toThrow(
    'LIVE_PREFLIGHT_INVALID',
  );
});

test('counts every dispatch before invoking work and never retries failures or cancellation', async () => {
  const budget = createLiveBudget();
  const scenario = budget.reserveScenario('react-openai-key', 'browser-tool');
  const controller = new AbortController();
  let attempts = 0;

  await expect(
    scenario.dispatch(
      { signal: controller.signal, maxOutputTokens: 384 },
      async () => {
        attempts++;
        expect(budget.snapshot().dispatchedCalls).toBe(1);
        throw new Error('failure');
      },
    ),
  ).rejects.toThrow('failure');
  await scenario.dispatch(
    { signal: controller.signal, maxOutputTokens: 384 },
    async () => {
      attempts++;
      controller.abort();
    },
  );

  expect(attempts).toBe(2);
  expect(scenario.snapshot().dispatchedCalls).toBe(2);
  await expect(
    scenario.dispatch(
      { signal: new AbortController().signal, maxOutputTokens: 384 },
      async () => {
        attempts++;
      },
    ),
  ).rejects.toThrow('LIVE_SCENARIO_CALL_CAP');
  expect(attempts).toBe(2);
});

test('rejects token caps and cancellation immediately before dispatch without counting a request', async () => {
  const budget = createLiveBudget();
  const scenario = budget.reserveScenario(
    'react-openai-key',
    'streaming-plain',
  );
  const controller = new AbortController();
  let calls = 0;

  await expect(
    scenario.dispatch(
      { signal: controller.signal, maxOutputTokens: 385 },
      async () => {
        calls++;
      },
    ),
  ).rejects.toThrow('LIVE_OUTPUT_TOKEN_CAP');
  controller.abort();
  await expect(
    scenario.dispatch(
      { signal: controller.signal, maxOutputTokens: 384 },
      async () => {
        calls++;
      },
    ),
  ).rejects.toThrow('LIVE_DEADLINE_ABORTED');

  expect(calls).toBe(0);
  expect(budget.snapshot().dispatchedCalls).toBe(0);
});

test('links deadlines into hanging acquisition and native enumeration and drains cooperative cancellation', async () => {
  const stages: string[] = [];
  const controller = new AbortController();
  const operation = (signal: AbortSignal) =>
    new Promise<void>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          stages.push('cancelled');
          reject(new Error('cancelled'));
        },
        { once: true },
      );
      stages.push('acquiring');
    });

  const result = withLiveDeadline(
    { runSignal: controller.signal, timeoutMs: 10 },
    operation,
  );

  await expect(result).rejects.toThrow('cancelled');
  expect(stages).toEqual(['acquiring', 'cancelled']);
});

test('rechecks deadline after acquisition before a native dispatch and enforces elapsed run ceiling', async () => {
  let now = 0;
  const budget = createLiveBudget({ now: () => now });
  const scenario = budget.reserveScenario(
    'angular-azure-cli',
    'streaming-plain',
  );
  const controller = new AbortController();
  let calls = 0;

  await withLiveDeadline(
    { runSignal: controller.signal, timeoutMs: 60_000 },
    async (signal) => {
      await Promise.resolve();
      controller.abort();
      await expect(
        scenario.dispatch({ signal, maxOutputTokens: 384 }, async () => {
          calls++;
        }),
      ).rejects.toThrow('LIVE_DEADLINE_ABORTED');
    },
  );
  now = 900_000;

  await expect(
    scenario.dispatch(
      { signal: new AbortController().signal, maxOutputTokens: 384 },
      async () => {
        calls++;
      },
    ),
  ).rejects.toThrow('LIVE_RUN_DEADLINE');
  expect(calls).toBe(0);
});

test('enforces the elapsed scenario ceiling and refuses deadlines beyond sixty seconds', async () => {
  let now = 0;
  const scenario = createLiveBudget({ now: () => now }).reserveScenario(
    'react-azure-key',
    'approval-resume-decline',
  );
  now = 60_000;

  await expect(
    scenario.dispatch(
      { signal: new AbortController().signal, maxOutputTokens: 384 },
      async () => undefined,
    ),
  ).rejects.toThrow('LIVE_SCENARIO_DEADLINE');
  await expect(
    withLiveDeadline(
      { runSignal: new AbortController().signal, timeoutMs: 60_001 },
      async () => undefined,
    ),
  ).rejects.toThrow('LIVE_DEADLINE_INVALID');
});

test('disposal aborts exposed run and scenario signals for owned process termination hooks', () => {
  const budget = createLiveBudget();
  const scenario = budget.reserveScenario(
    'react-openai-key',
    'streaming-plain',
  );
  const sibling = budget.reserveScenario(
    'angular-openai-key',
    'streaming-plain',
  );
  let stopped = 0;
  scenario.signal.addEventListener(
    'abort',
    () => {
      stopped++;
    },
    { once: true },
  );

  scenario.dispose();

  expect(scenario.signal.aborted).toBe(true);
  expect(stopped).toBe(1);
  expect(budget.signal.aborted).toBe(false);
  budget.dispose();
  expect(budget.signal.aborted).toBe(true);
  expect(sibling.signal.aborted).toBe(true);
});

test('drains native iteration when a linked deadline cancels after the first real item', async () => {
  const stages: string[] = [];
  const controller = new AbortController();
  async function* native(signal: AbortSignal) {
    try {
      yield 'first-native-item';
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener(
          'abort',
          () => reject(new Error('native-cancelled')),
          { once: true },
        ),
      );
    } finally {
      stages.push('drained');
    }
  }

  const result = withLiveDeadline(
    { runSignal: controller.signal, timeoutMs: 10 },
    async (signal) => {
      for await (const item of native(signal)) stages.push(item);
    },
  );

  await expect(result).rejects.toThrow('native-cancelled');
  expect(stages).toEqual(['first-native-item', 'drained']);
});

test('executes all fixed reservations without exceeding one hundred twenty-three native attempts', async () => {
  const budget = createLiveBudget();
  const projects = [
    'react-openai-key',
    'react-azure-key',
    'react-azure-cli',
    'angular-openai-key',
    'angular-azure-key',
    'angular-azure-cli',
  ];
  const request = {
    signal: new AbortController().signal,
    maxOutputTokens: 384,
  };

  for (const project of projects)
    for (const group of LIVE_BUDGET_MANIFEST.groups) {
      const scenario = budget.reserveScenario(project, group.name);
      for (let index = 0; index < group.calls; index++)
        await scenario.dispatch(request, async () => undefined);
      await expect(
        scenario.dispatch(request, async () => undefined),
      ).rejects.toThrow('LIVE_SCENARIO_CALL_CAP');
      scenario.dispose();
    }
  for (const name of LIVE_BUDGET_MANIFEST.preflights)
    await budget
      .reservePreflight(name)
      .dispatch(request, async () => undefined);

  expect(budget.snapshot()).toEqual({
    reservedCalls: 123,
    dispatchedCalls: 123,
  });
  budget.dispose();
});

test('native approval retains its own four attempts and cannot borrow unused reservations', async () => {
  const budget = createLiveBudget();
  const reservation = budget.reserveScenario(
    'react-openai-key',
    'native-approval',
  );
  const callback = jest.fn(async () => {
    throw new Error('unit failure');
  });

  try {
    for (let attempt = 0; attempt < 4; attempt++)
      await expect(
        reservation.dispatch(
          { signal: new AbortController().signal, maxOutputTokens: 384 },
          callback,
        ),
      ).rejects.toThrow('unit failure');
    await expect(
      reservation.dispatch(
        { signal: new AbortController().signal, maxOutputTokens: 384 },
        callback,
      ),
    ).rejects.toThrow('LIVE_SCENARIO_CALL_CAP');

    expect(callback).toHaveBeenCalledTimes(4);
    expect(reservation.snapshot().dispatchedCalls).toBe(4);
    expect(budget.snapshot().reservedCalls).toBe(123);
    expect(LIVE_BUDGET_MANIFEST.preflights).toEqual([
      'openai-responses',
      'azure-responses',
      'azure-cli-chat',
    ]);
    expect(LIVE_BUDGET_MANIFEST.maxScenarioCalls).toBe(4);
    expect(LIVE_BUDGET_MANIFEST.scenarioTimeoutMs).toBe(60_000);
    expect(LIVE_BUDGET_MANIFEST.runTimeoutMs).toBe(900_000);
  } finally {
    budget.dispose();
  }
});

test('requires fifty-four distinct live project group identities', async () => {
  const { LIVE_CASE_COUNT } = await import('../harness/live-budget');

  const actual = LIVE_CASE_COUNT;

  expect(actual).toBe(54);
});
