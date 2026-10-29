import test from 'node:test';
import assert from 'node:assert/strict';
import { runLoadRequest, completionCountInWindow } from './load.mjs';

function fixture({
  admissions = 0,
  foreignMarker = false,
  persistedForeignMarker = false,
  persistedDifferent = false,
  runtimeError = false,
} = {}) {
  let input,
    eof = false,
    queries = 0;
  const fetchImpl = async (_url, options) => {
    input = JSON.parse(options.body);
    const text = JSON.stringify({
      text:
        input.messages[0].content +
        (foreignMarker ? ' LOADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' : ''),
    });
    const frames = runtimeError
      ? [
          {
            type: 'RUN_ERROR',
            runId: input.runId,
            threadId: input.threadId,
            code: 'rate_limit_exceeded',
            message: 'controlled provider throttle',
          },
        ]
      : [
          { type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId },
          { type: 'TEXT_MESSAGE_CONTENT', delta: text },
          {
            type: 'RUN_FINISHED',
            threadId: input.threadId,
            runId: input.runId,
          },
        ];
    let sent = false;
    return new Response(
      new ReadableStream({
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(
              new TextEncoder().encode(
                frames
                  .map((e) => 'data: ' + JSON.stringify(e) + '\n\n')
                  .join(''),
              ),
            );
          } else {
            eof = true;
            controller.close();
          }
        },
      }),
      { headers: { 'set-cookie': 'atc_visitor=fixture; Secure' } },
    );
  };
  const dependencies = {
    origins: ['https://a.test', 'https://b.test'],
    schema: {},
    validate: (x) => typeof x.text === 'string',
    fetchImpl,
    snapshot: async (threadId) => {
      assert(eof, 'DB read must follow EOF');
      queries++;
      assert.equal(threadId, input.threadId);
      return {
        threadId,
        admissions,
        threadPresent: true,
        checkpoints: [{ sha256: 'checkpoint' }],
        tuplesSha256: 'tuple',
        threadSha256: 'thread',
      };
    },
    saver: {
      getTuple: async () => ({
        checkpoint: {
          channel_values: {
            messages: [
              { type: 'human', content: input.messages[0].content },
              {
                type: 'ai',
                content: JSON.stringify({
                  text:
                    input.messages[0].content +
                    (persistedForeignMarker
                      ? ' LOADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
                      : persistedDifferent
                        ? ' DIFFERENT'
                        : ''),
                }),
                response_metadata: {
                  id: 'provider-' + input.runId,
                  max_output_tokens: 4096,
                },
                usage_metadata: { input_tokens: 8, output_tokens: 12 },
              },
            ],
          },
        },
      }),
    },
    seenProviderIds: new Set(),
    redact: (value) => value,
  };
  return { dependencies, queries: () => queries };
}

test('first post-EOF admission query is immediate and successful state is isolated', async () => {
  const { dependencies, queries } = fixture();

  const result = await runLoadRequest(
    {
      index: 0,
      level: 1,
      worker: 0,
      deadlineMs: performance.now() + 1000,
      signal: new AbortController().signal,
    },
    dependencies,
  );

  assert.equal(queries(), 1);
  assert.equal(result.firstPostEofAdmissions, 0);
  assert.equal(result.pinnedCap, 4096);
  assert(result.firstByteMs >= 0);
  assert(result.firstContentMs >= 0);
  assert(result.totalMs >= result.firstContentMs);
  assert.equal(result.usage.output_tokens, 12);
});

test('nonzero first EOF admission read fails without polling', async () => {
  const { dependencies, queries } = fixture({ admissions: 1 });

  await assert.rejects(
    runLoadRequest(
      {
        index: 0,
        level: 1,
        worker: 0,
        deadlineMs: performance.now() + 1000,
        signal: new AbortController().signal,
      },
      dependencies,
    ),
    /first post-EOF/,
  );

  assert.equal(queries(), 1);
});

test('dispatch deadline includes waiting for response headers', async () => {
  const { dependencies, queries } = fixture();
  let aborted = false;
  dependencies.fetchImpl = (_url, options) =>
    new Promise((_, reject) =>
      options.signal.addEventListener(
        'abort',
        () => {
          aborted = true;
          reject(options.signal.reason);
        },
        { once: true },
      ),
    );

  await assert.rejects(
    runLoadRequest(
      {
        index: 0,
        level: 1,
        worker: 0,
        deadlineMs: performance.now() + 15,
        signal: new AbortController().signal,
      },
      dependencies,
    ),
  );

  assert(aborted);
  assert.equal(queries(), 0);
});

test('own marker plus a foreign marker cannot pass isolation', async () => {
  const { dependencies } = fixture({ foreignMarker: true });

  await assert.rejects(
    runLoadRequest(
      {
        index: 0,
        level: 1,
        worker: 0,
        deadlineMs: performance.now() + 1000,
        signal: new AbortController().signal,
      },
      dependencies,
    ),
    /foreign correlation/,
  );
});

test('persisted foreign marker fails even when the stream is isolated', async () => {
  const { dependencies } = fixture({ persistedForeignMarker: true });

  await assert.rejects(
    runLoadRequest(
      {
        index: 0,
        level: 1,
        worker: 0,
        deadlineMs: performance.now() + 1000,
        signal: new AbortController().signal,
      },
      dependencies,
    ),
    /foreign correlation marker in canonical/,
  );
});

test('persisted response must equal the validated streamed response', async () => {
  const { dependencies } = fixture({ persistedDifferent: true });

  await assert.rejects(
    runLoadRequest(
      {
        index: 0,
        level: 1,
        worker: 0,
        deadlineMs: performance.now() + 1000,
        signal: new AbortController().signal,
      },
      dependencies,
    ),
    /canonical response must match/,
  );
});

test('runtime throttling is preserved in failed private receipts', async () => {
  const { dependencies, queries } = fixture({ runtimeError: true });

  await assert.rejects(
    runLoadRequest(
      {
        index: 0,
        level: 1,
        worker: 0,
        deadlineMs: performance.now() + 1000,
        signal: new AbortController().signal,
      },
      dependencies,
    ),
    (error) => {
      assert.equal(error.receipt.runtimeErrors[0].code, 'rate_limit_exceeded');
      assert.equal(error.receipt.providerThrottled, true);
      return true;
    },
  );

  assert.equal(queries(), 0);
});

test('EOF completion timestamp is separate from later database verification', async () => {
  const { dependencies } = fixture();
  const snapshot = dependencies.snapshot;
  dependencies.snapshot = async (threadId) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return snapshot(threadId);
  };
  const scheduleStartedAt = performance.now();

  const result = await runLoadRequest(
    {
      index: 0,
      level: 1,
      worker: 0,
      deadlineMs: performance.now() + 1000,
      scheduleStartedAt,
      signal: new AbortController().signal,
    },
    dependencies,
  );

  assert(result.eofAtScheduleMs >= 0);
  assert(performance.now() - scheduleStartedAt - result.eofAtScheduleMs >= 15);
});

test('completion buckets use EOF rather than database verification finish', () => {
  const attempts = [
    {
      status: 'passed',
      finishedMs: 300100,
      result: { eofAtScheduleMs: 299999 },
    },
    {
      status: 'passed',
      finishedMs: 300200,
      result: { eofAtScheduleMs: 300050 },
    },
  ];

  const first = completionCountInWindow(attempts, 0, 300000),
    second = completionCountInWindow(attempts, 300000, 600000);

  assert.equal(first, 1);
  assert.equal(second, 1);
});
