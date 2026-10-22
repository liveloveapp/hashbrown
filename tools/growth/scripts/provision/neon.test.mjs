import assert from 'node:assert/strict';
import test from 'node:test';

import { createVercelClient } from '../../../vercel/bootstrap.mjs';
import { createChecklist } from './lib.mjs';
import {
  createBillingAuthorization,
  ensureConnection,
  ensureStore,
  findNeonConfiguration,
  provisionNeon,
} from './neon.mjs';
import { stubFetch } from './test-support.mjs';

const CONFIGS =
  'GET /v1/integrations/configurations?view=account&teamId=team_1';
const STORES = 'GET /v1/storage/stores?teamId=team_1';
const AUTH = 'POST /v1/integrations/billing/authorization?teamId=team_1';
const CREATE = 'POST /v1/storage/stores/integration?teamId=team_1';
const PROJECT_IDS = { www: 'prj_www', lifecycle: 'prj_lc' };

function clientFor(routes) {
  const { fetchImpl, calls } = stubFetch(routes);
  const vercel = createVercelClient('vercel-token-secret', fetchImpl, {
    teamId: 'team_1',
  });
  return { vercel, calls };
}

const ROWS = [
  ['growth-production-target-01', 'prj_www', 'production', null],
  ['growth-production-target-01', 'prj_lc', 'production', null],
  ['growth-preview-target-01', 'prj_www', 'preview', null],
  ['growth-preview-target-01', 'prj_lc', 'preview', null],
  ['b4-production-target-01', 'prj_lc', 'production', 'B4_'],
  ['b4-preview-target-01', 'prj_lc', 'preview', 'B4_'],
  ['growth-test-target-01', 'prj_lc', 'development', 'TEST_'],
];

function existingStores() {
  const names = [...new Set(ROWS.map(([name]) => name))];
  return names.map((name) => ({
    id: `store_${name}`,
    name,
    type: 'integration',
    projectsMetadata: ROWS.filter(([n]) => n === name).map(
      ([, projectId, environment, envVarPrefix]) => ({
        projectId,
        name: projectId,
        environments: [environment],
        envVarPrefix,
      }),
    ),
  }));
}

test('findNeonConfiguration picks the entry whose slug is neon', async () => {
  const { vercel } = clientFor({
    [CONFIGS]: {
      body: [
        { id: 'icfg_other', slug: 'resend' },
        { id: 'icfg_neon', slug: 'neon' },
      ],
    },
  });

  const id = await findNeonConfiguration(vercel);

  assert.equal(id, 'icfg_neon');
});

test('findNeonConfiguration accepts a configurations envelope', async () => {
  const { vercel } = clientFor({
    [CONFIGS]: {
      body: { configurations: [{ id: 'icfg_neon', slug: 'neon' }] },
    },
  });

  const id = await findNeonConfiguration(vercel);

  assert.equal(id, 'icfg_neon');
});

test('findNeonConfiguration fails clearly when Neon is not installed', async () => {
  const { vercel } = clientFor({
    [CONFIGS]: { body: [{ id: 'icfg_other', slug: 'resend' }] },
  });

  const act = findNeonConfiguration(vercel);

  await assert.rejects(act, /Neon integration is not installed/);
});

test('ensureStore creates the store with the exact body when absent', async () => {
  const { vercel, calls } = clientFor({
    [STORES]: { body: { stores: [] } },
    [AUTH]: { body: { authorization: { id: 'mba_1', status: 'succeeded' } } },
    [CREATE]: { body: { store: { id: 'store_1', name: 'growth-x' } } },
  });

  const result = await ensureStore(vercel, {
    name: 'growth-x',
    configurationId: 'icfg_neon',
  });

  assert.deepEqual(result, {
    status: 'created',
    store: { id: 'store_1', name: 'growth-x', projectsMetadata: [] },
  });
  assert.deepEqual(calls[2].body, {
    authorizationId: 'mba_1',
    integrationConfigurationId: 'icfg_neon',
    integrationProductIdOrSlug: 'neon',
    billingPlanId: 'free_v3',
    name: 'growth-x',
    metadata: { region: 'iad1' },
  });
});

test('createBillingAuthorization posts the exact body with metadata as a string', async () => {
  const { vercel, calls } = clientFor({
    [AUTH]: { body: { id: 'mba_2', status: 'succeeded' } },
  });
  const sleeps = [];

  const id = await createBillingAuthorization(vercel, {
    configurationId: 'icfg_neon',
    sleep: async (ms) => sleeps.push(ms),
  });

  assert.equal(id, 'mba_2');
  assert.deepEqual(calls[0].body, {
    integrationIdOrSlug: 'neon',
    productId: 'neon',
    billingPlanId: 'free_v3',
    integrationConfigurationId: 'icfg_neon',
    metadata: '{"region":"iad1"}',
  });
  assert.deepEqual(sleeps, []);
});

test('createBillingAuthorization polls a pending authorization until it succeeds', async () => {
  const statuses = ['pending', 'succeeded'];
  const { vercel, calls } = clientFor({
    [AUTH]: { body: { authorization: { id: 'mba_3', status: 'pending' } } },
    'GET /v1/integrations/billing/authorization/mba_3?teamId=team_1': () => ({
      body: { authorization: { id: 'mba_3', status: statuses.shift() } },
    }),
  });
  const sleeps = [];

  const id = await createBillingAuthorization(vercel, {
    configurationId: 'icfg_neon',
    sleep: async (ms) => sleeps.push(ms),
  });

  assert.equal(id, 'mba_3');
  assert.deepEqual(sleeps, [2000, 2000]);
  assert.equal(calls.filter((c) => c.method === 'GET').length, 2);
});

test('createBillingAuthorization throws the reason when the authorization fails', async () => {
  const { vercel } = clientFor({
    [AUTH]: {
      body: {
        authorization: { id: 'mba_4', status: 'failed', reason: 'no card' },
      },
    },
  });

  const act = createBillingAuthorization(vercel, {
    configurationId: 'icfg_neon',
    sleep: () => Promise.resolve(),
  });

  await assert.rejects(act, /no card/);
});

test('createBillingAuthorization gives up after 15 polls', async () => {
  const { vercel, calls } = clientFor({
    [AUTH]: { body: { authorization: { id: 'mba_5', status: 'pending' } } },
    'GET /v1/integrations/billing/authorization/mba_5?teamId=team_1': {
      body: { authorization: { id: 'mba_5', status: 'pending' } },
    },
  });

  const act = createBillingAuthorization(vercel, {
    configurationId: 'icfg_neon',
    sleep: () => Promise.resolve(),
  });

  await assert.rejects(act, /did not succeed in time/);
  assert.equal(calls.filter((c) => c.method === 'GET').length, 15);
});

test('ensureStore reports exists and makes no POST when the name is listed', async () => {
  const { vercel, calls } = clientFor({
    [STORES]: {
      body: {
        stores: [{ id: 'store_9', name: 'growth-x', projectsMetadata: [] }],
      },
    },
  });

  const result = await ensureStore(vercel, {
    name: 'growth-x',
    configurationId: 'icfg_neon',
  });

  assert.equal(result.status, 'exists');
  assert.equal(result.store.id, 'store_9');
  assert.deepEqual(
    calls.map((c) => c.method),
    ['GET'],
  );
});

test('ensureConnection posts the exact body, with the prefix when set', async () => {
  const { vercel, calls } = clientFor({
    'POST /v1/storage/stores/store_1/connections?teamId=team_1': { body: {} },
  });
  const store = { id: 'store_1', name: 's', projectsMetadata: [] };

  const plain = await ensureConnection(vercel, store, {
    projectId: 'prj_www',
    environment: 'production',
    envVarPrefix: null,
  });
  const prefixed = await ensureConnection(vercel, store, {
    projectId: 'prj_lc',
    environment: 'preview',
    envVarPrefix: 'B4_',
  });

  assert.equal(plain, 'created');
  assert.equal(prefixed, 'created');
  assert.deepEqual(calls[0].body, {
    projectId: 'prj_www',
    envVarEnvironments: ['production'],
  });
  assert.deepEqual(calls[1].body, {
    projectId: 'prj_lc',
    envVarEnvironments: ['preview'],
    envVarPrefix: 'B4_',
  });
});

test('ensureConnection reports exists only when project, environment and prefix all match', async () => {
  const { vercel, calls } = clientFor({
    'POST /v1/storage/stores/store_1/connections?teamId=team_1': { body: {} },
  });
  const store = {
    id: 'store_1',
    name: 's',
    projectsMetadata: [
      {
        projectId: 'prj_lc',
        environments: ['production'],
        envVarPrefix: 'B4_',
      },
    ],
  };

  const same = await ensureConnection(vercel, store, {
    projectId: 'prj_lc',
    environment: 'production',
    envVarPrefix: 'B4_',
  });
  const otherPrefix = await ensureConnection(vercel, store, {
    projectId: 'prj_lc',
    environment: 'production',
    envVarPrefix: null,
  });

  assert.equal(same, 'exists');
  assert.equal(otherPrefix, 'created');
  assert.equal(calls.length, 1);
});

test('provisionNeon creates five stores and seven connections on a first run', async () => {
  let created = 0;
  const routes = {
    [CONFIGS]: { body: [{ id: 'icfg_neon', slug: 'neon' }] },
    [STORES]: { body: { stores: [] } },
    [AUTH]: { body: { authorization: { id: 'mba_x', status: 'succeeded' } } },
    [CREATE]: () => {
      created += 1;
      return { body: { store: { id: `s${created}`, name: `n${created}` } } };
    },
  };
  const names = [];
  const { fetchImpl, calls } = stubFetch(
    new Proxy(routes, {
      get(target, key) {
        if (key in target) return target[key];
        if (/^POST \/v1\/storage\/stores\/s\d\/connections/.test(key)) {
          return { body: {} };
        }
        return undefined;
      },
    }),
  );
  const vercel = createVercelClient('vercel-token-secret', fetchImpl, {
    teamId: 'team_1',
  });
  const checklist = createChecklist();

  const result = await provisionNeon(vercel, checklist, {
    projectIds: PROJECT_IDS,
  });

  const stores = calls.filter((c) =>
    c.path.startsWith('/v1/storage/stores/integration'),
  );
  const connections = calls.filter((c) => c.path.includes('/connections'));
  names.push(...stores.map((c) => c.body.name));
  assert.deepEqual(result, {});
  assert.deepEqual(names, [
    'growth-production-target-01',
    'growth-preview-target-01',
    'b4-production-target-01',
    'b4-preview-target-01',
    'growth-test-target-01',
  ]);
  assert.equal(
    calls.filter((c) => c.path.startsWith('/v1/integrations/billing')).length,
    5,
  );
  assert.ok(stores.every((c) => c.body.authorizationId === 'mba_x'));
  assert.equal(connections.length, 7);
  assert.deepEqual(
    connections.map((c) => [c.path.split('/')[4], c.body]),
    [
      ['s1', { projectId: 'prj_www', envVarEnvironments: ['production'] }],
      ['s1', { projectId: 'prj_lc', envVarEnvironments: ['production'] }],
      ['s2', { projectId: 'prj_www', envVarEnvironments: ['preview'] }],
      ['s2', { projectId: 'prj_lc', envVarEnvironments: ['preview'] }],
      [
        's3',
        {
          projectId: 'prj_lc',
          envVarEnvironments: ['production'],
          envVarPrefix: 'B4_',
        },
      ],
      [
        's4',
        {
          projectId: 'prj_lc',
          envVarEnvironments: ['preview'],
          envVarPrefix: 'B4_',
        },
      ],
      [
        's5',
        {
          projectId: 'prj_lc',
          envVarEnvironments: ['development'],
          envVarPrefix: 'TEST_',
        },
      ],
    ],
  );
  assert.ok(!checklist.lines().join('\n').includes('vercel-token-secret'));
});

test('provisionNeon on a rerun logs exists for every row and makes no POST', async () => {
  const { vercel, calls } = clientFor({
    [CONFIGS]: { body: [{ id: 'icfg_neon', slug: 'neon' }] },
    [STORES]: { body: { stores: existingStores() } },
  });
  const checklist = createChecklist();

  await provisionNeon(vercel, checklist, { projectIds: PROJECT_IDS });

  assert.deepEqual(
    calls.filter((c) => c.method !== 'GET'),
    [],
  );
  const lines = checklist.lines();
  assert.equal(lines.length, 12);
  assert.ok(lines.every((line) => /\sexists\s/.test(line)));
  assert.ok(lines.some((line) => line.includes('b4-preview-target-01')));
  assert.ok(lines.some((line) => line.includes('B4_')));
  assert.ok(lines.some((line) => line.includes('growth-test-target-01')));
  assert.ok(lines.some((line) => line.includes('TEST_')));
});
