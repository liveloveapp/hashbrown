import { expect, test, vi } from 'vitest';

import {
  type B4FetchApp,
  createMarketingVercelAdapter,
} from './vercel-adapter.ts';

const SECRET = 'adapter-secret';
const STATE_URL = 'postgres://state:pw@state.invalid:5432/b4';
const GROWTH_URL = 'postgres://growth:pw@growth.invalid:5432/growth';

interface RecordedCall {
  request: Request;
  env: Record<string, string>;
  databaseUrl: string | undefined;
}

/**
 * A stand-in for the built b4run bundle: it resolves its store URL the way
 * b4run 0.14 does (`env?.[name] ?? process.env[name]`) and records what it
 * was handed. The isolated artifact check covers the real bundle.
 */
function createB4Stub(
  respond: (request: Request) => Response = () =>
    Response.json({ ok: true }, { headers: { 'x-b4': '1' } }),
) {
  const calls: RecordedCall[] = [];
  const app: B4FetchApp = {
    fetch(request, env) {
      calls.push({
        request,
        env,
        databaseUrl: env['DATABASE_URL'] ?? process.env['DATABASE_URL'],
      });
      return respond(request);
    },
  };
  return { app, calls };
}

function createAdapter(
  app: B4FetchApp,
  overrides: Partial<Parameters<typeof createMarketingVercelAdapter>[1]> = {},
) {
  return createMarketingVercelAdapter(app, {
    readSecret: () => SECRET,
    readDeploymentId: () => 'dpl_test',
    readStateDatabaseUrl: () => STATE_URL,
    readStateSchema: () => undefined,
    readStateTablePrefix: () => undefined,
    ...overrides,
  });
}

/** Header input accepted by `new Headers(...)`, without relying on the DOM `HeadersInit` global. */
type HeaderInput = ConstructorParameters<typeof Headers>[0];

function request(path: string, headers?: HeaderInput): Request {
  return new Request(`https://marketing.invalid${path}`, {
    headers: new Headers(headers),
  });
}

test('adapter rejects every unauthenticated path incl. /healthz, /readyz, /threads, /memory/candidates', async () => {
  const { app, calls } = createB4Stub();
  const adapter = createAdapter(app);
  const paths = [
    '/healthz',
    '/readyz',
    '/threads',
    '/threads/x/state',
    '/memory/candidates',
    '/dispatch',
    '/anything/else',
  ];
  const headerVariants: (HeaderInput | undefined)[] = [
    undefined,
    { authorization: 'Bearer wrong' },
    { Authorization: `bearer ${SECRET}` },
    { AUTHORIZATION: SECRET },
    { authorization: `Bearer ${SECRET}x` },
    { 'x-authorization': `Bearer ${SECRET}` },
  ];

  const responses = await Promise.all(
    paths.flatMap((path) =>
      headerVariants.map((headers) => adapter.fetch(request(path, headers))),
    ),
  );

  expect(responses).toHaveLength(paths.length * headerVariants.length);
  for (const response of responses) {
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-hashbrown-deployment-id')).toBeNull();
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  }
  expect(calls).toHaveLength(0);
});

test('adapter accepts the exact bearer under lowercase and mixed-case Authorization headers', async () => {
  const { app, calls } = createB4Stub();
  const adapter = createAdapter(app);

  const lower = await adapter.fetch(
    request('/threads/x/state', { authorization: `Bearer ${SECRET}` }),
  );
  const mixed = await adapter.fetch(
    request('/threads/x/state', { AuThOrIzAtIoN: `Bearer ${SECRET}` }),
  );

  expect(lower.status).toBe(200);
  expect(mixed.status).toBe(200);
  expect(calls).toHaveLength(2);
});

test('adapter answers 503 without a secret and 503 with a bearer but no B4_DATABASE_URL, never calling b4', async () => {
  const { app, calls } = createB4Stub();
  const noSecret = createAdapter(app, { readSecret: () => undefined });
  const emptySecret = createAdapter(app, { readSecret: () => '' });
  const noState = createAdapter(app, { readStateDatabaseUrl: () => undefined });
  const blankState = createAdapter(app, { readStateDatabaseUrl: () => '  ' });
  const bearer = { authorization: `Bearer ${SECRET}` };

  const responses = [
    await noSecret.fetch(request('/healthz', bearer)),
    await noSecret.fetch(request('/readyz')),
    await emptySecret.fetch(request('/healthz', { authorization: 'Bearer ' })),
    await noState.fetch(request('/healthz', bearer)),
    await blankState.fetch(request('/threads', bearer)),
  ];
  const unauthenticatedNoState = await noState.fetch(request('/healthz'));

  expect(responses.map((response) => response.status)).toEqual([
    503, 503, 503, 503, 503,
  ]);
  expect(await responses[0].json()).toEqual({
    error: 'service_secret_missing',
  });
  expect(await responses[3].json()).toEqual({
    error: 'state_database_missing',
  });
  for (const response of responses) {
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  expect(unauthenticatedNoState.status).toBe(401);
  expect(calls).toHaveLength(0);
});

test('adapter binds the state database and never passes the growth DATABASE_URL to b4', async () => {
  vi.stubEnv('DATABASE_URL', GROWTH_URL);
  vi.stubEnv('B4_DATABASE_URL', STATE_URL);
  vi.stubEnv('MARKETING_SERVICE_SECRET', SECRET);
  vi.stubEnv('OPENAI_API_KEY', 'sk-not-forwarded');
  const { app, calls } = createB4Stub();
  const defaults = createMarketingVercelAdapter(app);
  const named = createAdapter(app, {
    readStateSchema: () => 'marketing',
    readStateTablePrefix: () => 'lc',
  });
  const incoming = request('/readyz', { Authorization: `Bearer ${SECRET}` });

  await defaults.fetch(incoming);
  await named.fetch(request('/readyz', { authorization: `Bearer ${SECRET}` }));
  const growthUrlAfter = process.env['DATABASE_URL'];

  expect(calls[0].request).toBe(incoming);
  expect(calls[0].env).toEqual({ DATABASE_URL: STATE_URL });
  expect(calls[1].env).toEqual({
    DATABASE_URL: STATE_URL,
    B4_PG_SCHEMA: 'marketing',
    B4_PG_TABLE_PREFIX: 'lc',
  });
  expect(calls.map((call) => call.databaseUrl)).toEqual([STATE_URL, STATE_URL]);
  expect(growthUrlAfter).toBe(GROWTH_URL);
});

test('deployment id header appears only on authenticated /healthz', async () => {
  const { app } = createB4Stub(
    () =>
      new Response('ok', {
        status: 200,
        headers: { 'cache-control': 'public, max-age=60', 'x-b4': '1' },
      }),
  );
  const adapter = createAdapter(app);
  const bearer = { authorization: `Bearer ${SECRET}` };

  const health = await adapter.fetch(request('/healthz', bearer));
  const ready = await adapter.fetch(request('/readyz', bearer));
  const unauthenticated = await adapter.fetch(request('/healthz'));
  const noDeployment = await createAdapter(app, {
    readDeploymentId: () => undefined,
  }).fetch(request('/healthz', bearer));

  expect(health.headers.get('x-hashbrown-deployment-id')).toBe('dpl_test');
  expect(health.headers.get('x-b4')).toBe('1');
  expect(await health.text()).toBe('ok');
  expect(ready.headers.get('x-hashbrown-deployment-id')).toBeNull();
  expect(unauthenticated.headers.get('x-hashbrown-deployment-id')).toBeNull();
  expect(noDeployment.headers.get('x-hashbrown-deployment-id')).toBeNull();
  for (const response of [health, ready, noDeployment]) {
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
});
