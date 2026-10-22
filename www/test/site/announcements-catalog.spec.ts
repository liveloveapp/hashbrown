import { expect, test } from 'vitest';

import {
  ANNOUNCEMENTS,
  currentSiteAnnouncement,
  isSiteRelativeHref,
  isValidSiteAnnouncement,
  runtimeAnnouncementCatalog,
  type SiteAnnouncement,
} from '../../src/lib/announcements/catalog';

function entry(overrides: Partial<SiteAnnouncement> = {}): SiteAnnouncement {
  return {
    id: 'a',
    text: 'A',
    href: '/blog/a',
    publishedAt: '2026-01-01T00:00:00Z',
    expiresAt: '2026-12-31T00:00:00Z',
    ...overrides,
  };
}

test('the shipped catalog has the v0.7 entry with a site-relative href', () => {
  const entries = ANNOUNCEMENTS;

  expect(entries.map(({ id }) => id)).toEqual(['v0-7-ag-ui-1-0']);
  expect(entries.every(({ href }) => href.startsWith('/'))).toBe(true);
  expect(entries[0].expiresAt).toBe('2027-01-06T18:00:00Z');
});

test('currentSiteAnnouncement returns the newest live entry and none when all expired', () => {
  const entries = [
    entry({ id: 'old', publishedAt: '2026-01-01T00:00:00Z' }),
    entry({ id: 'new', publishedAt: '2026-06-01T00:00:00Z' }),
    entry({
      id: 'expired',
      publishedAt: '2026-09-01T00:00:00Z',
      expiresAt: '2026-09-02T00:00:00Z',
    }),
  ];

  const live = currentSiteAnnouncement(
    new Date('2026-10-01T00:00:00Z'),
    entries,
  );
  const none = currentSiteAnnouncement(
    new Date('2027-06-01T00:00:00Z'),
    entries,
  );

  expect(live?.id).toBe('new');
  expect(none).toBeUndefined();
});

test('currentSiteAnnouncement ignores entries not yet published', () => {
  const entries = [entry({ publishedAt: '2026-11-01T00:00:00Z' })];

  const result = currentSiteAnnouncement(
    new Date('2026-10-01T00:00:00Z'),
    entries,
  );

  expect(result).toBeUndefined();
});

test('the shipped entry is live on 2026-10-21', () => {
  const result = currentSiteAnnouncement(new Date('2026-10-21T00:00:00Z'));

  expect(result?.text).toBe('New: Hashbrown v0.7 moves to AG-UI 1.0');
});

test('runtimeAnnouncementCatalog excludes entries without a runtime block and skips a non-docs documentationUrl', () => {
  const runtime = {
    packageNames: ['@hashbrownai/react'] as const,
    minVersion: '0.7.0',
    documentationUrl: 'https://hashbrown.dev/docs/react',
  };
  const entries = [
    entry({ id: 'plain' }),
    entry({ id: 'with', text: 'Hello', runtime }),
    entry({
      id: 'bad',
      runtime: { ...runtime, documentationUrl: 'https://example.com/docs' },
    }),
  ];

  const projected = runtimeAnnouncementCatalog(entries);

  expect(projected).toEqual([
    {
      id: 'with',
      packageNames: ['@hashbrownai/react'],
      minVersion: '0.7.0',
      expiresAt: '2026-12-31T00:00:00Z',
      text: 'Hello',
      documentationUrl: 'https://hashbrown.dev/docs/react',
    },
  ]);
});

test('site-relative hrefs reject protocol-relative and absolute URLs', () => {
  const hrefs = ['//x', 'https://x', '/\\x', 'blog/a', 'javascript:1'];

  const results = hrefs.map(isSiteRelativeHref);

  expect(results).toEqual([false, false, false, false, false]);
  expect(isSiteRelativeHref('/blog/a?x=1#y')).toBe(true);
});

test('an entry with an invalid href is never shown', () => {
  const entries = [entry({ href: '//evil.example' })];

  const result = currentSiteAnnouncement(
    new Date('2026-10-01T00:00:00Z'),
    entries,
  );

  expect(result).toBeUndefined();
});

test('every shipped entry is valid for both surfaces', () => {
  const entries = ANNOUNCEMENTS;

  const valid = entries.map(isValidSiteAnnouncement);

  expect(valid.every(Boolean)).toBe(true);
  expect(runtimeAnnouncementCatalog(entries)).toHaveLength(
    entries.filter(({ runtime }) => runtime).length,
  );
});
