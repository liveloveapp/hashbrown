import { randomUUID } from 'node:crypto';
import { createPostgresPool } from '@b4run/postgres-storage/node';
import { expect, test } from 'vitest';
import { createProductionServer } from './app';
import { createApplicationStore } from './storage';
import { startNativeProviderFixture } from './provider-fixture';

/** Exercises native HTTP envelopes with a deterministic local model transport, never published recordings. */
test('two native replica resumes consume one grant and commit one effect while a valid foreign session sees nothing', async () => {
  const databaseUrl = process.env['PRODUCTION_TEST_DATABASE_URL'];
  if (!databaseUrl) throw new Error('Set PRODUCTION_TEST_DATABASE_URL');
  const fixture = await startNativeProviderFixture();
  const previousBase = process.env['OPENAI_BASE_URL'];
  const previousKey = process.env['OPENAI_API_KEY'];
  process.env['OPENAI_BASE_URL'] = fixture.url;
  process.env['OPENAI_API_KEY'] = 'local-integration-fixture';
  const options = {
    databaseUrl,
    secret: 'integration-shared-secret-32-characters',
    origin: 'http://localhost:4310',
    tablePrefix: `native_${randomUUID().replaceAll('-', '')}`,
  };
  const first = await createProductionServer(options);
  const second = await createProductionServer(options);
  const pool = createPostgresPool({ connectionString: databaseUrl });
  const create = async (reference: typeof first) => {
    const response = await reference.fetch(
      new Request(`${options.origin}/api/production/threads`, {
        method: 'POST',
        headers: { origin: options.origin },
      }),
    );
    return {
      cookie: (response.headers.get('set-cookie') ?? '').split(';')[0],
      threadId: (await response.json()).threadId as string,
    };
  };
  const post = (reference: typeof first, cookie: string, input: unknown) =>
    reference.fetch(
      new Request(`${options.origin}/api/production/run`, {
        method: 'POST',
        headers: {
          cookie,
          origin: options.origin,
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
      }),
    );
  try {
    const owner = await create(first);
    const foreign = await create(second);
    const input = {
      threadId: owner.threadId,
      runId: randomUUID(),
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          content: 'Propose the recording plan.',
        },
      ],
      state: {},
      tools: [],
      context: [],
      forwardedProps: {},
    };
    const initial = await post(first, owner.cookie, input);
    expect(initial.status).toBe(200);
    expect(await initial.text()).toContain('TOOL_CALL_START');
    const recoveryRequest = (cookie: string) =>
      new Request(
        `${options.origin}/api/production/threads/${owner.threadId}/recovery`,
        { headers: { cookie } },
      );
    const recovered = await first.fetch(recoveryRequest(owner.cookie));
    const parked = await recovered.json();
    expect(parked.disposition).toBe('paused');
    expect(parked.snapshot.interrupts).toHaveLength(1);
    const interrupt = parked.snapshot.interrupts[0];
    const resume = {
      ...input,
      runId: randomUUID(),
      messages: parked.snapshot.messages,
      resume: [
        {
          interruptId: interrupt.id,
          status: 'resolved',
          payload: 'once',
          metadata: { grant: interrupt.metadata.grant },
        },
      ],
    };
    const foreignRead = await second.fetch(recoveryRequest(foreign.cookie));
    const foreignResume = await post(second, foreign.cookie, resume);
    expect(foreignRead.status).toBe(404);
    expect(foreignResume.status).toBe(404);
    expect(await foreignRead.json()).toEqual({ error: 'Thread not found' });
    expect(await foreignResume.json()).toEqual({ error: 'Thread not found' });
    expect(
      await createApplicationStore(pool).receiptCount(owner.threadId),
    ).toBe(0);

    const raced = await Promise.all([
      post(first, owner.cookie, resume),
      post(second, owner.cookie, { ...resume, runId: randomUUID() }),
    ]);
    const bodies = await Promise.all(raced.map((response) => response.text()));
    const final = await second.fetch(recoveryRequest(owner.cookie));
    const settled = await final.json();
    const repeated = await post(first, owner.cookie, {
      ...resume,
      runId: randomUUID(),
    });

    expect(raced.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(
      bodies.filter((body) => body.includes('TOOL_CALL_RESULT')),
    ).toHaveLength(1);
    expect(
      bodies.some((body) => body.includes('Missing fenced request context')),
    ).toBe(false);
    expect(settled).toMatchObject({
      disposition: 'idle',
      application: { revision: 1 },
    });
    expect(
      await createApplicationStore(pool).receiptCount(owner.threadId),
    ).toBe(1);
    expect(repeated.status).toBe(409);
    expect(fixture.requests()).toBe(1);
    expect(fixture.toolNames()).toEqual(['acceptPlan']);
  } finally {
    await Promise.all([first.close(), second.close(), pool.end()]);
    await fixture.close();
    if (previousBase === undefined) delete process.env['OPENAI_BASE_URL'];
    else process.env['OPENAI_BASE_URL'] = previousBase;
    if (previousKey === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = previousKey;
  }
});
