import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProviderProxy } from './provider-proxy.mjs';
import { ownedWorker, childEnvironment, bounded } from './owner-worker.mjs';
import { reserveRecoveryRequest } from './runtime-recovery.mjs';

test('child environment excludes ambient credentials', () => {
  process.env.DATABASE_URL = 'ambient-secret';
  process.env.OPENAI_API_KEY = 'ambient-key';
  assert.deepEqual(childEnvironment(), {
    PATH: process.env.PATH,
    NODE_NO_WARNINGS: '1',
  });
});
test('bounded rejects a stalled cleanup', async () => {
  await assert.rejects(
    bounded(
      new Promise(() => {
        /* Deliberately stalled fixture. */
      }),
      10,
      'cleanup',
    ),
    /cleanup timed out/,
  );
});
test('IPC timeout and worker exit reject pending operations and cleanup resumes owned PID', async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  const signals = [];
  child.send = () => {
    /* Deliberately unresponsive IPC fixture. */
  };
  child.kill = (s) => {
    signals.push(s);
    if (s === 'SIGKILL') {
      child.signalCode = s;
      child.emit('exit', null, s);
    }
    return true;
  };
  const worker = ownedWorker(child, { timeoutMs: 10 });
  await assert.rejects(worker.command('stalled'), /timed out/);
  const pending = worker.command('pending');
  child.emit('exit', 1, null);
  await assert.rejects(pending, /exited/);
  await worker.close();
  assert.equal(signals[0], 'SIGCONT');
  assert.equal(signals.at(-1), 'SIGKILL');
});
test('recovery budget survives separate invocations and stops at sixteen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'recovery-budget-'));
  try {
    for (let i = 1; i <= 16; i++)
      assert.equal(await reserveRecoveryRequest(dir, 'case'), i);
    await assert.rejects(reserveRecoveryRequest(dir, 'case'), /budget/);
    assert.equal(
      JSON.parse(await readFile(join(dir, 'recovery-budget.json'), 'utf8'))
        .attempts.length,
      16,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('proxy forwards authentication and exact bytes only on explicit forward, holds reply until release, closes sockets', async () => {
  const bytes = Buffer.from(
    'data: {"type":"response.completed","response":{"id":"resp_real","status":"completed","max_output_tokens":4096,"output":[]}}\n\n',
  );
  let forwarded = 0;
  const proxy = await createProviderProxy({
    apiKey: 'private-key',
    schema: { type: 'object' },
    upstreamBase: 'https://provider.example/v1',
    fetchImpl: async (url, init) => {
      forwarded++;
      assert.equal(url, 'https://provider.example/v1/responses');
      assert.equal(init.headers.get('authorization'), 'Bearer private-key');
      assert.equal(
        init.body.toString(),
        JSON.stringify({
          stream: true,
          max_output_tokens: 4096,
          text: { format: { schema: { type: 'object' } } },
        }),
      );
      return new Response(bytes, {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });
  try {
    const response = fetch(proxy.baseUrl + '/responses', {
      method: 'POST',
      headers: { authorization: 'Bearer private-key' },
      body: JSON.stringify({
        stream: true,
        max_output_tokens: 4096,
        text: { format: { schema: { type: 'object' } } },
      }),
    });
    await proxy.waitCaptured();
    assert.equal(forwarded, 0);
    await proxy.forward();
    assert.equal(forwarded, 1);
    await proxy.release();
    assert.deepEqual(Buffer.from(await (await response).arrayBuffer()), bytes);
    assert.equal(proxy.receipt().responseId, 'resp_real');
  } finally {
    await proxy.close();
  }
});
test('proxy rejects incorrect authentication without forwarding', async () => {
  let forwarded = false;
  const proxy = await createProviderProxy({
    apiKey: 'right',
    schema: {},
    upstreamBase: 'https://provider.example/v1',
    fetchImpl: async () => {
      forwarded = true;
    },
  });
  try {
    const response = await fetch(proxy.baseUrl + '/responses', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
      body: '{}',
    });
    assert.equal(response.status, 502);
    assert.equal(forwarded, false);
  } finally {
    await proxy.close();
  }
});

test('manifest mismatch rejects before dependency lookup or database access', async () => {
  const { storageContext } = await import('./storage.mjs');
  await assert.rejects(
    storageContext({ manifest: {}, runtimeRoot: '/does-not-exist' }, {}),
    /initialization rejected/,
  );
});
test('schema mismatch rejects before any runtime, credential or database access', async () => {
  const { runRuntimeRecovery } = await import('./runtime-recovery.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'recovery-schema-'));
  try {
    const { writeFile } = await import('node:fs/promises');
    const schemaPath = join(dir, 'schema.json');
    await writeFile(schemaPath, '{}');
    await assert.rejects(
      runRuntimeRecovery(
        'kill',
        { schemaPath, runtimeRoot: '/does-not-exist' },
        { schemaSha256: 'wrong' },
      ),
      /Expected values/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('proxy incomplete real provider result cannot be released and cleanup still closes', async () => {
  const proxy = await createProviderProxy({
    apiKey: 'key',
    schema: {},
    upstreamBase: 'https://provider.example/v1',
    fetchImpl: async () =>
      new Response('data: {"type":"response.incomplete"}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
  });
  const request = fetch(proxy.baseUrl + '/responses', {
    method: 'POST',
    headers: { authorization: 'Bearer key' },
    body: JSON.stringify({
      stream: true,
      max_output_tokens: 4096,
      text: { format: { schema: {} } },
    }),
  }).catch(() => {
    /* Expected aborted loopback request on cleanup. */
  });
  try {
    await proxy.waitCaptured();
    await assert.rejects(proxy.forward());
    assert.throws(() => proxy.release(), /real completed/);
  } finally {
    await proxy.close();
    await request;
  }
});

test('committed prefix allows appended keyed writes but rejects prior checkpoint/write changes and deletions', async () => {
  const { assertCommittedPrefix, physicalHistoryRecords } =
    await import('./runtime-recovery.mjs');
  const checkpoint = {
    thread_id: 'owned',
    checkpoint_ns: 'ns',
    checkpoint_id: 'c1',
    parent_checkpoint_id: null,
    type: 'json',
    checkpoint: Buffer.from('payload'),
    metadata: Buffer.from('metadata'),
  };
  const write = {
    thread_id: 'owned',
    checkpoint_ns: 'ns',
    checkpoint_id: 'c1',
    task_id: 'task',
    idx: 0,
    channel: 'messages',
    type: 'json',
    value: Buffer.from('original'),
  };
  const state = (checkpoints, writes) => ({
    messageSha256s: ['human-all-fields', 'assistant-all-fields'],
    ...physicalHistoryRecords(checkpoints, writes),
  });
  const prefix = { state: state([checkpoint], [write]) };
  const extra = { ...write, idx: 1, value: Buffer.from('additional') };
  const successor = {
    state: state(
      [checkpoint, { ...checkpoint, checkpoint_id: 'c2' }],
      [write, extra],
    ),
  };
  assert.doesNotThrow(() => assertCommittedPrefix(prefix, successor));
  assert.throws(
    () =>
      assertCommittedPrefix(prefix, {
        state: state(
          [{ ...checkpoint, metadata: Buffer.from('changed') }],
          [write, extra],
        ),
      }),
    /checkpoint/,
  );
  assert.throws(
    () =>
      assertCommittedPrefix(prefix, {
        state: state(
          [checkpoint],
          [{ ...write, value: Buffer.from('changed') }, extra],
        ),
      }),
    /write/,
  );
  assert.throws(
    () =>
      assertCommittedPrefix(prefix, { state: state([checkpoint], [extra]) }),
    /write/,
  );
  assert.throws(
    () =>
      assertCommittedPrefix(prefix, {
        state: {
          ...successor.state,
          messageSha256s: ['human-all-fields', 'changed-assistant-metadata'],
        },
      }),
    /message/,
  );
});
test('successor cannot dispatch until completed provider bytes and natural expiry gates both settle', async () => {
  const { dispatchAfterRecoveryGates } = await import('./runtime-recovery.mjs');
  const calls = [];
  let complete;
  const providerCompletion = new Promise((resolve) => {
    complete = resolve;
  });
  const result = dispatchAfterRecoveryGates({
    providerCompletion,
    waitForExpiry: async () => {
      calls.push('expiry');
    },
    dispatch: async () => {
      calls.push('dispatch');
      return 'success';
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, []);
  calls.push('provider-complete');
  complete();
  assert.equal(await result, 'success');
  assert.deepEqual(calls, ['provider-complete', 'expiry', 'dispatch']);
});

test('full message digests detect assistant content and metadata changes despite unchanged provider ID/cap', async () => {
  const { messageRecordHashes } = await import('./runtime-recovery.mjs');
  const messages = [
    {
      type: 'ai',
      content: 'committed content',
      response_metadata: { id: 'resp_same', max_output_tokens: 4096 },
      additional_kwargs: { timestamp: 'original' },
    },
  ];
  const baseline = messageRecordHashes(messages);
  assert.notDeepEqual(
    messageRecordHashes([{ ...messages[0], content: 'changed content' }]),
    baseline,
  );
  assert.notDeepEqual(
    messageRecordHashes([
      { ...messages[0], additional_kwargs: { timestamp: 'changed' } },
    ]),
    baseline,
  );
});
test('failed real provider completion prevents expiry wait and successor dispatch', async () => {
  const { dispatchAfterRecoveryGates } = await import('./runtime-recovery.mjs');
  const calls = [];
  await assert.rejects(
    dispatchAfterRecoveryGates({
      providerCompletion: Promise.reject(Error('provider failed')),
      waitForExpiry: async () => {
        calls.push('expiry');
      },
      dispatch: async () => {
        calls.push('dispatch');
      },
    }),
    /provider failed/,
  );
  assert.deepEqual(calls, []);
});

test('stalled transaction rollback destroys checked-out client before bounded pool cleanup', async () => {
  const { closeOwnedStorage } = await import('./owner-worker.mjs');
  const calls = [];
  const client = {
    query() {
      calls.push('rollback');
      return new Promise(() => {
        /* Simulate server never returning a reply. */
      });
    },
    release(destroy) {
      calls.push(['release', destroy]);
    },
  };
  const errors = await closeOwnedStorage({
    client,
    admission: {
      close: async () => {
        calls.push('admission');
      },
    },
    saver: {
      close: async () => {
        calls.push('saver');
      },
    },
    pool: {
      end: async () => {
        calls.push('pool');
      },
    },
    timeoutMs: 5,
  });
  assert.deepEqual(calls, [
    'rollback',
    ['release', true],
    'admission',
    'saver',
    'pool',
  ]);
  assert.deepEqual(errors, ['transaction rollback failed']);
});
test('client query failure still destroys client and stalled pool shutdown is bounded', async () => {
  const { closeOwnedStorage } = await import('./owner-worker.mjs');
  let destroyed = false;
  const started = Date.now();
  const errors = await closeOwnedStorage({
    client: {
      query: async () => {
        throw Error('query read timeout');
      },
      release(value) {
        destroyed = value;
      },
    },
    admission: { close: async () => true },
    saver: { close: async () => true },
    pool: {
      end: () =>
        new Promise(() => {
          /* Deliberately stuck pool fixture. */
        }),
    },
    timeoutMs: 5,
  });
  assert(destroyed);
  assert(Date.now() - started < 1000);
  assert.deepEqual(errors, [
    'transaction rollback failed',
    'pool cleanup failed',
  ]);
});

test('raw tracker destroys underlying client even when fenced release waits behind stalled query', async () => {
  const { trackOwnedPool, closeOwnedStorage } =
    await import('./owner-worker.mjs');
  const releases = [];
  const calls = [];
  const tracked = trackOwnedPool({
    connect: async () => ({
      query: () =>
        new Promise(() => {
          /* Server reply never arrives. */
        }),
      release: (destroy) => {
        releases.push(destroy);
      },
    }),
    query: async () => true,
  });
  const rawClient = await tracked.pool.connect();
  const queued = new Promise(() => {
    /* Mimic fenced pool queue waiting on query. */
  });
  const fenced = {
    query: () => queued,
    release() {
      void queued.then(() => rawClient.release());
    },
  };
  const errors = await closeOwnedStorage({
    client: fenced,
    destroyClients: tracked.destroyClients,
    pool: {
      end: async () => {
        calls.push('pool end');
        assert.deepEqual(releases, [true]);
      },
    },
    timeoutMs: 5,
  });
  rawClient.release();
  assert.deepEqual(releases, [true]);
  assert.deepEqual(calls, ['pool end']);
  assert.deepEqual(errors, ['transaction rollback failed']);
});

test('both readiness pool sizes enforce client reply timeout and query failure reaches cleanup', async (context) => {
  const { createReadinessPool, closeOwnedStorage } =
    await import('./owner-worker.mjs');
  for (const max of [4, 5]) {
    const calls = [];
    const driver = {
      createPostgresPool(options) {
        assert.equal(options.query_timeout, 15000);
        assert.equal(options.statement_timeout, 15000);
        assert.equal(options.connectionTimeoutMillis, 15000);
        assert.equal(options.max, max);
        return Object.assign(new EventEmitter(), {
          query: () =>
            new Promise((_, reject) =>
              setTimeout(
                () => reject(Error('query read timeout')),
                options.query_timeout,
              ),
            ),
          end: async () => {
            calls.push('end');
          },
        });
      },
    };
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const pool = createReadinessPool(driver, 'explicit-private-dsn', max);
    const query = pool.query('owned query');
    context.mock.timers.tick(15000);
    await assert.rejects(query, /query read timeout/);
    context.mock.timers.reset();
    assert.deepEqual(await closeOwnedStorage({ pool }), []);
    assert.deepEqual(calls, ['end']);
  }
});

test('owned tracker preserves native pool query callback connect while wrapping admission Promise connect', async () => {
  const { trackOwnedPool } = await import('./owner-worker.mjs');
  const forms = [];
  const actual = { query: async () => ({ rows: [] }), release: () => true };
  const raw = {
    connect(callback) {
      if (callback) {
        forms.push('callback');
        callback(null, actual);
        return;
      }
      forms.push('promise');
      return Promise.resolve(actual);
    },
    query() {
      return new Promise((resolve, reject) =>
        this.connect((error, client) => {
          if (error) {
            reject(error);
            return;
          }
          client.release();
          resolve({ rows: [] });
        }),
      );
    },
  };
  const originalConnect = raw.connect;
  const tracked = trackOwnedPool(raw);
  await tracked.pool.query('admission query');
  const client = await tracked.pool.connect();
  client.release();
  assert.equal(raw.connect, originalConnect);
  assert.deepEqual(forms, ['callback', 'promise']);
});

test('idle pool errors never reach native raw warning and remain fatal after recovered queries', async () => {
  const {
    createReadinessPool,
    readinessPoolErrors,
    assertReadinessPoolHealthy,
  } = await import('./owner-worker.mjs');
  const warnings = [],
    events = [];
  const originalWarn = console.warn;
  console.warn = (...values) => warnings.push(values);
  try {
    const driver = {
      createPostgresPool() {
        const pool = new EventEmitter();
        pool.on('error', (error) => console.warn(String(error)));
        pool.query = async () => ({ rows: [] });
        return pool;
      },
    };
    const pool = createReadinessPool(driver, 'private-dsn', 5, (event) =>
      events.push(event),
    );
    pool.emit(
      'error',
      Error(
        'postgres://privateuser:privatepassword@db.example/private?token=private-token',
      ),
    );
    await pool.query('recovered query');
    assert.deepEqual(warnings, []);
    assert.equal(readinessPoolErrors(pool).length, 1);
    assert.equal(events.length, 1);
    assert(!JSON.stringify(events).includes('privatepassword'));
    assert.throws(() => assertReadinessPoolHealthy(pool), /idle client error/);
  } finally {
    console.warn = originalWarn;
  }
});

test('idle error fatal assertion still executes owned pool cleanup without emitting credentials', async () => {
  const { createReadinessPool, assertReadinessPoolHealthy, closeOwnedStorage } =
    await import('./owner-worker.mjs');
  let closed = false;
  const pool = createReadinessPool(
    {
      createPostgresPool() {
        return Object.assign(new EventEmitter(), {
          end: async () => {
            closed = true;
          },
        });
      },
    },
    'explicit-private-dsn',
  );
  pool.emit('error', Error('credential-like-synthetic-value'));
  try {
    assert.throws(() => assertReadinessPoolHealthy(pool), /idle client error/);
  } finally {
    assert.deepEqual(await closeOwnedStorage({ pool }), []);
  }
  assert(closed);
});

test('kill permits either observed durable owner input state while suspend requires the committed input', async () => {
  const { ownerInputCommitObserved, waitForCommittedOwnerInput } =
    await import('./runtime-recovery.mjs');
  const baseline = { humanContentHashes: ['seed'] };
  const uncommitted = { humanContentHashes: ['seed'] },
    committed = { humanContentHashes: ['seed', 'owner'] };
  assert.equal(ownerInputCommitObserved(baseline, uncommitted, 'owner'), false);
  assert.equal(ownerInputCommitObserved(baseline, committed, 'owner'), true);
  let now = 0,
    reads = 0;
  const result = await waitForCommittedOwnerInput({
    baseline,
    ownerInputHash: 'owner',
    read: async () => ({ state: ++reads < 3 ? uncommitted : committed }),
    checkPrefix: () => true,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    timeoutMs: 1000,
  });
  assert.equal(reads, 3);
  assert.deepEqual(result.state, committed);
});
test('suspend commit gate fails boundedly if captured provider request never gets a durable input', async () => {
  const { waitForCommittedOwnerInput } = await import('./runtime-recovery.mjs');
  let now = 0;
  await assert.rejects(
    waitForCommittedOwnerInput({
      baseline: { humanContentHashes: ['seed'] },
      ownerInputHash: 'owner',
      read: async () => ({ state: { humanContentHashes: ['seed'] } }),
      checkPrefix: () => true,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      timeoutMs: 200,
    }),
    /input commit.*timed out/,
  );
});

test('suspend input gate bounds a stalled database snapshot without pretending input committed', async () => {
  const { waitForCommittedOwnerInput } = await import('./runtime-recovery.mjs');
  await assert.rejects(
    waitForCommittedOwnerInput({
      baseline: { humanContentHashes: ['seed'] },
      ownerInputHash: 'owner',
      read: () =>
        new Promise(() => {
          /* Stalled database observer. */
        }),
      checkPrefix: () => true,
      timeoutMs: 5,
    }),
    /input commit.*timed out/,
  );
});
