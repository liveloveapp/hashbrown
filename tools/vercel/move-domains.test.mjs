import assert from 'node:assert/strict';
import test from 'node:test';

import { createVercelClient, SITE_DOMAINS } from './bootstrap.mjs';
import { moveDomains } from './move-domains.mjs';

function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname;
    calls.push({
      method,
      path,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    const handler = routes[`${method} ${path}`];
    if (!handler) {
      return new Response(JSON.stringify({ error: { code: 'not_found' } }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify(handler.body ?? {}), { status: 200 });
  };
  return { fetchImpl, calls };
}

test('the site domains are the apex and a www redirect to it', () => {
  const names = SITE_DOMAINS.map((d) => d.name);

  assert.deepEqual(names, ['hashbrown.dev', 'www.hashbrown.dev']);
  assert.equal(SITE_DOMAINS[1].redirect, 'hashbrown.dev');
});

test('moveDomains moves the apex, then www, back to the rollback project', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/prj_next/domains/hashbrown.dev': { body: {} },
    'GET /v9/projects/prj_next/domains/www.hashbrown.dev': { body: {} },
    'POST /v1/projects/prj_next/domains/hashbrown.dev/move': { body: {} },
    'POST /v1/projects/prj_next/domains/www.hashbrown.dev/move': { body: {} },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const results = await moveDomains(vercel, {
    fromProjectId: 'prj_next',
    toProjectId: 'prj_old',
    domains: SITE_DOMAINS,
  });

  assert.deepEqual(results, {
    'hashbrown.dev': 'moved',
    'www.hashbrown.dev': 'moved',
  });
  assert.deepEqual(
    calls.filter((c) => c.method === 'POST').map((c) => [c.path, c.body]),
    [
      [
        '/v1/projects/prj_next/domains/hashbrown.dev/move',
        { projectId: 'prj_old' },
      ],
      [
        '/v1/projects/prj_next/domains/www.hashbrown.dev/move',
        {
          projectId: 'prj_old',
          redirect: 'hashbrown.dev',
          redirectStatusCode: 308,
        },
      ],
    ],
  );
});

test('moveDomains leaves domains already on the target project alone', async () => {
  const { fetchImpl, calls } = stubFetch({
    'GET /v9/projects/prj_old/domains/hashbrown.dev': { body: {} },
    'GET /v9/projects/prj_old/domains/www.hashbrown.dev': {
      body: { redirect: 'hashbrown.dev', redirectStatusCode: 308 },
    },
  });
  const vercel = createVercelClient('tok', fetchImpl);

  const results = await moveDomains(vercel, {
    fromProjectId: 'prj_next',
    toProjectId: 'prj_old',
    domains: SITE_DOMAINS,
  });

  assert.deepEqual(results, {
    'hashbrown.dev': 'exists',
    'www.hashbrown.dev': 'exists',
  });
  assert.equal(calls.filter((c) => c.method !== 'GET').length, 0);
});
