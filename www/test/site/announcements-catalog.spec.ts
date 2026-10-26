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

test('the shipped catalog keeps releases and support entries with site-relative hrefs', () => {
  const entries = ANNOUNCEMENTS;

  expect(entries.map(({ id }) => id)).toEqual([
    'v0-8-decisions',
    'v0-7-ag-ui-1-0',
    'get-unstuck-form-react',
    'get-unstuck-form-angular',
  ]);
  expect(entries.every(({ href }) => href.startsWith('/'))).toBe(true);
  expect(entries[0].expiresAt).toBe('2027-01-20T18:00:00Z');
  expect(entries[0].href).toBe('/blog/2026-10-22-hashbrown-v-0-8-0');
});

test('support entries reach React and Angular runtimes while the release is the current site pill', () => {
  const now = new Date('2026-10-23T00:00:00Z');

  const pill = currentSiteAnnouncement(now);
  const runtime = runtimeAnnouncementCatalog(now).filter(({ id }) =>
    id.startsWith('get-unstuck-form'),
  );

  expect(pill?.id).toBe('v0-8-decisions');
  expect(pill?.href).toBe('/blog/2026-10-22-hashbrown-v-0-8-0');
  expect(
    runtime.map(({ packageNames, minVersion, documentationUrl, text }) => ({
      packageNames,
      minVersion,
      documentationUrl,
      text,
    })),
  ).toEqual([
    {
      packageNames: ['@hashbrownai/react'],
      minVersion: '0.8.0',
      documentationUrl: 'https://hashbrown.dev/docs/react',
      text: "Stuck on your first stream, tool call or component? Ask Brian, Hashbrown's founder: hashbrown.dev/unstuck",
    },
    {
      packageNames: ['@hashbrownai/angular'],
      minVersion: '0.8.0',
      documentationUrl: 'https://hashbrown.dev/docs/angular',
      text: "Stuck on your first stream, tool call or component? Ask Brian, Hashbrown's founder: hashbrown.dev/unstuck",
    },
  ]);
  expect(
    runtime.every(({ expiresAt }) => expiresAt === '2027-04-20T18:00:00Z'),
  ).toBe(true);
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

  const projected = runtimeAnnouncementCatalog(
    new Date('2026-10-01T00:00:00Z'),
    entries,
  );

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

test('runtimeAnnouncementCatalog skips entries not yet published, as the pill does', () => {
  const runtime = {
    packageNames: ['@hashbrownai/react'] as const,
    minVersion: '0.7.0',
    documentationUrl: 'https://hashbrown.dev/docs/react',
  };
  const entries = [
    entry({ id: 'future', publishedAt: '2026-11-01T00:00:00Z', runtime }),
  ];

  const before = runtimeAnnouncementCatalog(
    new Date('2026-10-31T23:59:59Z'),
    entries,
  );
  const after = runtimeAnnouncementCatalog(
    new Date('2026-11-01T00:00:00Z'),
    entries,
  );

  expect(before).toEqual([]);
  expect(after.map(({ id }) => id)).toEqual(['future']);
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
  const latest = new Date(
    Math.max(...entries.map(({ publishedAt }) => Date.parse(publishedAt))),
  );

  const valid = entries.map(isValidSiteAnnouncement);
  const runtime = runtimeAnnouncementCatalog(latest, entries);

  expect(valid.every(Boolean)).toBe(true);
  expect(runtime).toHaveLength(entries.filter(({ runtime }) => runtime).length);
});

test('the release announcement takes over at publication and keeps the prior announcement before it', () => {
  const before = new Date('2026-10-22T17:59:59Z');
  const atPublication = new Date('2026-10-22T18:00:00Z');

  const previous = currentSiteAnnouncement(before);
  const current = currentSiteAnnouncement(atPublication);

  expect(previous?.id).toBe('v0-7-ag-ui-1-0');
  expect(current?.id).toBe('v0-8-decisions');
  expect(current?.href).toBe('/blog/2026-10-22-hashbrown-v-0-8-0');
});
