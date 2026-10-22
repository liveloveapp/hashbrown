import { DevelopmentSession } from './session';
import { installBrowserStubs } from './testing/browser-stubs';
import { type DevelopmentCollectorOptions, SESSION_IDLE, UUID } from './types';

const NOW = Date.parse('2026-10-21T12:00:00.000Z');
const SESSION_KEY = 'hashbrown.growth.session.v1';

function options(packageVersion = '0.7.0'): DevelopmentCollectorOptions {
  return {
    integration: 'react',
    packageName: '@hashbrownai/react',
    packageVersion,
    isDevelopment: () => true,
  };
}

test('touch creates a persistent browser identity and a session', () => {
  const stubs = installBrowserStubs();
  try {
    const session = new DevelopmentSession();

    const first = session.touch(NOW);
    const second = session.touch(NOW + 1_000);

    expect(first.subject.scope).toBe('persistent');
    expect(first.subject.namespace).toBe('development_browser');
    expect(first.subject.id).toMatch(UUID);
    expect(first.sessionId).toMatch(UUID);
    expect(stubs.storage.get('hashbrown.growth.browser.v1')).toBe(
      first.subject.id,
    );
    expect(second).toEqual(first);
  } finally {
    stubs.restore();
  }
});

test('touch starts a new session after thirty minutes idle', () => {
  const stubs = installBrowserStubs();
  try {
    const first = new DevelopmentSession().touch(NOW - SESSION_IDLE);

    const second = new DevelopmentSession().touch(NOW);

    expect(second.subject.id).toBe(first.subject.id);
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.sessionId).toMatch(UUID);
  } finally {
    stubs.restore();
  }
});

test('touch falls back to memory when localStorage throws', () => {
  const stubs = installBrowserStubs({ throwing: true });
  try {
    const session = new DevelopmentSession();

    const identity = session.touch(NOW);

    expect(identity.subject.scope).toBe('memory');
    expect(identity.subject.id).toMatch(UUID);
    expect(identity.sessionId).toMatch(UUID);
  } finally {
    stubs.restore();
  }
});

test('touch discards a session blob of foreign shape', () => {
  const stubs = installBrowserStubs();
  stubs.storage.set(SESSION_KEY, '{"id":"x"}');
  try {
    const session = new DevelopmentSession();

    const identity = session.touch(NOW);

    expect(identity.sessionId).toMatch(UUID);
    expect(JSON.parse(stubs.storage.get(SESSION_KEY) ?? '{}').id).toBe(
      identity.sessionId,
    );
  } finally {
    stubs.restore();
  }
});

test('initialization reuses the envelope until version or token changes', () => {
  const stubs = installBrowserStubs();
  try {
    const session = new DevelopmentSession();
    const identity = session.touch(NOW);
    const token = '6f1c3a8e-2b4d-4c5e-9f7a-1b2c3d4e5f60';

    const first = session.initialization(options(), 'http', identity, NOW);
    const repeated = session.initialization(
      options(),
      'local',
      identity,
      NOW + 1,
    );
    const bumped = session.initialization(
      options('0.7.1'),
      'http',
      identity,
      NOW + 2,
    );
    const tokened = session.initialization(
      { ...options('0.7.1'), installationToken: token },
      'http',
      identity,
      NOW + 3,
    );

    expect(first).toEqual({
      eventId: expect.stringMatching(UUID),
      kind: 'runtime.session_started',
      occurredAt: new Date(NOW).toISOString(),
      collectorVersion: '1',
      subject: identity.subject,
      sessionId: identity.sessionId,
      properties: {
        integration: 'react',
        packageName: '@hashbrownai/react',
        packageVersion: '0.7.0',
        transport: 'http',
      },
    });
    expect(repeated.eventId).toBe(first.eventId);
    expect(repeated.properties['transport']).toBe('local');
    expect(bumped.eventId).not.toBe(first.eventId);
    expect(bumped.properties['packageVersion']).toBe('0.7.1');
    expect(tokened.eventId).not.toBe(bumped.eventId);
    expect(tokened.installationToken).toBe(token);
  } finally {
    stubs.restore();
  }
});

test('claim accepts each integration milestone once', () => {
  const stubs = installBrowserStubs();
  try {
    const session = new DevelopmentSession();
    session.touch(NOW);

    const first = session.claim('react:tool.first_call_executed');
    const again = session.claim('react:tool.first_call_executed');
    const angular = session.claim('angular:component.first_rendered');
    const bogus = session.claim('react:bogus');

    expect(first).toBe(true);
    expect(again).toBe(false);
    expect(angular).toBe(true);
    expect(bogus).toBe(false);
  } finally {
    stubs.restore();
  }
});
