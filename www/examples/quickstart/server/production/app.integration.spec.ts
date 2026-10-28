import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { createProductionServer } from './app';

/** Opens an isolated runtime using only the explicitly supplied disposable database. */
async function server() {
  const databaseUrl = process.env['PRODUCTION_TEST_DATABASE_URL'];
  if (!databaseUrl) throw new Error('Set PRODUCTION_TEST_DATABASE_URL');
  return createProductionServer({
    databaseUrl,
    secret: 'integration-shared-secret-32-characters',
    origin: 'http://localhost:4310',
    tablePrefix: `test_${randomUUID().replaceAll('-', '')}`,
  });
}

test('cold recovery is read-only across a replacement runtime and denies a foreign owner', async () => {
  const first = await server();
  const created = await first.fetch(
    new Request('http://localhost:4310/api/production/threads', {
      method: 'POST',
      headers: { origin: 'http://localhost:4310' },
    }),
  );
  const cookie = (created.headers.get('set-cookie') ?? '').split(';')[0];
  const { threadId } = await created.json();

  const recovery = await first.fetch(
    new Request(
      `http://localhost:4310/api/production/threads/${threadId}/recovery`,
      { headers: { cookie } },
    ),
  );
  const foreign = await first.fetch(
    new Request(
      `http://localhost:4310/api/production/threads/${threadId}/recovery`,
    ),
  );
  const denied = await first.fetch(
    new Request('http://localhost:4310/api/production/threads', {
      method: 'POST',
      headers: { origin: 'https://evil.test' },
    }),
  );

  expect(recovery.status).toBe(200);
  expect(await recovery.json()).toMatchObject({
    disposition: 'idle',
    snapshot: { messages: [] },
    application: { revision: 0, plan: null },
  });
  const stale = await first.fetch(
    new Request('http://localhost:4310/api/production/run', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:4310',
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId,
        runId: randomUUID(),
        messages: [],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
        resume: [
          {
            interruptId: 'stale',
            status: 'resolved',
            payload: 'once',
            metadata: { grant: 'stale' },
          },
        ],
      }),
    }),
  );
  expect(stale.status).toBe(409);
  expect(foreign.status).toBe(404);
  expect(denied.status).toBe(403);
  await first.close();
});

test('a replacement replica reads the same durable thread without provider calls and shared admission reports busy', async () => {
  const databaseUrl = process.env['PRODUCTION_TEST_DATABASE_URL'];
  if (!databaseUrl) throw new Error('Set PRODUCTION_TEST_DATABASE_URL');
  const tablePrefix = `replica_${randomUUID().replaceAll('-', '')}`;
  const options = {
    databaseUrl,
    secret: 'integration-shared-secret-32-characters',
    origin: 'http://localhost:4310',
    tablePrefix,
  };
  const first = await createProductionServer(options);
  const created = await first.fetch(
    new Request(`${options.origin}/api/production/threads`, {
      method: 'POST',
      headers: { origin: options.origin },
    }),
  );
  const cookie = (created.headers.get('set-cookie') ?? '').split(';')[0];
  const { threadId } = await created.json();
  await first.close();
  const second = await createProductionServer(options);
  const third = await createProductionServer(options);
  const request = () =>
    new Request(
      `${options.origin}/api/production/threads/${threadId}/recovery`,
      { headers: { cookie } },
    );

  const [left, right] = await Promise.all([
    second.fetch(request()),
    third.fetch(request()),
  ]);
  const recovered = await second.fetch(request());

  expect([left.status, right.status]).toEqual([200, 200]);
  expect(await recovered.json()).toMatchObject({
    disposition: 'idle',
    application: { revision: 0, plan: null },
    snapshot: { threadId, messages: [] },
  });
  await Promise.all([second.close(), third.close()]);
});

test('recovery retains native parked identities and marks an already consumed durable grant unknown', async () => {
  const databaseUrl = process.env['PRODUCTION_TEST_DATABASE_URL'];
  if (!databaseUrl) throw new Error('Set PRODUCTION_TEST_DATABASE_URL');
  const tablePrefix = `park_${randomUUID().replaceAll('-', '')}`;
  const options = {
    databaseUrl,
    secret: 'integration-shared-secret-32-characters',
    origin: 'http://localhost:4310',
    tablePrefix,
  };
  const reference = await createProductionServer(options);
  const created = await reference.fetch(
    new Request(`${options.origin}/api/production/threads`, {
      method: 'POST',
      headers: { origin: options.origin },
    }),
  );
  const cookie = (created.headers.get('set-cookie') ?? '').split(';')[0];
  const { threadId } = await created.json();
  const {
    createPostgresPool,
    postgresCheckpointer,
    createPostgresThreadsStore,
    createPostgresInterruptGrantStore,
  } = await import('@b4run/postgres-storage/node');
  const { emptyCheckpoint } = await import('@langchain/langgraph-checkpoint');
  const { AIMessage, HumanMessage } = await import('@langchain/core/messages');
  const pool = createPostgresPool({ connectionString: databaseUrl });
  const naming = { pool, schema: 'hashbrown_production', tablePrefix };
  const saver = postgresCheckpointer(naming);
  const checkpoint = {
    ...emptyCheckpoint(),
    channel_values: {
      messages: [
        new HumanMessage({ id: 'original-user', content: 'Plan the demo' }),
        new AIMessage({
          id: 'original-assistant',
          content: '',
          tool_calls: [{ id: 'original-call', name: 'acceptPlan', args: {} }],
        }),
      ],
    },
  };
  const config = await saver.put(
    { configurable: { thread_id: threadId, checkpoint_ns: '' } },
    checkpoint,
    {
      source: 'loop',
      step: 1,
      parents: {},
      ...{
        'b4:checkpoint-routes': {
          checkpointId: checkpoint.id,
          routes: ['/recording-plan-v1#agent'],
        },
      },
    },
    {},
  );
  const envelope = {
    interruptId: 'parked-approval',
    type: 'permission-request',
    kind: 'tool',
    toolCallId: 'original-call',
    grant: 'opaque-fixture-grant',
    allowAlways: false,
  };
  await saver.putWrites(
    config,
    [['__interrupt__', { id: 'a'.repeat(32), value: envelope }]],
    'original-task',
  );
  await createPostgresThreadsStore(naming).updateStatus(
    threadId,
    'interrupted',
  );
  const grants = createPostgresInterruptGrantStore(naming);
  const at = new Date().toISOString();
  await grants.issue({
    threadId,
    interruptId: envelope.interruptId,
    checkpointNs: 'tools:original-task',
    tokenHash: await (
      await import('@b4run/sdk')
    ).hashApprovalGrant(envelope.grant),
    issuedAt: at,
    expiresAt: null,
    consumedAt: null,
    consumedDecision: null,
    consumedBy: null,
    voidedAt: null,
  });
  const request = () =>
    new Request(
      `${options.origin}/api/production/threads/${threadId}/recovery`,
      { headers: { cookie } },
    );

  const parked = await reference.fetch(request());
  await pool.query(
    `UPDATE hashbrown_production.${tablePrefix}_interrupt_grants SET checkpoint_ns = $1 WHERE thread_id = $2`,
    ['tools:foreign-task', threadId],
  );
  const mismatched = await reference.fetch(request());
  expect(await mismatched.json()).toMatchObject({ disposition: 'unknown' });
  await pool.query(
    `UPDATE hashbrown_production.${tablePrefix}_interrupt_grants SET checkpoint_ns = $1 WHERE thread_id = $2`,
    ['tools:original-task', threadId],
  );
  await grants.consume({
    threadId,
    interruptId: envelope.interruptId,
    decision: 'once',
    at,
  });
  const consumed = await reference.fetch(request());

  expect(parked.status).toBe(200);
  expect(await parked.json()).toMatchObject({
    disposition: 'paused',
    snapshot: {
      messages: [{ id: 'original-user' }, { id: 'original-assistant' }],
      interrupts: [{ id: 'parked-approval', metadata: envelope }],
    },
  });
  expect(consumed.status).toBe(200);
  const uncertain = await consumed.json();
  expect(uncertain).toMatchObject({
    disposition: 'unknown',
    application: { revision: 0, plan: null },
  });
  expect(uncertain.snapshot.interrupts).toBeUndefined();
  await reference.close();
  await pool.end();
});
