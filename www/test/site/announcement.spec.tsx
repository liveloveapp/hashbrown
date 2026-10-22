// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import {
  Announcement,
  ANNOUNCEMENT_STORAGE_KEY,
  shouldShowAnnouncement,
} from '../../src/components/site/Announcement';
import { ANNOUNCEMENTS } from '../../src/lib/announcements/catalog';

const PUBLISHED_AT = ANNOUNCEMENTS[0].publishedAt;
const ANNOUNCEMENT_DATE = new Date(PUBLISHED_AT);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LIVE_NOW = new Date('2026-10-22T19:00:00Z');

const mounted: Root[] = [];

/** Undo the previous test: unmount, restore globals, clear storage and DOM. */
function reset() {
  vi.useRealTimers();
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
}

function mount() {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  const root = createRoot(container);
  mounted.push(root);
  act(() => root.render(<Announcement />));
  return container;
}

const link = () =>
  document.querySelector<HTMLAnchorElement>(
    'a[href="/blog/2026-10-22-hashbrown-v-0-8-0"]',
  );

test('shows when nothing has been dismissed', () => {
  const stored = null;

  const result = shouldShowAnnouncement(stored, ANNOUNCEMENT_DATE);

  expect(result).toBe(true);
});

test('shows when the last dismissal was before this announcement', () => {
  const stored = '2026-01-01T00:00:00.000Z';

  const result = shouldShowAnnouncement(stored, ANNOUNCEMENT_DATE);

  expect(result).toBe(true);
});

test('stays hidden once this announcement was dismissed', () => {
  const stored = ANNOUNCEMENT_DATE.toISOString();

  const result = shouldShowAnnouncement(stored, ANNOUNCEMENT_DATE);

  expect(result).toBe(false);
});

test('stays hidden when storage is unavailable', () => {
  const stored = undefined;

  const result = shouldShowAnnouncement(stored, ANNOUNCEMENT_DATE);

  expect(result).toBe(false);
});

test('dismissal compares against the entry publishedAt', () => {
  const before = '2026-10-08T17:59:59.000Z';
  const exactly = new Date(PUBLISHED_AT).toISOString();

  const showBefore = shouldShowAnnouncement(before, new Date(PUBLISHED_AT));
  const showExactly = shouldShowAnnouncement(exactly, new Date(PUBLISHED_AT));

  expect(showBefore).toBe(true);
  expect(showExactly).toBe(false);
});

test('announces the date of the current announcement', () => {
  const date = ANNOUNCEMENT_DATE;

  const iso = date.toISOString();

  expect(iso).toBe('2026-10-22T18:00:00.000Z');
  expect(ANNOUNCEMENT_STORAGE_KEY).toBe('lastAnnouncementDateTime');
});

test('does not render on the server', () => {
  reset();
  vi.useFakeTimers({ now: LIVE_NOW, toFake: ['Date'] });

  const html = renderToString(<Announcement />);

  expect(html).toBe('');
});

test('renders the link in the browser when not yet dismissed', () => {
  reset();
  vi.useFakeTimers({ now: LIVE_NOW, toFake: ['Date'] });

  mount();

  expect(link()?.textContent).toBe('New: Hashbrown v0.8 adds decisions');
  expect(link()?.querySelector('strong')?.textContent).toBe('New:');
});

test('stays hidden in the browser once dismissed', () => {
  reset();
  vi.useFakeTimers({ now: LIVE_NOW, toFake: ['Date'] });
  localStorage.setItem(
    ANNOUNCEMENT_STORAGE_KEY,
    ANNOUNCEMENT_DATE.toISOString(),
  );

  mount();

  expect(link()).toBeNull();
});

test('dismissing stores the announcement date and hides it', () => {
  reset();
  vi.useFakeTimers({ now: LIVE_NOW, toFake: ['Date'] });
  mount();

  act(() => {
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Dismiss announcement"]',
      )
      ?.click();
  });

  expect(localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY)).toBe(PUBLISHED_AT);
  expect(link()).toBeNull();
});

test('hydrates without a mismatch, then shows', () => {
  reset();
  vi.useFakeTimers({ now: LIVE_NOW, toFake: ['Date'] });
  const container = document.createElement('div');
  container.innerHTML = renderToString(<Announcement />);
  document.body.replaceChildren(container);
  const recoverableErrors = vi.fn();

  act(() => {
    mounted.push(
      hydrateRoot(container, <Announcement />, {
        onRecoverableError: recoverableErrors,
      }),
    );
  });

  expect(recoverableErrors).not.toHaveBeenCalled();
  expect(link()).not.toBeNull();
});

test('renders nothing once the entry has expired', () => {
  reset();
  vi.useFakeTimers({ now: new Date('2027-06-01T00:00:00Z'), toFake: ['Date'] });

  mount();

  expect(link()).toBeNull();
});

test('shows the release announcement after the previous release was dismissed', () => {
  reset();
  vi.useFakeTimers({ now: LIVE_NOW, toFake: ['Date'] });
  localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, '2026-10-08T18:00:00Z');

  mount();

  expect(link()?.textContent).toBe('New: Hashbrown v0.8 adds decisions');
});
