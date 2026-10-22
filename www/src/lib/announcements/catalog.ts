import type { PACKAGE_NAMES } from '@hashbrownai-internal/growth';
import type { RuntimeAnnouncement } from '../growth/runtime-announcements';

/** The name of a published Hashbrown package, such as `@hashbrownai/react`. */
export type PackageName = (typeof PACKAGE_NAMES)[number];

/** One announcement, shown on hashbrown.dev and optionally to collectors. */
export interface SiteAnnouncement {
  id: string;
  /** The pill text; a leading `New:` is rendered bold. */
  text: string;
  /** ISO time it went out; also the stored dismissal value. */
  publishedAt: string;
  /** ISO time after which it is no longer shown. */
  expiresAt: string;
  /** A site-relative path starting with `/`. */
  href: string;
  /** Present only when development collectors should also receive it. */
  runtime?: {
    packageNames: readonly PackageName[];
    minVersion: string;
    maxVersion?: string;
    documentationUrl: string;
  };
}

/** The announcements, in any order; the newest live one is shown. */
export const ANNOUNCEMENTS: readonly SiteAnnouncement[] = [
  {
    id: 'v0-8-decisions',
    text: 'New: Hashbrown v0.8 adds decisions',
    href: '/blog/2026-10-22-hashbrown-v-0-8-0',
    publishedAt: '2026-10-22T18:00:00Z',
    expiresAt: '2027-01-20T18:00:00Z',
  },
  {
    id: 'v0-7-ag-ui-1-0',
    text: 'New: Hashbrown v0.7 moves to AG-UI 1.0',
    href: '/blog/2026-10-08-hashbrown-v-0-7-0',
    publishedAt: '2026-10-08T18:00:00Z',
    expiresAt: '2027-01-06T18:00:00Z',
  },
];

/**
 * Whether a documentation URL is an https hashbrown.dev docs page.
 *
 * @param value - The candidate URL.
 * @returns Whether it is approved for runtime announcements.
 */
export function approvedDocumentationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'hashbrown.dev' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      (url.pathname === '/docs' || url.pathname.startsWith('/docs/'))
    );
  } catch {
    return false;
  }
}

/**
 * Whether an href is a site-relative path: one leading `/`, not `//`, and no
 * scheme or backslash.
 *
 * @param value - The candidate href.
 * @returns Whether it is safe to render as an internal link.
 */
export function isSiteRelativeHref(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !/[\\\p{Cc}\s]/u.test(value)
  );
}

/**
 * Whether an entry is valid for both surfaces: a site-relative `href` and,
 * when it has a `runtime` block, an approved documentation URL.
 *
 * @param entry - The announcement.
 * @returns Whether it may be shown and projected.
 */
export function isValidSiteAnnouncement(entry: SiteAnnouncement): boolean {
  return (
    isSiteRelativeHref(entry.href) &&
    (entry.runtime === undefined ||
      approvedDocumentationUrl(entry.runtime.documentationUrl))
  );
}

/**
 * The newest announcement that is published and not yet expired.
 *
 * @param now - The time to evaluate against.
 * @param entries - The catalog; defaults to {@link ANNOUNCEMENTS}.
 * @returns The newest live entry, or `undefined` when none is live.
 */
export function currentSiteAnnouncement(
  now: Date,
  entries: readonly SiteAnnouncement[] = ANNOUNCEMENTS,
): SiteAnnouncement | undefined {
  const time = now.getTime();
  return entries
    .filter(
      (entry) =>
        isValidSiteAnnouncement(entry) &&
        Date.parse(entry.publishedAt) <= time &&
        time < Date.parse(entry.expiresAt),
    )
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
}

/**
 * Projects the published entries with a `runtime` block to the shape
 * collectors receive. As with the site pill, an entry whose `publishedAt` is
 * after `now` is not yet published and is skipped.
 *
 * @param now - The time used for publication.
 * @param entries - The catalog; defaults to {@link ANNOUNCEMENTS}.
 * @returns The runtime announcements.
 * Invalid entries are skipped, never thrown on.
 */
export function runtimeAnnouncementCatalog(
  now: Date,
  entries: readonly SiteAnnouncement[] = ANNOUNCEMENTS,
): RuntimeAnnouncement[] {
  const time = now.getTime();
  return entries.flatMap((entry) => {
    const { runtime } = entry;
    if (
      !runtime ||
      !isValidSiteAnnouncement(entry) ||
      !(Date.parse(entry.publishedAt) <= time)
    )
      return [];
    return [
      {
        id: entry.id,
        packageNames: [...runtime.packageNames],
        minVersion: runtime.minVersion,
        ...(runtime.maxVersion === undefined
          ? {}
          : { maxVersion: runtime.maxVersion }),
        expiresAt: entry.expiresAt,
        text: entry.text,
        documentationUrl: runtime.documentationUrl,
      },
    ];
  });
}
