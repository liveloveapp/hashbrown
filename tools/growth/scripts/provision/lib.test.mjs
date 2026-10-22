import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNoSecrets,
  createChecklist,
  createJsonClient,
  randomSecret,
} from './lib.mjs';

test('createJsonClient sends the scheme and token and throws on non-2xx without echoing the token', async () => {
  const seen = [];
  const client = createJsonClient({
    baseUrl: 'https://api.example.com',
    token: 'tok-secret-value',
    scheme: 'Token',
    fetchImpl: async (url, init) => {
      seen.push({ url, authorization: init.headers.authorization });
      return new Response(JSON.stringify({ error: { message: 'nope' } }), {
        status: 403,
      });
    },
  });

  await assert.rejects(
    () => client('GET', '/x'),
    (error) => {
      assert.equal(error.status, 403);
      assert.ok(error.message.includes('GET /x -> 403: nope'));
      assert.ok(!error.message.includes('tok-secret-value'));
      return true;
    },
  );
  assert.deepEqual(seen, [
    {
      url: 'https://api.example.com/x',
      authorization: 'Token tok-secret-value',
    },
  ]);
});

test('createJsonClient omits the body detail when the vendor sends none', async () => {
  const client = createJsonClient({
    baseUrl: 'https://api.example.com',
    token: 'tok',
    fetchImpl: async () => new Response('<html>oops</html>', { status: 500 }),
  });

  await assert.rejects(
    () => client('GET', '/y'),
    (error) => {
      assert.equal(error.message, 'GET /y -> 500: response body omitted');
      return true;
    },
  );
});

test('createJsonClient parses JSON bodies and sends JSON', async () => {
  const calls = [];
  const client = createJsonClient({
    baseUrl: 'https://api.example.com',
    token: 'tok',
    fetchImpl: async (url, init) => {
      calls.push({ init });
      return new Response(JSON.stringify({ id: 7 }), { status: 201 });
    },
  });

  const result = await client('POST', '/things', { name: 'a' });

  assert.deepEqual(result, { id: 7 });
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.equal(calls[0].init.headers.authorization, 'Bearer tok');
  assert.equal(calls[0].init.body, JSON.stringify({ name: 'a' }));
});

test('randomSecret is 64 hex chars and unique', () => {
  const first = randomSecret();
  const second = randomSecret();

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test('createChecklist prints padded step, outcome, detail lines', () => {
  const checklist = createChecklist();

  checklist.add('neon project', 'created', 'hashbrown-growth');
  checklist.add('dns', 'manual');

  assert.deepEqual(checklist.lines(), [
    'neon project  created  hashbrown-growth',
    'dns           manual',
  ]);
});

test('assertNoSecrets throws when a secret appears in text', () => {
  assert.throws(
    () => assertNoSecrets('token is abcdefghijk here', ['abcdefghijk']),
    /secret/i,
  );
  assert.doesNotThrow(() => assertNoSecrets('clean', ['abcdefghijk']));
  assert.doesNotThrow(() => assertNoSecrets('short abc', ['abc']));
});

function retryClient(statuses, headers = {}) {
  const delays = [];
  let calls = 0;
  const client = createJsonClient({
    baseUrl: 'https://api.example.com',
    token: 'tok',
    sleep: async (ms) => {
      delays.push(ms);
    },
    fetchImpl: async () => {
      const status = statuses[Math.min(calls, statuses.length - 1)];
      calls += 1;
      return new Response(JSON.stringify({ ok: true }), { status, headers });
    },
  });
  return { client, delays, count: () => calls };
}

test('createJsonClient retries a 423 with backoff and then succeeds', async () => {
  const { client, delays, count } = retryClient([423, 423, 200]);

  const result = await client('GET', '/busy');

  assert.deepEqual(result, { ok: true });
  assert.equal(count(), 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test('createJsonClient honours Retry-After on a 429', async () => {
  const { client, delays } = retryClient([429, 200], { 'retry-after': '3' });

  await client('GET', '/limited');

  assert.deepEqual(delays, [3000]);
});

test('createJsonClient gives up after five attempts on 423', async () => {
  const { client, delays, count } = retryClient([423]);

  await assert.rejects(
    () => client('GET', '/busy'),
    (error) => {
      assert.equal(error.status, 423);
      return true;
    },
  );
  assert.equal(count(), 5);
  assert.deepEqual(delays, [1000, 2000, 4000, 8000]);
});
