'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import styles from './Announcement.module.css';

/** The `localStorage` key the Angular site stores the last dismissal under. */
export const ANNOUNCEMENT_STORAGE_KEY = 'lastAnnouncementDateTime';

/** When the current announcement went out. Bump it to show a new one. */
export const ANNOUNCEMENT_DATE = new Date('2026-09-23T18:00:00Z');

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

function dismiss() {
  try {
    localStorage.setItem(
      ANNOUNCEMENT_STORAGE_KEY,
      ANNOUNCEMENT_DATE.toISOString(),
    );
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

  if (!shouldShowAnnouncement(stored, ANNOUNCEMENT_DATE)) {
    return null;
  }
  return (
    <div className={styles.announcement}>
      <div className={styles.alert}>
        <Link href="/blog/2026-09-23-hashbrown-v-0-6-0">
          <strong>New:</strong> Hashbrown v0.6 speaks AG-UI end to end
        </Link>
        <button
          type="button"
          className={styles.close}
          onClick={dismiss}
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
        <div className={styles.gradient}></div>
      </div>
    </div>
  );
}
