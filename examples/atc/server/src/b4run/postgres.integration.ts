import { randomUUID } from 'node:crypto';
import { expect, onTestFinished, test } from 'vitest';
import { pruneAnonymousThreads } from './cleanup';
import { createSharedAgentStores } from './stores';
import { THREAD_LIFETIME_MS } from './thread-policy';

const databaseUrl = process.env['ATC_TEST_DATABASE_URL'];
if (!databaseUrl)
  throw new Error('ATC_TEST_DATABASE_URL must name a disposable test database');

async function replicas() {
  const first = await createSharedAgentStores(databaseUrl as string);
  onTestFinished(() => first.close());
  const second = await createSharedAgentStores(databaseUrl as string);
  onTestFinished(() => second.close());
  return { first, second };
}

async function saveCheckpoint(
  stores: Awaited<ReturnType<typeof createSharedAgentStores>>,
  threadId: string,
) {
  return stores.checkpointer.put(
    { configurable: { thread_id: threadId, checkpoint_ns: '' } },
    {
      v: 4,
      id: randomUUID(),
      ts: new Date().toISOString(),
      channel_values: { result: 'browser result' },
      channel_versions: {},
      versions_seen: {},
    },
    { source: 'input', step: 0, parents: {} },
    {},
  );
}

test('independent Postgres pools share anonymous threads and checkpoints', async () => {
  const { first, second } = await replicas();
  const threadId = randomUUID();
  await first.threads.createThread({
    thread_id: threadId,
    metadata: { owner: 'visitor-a' },
  });

  const config = await saveCheckpoint(first, threadId);
  const thread = await second.threads.getThread(threadId);
  const checkpoint = await second.checkpointer.get(config);

  expect(thread?.metadata).toEqual({ owner: 'visitor-a' });
  expect(checkpoint?.channel_values).toEqual({ result: 'browser result' });
});

test('Postgres stores preserve partial browser results and accept each result once across replicas', async () => {
  const { first, second } = await replicas();
  const threadId = randomUUID();
  const at = new Date().toISOString();
  for (const toolCallId of ['find', 'highlight']) {
    await first.clientTools.issue({
      threadId,
      toolCallId,
      kind: 'client',
      interruptId: `client-${toolCallId}`,
      toolName: toolCallId === 'find' ? 'findAircraft' : 'highlightAircraft',
      runId: 'run',
      routeId: '/atc#agent',
      issuedAt: at,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      answeredAt: null,
      result: null,
      voidedAt: null,
      settledAt: null,
      parentToolCallId: null,
    });
  }

  const answers = await Promise.all(
    [first, second].map((store) =>
      store.clientTools.answer({
        threadId,
        toolCallId: 'find',
        result: 'found',
        at,
      }),
    ),
  );
  const pending = await second.clientTools.listOutstanding(threadId);
  await second.clientTools.answer({
    threadId,
    toolCallId: 'highlight',
    result: '{"error":"browser action failed"}',
    at,
  });

  expect(answers.map((answer) => answer.outcome).sort()).toEqual([
    'already_answered',
    'answered',
  ]);
  expect(pending.map((call) => call.toolCallId)).toEqual(['highlight']);
  expect(await first.clientTools.listOutstanding(threadId)).toEqual([]);
  expect((await first.clientTools.get(threadId, 'highlight'))?.result).toBe(
    '{"error":"browser action failed"}',
  );
});

test('offline Postgres cleanup is retryable and deletes checkpoints, threads and expired calls', async () => {
  const { first, second } = await replicas();
  const threadId = randomUUID();
  await first.threads.createThread({ thread_id: threadId });
  const config = await saveCheckpoint(first, threadId);
  const threads = {
    listThreads: async () =>
      (await first.threads.listThreads()).filter(
        (thread) => thread.thread_id === threadId,
      ),
    deleteThread: (id: string) => first.threads.deleteThread(id),
  };
  const now = Date.now() + THREAD_LIFETIME_MS + 1_000;
  const recordTime = new Date(
    Date.now() - THREAD_LIFETIME_MS - 1_000,
  ).toISOString();
  await first.clientTools.issue({
    threadId,
    toolCallId: 'expired',
    kind: 'client',
    interruptId: 'client-expired',
    toolName: 'findAircraft',
    runId: 'run',
    routeId: '/atc#agent',
    issuedAt: recordTime,
    expiresAt: recordTime,
    answeredAt: null,
    result: null,
    voidedAt: null,
    settledAt: null,
    parentToolCallId: null,
  });

  await expect(
    pruneAnonymousThreads({
      threads,
      now,
      checkpointer: {
        deleteThread: async () => {
          throw new Error('Interrupted cleanup');
        },
      },
    }),
  ).rejects.toThrow('Interrupted cleanup');
  expect(await second.threads.getThread(threadId)).toBeDefined();
  expect(await second.checkpointer.get(config)).toBeDefined();
  const removed = await pruneAnonymousThreads({
    threads,
    now,
    checkpointer: first.checkpointer,
  });
  await first.clientTools.prune({ before: new Date().toISOString() });

  expect(removed).toBe(1);
  expect(await second.threads.getThread(threadId)).toBeUndefined();
  expect(await second.checkpointer.get(config)).toBeUndefined();
  expect(await second.clientTools.get(threadId, 'expired')).toBeUndefined();
});
