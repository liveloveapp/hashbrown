import { expect, test, vi } from 'vitest';
import {
  type CollectionAcknowledgment,
  ObservationError,
} from '@hashbrownai-internal/growth';

import {
  type CollectionRouteDependencies,
  createCollectionRoute,
  filterWebsiteCollection,
} from '../../src/lib/growth/collection-route';
import type { RuntimeAnnouncement } from '../../src/lib/growth/runtime-announcements';
import { TEST_NOW } from './_keys';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const URL_BASE = 'https://hashbrown.dev/_/growth/collect/v1';

const ACKNOWLEDGMENT: CollectionAcknowledgment = {
  schemaVersion: 1,
  events: [{ eventId: EVENT_ID, disposition: 'accepted' }],
};

const ANNOUNCEMENT: RuntimeAnnouncement = {
  id: 'docs-1',
  packageNames: ['@hashbrownai/react'],
  minVersion: '0.0.0',
  expiresAt: '2027-01-01T00:00:00Z',
  text: 'Read the Hashbrown docs.',
  documentationUrl: 'https://hashbrown.dev/docs',
};

function websiteEvent(kind: string, properties: Record<string, string>) {
  return {
    eventId: EVENT_ID,
    kind,
    occurredAt: '2026-10-21T11:59:00Z',
    collectorVersion: '1',
    subject: { id: SUBJECT_ID, namespace: 'website_session', scope: 'session' },
    properties,
  };
}

const WEBSITE_BATCH = {
  schemaVersion: 1,
  events: [websiteEvent('website.session_started', {})],
};

const RUNTIME_BATCH = {
  schemaVersion: 1,
  events: [
    {
      eventId: EVENT_ID,
      kind: 'runtime.session_started',
      occurredAt: '2026-10-21T11:59:00.000Z',
      collectorVersion: '1',
      subject: {
        id: SUBJECT_ID,
        namespace: 'development_browser',
        scope: 'memory',
      },
      sessionId: SESSION_ID,
      properties: {
        packageName: '@hashbrownai/react',
        packageVersion: '0.8.0',
        integration: 'react',
        transport: 'http',
      },
    },
  ],
};

function installBatch(identity?: Record<string, string>) {
  return {
    schemaVersion: 1,
    events: [
      {
        eventId: EVENT_ID,
        kind: 'package.installed',
        occurredAt: '2026-10-21T11:59:00Z',
        collectorVersion: '1',
        subject: {
          id: SUBJECT_ID,
          namespace: 'installation',
          scope: 'persistent',
        },
        properties: {
          packageName: '@hashbrownai/core',
          packageVersion: '0.8.0',
          osFamily: 'darwin',
          architecture: 'arm64',
          nodeVersion: '22.0.0',
          environment: 'unknown',
          environmentEvidence: 'unknown',
        },
        ...(identity ? { identity } : {}),
      },
    ],
  };
}

function post(source: string, body: unknown): Request {
  return new Request(`${URL_BASE}/${source}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function setup(sources = 'website,install,runtime') {
  const close = vi.fn(async () => undefined);
  const deps = {
    environment: vi.fn(() => ({ GROWTH_COLLECTION_SOURCES: sources })),
    createDatabase: vi.fn(() => ({ close }) as never),
    loadKeyring: vi.fn<CollectionRouteDependencies['loadKeyring']>(() => ({
      active: { version: 1, secret: 'k'.repeat(32) },
    })),
    now: () => TEST_NOW,
    sourceBudget: vi.fn<CollectionRouteDependencies['sourceBudget']>(
      async () => ({ allowed: true, retryAfterSec: 30 }),
    ),
    subjectBudgets: vi.fn<CollectionRouteDependencies['subjectBudgets']>(
      async () => ({ allowed: true, retryAfterSec: 30 }),
    ),
    accept: vi.fn<CollectionRouteDependencies['accept']>(
      async () => ACKNOWLEDGMENT,
    ),
    filterWebsite: filterWebsiteCollection,
    runtimeAnnouncements: vi.fn<
      CollectionRouteDependencies['runtimeAnnouncements']
    >(() => [ANNOUNCEMENT]),
    log: vi.fn<CollectionRouteDependencies['log']>(),
  };
  return { deps, close, handle: createCollectionRoute(deps) };
}

test('preflight returns 204 with CORS headers and touches no database', async () => {
  const { deps, handle } = setup();

  const response = await handle(
    new Request(`${URL_BASE}/runtime`, { method: 'OPTIONS' }),
    'runtime',
  );

  expect(response.status).toBe(204);
  expect(response.headers.get('access-control-allow-origin')).toBe('*');
  expect(response.headers.get('access-control-allow-methods')).toBe(
    'POST, OPTIONS',
  );
  expect(response.headers.get('access-control-allow-headers')).toBe(
    'Content-Type',
  );
  expect(response.headers.get('access-control-expose-headers')).toBe(
    'Retry-After',
  );
  expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(deps.createDatabase).not.toHaveBeenCalled();
});

test('unknown sources return 404 and other methods return 405', async () => {
  const { deps, handle } = setup();

  const unknown = await handle(post('attacker', WEBSITE_BATCH), 'attacker');
  const wrongMethod = await handle(
    new Request(`${URL_BASE}/website`, { method: 'GET' }),
    'website',
  );

  expect(unknown.status).toBe(404);
  expect(await unknown.json()).toEqual({ error: 'unknown_source' });
  expect(wrongMethod.status).toBe(405);
  expect(deps.createDatabase).not.toHaveBeenCalled();
});

test('a source not in GROWTH_COLLECTION_SOURCES returns 503 with Retry-After 60', async () => {
  const disabled = setup('install');
  const misconfigured = setup('website,misspelled');

  const disabledResponse = await disabled.handle(
    post('website', WEBSITE_BATCH),
    'website',
  );
  const misconfiguredResponse = await misconfigured.handle(
    post('website', WEBSITE_BATCH),
    'website',
  );

  expect(disabledResponse.status).toBe(503);
  expect(disabledResponse.headers.get('retry-after')).toBe('60');
  expect(await disabledResponse.json()).toEqual({
    error: 'collection_disabled',
  });
  expect(misconfiguredResponse.status).toBe(503);
  expect(misconfiguredResponse.headers.get('retry-after')).toBe('60');
  expect(await misconfiguredResponse.json()).toEqual({
    error: 'collection_configuration',
  });
  expect(disabled.deps.createDatabase).not.toHaveBeenCalled();
  expect(misconfigured.deps.createDatabase).not.toHaveBeenCalled();
});

test('invalid JSON still consumes the source budget', async () => {
  const { deps, handle, close } = setup();

  const response = await handle(post('website', '{'), 'website');

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid_payload' });
  expect(deps.log.mock.calls[0]?.[0]).toMatchObject({ cause: 'SyntaxError' });
  expect(deps.sourceBudget).toHaveBeenCalledOnce();
  expect(deps.accept).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

test('an exhausted source budget returns 429 before the body and closes the database', async () => {
  const { deps, handle, close } = setup();
  deps.sourceBudget.mockResolvedValueOnce({
    allowed: false,
    retryAfterSec: 17,
  });

  const response = await handle(post('website', WEBSITE_BATCH), 'website');

  expect(response.status).toBe(429);
  expect(response.headers.get('retry-after')).toBe('17');
  expect(deps.accept).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

test('a non-JSON content type returns 415', async () => {
  const { handle } = setup();

  const response = await handle(
    new Request(`${URL_BASE}/website`, { method: 'POST', body: '{}' }),
    'website',
  );

  expect(response.status).toBe(415);
  expect(await response.json()).toEqual({ error: 'content_type' });
});

test('oversize and stalled bodies return 413', async () => {
  const { deps, handle } = setup();
  const cancel = vi.fn();
  const stalled = new Request(`${URL_BASE}/website`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: new ReadableStream({ cancel }),
    duplex: 'half',
  } as RequestInit);

  const oversize = await handle(
    post('website', { data: 'x'.repeat(65_536) }),
    'website',
  );
  const stalledResponse = await handle(stalled, 'website');

  expect(oversize.status).toBe(413);
  expect(await oversize.json()).toEqual({ error: 'body_limit' });
  expect(stalledResponse.status).toBe(413);
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  expect(deps.accept).not.toHaveBeenCalled();
});

test('a batch with one known and one unknown view admits only the known one', async () => {
  const { deps, handle } = setup();
  const known = websiteEvent('website.content_viewed', {
    contentId: 'docs/react/concept/components',
    topic: 'concepts',
  });
  const unknown = {
    ...websiteEvent('website.content_viewed', {
      contentId: 'unknown-private-page',
      topic: 'other',
    }),
    eventId: '44444444-4444-4444-8444-444444444444',
  };

  const response = await handle(
    post('website', { schemaVersion: 1, events: [known, unknown] }),
    'website',
  );

  expect(response.status).toBe(200);
  const admitted = (deps.accept.mock.calls[0] as unknown[])[2] as {
    events: { eventId: string }[];
  };
  expect(admitted.events.map((e) => e.eventId)).toEqual([EVENT_ID]);
  expect(deps.log).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'committed', droppedUnknownContent: 1 }),
  );
  expect(JSON.stringify(deps.log.mock.calls)).not.toContain(
    'unknown-private-page',
  );
});

test('a batch of only unknown or wrong-topic views is accepted with zero admitted', async () => {
  const { deps, handle } = setup();
  const viewed = (properties: Record<string, string>) => ({
    schemaVersion: 1,
    events: [websiteEvent('website.content_viewed', properties)],
  });

  const unknown = await handle(
    post(
      'website',
      viewed({ contentId: 'unknown-private-page', topic: 'other' }),
    ),
    'website',
  );
  const wrongTopic = await handle(
    post(
      'website',
      viewed({ contentId: 'docs/react/concept/components', topic: 'react' }),
    ),
    'website',
  );

  expect(unknown.status).toBe(200);
  expect(wrongTopic.status).toBe(200);
  expect(await unknown.json()).toEqual({ schemaVersion: 1, events: [] });
  expect(deps.accept).not.toHaveBeenCalled();
  expect(deps.log).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'committed',
      eventCount: 0,
      accepted: 0,
      droppedUnknownContent: 1,
    }),
  );
});

test('website events with a known contentId and its topic are accepted', async () => {
  const { deps, handle } = setup();

  const response = await handle(
    post('website', {
      schemaVersion: 1,
      events: [
        websiteEvent('website.content_viewed', {
          contentId: 'docs/react/concept/components',
          topic: 'concepts',
        }),
      ],
    }),
    'website',
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(ACKNOWLEDGMENT);
  expect(deps.accept).toHaveBeenCalledOnce();
  expect(deps.runtimeAnnouncements).not.toHaveBeenCalled();
});

test('a runtime acknowledgment carries announcements after the commit and tolerates a catalog failure', async () => {
  const { deps, handle } = setup();
  let commit!: () => void;
  deps.accept.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        commit = () => resolve(ACKNOWLEDGMENT);
      }),
  );

  const pending = handle(post('runtime', RUNTIME_BATCH), 'runtime');
  await vi.waitFor(() => expect(deps.accept).toHaveBeenCalledOnce());
  const calledBeforeCommit = deps.runtimeAnnouncements.mock.calls.length;
  commit();
  const response = await pending;
  deps.runtimeAnnouncements.mockImplementationOnce(() => {
    throw new Error('catalog unavailable');
  });
  const tolerated = await handle(post('runtime', RUNTIME_BATCH), 'runtime');

  expect(calledBeforeCommit).toBe(0);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ...ACKNOWLEDGMENT,
    announcements: [ANNOUNCEMENT],
  });
  expect(tolerated.status).toBe(200);
  expect(await tolerated.json()).toEqual({
    ...ACKNOWLEDGMENT,
    announcements: [],
  });
});

test('event_conflict maps to 409 and storage errors to 503 with no detail', async () => {
  const { deps, handle } = setup();
  const storageError = Object.assign(new Error('DO-NOT-LOG@example.invalid'), {
    name: 'NeonDbError',
  });
  deps.accept
    .mockRejectedValueOnce(new ObservationError('event_conflict'))
    .mockRejectedValueOnce(storageError);

  const conflict = await handle(post('website', WEBSITE_BATCH), 'website');
  const failure = await handle(post('website', WEBSITE_BATCH), 'website');

  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toEqual({ error: 'event_conflict' });
  expect(failure.status).toBe(503);
  expect(failure.headers.get('retry-after')).toBe('30');
  expect(await failure.text()).toBe('{"error":"collection_unavailable"}');
  expect(deps.log.mock.calls.map(([event]) => event.cause)).toEqual([
    'event_conflict',
    storageError.name,
  ]);
  expect(JSON.stringify(deps.log.mock.calls)).not.toContain('DO-NOT-LOG');
});

test('website traffic is accepted without a keyring; install identity loads it', async () => {
  const keyless = setup();
  keyless.deps.loadKeyring.mockImplementation(() => {
    throw new Error('key unavailable');
  });
  const { deps, handle } = setup();

  const website = await keyless.handle(
    post('website', WEBSITE_BATCH),
    'website',
  );
  const anonymousInstall = await handle(
    post('install', installBatch()),
    'install',
  );
  const callsBeforeIdentity = deps.loadKeyring.mock.calls.length;
  const identifiedInstall = await handle(
    post('install', installBatch({ gitEmail: 'dev@example.com' })),
    'install',
  );

  expect(website.status).toBe(200);
  expect(keyless.deps.loadKeyring).not.toHaveBeenCalled();
  expect(anonymousInstall.status).toBe(200);
  expect(callsBeforeIdentity).toBe(0);
  expect(identifiedInstall.status).toBe(200);
  expect(deps.loadKeyring).toHaveBeenCalledOnce();
  expect(deps.accept.mock.calls[1]?.[3]).toEqual({
    now: TEST_NOW,
    keyring: { active: { version: 1, secret: 'k'.repeat(32) } },
  });
});

test('a committed batch logs counts and latency but no values', async () => {
  const { deps, handle } = setup();

  await handle(
    post('install', installBatch({ gitEmail: 'dev@example.com' })),
    'install',
  );

  expect(deps.log).toHaveBeenCalledOnce();
  expect(deps.log.mock.calls[0]?.[0]).toMatchObject({
    event: 'growth.collection',
    source: 'install',
    code: 'committed',
    status: 200,
    eventCount: 1,
    accepted: 1,
    duplicate: 0,
    redacted: 0,
  });
  expect(JSON.stringify(deps.log.mock.calls)).not.toContain('dev@example.com');
});
