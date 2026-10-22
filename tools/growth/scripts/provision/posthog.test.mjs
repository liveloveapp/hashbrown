import assert from 'node:assert/strict';
import test from 'node:test';

import { createChecklist, createJsonClient } from './lib.mjs';
import { ensurePosthogProject, provisionPosthog } from './posthog.mjs';
import { stubFetch } from './test-support.mjs';

const BASE = 'https://us.posthog.com';

function clientFor(routes) {
  const { fetchImpl, calls } = stubFetch(routes);
  const posthog = createJsonClient({
    baseUrl: BASE,
    token: 'phx-key-secret',
    fetchImpl,
  });
  return { posthog, calls };
}

const ORG = {
  'GET /api/organizations/@current/': { body: { id: 'o1', name: 'Org' } },
};

test('ensurePosthogProject creates hashbrown under the current organization', async () => {
  const { posthog, calls } = clientFor({
    ...ORG,
    'GET /api/organizations/o1/projects/': { body: { results: [] } },
    'POST /api/organizations/o1/projects/': {
      body: { id: 7, name: 'hashbrown', api_token: 'phc_new' },
    },
  });

  const result = await ensurePosthogProject(posthog, 'hashbrown');

  assert.deepEqual(result, {
    status: 'created',
    project: { id: 7, api_token: 'phc_new' },
  });
  assert.deepEqual(calls[2].body, { name: 'hashbrown' });
});

test('ensurePosthogProject reports exists when a project named hashbrown is listed', async () => {
  const { posthog, calls } = clientFor({
    ...ORG,
    'GET /api/organizations/o1/projects/': {
      body: {
        results: [
          { id: 3, name: 'hashbrown-old', api_token: 'phc_old' },
          { id: 4, name: 'hashbrown', api_token: 'phc_cur' },
        ],
      },
    },
  });

  const result = await ensurePosthogProject(posthog, 'hashbrown');

  assert.deepEqual(result, {
    status: 'exists',
    project: { id: 4, api_token: 'phc_cur' },
  });
  assert.ok(calls.every((c) => c.method === 'GET'));
});

test('provisionPosthog returns the project token under NEXT_PUBLIC_POSTHOG_TOKEN', async () => {
  const { posthog } = clientFor({
    ...ORG,
    'GET /api/organizations/o1/projects/': {
      body: { results: [{ id: 4, name: 'hashbrown', api_token: 'phc_cur' }] },
    },
  });
  const checklist = createChecklist();

  const env = await provisionPosthog(posthog, checklist);

  assert.deepEqual(env, {
    NEXT_PUBLIC_POSTHOG_TOKEN: 'phc_cur',
    NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com',
    POSTHOG_PROJECT_ID: '4',
  });
});

test('a rerun makes only GET calls, reports exists, and leaks no secret', async () => {
  const { posthog, calls } = clientFor({
    ...ORG,
    'GET /api/organizations/o1/projects/': {
      body: { results: [{ id: 4, name: 'hashbrown', api_token: 'phc_cur' }] },
    },
  });
  const checklist = createChecklist();

  await provisionPosthog(posthog, checklist);

  assert.ok(calls.every((c) => c.method === 'GET'));
  assert.equal(checklist.lines().length, 1);
  assert.ok(checklist.lines().every((l) => /\s{2}exists(\s|$)/.test(l)));
  assert.ok(checklist.lines().every((l) => !l.includes('phx-key-secret')));
  assert.ok(checklist.lines().every((l) => !l.includes('phc_cur')));
});
