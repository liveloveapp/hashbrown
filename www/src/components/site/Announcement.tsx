'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import {
  currentSiteAnnouncement,
  type SiteAnnouncement,
} from '../../lib/announcements/catalog';
import styles from './Announcement.module.css';

/** The `localStorage` key the Angular site stores the last dismissal under. */
export const ANNOUNCEMENT_STORAGE_KEY = 'lastAnnouncementDateTime';

/**
 * Whether to show the announcement, following the Angular `Announcement`:
 * show it when nothing was dismissed yet or the last dismissal predates it.
 *
 * @param stored - The stored dismissal time, `null` when none is stored, or
 *   `undefined` when storage is unavailable (the server, blocked site data).
 * @param announcementDate - When the current announcement went out.
 * @returns Whether to show it.
 */
export function shouldShowAnnouncement(
  stored: string | null | undefined,
  announcementDate: Date,
): boolean {
  if (stored === undefined) {
    return false;
  }
  if (stored === null || stored === '') {
    return true;
  }
  return new Date(stored) < announcementDate;
}

const listeners = new Set<() => void>();

function readStored(): string | null | undefined {
  try {
    return globalThis.localStorage
      ? globalThis.localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY)
      : undefined;
  } catch {
    return undefined;
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === ANNOUNCEMENT_STORAGE_KEY) {
    listeners.forEach((listener) => listener());
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('storage', onStorage);
    }
  };
}

const getServerStored = () => undefined;

function dismiss(announcement: SiteAnnouncement) {
  try {
    localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, announcement.publishedAt);
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  listeners.forEach((listener) => listener());
}

/**
 * The site-wide announcement pill at the bottom of the page, a port of
 * `www/analog/src/app/components/Announcement.ts`. It reads `localStorage`, so
 * it renders nothing on the server or during hydration and fades in after.
 */
export function Announcement() {
  const stored = useSyncExternalStore(subscribe, readStored, getServerStored);

  // `stored` is `undefined` on the server, so the clock is only read in the
  // browser and the server render stays empty.
  const announcement =
    stored === undefined ? undefined : currentSiteAnnouncement(new Date());
  if (
    !announcement ||
    !shouldShowAnnouncement(stored, new Date(announcement.publishedAt))
  ) {
    return null;
  }
  const [lead, rest] = announcement.text.startsWith('New:')
    ? ['New:', announcement.text.slice('New:'.length)]
    : [undefined, announcement.text];
  return (
    <div className={styles.announcement}>
      <div className={styles.alert}>
        <Link href={announcement.href}>
          {lead && <strong>{lead}</strong>}
          {rest}
        </Link>
        <button
          type="button"
          className={styles.close}
          onClick={() => dismiss(announcement)}
          aria-label="Dismiss announcement"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-x"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
