import {
  control,
  durableEffects,
  waitForStage,
  withDurableCluster,
} from '../harness/durable-fixture';
import { postRun, runInput } from '../harness/http-fixture';

function answers(
  events: ReadonlyArray<Record<string, unknown>>,
  approved = true,
) {
  const outcome = events.at(-1)?.outcome as {
    interrupts: Array<{ id: string }>;
  };
  return outcome.interrupts.map(({ id }) => ({
    interruptId: id,
    status: 'resolved',
    payload: { approved },
  }));
}

for (const provider of ['openai', 'azure'] as const) {
  test(`${provider}: pending approval survives process death and uses stored parameters`, async () => {
    await withDurableCluster(provider, async (cluster) => {
      const firstWorker = await cluster.start();
      const input = runInput();
      const pending = await postRun(firstWorker, input);
      await firstWorker.stop();
      const secondWorker = await cluster.start({ CheckpointCode: 'FORGED' });

      const completed = await postRun(secondWorker, {
        ...input,
        resume: answers(pending.events),
      });
      const counters = await (
        await fetch(`${secondWorker.url}/__test/counters`)
      ).json();

      expect(completed.response.status).toBe(200);
      expect(counters).toMatchObject({
        durableProtected: 1,
        durableProtectedCode: 'PDX',
      });
      expect(secondWorker.requests).toHaveLength(1);
    });
  });
}

for (const identicalRunId of [false, true]) {
  test(`competing processes admit one claim with ${identicalRunId ? 'identical' : 'different'} browser run IDs`, async () => {
    await withDurableCluster('openai', async (cluster) => {
      const a = await cluster.start({ Workflow: 'confirm-before' });
      const b = await cluster.start({ Workflow: 'confirm-before' });
      const input = runInput();
      const created = await Promise.all([postRun(a, input), postRun(b, input)]);
      const resume = answers(created[0].events);
      const resumed = { ...input, resume };
      const advancing = postRun(a, resumed);

      try {
        await waitForStage(a, 'before');
        const competing = await postRun(b, {
          ...resumed,
          runId: identicalRunId ? input.runId : crypto.randomUUID(),
        });

        expect(answers(created[1].events)).toEqual(resume);
        expect(competing.response.status).toBe(409);
        expect(await durableEffects(b)).toBe(0);
      } finally {
        await control(a, 'release-checkpoint');
        await advancing;
      }
      expect(await durableEffects(b)).toBe(1);
    });
  });
}

for (const provider of ['openai', 'azure'] as const) {
  test(`${provider}: a process killed during preparation can be reclaimed after lease expiry`, async () => {
    await withDurableCluster(provider, async (cluster) => {
      const a = await cluster.start({ Workflow: 'confirm-before' });
      const b = await cluster.start();
      const input = runInput();
      const pending = await postRun(a, input);
      const resumed = { ...input, resume: answers(pending.events) };
      const crashed = postRun(a, resumed).catch(() => undefined);
      await waitForStage(a, 'before');
      await a.stop();
      await crashed;

      const stillLeased = await postRun(b, resumed);
      await control(b, 'expire-lease');
      const recovered = await postRun(b, resumed);

      expect(stillLeased.response.status).toBe(409);
      expect(recovered.response.status).toBe(200);
      expect(await durableEffects(b)).toBe(1);
      expect(b.requests).toHaveLength(1);
    });
  });
}

test('an old worker cannot dispatch or finalize the replacement claim after takeover', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({ Workflow: 'confirm-stale' });
    const b = await cluster.start({ Workflow: 'confirm-before' });
    const input = runInput();
    const pending = await postRun(a, input);
    const resumed = { ...input, resume: answers(pending.events) };
    const stale = postRun(a, resumed);
    await waitForStage(a, 'before');
    await control(b, 'expire-lease');
    const successor = postRun(b, resumed);

    try {
      await waitForStage(b, 'before');
      await control(a, 'release-checkpoint');
      await stale;
      const blocked = await postRun(a, resumed);

      expect(blocked.response.status).toBe(409);
      expect(await durableEffects(b)).toBe(0);
      expect(a.requests).toHaveLength(0);
    } finally {
      await control(a, 'release-checkpoint');
      await control(b, 'release-checkpoint');
      await Promise.all([stale, successor]);
    }
    expect(await durableEffects(b)).toBe(1);
    expect(b.requests).toHaveLength(1);
  });
});

for (const stage of ['marker', 'after'] as const) {
  test(`killing at ${stage} preserves the durable dispatch marker across restart`, async () => {
    await withDurableCluster('openai', async (cluster) => {
      const a = await cluster.start({ Workflow: `confirm-${stage}` });
      const input = runInput();
      const pending = await postRun(a, input);
      const resumed = { ...input, resume: answers(pending.events) };
      const crashed = postRun(a, resumed).catch(() => undefined);
      await waitForStage(a, stage);
      await a.stop();
      await crashed;
      const b = await cluster.start();

      await control(b, 'expire-lease');
      const replay = await postRun(b, resumed);

      expect(replay.response.status).toBe(409);
      expect(await durableEffects(b)).toBe(stage === 'marker' ? 0 : 1);
      expect(b.requests).toHaveLength(0);
    });
  });
}

for (const stage of ['before', 'marker', 'after'] as const) {
  test(`request cancellation at ${stage} ${stage === 'before' ? 'releases' : 'retains'} the durable claim`, async () => {
    await withDurableCluster('openai', async (cluster) => {
      const a = await cluster.start({ Workflow: `confirm-${stage}` });
      const b = await cluster.start();
      const input = runInput();
      const pending = await postRun(a, input);
      const resumed = { ...input, resume: answers(pending.events) };
      const cancellation = new AbortController();
      const advancing = fetch(`${a.url}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resumed),
        signal: cancellation.signal,
      })
        .then((response) => response.text())
        .catch(() => undefined);
      await waitForStage(a, stage);

      cancellation.abort();
      await advancing;
      await waitForCancellation(a);
      const retried = await retryReleased(b, resumed, stage === 'before');

      expect(retried.response.status).toBe(stage === 'before' ? 200 : 409);
      expect(await durableEffects(b)).toBe(stage === 'marker' ? 0 : 1);
      expect(b.requests).toHaveLength(stage === 'before' ? 1 : 0);
    });
  });
}

test('a valid preparation lease may cross approval expiry and complete', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({ Workflow: 'confirm-before' });
    const b = await cluster.start();
    const input = runInput();
    const pending = await postRun(a, input);
    const resumed = { ...input, resume: answers(pending.events) };
    const advancing = postRun(a, resumed);

    try {
      await waitForStage(a, 'before');
      await control(b, 'expire-approval');
      const cleanup = await postRun(b, {
        ...runInput(),
        threadId: 'cleanup-trigger',
      });
      expect(cleanup.response.status).toBe(200);
    } finally {
      await control(a, 'release-checkpoint');
    }
    const completed = await advancing;

    expect(completed.response.status).toBe(200);
    expect(completed.events.at(-1)?.type).toBe('RUN_FINISHED');
    expect(await durableEffects(b)).toBe(1);
  });
});

test('expired preparation cannot dispatch and expired approval cannot be reclaimed', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({ Workflow: 'confirm-stale' });
    const b = await cluster.start();
    const input = runInput();
    const pending = await postRun(a, input);
    const resumed = { ...input, resume: answers(pending.events) };
    const advancing = postRun(a, resumed);
    await waitForStage(a, 'before');

    await control(b, 'expire-lease');
    await control(b, 'expire-approval');
    await control(a, 'release-checkpoint');
    await advancing;
    const expired = await postRun(b, resumed);

    expect(expired.response.status).toBe(410);
    expect(await durableEffects(b)).toBe(0);
    expect(a.requests).toHaveLength(0);
    expect(b.requests).toHaveLength(0);
  });
});

for (const kind of ['version', 'parameters'] as const) {
  test(`invalid persisted operation ${kind} fails closed without consuming effect work`, async () => {
    await withDurableCluster('openai', async (cluster) => {
      const a = await cluster.start();
      const input = runInput();
      const pending = await postRun(a, input);
      await control(a, `corrupt-operation?kind=${kind}`);

      const invalid = await postRun(a, {
        ...input,
        resume: answers(pending.events),
      });

      expect(invalid.response.ok).toBe(false);
      expect(await durableEffects(a)).toBe(0);
      expect(a.requests).toHaveLength(0);
    });
  });
}

test('a deployment missing the stored operation version cannot execute the checkpoint', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start();
    const input = runInput();
    const pending = await postRun(a, input);
    await a.stop();
    const b = await cluster.start({ RegistryVersion: '2' });

    const invalid = await postRun(b, {
      ...input,
      resume: answers(pending.events),
    });

    expect(invalid.response.ok).toBe(false);
    expect(await durableEffects(b)).toBe(0);
    expect(b.requests).toHaveLength(0);
  });
});

for (const failure of [
  'database-unavailable?enabled=true',
  'fail-dispatch',
] as const) {
  test(`${failure} prevents both execution and model continuation`, async () => {
    await withDurableCluster('openai', async (cluster) => {
      const a = await cluster.start();
      const input = runInput();
      const pending = await postRun(a, input);
      await control(a, failure);

      const failed = await postRun(a, {
        ...input,
        resume: answers(pending.events),
      });
      if (failure.startsWith('database'))
        await control(a, 'database-unavailable?enabled=false');

      expect(
        failed.response.ok && failed.events.at(-1)?.type !== 'RUN_ERROR',
      ).toBe(false);
      expect(await durableEffects(a)).toBe(0);
      expect(a.requests).toHaveLength(0);
    });
  });
}

for (const decision of ['declined', 'cancelled'] as const) {
  test(`${decision} approval remains terminal after process restart`, async () => {
    await withDurableCluster('openai', async (cluster) => {
      const a = await cluster.start();
      const input = runInput();
      const pending = await postRun(a, input);
      const resume = answers(pending.events);
      const rejected =
        decision === 'declined'
          ? answers(pending.events, false)
          : resume.map(({ interruptId }) => ({
              interruptId,
              status: 'cancelled',
            }));

      const declined = await postRun(a, { ...input, resume: rejected });
      await a.stop();
      const b = await cluster.start();
      const replay = await postRun(b, { ...input, resume });

      expect(declined.response.status).toBe(200);
      expect(replay.response.status).toBe(409);
      expect(await durableEffects(b)).toBe(0);
      expect(a.requests).toHaveLength(0);
      expect(b.requests).toHaveLength(0);
    });
  });
}

test('scope, thread, fingerprint and malformed batches reject without consuming the valid batch', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start();
    const b = await cluster.start();
    const input = runInput();
    const pending = await postRun(a, input, { 'X-Fixture-Principal': 'alice' });
    const resume = answers(pending.events);
    const candidates = [
      { input: { ...input, resume }, principal: 'bob', status: 410 },
      {
        input: { ...input, threadId: 'other', resume },
        principal: 'alice',
        status: 410,
      },
      {
        input: { ...input, forwardedProps: { code: 'FORGED' }, resume },
        principal: 'alice',
        status: 400,
      },
      {
        input: { ...input, resume: [resume[0], resume[0]] },
        principal: 'alice',
        status: 400,
      },
      {
        input: {
          ...input,
          resume: resume.map((answer) => ({
            ...answer,
            payload: { approved: 'yes' },
          })),
        },
        principal: 'alice',
        status: 400,
      },
      {
        input: {
          ...input,
          resume: resume.map((answer) => ({
            ...answer,
            payload: { approved: true, replacementCode: 'FORGED' },
          })),
        },
        principal: 'alice',
        status: 400,
      },
      {
        input: {
          ...input,
          resume: resume.map((answer) => ({
            ...answer,
            interruptId: crypto.randomUUID(),
          })),
        },
        principal: 'alice',
        status: 410,
      },
    ];

    for (const candidate of candidates) {
      const rejected = await postRun(b, candidate.input, {
        'X-Fixture-Principal': candidate.principal,
      });
      expect(rejected.response.status).toBe(candidate.status);
      expect(await durableEffects(b)).toBe(0);
      expect(b.requests).toHaveLength(0);
    }
    const accepted = await postRun(
      b,
      { ...input, resume },
      { 'X-Fixture-Principal': 'alice' },
    );

    expect(accepted.response.status).toBe(200);
    expect(await durableEffects(b)).toBe(1);
  });
});

test('capacity cleanup retains dispatch markers and frees expired pending slots', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({
      InterruptCapacity: '2',
      Workflow: 'confirm-marker',
    });
    const b = await cluster.start({ InterruptCapacity: '2' });
    const input = runInput();
    const pending = await postRun(a, input);
    const resumed = { ...input, resume: answers(pending.events) };
    const crashed = postRun(a, resumed).catch(() => undefined);
    await waitForStage(a, 'marker');
    await a.stop();
    await crashed;
    const second = await postRun(b, { ...runInput(), threadId: 'second-slot' });

    const full = await postRun(b, { ...runInput(), threadId: 'over-capacity' });
    await control(b, 'expire-approval');
    const reclaimed = await postRun(b, {
      ...runInput(),
      threadId: 'reclaimed-slot',
    });
    const replay = await postRun(b, resumed);
    const stillFull = await postRun(b, {
      ...runInput(),
      threadId: 'marker-still-counts',
    });

    expect(second.events.at(-1)?.outcome).toMatchObject({ type: 'interrupt' });
    expect(full.events.at(-1)?.type).toBe('RUN_ERROR');
    expect(reclaimed.events.at(-1)?.outcome).toMatchObject({
      type: 'interrupt',
    });
    expect(replay.response.status).toBe(410);
    expect(stillFull.events.at(-1)?.type).toBe('RUN_ERROR');
    expect(await durableEffects(b)).toBe(0);
    expect(b.requests).toHaveLength(0);
  });
});

async function waitForCancellation(
  fixture: Parameters<typeof durableEffects>[0],
) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const counters = await (
      await fetch(`${fixture.url}/__test/counters`)
    ).json();
    if (counters.checkpointCancelled) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `Checkpoint cancellation was not observed: ${fixture.diagnostics()}`,
  );
}

async function retryReleased(
  fixture: Parameters<typeof postRun>[0],
  input: unknown,
  retry: boolean,
) {
  for (let attempt = 0; ; attempt++) {
    const result = await postRun(fixture, input);
    if (!retry || result.response.status !== 409 || attempt === 100)
      return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('missing complete-batch answers do not consume a batch and reordered complete answers succeed', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start();
    const b = await cluster.start();
    const input = runInput();
    const pending = await postRun(a, input);
    const resume = answers(pending.events);
    expect(resume.length).toBeGreaterThan(1);

    const incomplete = await postRun(b, { ...input, resume: resume.slice(1) });
    const reordered = await postRun(b, {
      ...input,
      resume: [...resume].reverse(),
    });
    await b.stop();
    const c = await cluster.start();
    const replay = await postRun(c, { ...input, resume });

    expect(incomplete.response.status).toBe(400);
    expect(reordered.response.status).toBe(200);
    expect(replay.response.status).toBe(409);
    expect(await durableEffects(c)).toBe(1);
    expect(c.requests).toHaveLength(0);
  });
});

test('database outage while creating a pending batch performs neither model nor effect work', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start();
    await control(a, 'database-unavailable?enabled=true');

    const failed = await postRun(a, runInput());
    await control(a, 'database-unavailable?enabled=false');

    expect(
      failed.response.ok && failed.events.at(-1)?.type !== 'RUN_ERROR',
    ).toBe(false);
    expect(await durableEffects(a)).toBe(0);
    expect(a.requests).toHaveLength(0);
  });
});

for (const identicalRunId of [false, true]) {
  test(`simultaneous claims using ${identicalRunId ? 'identical' : 'different'} run IDs execute exactly one protected invocation`, async () => {
    await withDurableCluster('openai', async (cluster) => {
      const a = await cluster.start();
      const b = await cluster.start();
      const input = runInput();
      const pending = await postRun(a, input);
      const resumed = { ...input, resume: answers(pending.events) };

      const results = await Promise.all([
        postRun(a, resumed),
        postRun(b, {
          ...resumed,
          runId: identicalRunId ? input.runId : crypto.randomUUID(),
        }),
      ]);

      expect(results.map(({ response }) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect(await durableEffects(a)).toBe(1);
      expect(a.requests.length + b.requests.length).toBe(1);
    });
  });
}

test('an expired preparation lease cannot dispatch even while approval remains valid', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({ Workflow: 'confirm-stale' });
    const b = await cluster.start();
    const input = runInput();
    const pending = await postRun(a, input);
    const resumed = { ...input, resume: answers(pending.events) };
    const advancing = postRun(a, resumed);
    await waitForStage(a, 'before');

    await control(b, 'expire-lease');
    await control(a, 'release-checkpoint');
    await advancing;
    const beforeReclaim = await durableEffects(b);
    const reclaimed = await postRun(b, resumed);

    expect(beforeReclaim).toBe(0);
    expect(a.requests).toHaveLength(0);
    expect(reclaimed.response.status).toBe(200);
    expect(await durableEffects(b)).toBe(1);
  });
});

test('simultaneous creation on different threads cannot exceed shared capacity', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({ InterruptCapacity: '1' });
    const b = await cluster.start({ InterruptCapacity: '1' });

    const results = await Promise.all([
      postRun(a, { ...runInput(), threadId: 'capacity-race-a' }),
      postRun(b, { ...runInput(), threadId: 'capacity-race-b' }),
    ]);

    expect(
      results.filter(({ events }) => events.at(-1)?.outcome !== undefined),
    ).toHaveLength(1);
    expect(
      results.filter(({ events }) => events.at(-1)?.type === 'RUN_ERROR'),
    ).toHaveLength(1);
    expect(await durableEffects(a)).toBe(0);
    expect(a.requests.length + b.requests.length).toBe(0);
  });
});

test('an unexpired preparation failure consumes the batch before effect or model work', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({ Workflow: 'confirm-prepare-failure' });
    const b = await cluster.start();
    const input = runInput();
    const pending = await postRun(a, input);
    const resumed = { ...input, resume: answers(pending.events) };

    const failed = await postRun(a, resumed);
    const replay = await postRun(b, resumed);

    expect(failed.events.at(-1)?.type).toBe('RUN_ERROR');
    expect(replay.response.status).toBe(409);
    expect(await durableEffects(b)).toBe(0);
    expect(a.requests).toHaveLength(0);
    expect(b.requests).toHaveLength(0);
  });
});

test('an expired preparation failure cannot consume the successor opportunity', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({
      Workflow: 'confirm-expired-prepare-failure',
    });
    const b = await cluster.start();
    const input = runInput();
    const pending = await postRun(a, input);
    const resumed = { ...input, resume: answers(pending.events) };
    const advancing = postRun(a, resumed);

    try {
      await waitForStage(a, 'before');
      await control(b, 'expire-lease');
    } finally {
      await control(a, 'release-checkpoint');
    }
    const failed = await advancing;
    const recovered = await postRun(b, resumed);

    expect(failed.events.at(-1)?.type).toBe('RUN_ERROR');
    expect(recovered.response.status).toBe(200);
    expect(await durableEffects(b)).toBe(1);
    expect(a.requests).toHaveLength(0);
    expect(b.requests).toHaveLength(1);
  });
});

test('simultaneous startup initializes one versioned schema safely', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const [a, b] = await Promise.all([cluster.start(), cluster.start()]);
    const input = runInput();

    const created = await Promise.all([postRun(a, input), postRun(b, input)]);

    expect(answers(created[0].events)).toEqual(answers(created[1].events));
    expect(await durableEffects(a)).toBe(0);
  });
});
