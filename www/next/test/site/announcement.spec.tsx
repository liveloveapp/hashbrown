// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import {
  Announcement,
  ANNOUNCEMENT_DATE,
  ANNOUNCEMENT_STORAGE_KEY,
  shouldShowAnnouncement,
} from '../../src/components/site/Announcement';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Root[] = [];

/** Undo the previous test: unmount, restore globals, clear storage and DOM. */
function reset() {
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
    'a[href="/blog/2026-09-23-hashbrown-v-0-6-0"]',
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

test('announces the date the Angular site used', () => {
  const date = ANNOUNCEMENT_DATE;

  const iso = date.toISOString();

  expect(iso).toBe('2026-09-23T18:00:00.000Z');
  expect(ANNOUNCEMENT_STORAGE_KEY).toBe('lastAnnouncementDateTime');
});

test('does not render on the server', () => {
  reset();

  const html = renderToString(<Announcement />);

  expect(html).toBe('');
});

test('renders the link in the browser when not yet dismissed', () => {
  reset();

  mount();

  expect(link()?.textContent).toBe(
    'New: Hashbrown v0.6 speaks AG-UI end to end',
  );
  expect(link()?.querySelector('strong')?.textContent).toBe('New:');
});

test('stays hidden in the browser once dismissed', () => {
  reset();
  localStorage.setItem(
    ANNOUNCEMENT_STORAGE_KEY,
    ANNOUNCEMENT_DATE.toISOString(),
  );

  mount();

  expect(link()).toBeNull();
});

test('dismissing stores the announcement date and hides it', () => {
  reset();
  mount();

  act(() => {
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Dismiss announcement"]',
      )
      ?.click();
  });

  expect(localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY)).toBe(
    '2026-09-23T18:00:00.000Z',
  );
  expect(link()).toBeNull();
});

test('hydrates without a mismatch, then shows', () => {
  reset();
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
