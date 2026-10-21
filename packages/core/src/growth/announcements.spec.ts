import { DevelopmentAnnouncements } from './announcements';
import { installBrowserStubs } from './testing/browser-stubs';
import type { RuntimeEvent } from './types';

const SUBJECT_ID = '0b8f6c2e-4a1d-4e3f-8c5b-2d7e9f1a3b4c';

function event(): RuntimeEvent {
  return {
    eventId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    kind: 'runtime.session_started',
    occurredAt: '2026-10-21T12:00:00.000Z',
    collectorVersion: '1',
    subject: {
      id: SUBJECT_ID,
      namespace: 'development_browser',
      scope: 'persistent',
    },
    sessionId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
    properties: {
      integration: 'react',
      packageName: '@hashbrownai/react',
      packageVersion: '0.7.0',
      transport: 'http',
    },
  };
}

function announcement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'release-0-8',
    text: 'Hashbrown 0.8 is available.',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    packageNames: ['@hashbrownai/react'],
    minVersion: '0.7.0',
    maxVersion: '0.8.0',
    documentationUrl: 'https://hashbrown.dev/docs/react/migrations/v0-8',
    ...overrides,
  };
}

test('display prints an applicable announcement once and remembers it', () => {
  const stubs = installBrowserStubs();
  const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  try {
    const announcements = new DevelopmentAnnouncements();

    announcements.display([announcement()], [event()]);
    announcements.display([announcement()], [event()]);
    new DevelopmentAnnouncements().display([announcement()], [event()]);

    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      '[Hashbrown] %s',
      'Hashbrown 0.8 is available.\nhttps://hashbrown.dev/docs/react/migrations/v0-8',
    );
    expect(
      stubs.storage.get(`hashbrown.growth.announcements.v1:${SUBJECT_ID}`),
    ).toBe('["release-0-8"]');
  } finally {
    info.mockRestore();
    stubs.restore();
  }
});

test('display ignores expired, foreign-link, or unmatched announcements', () => {
  const stubs = installBrowserStubs();
  const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  try {
    const announcements = new DevelopmentAnnouncements();
    const items = [
      announcement({
        id: 'expired',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      }),
      announcement({
        id: 'foreign-link',
        documentationUrl: 'https://example.com/docs',
      }),
      announcement({ id: 'unmatched', packageNames: ['@hashbrownai/angular'] }),
    ];

    announcements.display(items, [event()]);

    expect(info).not.toHaveBeenCalled();
  } finally {
    info.mockRestore();
    stubs.restore();
  }
});
