import { postRun, runInput, withDotnetFixture } from '../harness/http-fixture';

function answers(events: ReadonlyArray<Record<string, unknown>>) {
  const outcome = events.at(-1)?.outcome as {
    interrupts: Array<{ id: string }>;
  };
  return outcome.interrupts.map(({ id }) => ({
    interruptId: id,
    status: 'resolved',
    payload: { approved: true },
  }));
}

test('expired confirmations cannot advance model or tool work', async () => {
  await withDotnetFixture(
    'openai',
    async (fixture) => {
      const input = runInput();
      const first = await postRun(fixture, input);

      const advanced = await fetch(`${fixture.url}/__test/advance-clock`, {
        method: 'POST',
      });
      const result = await postRun(fixture, {
        ...input,
        resume: answers(first.events),
      });

      expect(advanced.status).toBe(200);
      expect(result.response.status).toBe(410);
      expect(fixture.requests).toHaveLength(0);
    },
    'confirm',
  );
});

test('a different principal cannot consume another caller confirmation', async () => {
  await withDotnetFixture(
    'openai',
    async (fixture) => {
      const input = runInput();
      const first = await postRun(fixture, input, {
        'X-Fixture-Principal': 'alice',
      });

      const result = await postRun(
        fixture,
        { ...input, resume: answers(first.events) },
        { 'X-Fixture-Principal': 'bob' },
      );

      expect(result.response.status).toBe(410);
      expect(fixture.requests).toHaveLength(0);
    },
    'confirm',
  );
});

test('a resume cannot replace the conversation that was confirmed', async () => {
  await withDotnetFixture(
    'openai',
    async (fixture) => {
      const input = runInput();
      const first = await postRun(fixture, input);

      const result = await postRun(fixture, {
        ...runInput('Changed action'),
        resume: answers(first.events),
      });

      expect(result.response.status).toBe(400);
      expect(fixture.requests).toHaveLength(0);
    },
    'confirm',
  );
});

test('concurrent resume cannot repeat a protected server function', async () => {
  await withDotnetFixture(
    'openai',
    async (fixture) => {
      let entered = () => undefined as void;
      let release = () => undefined as void;
      const arrived = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      fixture.mock.onToolResult('airport-once', async () => {
        entered();
        await gate;
        return { content: 'Completed' };
      });
      fixture.mock.onMessage('Protected fixture', {
        toolCalls: [
          {
            id: 'airport-once',
            name: 'lookupAirport',
            arguments: { code: 'PDX' },
          },
        ],
      });
      const input = runInput('Protected fixture');
      const first = await postRun(fixture, input);
      const resumed = {
        ...input,
        runId: crypto.randomUUID(),
        resume: answers(first.events),
      };
      const advancing = postRun(fixture, resumed);

      try {
        await arrived;
        const competing = await postRun(fixture, {
          ...resumed,
          runId: crypto.randomUUID(),
        });

        expect(competing.response.status).toBe(409);
        expect(
          await (await fetch(`${fixture.url}/__test/counters`)).json(),
        ).toMatchObject({ server: 1, protected: 1 });
      } finally {
        release();
        await advancing;
      }
    },
    'confirm',
  );
});

test('resumes a server-owned checkpoint once and rejects replacement parameters', async () => {
  await withDotnetFixture(
    'openai',
    async (fixture) => {
      const input = runInput();
      const first = await postRun(fixture, input);
      const resume = answers(first.events);

      const forged = await postRun(fixture, {
        ...input,
        forwardedProps: { code: 'FORGED' },
        resume,
      });
      const accepted = await postRun(fixture, { ...input, resume });
      const secondBatch = await postRun(fixture, input);
      const replay = await postRun(fixture, { ...input, resume });

      expect(forged.response.status).toBe(400);
      expect(accepted.response.status).toBe(200);
      expect(secondBatch.events.at(-1)?.outcome).toMatchObject({
        type: 'interrupt',
      });
      expect(replay.response.status).toBe(409);
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ protected: 1, protectedCode: 'PDX' });
    },
    'confirm',
  );
});

for (const stage of ['before', 'after'] as const) {
  test(`cancel ${stage} the protected effect ${stage === 'before' ? 'releases' : 'retains'} the claim`, async () => {
    await withDotnetFixture(
      'openai',
      async (fixture) => {
        const input = runInput();
        const first = await postRun(fixture, input);
        const resumed = {
          ...input,
          runId: crypto.randomUUID(),
          resume: answers(first.events),
        };
        const cancellation = new AbortController();
        const advancing = fetch(`${fixture.url}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(resumed),
          signal: cancellation.signal,
        })
          .then((response) => response.text())
          .catch(() => undefined);
        let observed: Record<string, unknown> = {};
        for (let attempt = 0; attempt < 100; attempt++) {
          observed = await (
            await fetch(`${fixture.url}/__test/counters`)
          ).json();
          if (observed['checkpointStage'] === stage) break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(observed['checkpointStage']).toBe(stage);

        cancellation.abort();
        await advancing;
        for (let attempt = 0; attempt < 100; attempt++) {
          observed = await (
            await fetch(`${fixture.url}/__test/counters`)
          ).json();
          if (observed['checkpointCancelled']) break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(observed['checkpointCancelled']).toBe(true);
        await fetch(`${fixture.url}/__test/release-checkpoint`, {
          method: 'POST',
        });
        let retried;
        for (let attempt = 0; attempt < 100; attempt++) {
          retried = await postRun(fixture, {
            ...resumed,
            runId: crypto.randomUUID(),
          });
          if (stage === 'after' || retried.response.status !== 409) break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        expect(retried?.response.status).toBe(stage === 'before' ? 200 : 409);
        expect(
          await (await fetch(`${fixture.url}/__test/counters`)).json(),
        ).toMatchObject({ protected: 1 });
      },
      `confirm-${stage}`,
    );
  });
}

test('an active checkpoint survives TTL cleanup until its effect completes', async () => {
  await withDotnetFixture(
    'openai',
    async (fixture) => {
      const input = runInput();
      const first = await postRun(fixture, input);
      const advancing = postRun(fixture, {
        ...input,
        resume: answers(first.events),
      });
      for (let attempt = 0; attempt < 100; attempt++) {
        const counters = await (
          await fetch(`${fixture.url}/__test/counters`)
        ).json();
        if (counters.checkpointStage === 'after') break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ checkpointStage: 'after' });

      await fetch(`${fixture.url}/__test/advance-clock`, { method: 'POST' });
      await postRun(fixture, { ...runInput(), threadId: 'another-thread' });
      await fetch(`${fixture.url}/__test/release-checkpoint`, {
        method: 'POST',
      });
      const completed = await advancing;

      expect(completed.response.status).toBe(200);
      expect(completed.events.at(-1)?.type).toBe('RUN_FINISHED');
      expect(fixture.diagnostics()).not.toContain(
        'Sequence contains no matching element',
      );
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ protected: 1 });
    },
    'confirm-after',
  );
});

test('rejects malformed complete batches without consuming the valid checkpoint', async () => {
  await withDotnetFixture(
    'openai',
    async (fixture) => {
      const input = runInput();
      const first = await postRun(fixture, input);
      const entries = answers(first.events);
      const invalid = [
        {
          status: 410,
          entries: entries.map((entry) => ({
            ...entry,
            interruptId: crypto.randomUUID(),
          })),
        },
        { status: 400, entries: [entries[0], entries[0]] },
        {
          status: 400,
          entries: entries.map((entry) => ({
            ...entry,
            payload: { approved: 'yes' },
          })),
        },
        {
          status: 400,
          entries: entries.map((entry) => ({
            ...entry,
            payload: { approved: true, replacementCode: 'FORGED' },
          })),
        },
        {
          status: 400,
          entries: entries.map((entry) => ({ ...entry, status: 'cancelled' })),
        },
      ];

      for (const candidate of invalid) {
        const rejected = await postRun(fixture, {
          ...input,
          resume: candidate.entries,
        });
        expect(rejected.response.status).toBe(candidate.status);
        expect(fixture.requests).toHaveLength(0);
      }
      const wrongThread = await postRun(fixture, {
        ...input,
        threadId: 'other-thread',
        resume: entries,
      });
      const accepted = await postRun(fixture, { ...input, resume: entries });

      expect(wrongThread.response.status).toBe(410);
      expect(accepted.response.status).toBe(200);
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ protected: 1 });
    },
    'confirm',
  );
});

test('bounds pending records without evicting an earlier batch and reclaims expired capacity', async () => {
  await withDotnetFixture(
    'openai',
    async (fixture) => {
      const input = runInput();
      const first = await postRun(fixture, input);
      for (let index = 1; index < 128; index++) {
        const created = await postRun(fixture, {
          ...input,
          threadId: `capacity-${index}`,
        });
        expect(created.events.at(-1)?.outcome).toMatchObject({
          type: 'interrupt',
        });
      }

      const full = await postRun(fixture, {
        ...input,
        threadId: 'over-capacity',
      });
      const original = await postRun(fixture, {
        ...input,
        resume: answers(first.events),
      });
      await fetch(`${fixture.url}/__test/advance-clock`, { method: 'POST' });
      const reclaimed = await postRun(fixture, {
        ...input,
        threadId: 'after-expiry',
      });

      expect(full.events.at(-1)?.type).toBe('RUN_ERROR');
      expect(original.response.status).toBe(200);
      expect(reclaimed.events.at(-1)?.outcome).toMatchObject({
        type: 'interrupt',
      });
      expect(fixture.requests).toHaveLength(1);
    },
    'confirm',
  );
});
