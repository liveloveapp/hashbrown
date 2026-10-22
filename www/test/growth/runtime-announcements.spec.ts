import { expect, test } from 'vitest';

import {
  type RuntimeAnnouncement,
  selectRuntimeAnnouncements,
} from '../../src/lib/growth/runtime-announcements';
import { runtimeAnnouncementCatalog } from '../../src/lib/announcements/catalog';

const NOW = new Date('2026-10-21T12:00:00.000Z');

function batch(packageVersion: string) {
  return {
    events: [
      {
        properties: { packageName: '@hashbrownai/react', packageVersion },
      },
    ],
  };
}

function entry(
  overrides: Partial<RuntimeAnnouncement> = {},
): RuntimeAnnouncement {
  return {
    id: 'docs-1',
    packageNames: ['@hashbrownai/react'],
    minVersion: '0.7.0',
    expiresAt: '2027-01-01T00:00:00Z',
    text: 'Read the Hashbrown docs.',
    documentationUrl: 'https://hashbrown.dev/docs/react/start/quick',
    ...overrides,
  };
}

test('selectRuntimeAnnouncements reads the shared catalog', () => {
  const input = batch('0.8.0');

  const selected = selectRuntimeAnnouncements(input, NOW);

  expect(selected).toEqual(runtimeAnnouncementCatalog(NOW));
});

test('an entry applies to release versions inside its range only', () => {
  const entries = [entry({ maxVersion: '0.9.0' })];

  const inRange = selectRuntimeAnnouncements(batch('0.8.0'), NOW, entries);
  const tooOld = selectRuntimeAnnouncements(batch('0.6.9'), NOW, entries);
  const tooNew = selectRuntimeAnnouncements(batch('0.9.0'), NOW, entries);
  const prerelease = selectRuntimeAnnouncements(
    batch('0.8.0-beta.1'),
    NOW,
    entries,
  );

  expect(inRange).toEqual(entries);
  expect(tooOld).toEqual([]);
  expect(tooNew).toEqual([]);
  expect(prerelease).toEqual([]);
});

test('expired entries and unapproved documentation links are skipped', () => {
  const entries = [
    entry({ id: 'expired', expiresAt: '2026-01-01T00:00:00Z' }),
    entry({ id: 'other-host', documentationUrl: 'https://example.com/docs' }),
    entry({ id: 'not-docs', documentationUrl: 'https://hashbrown.dev/blog' }),
    entry({
      id: 'query',
      documentationUrl: 'https://hashbrown.dev/docs?x=1',
    }),
    entry({ id: 'markup', text: '<b>hi</b>' }),
  ];

  const selected = selectRuntimeAnnouncements(batch('0.8.0'), NOW, entries);

  expect(selected).toEqual([]);
});
