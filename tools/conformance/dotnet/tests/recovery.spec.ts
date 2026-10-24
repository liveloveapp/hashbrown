import { durableEffects, withDurableCluster } from '../harness/durable-fixture';
import { postRun, runInput } from '../harness/http-fixture';

test('read-only authenticated recovery survives worker death without model or effect work', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start();
    const input = runInput();
    await postRun(a, input, { 'X-Fixture-Principal': 'alice' });
    await a.stop();
    const b = await cluster.start();

    const response = await fetch(
      `${b.url}/threads/${input.threadId}/recovery`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fixture-Principal': 'alice',
        },
        body: JSON.stringify({
          tools: input.tools,
          forwardedProps: input.forwardedProps,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      schemaVersion: 1,
      effectState: 'Pending',
      generationOutcome: 'NotStarted',
      snapshot: {
        threadId: input.threadId,
        messages: input.messages,
        interrupts: expect.any(Array),
      },
    });
    expect(b.requests).toHaveLength(0);
    expect(await durableEffects(b)).toBe(0);
  });
});

function recovery(
  fixture: { url: string },
  principal = 'alice',
  body: unknown = { tools: [], forwardedProps: {} },
  threadId = 'fixture-thread',
) {
  return fetch(`${fixture.url}/threads/${threadId}/recovery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Fixture-Principal': principal,
    },
    body: JSON.stringify(body),
  });
}

function resume(events: ReadonlyArray<Record<string, unknown>>) {
  return (
    events.at(-1)?.outcome as { interrupts: Array<{ id: string }> }
  ).interrupts.map(({ id }) => ({
    interruptId: id,
    status: 'resolved',
    payload: { approved: true },
  }));
}

test('recovery authenticates and resolves scope before reporting configuration conflicts', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const fixture = await cluster.start();
    await postRun(fixture, runInput(), { 'X-Fixture-Principal': 'alice' });

    const anonymous = await recovery(fixture, 'unknown');
    const wrongScope = await recovery(fixture, 'bob', {
      tools: [],
      forwardedProps: { changed: true },
    });
    const incompatible = await recovery(fixture, 'alice', {
      tools: [],
      forwardedProps: { changed: true },
    });
    const malformed = await recovery(fixture, 'alice', { scope: 'bob' });

    expect(anonymous.status).toBe(401);
    expect(wrongScope.status).toBe(404);
    expect(incompatible.status).toBe(409);
    expect(malformed.status).toBe(400);
    expect(fixture.requests).toHaveLength(0);
  });
});

test('completed effects retain actual final native answer independently from original history', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start();
    const input = runInput();
    const pending = await postRun(a, input, { 'X-Fixture-Principal': 'alice' });
    const completed = await postRun(
      a,
      { ...input, resume: resume(pending.events) },
      { 'X-Fixture-Principal': 'alice' },
    );
    await a.stop();
    const b = await cluster.start();

    const response = await recovery(b);
    const envelope = await response.json();

    if (envelope.transcriptAvailability !== 'Complete')
      throw new Error(JSON.stringify({ envelope, events: completed.events }));
    expect(envelope).toMatchObject({
      effectState: 'Completed',
      generationOutcome: 'Finished',
      transcriptAvailability: 'Complete',
    });
    expect(envelope.snapshot.messages).toEqual([
      input.messages[0],
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello from .NET',
      }),
    ]);
    expect(envelope.snapshot.interrupts).toBeNull();
    expect(b.requests).toHaveLength(0);
    expect(await durableEffects(b)).toBe(1);
  });
});

test('operator reconciliation records an immutable scoped terminal resolution without retrying the effect', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({ Workflow: 'confirm-marker' });
    const input = runInput();
    const pending = await postRun(a, input, { 'X-Fixture-Principal': 'alice' });
    const advancing = postRun(
      a,
      { ...input, resume: resume(pending.events) },
      { 'X-Fixture-Principal': 'alice' },
    ).catch(() => undefined);
    const { waitForStage } = await import('../harness/durable-fixture');
    await waitForStage(a, 'marker');
    await a.stop();
    await advancing;
    const b = await cluster.start();
    const envelope = await (await recovery(b)).json();
    const endpoint = `${b.url}/checkpoints/${envelope.batchId}/reconcile`;
    const body = {
      expectedState: envelope.effectState,
      expectedGeneration: 1,
      expectedRevision: envelope.serverRevision,
      outcome: 'ConfirmedNotPerformed',
      reason: 'Stopped owner',
      evidenceReference: 'fixture://terminated-worker',
      externalQuiescenceAcknowledged: true,
    };

    const forbidden = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fixture-Principal': 'alice',
      },
      body: JSON.stringify(body),
    });
    const accepted = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fixture-Principal': 'operator',
      },
      body: JSON.stringify(body),
    });
    const replay = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fixture-Principal': 'operator',
      },
      body: JSON.stringify(body),
    });
    const inspected = await fetch(`${b.url}/checkpoints/${envelope.batchId}`, {
      headers: { 'X-Fixture-Principal': 'operator' },
    });

    expect(forbidden.status).toBe(403);
    expect(accepted.status).toBe(200);
    expect(replay.status).toBe(409);
    expect(await inspected.json()).toMatchObject({
      checkpoint: {
        effectState: 'Reconciled',
        reconciliationOutcome: 'ConfirmedNotPerformed',
      },
      audit: [
        expect.objectContaining({
          actor: 'operator',
          outcome: 'ConfirmedNotPerformed',
        }),
      ],
    });
    expect(await durableEffects(b)).toBe(0);
    expect(b.requests).toHaveLength(0);
  });
});

test('an active preparation lease remains busy after approval expiry', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({ Workflow: 'confirm-before' });
    const b = await cluster.start();
    const input = runInput();
    const pending = await postRun(a, input, { 'X-Fixture-Principal': 'alice' });
    const advancing = postRun(
      a,
      { ...input, resume: resume(pending.events) },
      { 'X-Fixture-Principal': 'alice' },
    );
    const { control, waitForStage } =
      await import('../harness/durable-fixture');
    try {
      await waitForStage(a, 'before');
      await control(b, 'expire-approval');

      const envelope = await (await recovery(b)).json();

      expect(envelope).toMatchObject({
        effectState: 'Claimed',
        disposition: 'Busy',
        generationOutcome: 'Running',
        snapshot: { interrupts: null },
      });
    } finally {
      await control(a, 'release-checkpoint');
      await advancing;
    }
  });
});

test('operator list is bounded and excludes privileged original request and parameters', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const fixture = await cluster.start();
    await postRun(fixture, runInput(), { 'X-Fixture-Principal': 'alice' });

    const response = await fetch(`${fixture.url}/checkpoints?limit=1`, {
      headers: { 'X-Fixture-Principal': 'operator' },
    });
    const text = await response.text();
    const oversized = await fetch(`${fixture.url}/checkpoints?limit=101`, {
      headers: { 'X-Fixture-Principal': 'operator' },
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({
      items: [
        expect.objectContaining({
          operationName: 'confirm-airport',
          effectState: 'Pending',
        }),
      ],
    });
    expect(text).not.toMatch(
      /claimToken|originalRequest|fixture-user|PDX|parameters/,
    );
    expect(oversized.status).toBe(400);
  });
});

test('configured system identity and nested JSON order survive native recovery and actual resumed admission', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start();
    const input = {
      ...runInput(),
      messages: [
        { id: 'original-overlay', role: 'system', content: 'Trusted system' },
        ...runInput().messages,
      ],
      forwardedProps: { z: 1, nested: { b: 2, a: 1 } },
      state: { serverOwned: 'original' },
    };
    await postRun(a, input, { 'X-Fixture-Principal': 'alice' });
    await a.stop();
    const b = await cluster.start();

    const incompatible = await recovery(b, 'alice', {
      system: 'Changed',
      tools: [],
      forwardedProps: input.forwardedProps,
    });
    const response = await recovery(b, 'alice', {
      system: 'Trusted system',
      tools: [],
      forwardedProps: input.forwardedProps,
    });
    const envelope = await response.json();
    const resumed = await postRun(
      b,
      {
        ...input,
        messages: envelope.snapshot.messages,
        state: envelope.snapshot.state,
        runId: crypto.randomUUID(),
        resume: envelope.snapshot.interrupts.map(({ id }: { id: string }) => ({
          interruptId: id,
          status: 'resolved',
          payload: { approved: true },
        })),
      },
      { 'X-Fixture-Principal': 'alice' },
    );

    expect(incompatible.status).toBe(409);
    expect(envelope.snapshot).toMatchObject({
      configuredSystemMessageId: 'original-overlay',
      messages: input.messages,
      state: input.state,
    });
    expect(resumed.response.status).toBe(200);
    expect(await durableEffects(b)).toBe(1);
    expect(b.requests).toHaveLength(1);
  });
});

test('legacy checkpoint migration retains dispatch safety without fabricating recoverable approvals', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start();
    await postRun(a, runInput(), { 'X-Fixture-Principal': 'alice' });
    const { control } = await import('../harness/durable-fixture');
    await control(a, 'legacy-schema');
    await a.stop();
    const [b, c] = await Promise.all([cluster.start(), cluster.start()]);

    const envelope = await (await recovery(b)).json();
    const list = await (
      await fetch(`${c.url}/checkpoints`, {
        headers: { 'X-Fixture-Principal': 'operator' },
      })
    ).json();

    expect(envelope).toMatchObject({
      effectState: 'Pending',
      transcriptAvailability: 'Unavailable',
      snapshot: null,
    });
    expect(list.items).toHaveLength(1);
    expect(await durableEffects(b)).toBe(0);
    expect(b.requests).toHaveLength(0);
  });
});

test('terminal persistence failure cannot acknowledge a durable completed answer', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const fixture = await cluster.start();
    const input = runInput();
    const pending = await postRun(fixture, input, {
      'X-Fixture-Principal': 'alice',
    });
    const { control } = await import('../harness/durable-fixture');
    await control(fixture, 'fail-terminal');

    const resumed = await fetch(`${fixture.url}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fixture-Principal': 'alice',
      },
      body: JSON.stringify({ ...input, resume: resume(pending.events) }),
    });
    const body = await resumed.text().catch(() => 'disconnected');
    const envelope = await (await recovery(fixture)).json();

    expect(body).not.toContain('RUN_FINISHED');
    expect(envelope).toMatchObject({
      effectState: 'Completed',
      generationOutcome: 'Unavailable',
      disposition: 'CompletedAnswerUnavailable',
      transcriptAvailability: 'Original',
    });
    expect(await durableEffects(fixture)).toBe(1);
  });
});

async function captureStage(fixture: { url: string }, expected: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const { stage } = await (
      await fetch(`${fixture.url}/__test/capture-stage`)
    ).json();
    if (stage === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Capture did not reach ${expected}`);
}

for (const gate of ['start', 'failure', 'finally'] as const) {
  test(`late old capture ${gate} cannot overwrite a successor's committed final answer`, async () => {
    await withDurableCluster('openai', async (cluster) => {
      const a = await cluster.start({
        CaptureGate: gate,
        Workflow: 'confirm-stale',
      });
      const b = await cluster.start();
      const input = runInput();
      const pending = await postRun(a, input, {
        'X-Fixture-Principal': 'alice',
      });
      const resumed = { ...input, resume: resume(pending.events) };
      const advancing = fetch(`${a.url}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fixture-Principal': 'alice',
        },
        body: JSON.stringify(resumed),
      })
        .then((response) => response.text())
        .catch(() => undefined);
      const { control, waitForStage } =
        await import('../harness/durable-fixture');
      if (gate === 'start') await captureStage(a, gate);
      else await waitForStage(a, 'before');
      await control(b, 'expire-lease');
      if (gate !== 'start') {
        await control(a, 'release-checkpoint');
        await captureStage(a, gate);
      }
      await postRun(b, resumed, { 'X-Fixture-Principal': 'alice' });
      const winner = await (await recovery(b)).json();

      await control(a, 'release-capture');
      await advancing;
      const after = await (await recovery(b)).json();

      expect(after).toEqual(winner);
      expect(after).toMatchObject({
        effectState: 'Completed',
        generationOutcome: 'Finished',
        transcriptAvailability: 'Complete',
      });
      expect(await durableEffects(b)).toBe(1);
      expect(a.requests).toHaveLength(0);
      expect(b.requests).toHaveLength(1);
    });
  });
}

test('late output and worker finish cannot overwrite reconciliation even after issued dispatch permission', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({
      Workflow: 'confirm-marker',
      CaptureGate: 'terminal',
    });
    const b = await cluster.start();
    const input = runInput();
    const pending = await postRun(a, input, { 'X-Fixture-Principal': 'alice' });
    const advancing = fetch(`${a.url}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fixture-Principal': 'alice',
      },
      body: JSON.stringify({ ...input, resume: resume(pending.events) }),
    })
      .then((response) => response.text())
      .catch(() => undefined);
    const { control, waitForStage } =
      await import('../harness/durable-fixture');
    await waitForStage(a, 'marker');
    const before = await (await recovery(b)).json();
    const response = await fetch(
      `${b.url}/checkpoints/${before.batchId}/reconcile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fixture-Principal': 'operator',
        },
        body: JSON.stringify({
          expectedState: 'EffectStarted',
          expectedGeneration: 1,
          expectedRevision: before.serverRevision,
          outcome: 'Unresolved',
          reason: 'Cannot establish downstream status',
          evidenceReference: 'fixture://external-review',
          externalQuiescenceAcknowledged: true,
        }),
      },
    );
    const reconciled = await (await recovery(b)).json();

    await control(a, 'release-checkpoint');
    await captureStage(a, 'terminal');
    await control(a, 'release-capture');
    await advancing;

    expect(response.status).toBe(200);
    expect(await (await recovery(b)).json()).toEqual(reconciled);
    expect(reconciled).toMatchObject({
      effectState: 'Reconciled',
      reconciliationOutcome: 'Unresolved',
      snapshot: { interrupts: null },
    });
    // This deliberately violates the operator's external assertion to prove CAS cannot revoke permission already issued.
    expect(await durableEffects(b)).toBe(1);
  });
});

test('reconciled audit remains scoped and inspectable after checkpoint retention cleanup', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({ Workflow: 'confirm-marker' });
    const input = runInput();
    const pending = await postRun(a, input, { 'X-Fixture-Principal': 'alice' });
    const advancing = postRun(
      a,
      { ...input, resume: resume(pending.events) },
      { 'X-Fixture-Principal': 'alice' },
    ).catch(() => undefined);
    const { control, waitForStage } =
      await import('../harness/durable-fixture');
    await waitForStage(a, 'marker');
    await a.stop();
    await advancing;
    const b = await cluster.start();
    const before = await (await recovery(b)).json();
    await fetch(`${b.url}/checkpoints/${before.batchId}/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fixture-Principal': 'operator',
      },
      body: JSON.stringify({
        expectedState: 'EffectStarted',
        expectedGeneration: 1,
        expectedRevision: before.serverRevision,
        outcome: 'Unresolved',
        reason: 'External review',
        evidenceReference: 'fixture://review',
        externalQuiescenceAcknowledged: true,
      }),
    });

    await control(b, 'age-retention');
    await postRun(b, { ...input, threadId: 'cleanup-trigger' });
    const inspected = await fetch(`${b.url}/checkpoints/${before.batchId}`, {
      headers: { 'X-Fixture-Principal': 'operator' },
    });

    expect(await inspected.json()).toMatchObject({
      checkpoint: null,
      audit: [
        expect.objectContaining({ actor: 'operator', outcome: 'Unresolved' }),
      ],
    });
    expect((await recovery(b)).status).toBe(404);
    expect(await durableEffects(b)).toBe(0);
  });
});

test('snapshot retention purges private history without reopening an unresolved dispatch marker', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({ Workflow: 'confirm-marker' });
    const input = runInput();
    const pending = await postRun(a, input, { 'X-Fixture-Principal': 'alice' });
    const advancing = postRun(
      a,
      { ...input, resume: resume(pending.events) },
      { 'X-Fixture-Principal': 'alice' },
    ).catch(() => undefined);
    const { control, waitForStage } =
      await import('../harness/durable-fixture');
    await waitForStage(a, 'marker');
    await a.stop();
    await advancing;
    const b = await cluster.start();

    await control(b, 'age-retention');
    await postRun(b, { ...input, threadId: 'cleanup-snapshot' });
    const envelope = await (await recovery(b)).json();
    const replay = await postRun(
      b,
      { ...input, resume: resume(pending.events) },
      { 'X-Fixture-Principal': 'alice' },
    );

    expect(envelope).toMatchObject({
      effectState: 'EffectStarted',
      disposition: 'UnknownEffect',
      transcriptAvailability: 'Unavailable',
      snapshot: null,
    });
    expect(replay.response.status).toBe(409);
    expect(await durableEffects(b)).toBe(0);
  });
});

test('audit failure rolls back reconciliation and preserves the exact prior revision and authority', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start({ Workflow: 'confirm-marker' });
    const input = runInput();
    const pending = await postRun(a, input, { 'X-Fixture-Principal': 'alice' });
    const advancing = postRun(
      a,
      { ...input, resume: resume(pending.events) },
      { 'X-Fixture-Principal': 'alice' },
    ).catch(() => undefined);
    const { control, waitForStage } =
      await import('../harness/durable-fixture');
    await waitForStage(a, 'marker');
    await a.stop();
    await advancing;
    const b = await cluster.start();
    const before = await (await recovery(b)).json();
    await control(b, 'fail-audit');

    const failed = await fetch(
      `${b.url}/checkpoints/${before.batchId}/reconcile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fixture-Principal': 'operator',
        },
        body: JSON.stringify({
          expectedState: 'EffectStarted',
          expectedGeneration: 1,
          expectedRevision: before.serverRevision,
          outcome: 'Unresolved',
          reason: 'Evidence',
          evidenceReference: 'fixture://evidence',
          externalQuiescenceAcknowledged: true,
        }),
      },
    );
    const inspection = await (
      await fetch(`${b.url}/checkpoints/${before.batchId}`, {
        headers: { 'X-Fixture-Principal': 'operator' },
      })
    ).json();

    expect(failed.status).toBe(503);
    expect(await (await recovery(b)).json()).toEqual(before);
    expect(inspection.audit).toEqual([]);
    expect(await durableEffects(b)).toBe(0);
  });
});

test('original request and query byte/message limits reject before model or effect work', async () => {
  const { withDotnetFixture } = await import('../harness/http-fixture');
  await withDotnetFixture(
    'openai',
    async (fixture) => {
      const oversized = await postRun(
        fixture,
        runInput('x'.repeat(256 * 1024)),
        { 'X-Fixture-Principal': 'alice' },
      );
      const tooMany = await postRun(
        fixture,
        {
          ...runInput(),
          messages: Array.from({ length: 2049 }, (_, id) => ({
            id: String(id),
            role: 'user',
            content: 'x',
          })),
        },
        { 'X-Fixture-Principal': 'alice' },
      );

      const query = await recovery(fixture, 'alice', {
        tools: [],
        forwardedProps: { large: 'x'.repeat(256 * 1024) },
      });
      const missing = await recovery(fixture);

      expect(oversized.events.at(-1)?.type).toBe('RUN_ERROR');
      expect(tooMany.events.at(-1)?.type).toBe('RUN_ERROR');
      expect(query.status).toBe(413);
      expect(missing.status).toBe(404);
      expect(fixture.requests).toHaveLength(0);
      expect(
        (await (await fetch(`${fixture.url}/__test/counters`)).json())
          .protected,
      ).toBe(0);
    },
    'confirm',
  );
});

test('authoritative database or missing operation registry returns unavailable without model fallback', async () => {
  await withDurableCluster('openai', async (cluster) => {
    const a = await cluster.start();
    await postRun(a, runInput(), { 'X-Fixture-Principal': 'alice' });
    const { control } = await import('../harness/durable-fixture');
    await control(a, 'database-unavailable?enabled=true');

    const unavailable = await recovery(a);
    await control(a, 'database-unavailable?enabled=false');
    await a.stop();
    const b = await cluster.start({ RegistryVersion: '2' });
    const incompatible = await recovery(b);

    expect(unavailable.status).toBe(503);
    expect(incompatible.status).toBe(503);
    expect(a.requests).toHaveLength(0);
    expect(b.requests).toHaveLength(0);
    expect(await durableEffects(b)).toBe(0);
  });
});

test('process-local storage preserves original state and complete confirmations with the durable HTTP contract', async () => {
  const { withDotnetFixture } = await import('../harness/http-fixture');
  await withDotnetFixture(
    'openai',
    async (fixture) => {
      const input = { ...runInput(), state: { server: 'original' } };
      await postRun(fixture, input, { 'X-Fixture-Principal': 'alice' });

      const envelope = await (await recovery(fixture)).json();
      const completed = await postRun(
        fixture,
        {
          ...input,
          state: { browser: 'forged' },
          resume: envelope.snapshot.interrupts.map(
            ({ id }: { id: string }) => ({
              interruptId: id,
              status: 'resolved',
              payload: { approved: true },
            }),
          ),
        },
        { 'X-Fixture-Principal': 'alice' },
      );
      const final = await (await recovery(fixture)).json();

      expect(envelope.snapshot.state).toEqual(input.state);
      expect(envelope.snapshot.interrupts).toHaveLength(2);
      expect(completed.response.status).toBe(200);
      expect(final).toMatchObject({
        effectState: 'Completed',
        generationOutcome: 'Finished',
        transcriptAvailability: 'Complete',
        snapshot: { state: input.state, interrupts: null },
      });
      expect(fixture.requests).toHaveLength(1);
    },
    'confirm',
  );
});

test('actual native server-tool continuation preserves complete canonical final history without replay', async () => {
  const { withDotnetFixture } = await import('../harness/http-fixture');
  await withDotnetFixture(
    'openai',
    async (fixture) => {
      fixture.mock.onToolResult('recovered-airport', {
        content: 'Airport found',
      });
      fixture.mock.onMessage('Lookup fixture', {
        toolCalls: [
          {
            id: 'recovered-airport',
            name: 'lookupAirport',
            arguments: { code: 'PDX' },
          },
        ],
      });
      const input = runInput('Lookup fixture');
      const pending = await postRun(fixture, input, {
        'X-Fixture-Principal': 'alice',
      });
      const completed = await postRun(
        fixture,
        { ...input, resume: resume(pending.events) },
        { 'X-Fixture-Principal': 'alice' },
      );

      const envelope = await (await recovery(fixture)).json();

      if (envelope.transcriptAvailability !== 'Complete')
        throw new Error(JSON.stringify({ envelope, events: completed.events }));
      expect(envelope).toMatchObject({
        effectState: 'Completed',
        generationOutcome: 'Finished',
        transcriptAvailability: 'Complete',
      });
      expect(envelope.snapshot.messages).toContainEqual(
        expect.objectContaining({
          role: 'tool',
          toolCallId: 'recovered-airport',
        }),
      );
      expect(envelope.snapshot.messages.at(-1)).toMatchObject({
        role: 'assistant',
        content: 'Airport found',
      });
      expect(fixture.requests).toHaveLength(2);
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ server: 1, protected: 1 });
    },
    'confirm',
  );
});
