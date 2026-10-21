import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createVercelClient } from '../../../vercel/bootstrap.mjs';
import {
  buildBootstrapEnv,
  buildEnvFile,
  parseEnvFile,
  provision,
  resolveOutDir,
  runProvision,
  SecretLeakError,
} from './index.mjs';
import { assertNoSecrets, createChecklist, createJsonClient } from './lib.mjs';
import { stubFetch } from './test-support.mjs';

const SWITCHES = [
  'CAMPAIGN_ENABLED',
  'CAMPAIGN_ENROLLMENT_ENABLED',
  'DELIVERY_ENABLED',
  'LIFECYCLE_CRON_ENABLED',
  'GROWTH_OBSERVATION_PROCESSING_ENABLED',
  'GROWTH_INSTALL_DIGEST_ENABLED',
  'GROWTH_INSTALL_RUNTIME_HELLO_ENABLED',
];

const POSTHOG = {
  NEXT_PUBLIC_POSTHOG_TOKEN: 'phc_public_token_value',
  NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com',
  POSTHOG_PROJECT_ID: '42',
};
const SECRETS = {
  LIFECYCLE_SERVICE_SECRET: 'a'.repeat(64),
  CRON_SECRET: 'b'.repeat(64),
  GOOGLE_REPLY_HMAC_SECRET: 'c'.repeat(64),
  GROWTH_ACTION_TOKEN_ACTIVE_SECRET: 'd'.repeat(64),
  GROWTH_EMAIL_HMAC_ACTIVE_SECRET: 'e'.repeat(64),
};

function build(resend = { RESEND_API_KEY: 're_sending_secret_value' }) {
  return buildEnvFile({
    posthog: POSTHOG,
    resend,
    secrets: SECRETS,
    founderEmail: 'brian@hashbrown.dev',
  });
}

test('buildEnvFile sets every rollout switch to false and both key versions to the integer 1', () => {
  const text = build();

  const env = parseEnvFile(text);

  for (const key of SWITCHES) assert.equal(env[key], 'false');
  assert.equal(env.GROWTH_ACTION_TOKEN_ACTIVE_VERSION, '1');
  assert.equal(env.GROWTH_EMAIL_HMAC_ACTIVE_VERSION, '1');
  assert.equal(env.RESEND_SENDER_VERIFIED, 'false');
  assert.equal(env.RESEND_TRACKING_DISABLED, 'true');
  assert.equal(env.GROWTH_DATABASE_ENVIRONMENT, 'production');
  assert.equal(env.PREVIEW_GROWTH_DATABASE_ENVIRONMENT, 'preview');
  assert.equal(env.DELIVERY_ENVIRONMENT, 'production');
  assert.equal(env.PREVIEW_DELIVERY_ENVIRONMENT, 'preview');
  assert.equal(env.GROWTH_PUBLIC_ACTION_ORIGIN, 'https://hashbrown.dev');
  assert.equal(env.LIFECYCLE_URL, 'https://hashbrown-lifecycle.vercel.app');
  assert.equal(env.FOUNDER_NOTIFICATION_EMAIL, 'brian@hashbrown.dev');
  for (const key of [
    'DATABASE_URL',
    'B4_DATABASE_URL',
    'PREVIEW_DATABASE_URL',
    'PREVIEW_B4_DATABASE_URL',
  ]) {
    assert.ok(!(key in env), key);
  }
  assert.equal(env.CRON_SECRET, SECRETS.CRON_SECRET);
  assert.ok(!('PREVIEW_GROWTH_PUBLIC_ACTION_ORIGIN' in env));
  assert.ok(!('PREVIEW_LIFECYCLE_URL' in env));
});

test('buildEnvFile omits RESEND_API_KEY when resend returned none', () => {
  const text = build({});

  const env = parseEnvFile(text);

  assert.ok(!('RESEND_API_KEY' in env));
});

test('buildEnvFile rejects a value containing a newline', () => {
  const act = () =>
    buildEnvFile({
      posthog: { ...POSTHOG, POSTHOG_PROJECT_ID: '42\nINJECTED=1' },
      resend: {},
      secrets: SECRETS,
      founderEmail: 'brian@hashbrown.dev',
    });

  assert.throws(act, /POSTHOG_PROJECT_ID/);
});

function clientsFor(fetchImpl) {
  return {
    posthog: createJsonClient({
      baseUrl: 'https://us.posthog.com',
      token: 'ph-token-secret',
      fetchImpl,
    }),
    resend: createJsonClient({
      baseUrl: 'https://api.resend.com',
      token: 're-token-secret',
      fetchImpl,
    }),
    vercel: createVercelClient('vercel-token-secret', fetchImpl, {
      teamId: 'team_1',
    }),
  };
}

const NEON_STORES = [
  ['growth-production-target-01', 'prj_www', 'production', null],
  ['growth-production-target-01', 'prj_lc', 'production', null],
  ['growth-preview-target-01', 'prj_www', 'preview', null],
  ['growth-preview-target-01', 'prj_lc', 'preview', null],
  ['b4-production-target-01', 'prj_lc', 'production', 'B4_'],
  ['b4-preview-target-01', 'prj_lc', 'preview', 'B4_'],
  ['growth-test-target-01', 'prj_lc', 'development', 'TEST_'],
];

const TEST_URL =
  'postgresql://user:pw-secret@host.neon.tech/db?sslmode=require&channel_binding=require';

function testEnvFixtures(value) {
  return {
    'GET /v9/projects/prj_lc/env?teamId=team_1': {
      body: {
        envs: [
          { id: 'env_other', key: 'DATABASE_URL', target: ['production'] },
          { id: 'env_prev', key: 'TEST_DATABASE_URL', target: ['preview'] },
          { id: 'env_test', key: 'TEST_DATABASE_URL', target: ['development'] },
        ],
      },
    },
    'GET /v1/projects/prj_lc/env/env_test?decrypt=true&teamId=team_1': {
      body: {
        id: 'env_test',
        key: 'TEST_DATABASE_URL',
        value,
        target: ['development'],
        type: 'encrypted',
      },
    },
  };
}

function neonFixtures() {
  const names = [...new Set(NEON_STORES.map(([name]) => name))];
  return {
    'GET /v9/projects/hashbrown-www?teamId=team_1': { body: { id: 'prj_www' } },
    'GET /v9/projects/hashbrown-lifecycle?teamId=team_1': {
      body: { id: 'prj_lc' },
    },
    'GET /v1/integrations/configurations?view=account&teamId=team_1': {
      body: [{ id: 'icfg_neon', slug: 'neon' }],
    },
    ...testEnvFixtures(TEST_URL),
    'GET /v1/storage/stores?teamId=team_1': {
      body: {
        stores: names.map((name) => ({
          id: `store_${name}`,
          name,
          projectsMetadata: NEON_STORES.filter(([n]) => n === name).map(
            ([, projectId, environment, envVarPrefix]) => ({
              projectId,
              environments: [environment],
              envVarPrefix,
            }),
          ),
        })),
      },
    },
  };
}

function vendorFixtures() {
  const routes = {
    ...neonFixtures(),
    'GET /api/organizations/@current/': { body: { id: 'org1' } },
    'GET /api/organizations/org1/projects/': {
      body: {
        results: [{ id: 42, name: 'hashbrown', api_token: 'phc_existing' }],
      },
    },
    'GET /domains': {
      body: {
        data: [{ id: 'd1', name: 'hashbrown.dev', status: 'verified' }],
      },
    },
    'GET /domains/d1': {
      body: {
        id: 'd1',
        status: 'verified',
        records: [
          {
            record: 'DKIM',
            name: 'resend._domainkey',
            type: 'TXT',
            value: 'p=abc',
            ttl: 'Auto',
          },
        ],
      },
    },
    'POST /domains/d1/verify': { body: {} },
    'GET /api-keys': {
      body: { data: [{ id: 'k1', name: 'hashbrown-lifecycle' }] },
    },
    'GET /v2/user': { body: { user: { defaultTeamId: 'team_1' } } },
    'GET /v5/domains/hashbrown.dev/records?limit=100&teamId=team_1': {
      body: {
        records: [{ name: 'resend._domainkey', type: 'TXT', value: 'p=abc' }],
      },
    },
  };
  return routes;
}

test('a rerun with all-exists vendors makes no vendor mutation', async () => {
  const { fetchImpl, calls } = stubFetch(vendorFixtures());
  const outDir = mkdtempSync(join(tmpdir(), 'growth-provision-'));
  const spawned = [];

  await provision({
    clients: {
      posthog: createJsonClient({
        baseUrl: 'https://us.posthog.com',
        token: 'ph-token-secret',
        fetchImpl,
      }),
      resend: createJsonClient({
        baseUrl: 'https://api.resend.com',
        token: 're-token-secret',
        fetchImpl,
      }),
      vercel: createVercelClient('vercel-token-secret', fetchImpl, {
        teamId: 'team_1',
      }),
    },
    outDir,
    founderEmail: 'brian@hashbrown.dev',
    checklist: createChecklist(),
    spawnBootstrap: async (args) => {
      spawned.push(args);
      return 0;
    },
  });

  assert.deepEqual(
    calls.filter((c) => c.method !== 'GET'),
    [],
  );
  assert.ok(
    calls.some((c) => c.path === '/v1/storage/stores?teamId=team_1'),
    'lists the stores',
  );
  assert.equal(spawned.length, 1);
  assert.deepEqual(spawned[0], [
    '--env-file',
    join(outDir, 'growth.env'),
    '--skip-workflow',
    '--skip-token-secrets',
  ]);
});

test('the bootstrap child env drops provisioned keys and keeps tokens', async () => {
  const { fetchImpl } = stubFetch(vendorFixtures());
  const outDir = mkdtempSync(join(tmpdir(), 'growth-provision-'));
  const before = { ...process.env };
  process.env.LIFECYCLE_URL = 'https://shell.example';
  process.env.PREVIEW_DELIVERY_ENVIRONMENT = 'shell-preview';
  process.env.VERCEL_TOKEN = 'vercel-token-secret';
  let childEnv;

  try {
    await provision({
      clients: clientsFor(fetchImpl),
      outDir,
      founderEmail: 'brian@hashbrown.dev',
      checklist: createChecklist(),
      spawnBootstrap: async (_args, env) => {
        childEnv = env;
        return 0;
      },
    });
  } finally {
    for (const key of [
      'LIFECYCLE_URL',
      'PREVIEW_DELIVERY_ENVIRONMENT',
      'VERCEL_TOKEN',
    ]) {
      if (key in before) process.env[key] = before[key];
      else delete process.env[key];
    }
  }

  assert.ok(!('LIFECYCLE_URL' in childEnv));
  assert.ok(!('PREVIEW_DELIVERY_ENVIRONMENT' in childEnv));
  assert.equal(childEnv.VERCEL_TOKEN, 'vercel-token-secret');
  assert.equal(buildBootstrapEnv({ A: '1', B: '2' }, 'A=x\n').B, '2');
});

test('a second identical run reports the env file as exists and leaves it untouched', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'growth-provision-'));
  const run = async () => {
    const { fetchImpl } = stubFetch(vendorFixtures());
    const checklist = createChecklist();
    await provision({
      clients: clientsFor(fetchImpl),
      outDir,
      founderEmail: 'brian@hashbrown.dev',
      checklist,
      spawnBootstrap: async () => 0,
    });
    return checklist.lines().find((l) => l.startsWith('Env file'));
  };

  const first = await run();
  const second = await run();

  assert.match(first, /\screated\s/);
  assert.match(second, /\sexists\s/);
});

test('resolveOutDir defaults to the repo folder whatever the cwd is', () => {
  const dir = mkdtempSync(join(tmpdir(), 'growth-cwd-'));
  const sub = join(dir, 'sub');
  mkdirSync(sub);
  const cwd = process.cwd();
  process.chdir(sub);

  try {
    const resolved = resolveOutDir(undefined);

    assert.ok(resolved.endsWith(join('tools', 'growth', '.provision')));
    assert.ok(!resolved.startsWith(sub));
  } finally {
    process.chdir(cwd);
  }
});

test('provision writes growth.env as 0600, keeps secrets stable on rerun, and the checklist leaks none', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'growth-provision-'));
  const run = async () => {
    const { fetchImpl } = stubFetch(vendorFixtures());
    const checklist = createChecklist();
    await provision({
      clients: {
        posthog: createJsonClient({
          baseUrl: 'https://us.posthog.com',
          token: 'ph-token-secret',
          fetchImpl,
        }),
        resend: createJsonClient({
          baseUrl: 'https://api.resend.com',
          token: 're-token-secret',
          fetchImpl,
        }),
        vercel: createVercelClient('vercel-token-secret', fetchImpl, {
          teamId: 'team_1',
        }),
      },
      outDir,
      founderEmail: 'brian@hashbrown.dev',
      checklist,
      spawnBootstrap: async () => 0,
    });
    return checklist;
  };
  const path = join(outDir, 'growth.env');

  const checklist = await run();
  const first = readFileSync(path, 'utf8');
  writeFileSync(path, `${first}RESEND_API_KEY=re_kept_from_first_run\n`);
  await run();
  const second = parseEnvFile(readFileSync(path, 'utf8'));

  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(second.CRON_SECRET, parseEnvFile(first).CRON_SECRET);
  assert.equal(second.RESEND_API_KEY, 're_kept_from_first_run');
  const lines = checklist.lines();
  assertNoSecrets(lines.join('\n'), [
    ...Object.values(SECRETS),
    ...Object.values(parseEnvFile(first)).filter((v) => v.length > 40),
  ]);
  assert.deepEqual(
    lines.slice(-3).map((l) => /\smanual\s/.test(l)),
    [true, true, true],
  );
});

test('runProvision prints no checklist line when the secret guard fires', async () => {
  const routes = vendorFixtures();
  routes['GET /domains/d1'] = {
    body: {
      id: 'd1',
      status: 'phc_existing',
      records: [],
    },
  };
  const { fetchImpl } = stubFetch(routes);
  const outDir = mkdtempSync(join(tmpdir(), 'growth-provision-'));
  const printed = [];

  const act = runProvision(
    {
      clients: {
        posthog: createJsonClient({
          baseUrl: 'https://us.posthog.com',
          token: 'ph-token-secret',
          fetchImpl,
        }),
        resend: createJsonClient({
          baseUrl: 'https://api.resend.com',
          token: 're-token-secret',
          fetchImpl,
        }),
        vercel: createVercelClient('vercel-token-secret', fetchImpl, {
          teamId: 'team_1',
        }),
      },
      outDir,
      founderEmail: 'brian@hashbrown.dev',
      spawnBootstrap: async () => 0,
    },
    (line) => printed.push(line),
  );

  await assert.rejects(act, SecretLeakError);
  assert.deepEqual(printed, []);
});

test('a first run creates five Neon stores and seven connections after the bootstrap', async () => {
  const order = [];
  const routes = vendorFixtures();
  routes['GET /v1/storage/stores?teamId=team_1'] = { body: { stores: [] } };
  routes['POST /v1/integrations/billing/authorization?teamId=team_1'] = {
    body: { authorization: { id: 'mba_1', status: 'succeeded' } },
  };
  let n = 0;
  routes['POST /v1/storage/stores/integration?teamId=team_1'] = () => {
    n += 1;
    return { body: { store: { id: `s${n}`, name: `n${n}` } } };
  };
  for (let i = 1; i <= 5; i += 1) {
    routes[`POST /v1/storage/stores/s${i}/connections?teamId=team_1`] = {
      body: {},
    };
  }
  const { fetchImpl, calls } = stubFetch(routes);
  const outDir = mkdtempSync(join(tmpdir(), 'growth-provision-'));

  await provision({
    clients: clientsFor(fetchImpl),
    outDir,
    founderEmail: 'brian@hashbrown.dev',
    checklist: createChecklist(),
    spawnBootstrap: async () => {
      order.push(calls.length);
      return 0;
    },
  });

  const creates = calls.filter(
    (c) => c.path === '/v1/storage/stores/integration?teamId=team_1',
  );
  const connects = calls.filter((c) => c.path.includes('/connections'));
  assert.equal(creates.length, 5);
  assert.equal(
    calls.filter(
      (c) => c.path === '/v1/integrations/billing/authorization?teamId=team_1',
    ).length,
    5,
  );
  assert.ok(creates.every((c) => c.body.authorizationId === 'mba_1'));
  assert.deepEqual(
    creates.map((c) => c.body.name),
    [
      'growth-production-target-01',
      'growth-preview-target-01',
      'b4-production-target-01',
      'b4-preview-target-01',
      'growth-test-target-01',
    ],
  );
  assert.deepEqual(
    connects.map((c) => [c.path.split('/')[4], c.body]),
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
  const bootstrapAt = order[0];
  assert.ok(calls.indexOf(creates[0]) >= bootstrapAt);
});

test('the Neon step is skipped when the bootstrap exits non-zero', async () => {
  const { fetchImpl, calls } = stubFetch(vendorFixtures());
  const outDir = mkdtempSync(join(tmpdir(), 'growth-provision-'));

  const act = provision({
    clients: clientsFor(fetchImpl),
    outDir,
    founderEmail: 'brian@hashbrown.dev',
    checklist: createChecklist(),
    spawnBootstrap: async () => 1,
  });

  await assert.rejects(act, /bootstrap exited with code 1/);
  assert.ok(!calls.some((c) => c.path.startsWith('/v1/storage')));
});

async function runWith(routes, outDir, checklist = createChecklist()) {
  const { fetchImpl, calls } = stubFetch(routes);
  await provision({
    clients: clientsFor(fetchImpl),
    outDir,
    founderEmail: 'brian@hashbrown.dev',
    checklist,
    spawnBootstrap: async () => 0,
  });
  return { calls, checklist };
}

test('provision writes test-database.env as 0600 from the decrypted development value', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'growth-provision-'));
  const path = join(outDir, 'test-database.env');

  const { checklist, calls } = await runWith(vendorFixtures(), outDir);

  assert.equal(readFileSync(path, 'utf8'), `TEST_DATABASE_URL='${TEST_URL}'\n`);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const lines = checklist.lines();
  assert.ok(
    lines.some(
      (l) =>
        l.includes(`Test database env file ${path}`) &&
        /\screated\s/.test(l) &&
        l.includes('mode 0600'),
    ),
  );
  assert.ok(!lines.join('\n').includes('pw-secret'));
  assert.ok(!lines.join('\n').includes('host.neon.tech'));
  assert.deepEqual(
    calls.filter((c) => c.method !== 'GET'),
    [],
  );
});

test('a rerun reports test-database.env as exists and a changed value as updated', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'growth-provision-'));
  await runWith(vendorFixtures(), outDir);

  const same = await runWith(vendorFixtures(), outDir);
  const changedRoutes = {
    ...vendorFixtures(),
    ...testEnvFixtures('postgresql://other@host/db?a=1&b=2'),
  };
  const changed = await runWith(changedRoutes, outDir);

  assert.ok(
    same.checklist
      .lines()
      .some((l) => /Test database env file.*\sexists\s/.test(l)),
  );
  assert.ok(
    changed.checklist
      .lines()
      .some((l) => /Test database env file.*\supdated\s/.test(l)),
  );
});

test('a non-postgres readback is a manual step, writes no file, and stays last', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'growth-provision-'));
  const routes = {
    ...vendorFixtures(),
    ...testEnvFixtures('not-a-database-url-secret'),
  };

  const { checklist } = await runWith(routes, outDir);

  assert.equal(existsSync(join(outDir, 'test-database.env')), false);
  const lines = checklist.lines();
  const index = lines.findIndex((l) =>
    l.includes('Test database connection string'),
  );
  assert.ok(index >= lines.length - 3);
  assert.match(lines[index], /\smanual\s/);
  assert.ok(!lines.join('\n').includes('not-a-database-url-secret'));
});
