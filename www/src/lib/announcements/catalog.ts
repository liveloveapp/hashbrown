import type { RuntimeAnnouncement } from '../growth/runtime-announcements';

/** The name of a published Hashbrown package, such as `@hashbrownai/react`. */
export type PackageName = string;

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
        Date.parse(entry.publishedAt) <= time &&
        time < Date.parse(entry.expiresAt),
    )
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
}

/**
 * Projects the entries with a `runtime` block to the shape collectors receive.
 *
 * @param entries - The catalog; defaults to {@link ANNOUNCEMENTS}.
 * @returns The runtime announcements.
 * @throws When a documentation URL is not an approved hashbrown.dev docs URL
 *   or an `href` is not a site-relative path.
 */
export function runtimeAnnouncementCatalog(
  entries: readonly SiteAnnouncement[] = ANNOUNCEMENTS,
): RuntimeAnnouncement[] {
  return entries.flatMap(({ runtime, ...entry }) => {
    if (!entry.href.startsWith('/') || entry.href.startsWith('//')) {
      throw new Error(`Announcement ${entry.id} href must be site-relative`);
    }
    if (!runtime) return [];
    if (!approvedDocumentationUrl(runtime.documentationUrl)) {
      throw new Error(
        `Announcement ${entry.id} has an unapproved documentationUrl`,
      );
    }
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
