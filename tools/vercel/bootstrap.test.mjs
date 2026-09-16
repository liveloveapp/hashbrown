import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createVercelClient,
  ensureDomain,
  ensureProject,
  missingDnsRecords,
  upsertEnv,
} from './bootstrap.mjs';

function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname + new URL(url).search;
    calls.push({
      method,
      path,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    const handler = routes[`${method} ${path}`];
    if (!handler) {
      return new Response(
        JSON.stringify({ error: { code: 'not_found', message: path } }),
        { status: 404 },
      );
    }
    const { status = 200, body = {} } =
      typeof handler === 'function' ? handler() : handler;
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

test('createVercelClient sends a bearer token and throws on non-2xx', async () => {
  const seen = [];
  const vercel = createVercelClient('tok', async (url, init) => {
    seen.push(init.headers.authorization);
    return new Response(
      JSON.stringify({ error: { code: 'forbidden', message: 'nope' } }),
      { status: 403 },
    );
  });

  await assert.rejects(
    () => vercel('GET', '/v2/user'),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, 'forbidden');
      return true;
    },
  );
  assert.deepEqual(seen, ['Bearer tok']);
});

test('ensureProject returns the existing project without creating', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/hashbrown-www': {
      body: { id: 'prj_1', name: 'hashbrown-www' },
    },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const result = await ensureProject(vercel, 'hashbrown-www');

  assert.equal(result.status, 'exists');
  assert.equal(result.project.id, 'prj_1');
  assert.deepEqual(
    calls.map((call) => call.method),
    ['GET'],
  );
});

test('ensureProject creates a framework-less project when missing', async () => {
  const { fetchImpl, calls } = stubFetch({
    'POST /v11/projects': { body: { id: 'prj_2', name: 'hashbrown-www' } },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const result = await ensureProject(vercel, 'hashbrown-www');

  assert.equal(result.status, 'created');
  assert.deepEqual(calls[1].body, { name: 'hashbrown-www', framework: null });
});

test('upsertEnv skips empty values and targets production and preview', async () => {
  const { fetchImpl, calls } = stubFetch({
    'POST /v10/projects/prj_1/env?upsert=true': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(
    await upsertEnv(vercel, 'prj_1', {
      OPENAI_API_KEY: '',
      OPENAI_MODEL: undefined,
    }),
    'skipped',
  );
  assert.equal(
    await upsertEnv(vercel, 'prj_1', { OPENAI_API_KEY: 'sk-test' }),
    'updated',
  );
  assert.deepEqual(calls.at(-1).body, [
    {
      key: 'OPENAI_API_KEY',
      value: 'sk-test',
      type: 'encrypted',
      target: ['production', 'preview'],
    },
  ]);
});

test('ensureDomain treats an existing project domain as exists', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/prj_1/domains/www.hashbrown.dev': {
      body: { name: 'www.hashbrown.dev' },
    },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  assert.equal(
    await ensureDomain(vercel, 'prj_1', { name: 'www.hashbrown.dev' }),
    'exists',
  );
  assert.equal(calls.length, 1);
});

test('missingDnsRecords compares name, type and value', () => {
  const existing = [
    { name: '', type: 'MX', value: 'mail.example.com.' },
    { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none' },
  ];
  const wanted = [
    { name: '', type: 'MX', value: 'mail.example.com.', mxPriority: 10 },
    { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none' },
    { name: 'blog', type: 'CNAME', value: 'ghs.googlehosted.com.' },
  ];

  assert.deepEqual(missingDnsRecords(existing, wanted), [wanted[2]]);
});
