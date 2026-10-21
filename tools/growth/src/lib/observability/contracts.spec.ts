import { expect, test } from 'vitest';

import { parseCollectionBatch } from './contracts.ts';

const now = new Date('2026-09-04T12:00:00.000Z');
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function installBatch(): Json {
  return {
    schemaVersion: 1,
    events: [
      {
        eventId: EVENT_ID,
        kind: 'package.installed',
        occurredAt: now.toISOString(),
        collectorVersion: '1.0.0',
        subject: {
          id: SUBJECT_ID,
          namespace: 'installation',
          scope: 'persistent',
        },
        properties: {
          packageName: '@hashbrownai/core',
          packageVersion: '0.7.0',
          osFamily: 'linux',
          architecture: 'x64',
          nodeVersion: '22.0.0',
          environment: 'ci',
          environmentEvidence: 'github_actions',
          ciProvider: 'github_actions',
        },
        identity: {
          gitEmail: ' Developer@Example.Invalid ',
          gitDisplayName: 'Developer',
          gitConfigOrigin: 'global',
        },
      },
    ],
  };
}

function runtimeEvent(kind: string, extra: Json = {}): Json {
  return {
    eventId: EVENT_ID,
    kind,
    occurredAt: now.toISOString(),
    collectorVersion: '1',
    subject: {
      id: SUBJECT_ID,
      namespace: 'development_browser',
      scope: 'memory',
    },
    sessionId: SESSION_ID,
    properties: {
      packageName: '@hashbrownai/react',
      packageVersion: '0.7.0',
      integration: 'react',
      transport: 'http',
      ...extra,
    },
  };
}

function websiteEvent(kind: string, properties: Json, extra: Json = {}): Json {
  return {
    eventId: EVENT_ID,
    kind,
    occurredAt: now.toISOString(),
    collectorVersion: '1',
    subject: { id: SUBJECT_ID, namespace: 'website_session', scope: 'session' },
    properties,
    ...extra,
  };
}

const parseRuntime = (event: Json) =>
  parseCollectionBatch('runtime', { schemaVersion: 1, events: [event] }, now);
const parseWebsite = (event: Json) =>
  parseCollectionBatch('website', { schemaVersion: 1, events: [event] }, now);

test('accepts a valid install event and rejects unknown keys, trust fields, and bad UUIDs', () => {
  const batch = installBatch();

  const parsed = parseCollectionBatch('install', batch, now);

  expect(parsed.events[0].identity?.gitEmail).toBe('developer@example.invalid');
  expect(parsed.events[0]).not.toHaveProperty('trust');
  for (const key of [
    'trust',
    'accountId',
    'approval',
    'receivedAt',
    'source',
  ]) {
    const forged = installBatch();
    Object.assign(forged.events[0], { [key]: 'DO-NOT-LOG' });
    expect(() => parseCollectionBatch('install', forged, now)).toThrow(
      'invalid_payload',
    );
  }
  const unknownProperty = installBatch();
  unknownProperty.events[0].properties.cwd = '/private/path';
  expect(() => parseCollectionBatch('install', unknownProperty, now)).toThrow(
    'invalid_payload',
  );
  const badId = installBatch();
  badId.events[0].eventId = 'bad';
  expect(() => parseCollectionBatch('install', badId, now)).toThrow(
    'invalid_payload',
  );
  const controlChar = installBatch();
  controlChar.events[0].identity.gitDisplayName = 'x\nsecret';
  expect(() => parseCollectionBatch('install', controlChar, now)).toThrow(
    'invalid_payload',
  );
  const notPackage = installBatch();
  notPackage.events[0].properties.packageName = '@threadplane/chat';
  expect(() => parseCollectionBatch('install', notPackage, now)).toThrow(
    'invalid_payload',
  );
});

test('rejects occurredAt outside the 24h/5min window and impossible dates', () => {
  const stale = installBatch();
  stale.events[0].occurredAt = '2026-09-03T11:59:59Z';
  const future = installBatch();
  future.events[0].occurredAt = '2026-09-04T12:05:01Z';
  const impossible = installBatch();
  impossible.events[0].occurredAt = '2026-09-31T12:00:00Z';

  expect(() => parseCollectionBatch('install', stale, now)).toThrow(
    'invalid_payload',
  );
  expect(() => parseCollectionBatch('install', future, now)).toThrow(
    'invalid_payload',
  );
  expect(() =>
    parseCollectionBatch(
      'install',
      impossible,
      new Date('2026-10-01T12:00:00Z'),
    ),
  ).toThrow('invalid_payload');
});

test('namespace must match the source path', () => {
  const install = installBatch();
  install.events[0].subject.namespace = 'development_browser';

  const runtimeAsInstall = () => parseCollectionBatch('install', install, now);

  expect(runtimeAsInstall).toThrow('invalid_payload');
  expect(() =>
    parseCollectionBatch(
      'website',
      { schemaVersion: 1, events: [runtimeEvent('runtime.session_started')] },
      now,
    ),
  ).toThrow('invalid_payload');
});

test('install requires environment/evidence consistency and allows identity', () => {
  for (const [environment, environmentEvidence] of [
    ['local', 'interactive_package_manager'],
    ['ci', 'generic_ci'],
    ['unknown', 'unknown'],
  ]) {
    const batch = installBatch();
    delete batch.events[0].properties.ciProvider;
    Object.assign(batch.events[0].properties, {
      environment,
      environmentEvidence,
    });
    expect(
      parseCollectionBatch('install', batch, now).events[0].properties
        .environment,
    ).toBe(environment);
  }
  const mismatch = installBatch();
  mismatch.events[0].properties.environment = 'local';
  const wrongProvider = installBatch();
  wrongProvider.events[0].properties.ciProvider = 'gitlab_ci';
  const sessionOnInstall = installBatch();
  sessionOnInstall.events[0].sessionId = SESSION_ID;

  expect(() => parseCollectionBatch('install', mismatch, now)).toThrow(
    'invalid_payload',
  );
  expect(() => parseCollectionBatch('install', wrongProvider, now)).toThrow(
    'invalid_payload',
  );
  expect(() => parseCollectionBatch('install', sessionOnInstall, now)).toThrow(
    'invalid_payload',
  );
});

test('runtime requires sessionId, accepts the four runtime kinds, and allows durationBucket only on first_stream_completed', () => {
  const kinds = [
    'runtime.session_started',
    'runtime.first_stream_completed',
    'tool.first_call_executed',
    'component.first_rendered',
  ];

  for (const kind of kinds) {
    expect(parseRuntime(runtimeEvent(kind)).events[0].kind).toBe(kind);
  }

  expect(
    parseRuntime(
      runtimeEvent('runtime.first_stream_completed', {
        durationBucket: 'lt_1s',
        provider: 'openai',
      }),
    ).events,
  ).toHaveLength(1);
  expect(() =>
    parseRuntime(
      runtimeEvent('tool.first_call_executed', { durationBucket: 'lt_1s' }),
    ),
  ).toThrow('invalid_payload');
  expect(() =>
    parseRuntime({
      ...runtimeEvent('runtime.session_started'),
      sessionId: undefined,
    }),
  ).toThrow('invalid_payload');
  expect(() => parseRuntime(runtimeEvent('transport.connected'))).toThrow(
    'invalid_payload',
  );
  expect(() =>
    parseRuntime(
      runtimeEvent('runtime.first_stream_completed', { durationBucket: '1h' }),
    ),
  ).toThrow('invalid_payload');
});

test('runtime rejects packageName, integration, transport, or provider outside the enums', () => {
  const bad = [
    { packageName: '@threadplane/chat' },
    { integration: 'langgraph' },
    { transport: 'websocket' },
    { provider: 'mistral' },
  ];

  for (const override of bad) {
    expect(() =>
      parseRuntime(runtimeEvent('runtime.session_started', override)),
    ).toThrow('invalid_payload');
  }
  const missingTransport = runtimeEvent('runtime.session_started');
  delete missingTransport.properties.transport;
  expect(() => parseRuntime(missingTransport)).toThrow('invalid_payload');
});

test('website rejects identity and installationToken and validates topic and campaign fields', () => {
  const view = websiteEvent('website.content_viewed', {
    contentId: 'quickstart',
    topic: 'getting_started',
  });
  const start = websiteEvent('website.session_started', {
    campaignSource: 'newsletter',
    referrerHost: 'Example.com',
  });

  expect(parseWebsite(view).events).toHaveLength(1);
  expect(parseWebsite(start).events[0].properties.referrerHost).toBe(
    'example.com',
  );
  expect(() => parseWebsite({ ...view, identity: {} })).toThrow(
    'invalid_payload',
  );
  expect(() =>
    parseWebsite({ ...view, installationToken: SESSION_ID }),
  ).toThrow('invalid_payload');
  expect(() =>
    parseWebsite(
      websiteEvent('website.content_viewed', {
        contentId: 'x',
        topic: 'pricing',
      }),
    ),
  ).toThrow('invalid_payload');
  expect(() =>
    parseWebsite(
      websiteEvent('website.session_started', { campaignSource: 'Bad Token' }),
    ),
  ).toThrow('invalid_payload');
  expect(() =>
    parseWebsite(
      websiteEvent('website.session_started', {
        referrerHost: 'https://example.com/path',
      }),
    ),
  ).toThrow('invalid_payload');
  expect(() =>
    parseWebsite(
      websiteEvent('website.install_command_copied', {
        packageName: '@hashbrownai/core',
      }),
    ),
  ).toThrow('invalid_payload');
});

test('batch rejects more than 20 events and duplicate eventIds', () => {
  const tooMany = installBatch();
  tooMany.events = Array(21).fill(tooMany.events[0]);
  const duplicate = installBatch();
  duplicate.events.push(duplicate.events[0]);
  const empty = { schemaVersion: 1, events: [] };
  const versioned = { ...installBatch(), schemaVersion: 2 };

  expect(() => parseCollectionBatch('install', tooMany, now)).toThrow(
    'invalid_payload',
  );
  expect(() => parseCollectionBatch('install', duplicate, now)).toThrow(
    'invalid_payload',
  );
  expect(() => parseCollectionBatch('install', empty, now)).toThrow(
    'invalid_payload',
  );
  expect(() => parseCollectionBatch('install', versioned, now)).toThrow(
    'unsupported_version',
  );
});
