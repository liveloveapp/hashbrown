// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { SearchOverlay } from '../../src/components/search/SearchOverlay';
import { SEARCH_OVERLAY_OPEN_EVENT } from '../../src/components/site/links';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const INDEX = {
  sitemap:
    '|url|title|description|\n|---|---|---|\n|/docs/react/concept/components|Components|Expose components|',
  apiReferences:
    '|url|symbol|kind|package|\n|---|---|---|---|\n|/api/react/useUiChat|useUiChat|Function|@hashbrownai/react|',
};

/** The first open imports the lazy panel, which can be slow in a busy run. */
const LAZY_LOAD = { timeout: 10_000 };

const mounted: Root[] = [];

afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** Stub `fetch`: the index URL answers with `INDEX`; chat requests hang. */
function stubFetch() {
  const chatBodies: string[] = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === '/_/search-index') {
      return Response.json(INDEX);
    }
    chatBodies.push(String(init?.body ?? ''));
    return new Promise<Response>(() => undefined);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, chatBodies };
}

function mount(): { trigger: HTMLButtonElement } {
  const trigger = document.createElement('button');
  trigger.textContent = 'Search';
  const container = document.createElement('div');
  document.body.replaceChildren(trigger, container);
  const root = createRoot(container);
  mounted.push(root);
  act(() => root.render(<SearchOverlay />));
  return { trigger };
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const queryInput = () =>
  document.querySelector<HTMLInputElement>('input[name="query"]');

/** Open search and wait for the lazily loaded panel to show. */
async function open() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent(SEARCH_OVERLAY_OPEN_EVENT));
  });
  await vi.waitFor(() => expect(dialog()).not.toBeNull(), LAZY_LOAD);
}

function type(value: string) {
  const input = queryInput();
  if (!input) {
    throw new Error('no query input');
  }
  act(() => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

test('is closed until something asks it to open', () => {
  stubFetch();

  mount();

  expect(dialog()).toBeNull();
});

test('the open event shows a modal dialog and focuses the query', async () => {
  stubFetch();
  mount();

  await open();

  expect(dialog()?.getAttribute('aria-modal')).toBe('true');
  expect(document.activeElement).toBe(queryInput());
  expect(document.querySelector('label')?.textContent?.trim()).toBe(
    'Search query',
  );
});

test('⌘K opens it', async () => {
  stubFetch();
  mount();

  await act(async () => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });

  await vi.waitFor(() => expect(dialog()).not.toBeNull(), LAZY_LOAD);
});

test('Escape closes it and returns focus to where it was', async () => {
  stubFetch();
  const { trigger } = mount();
  trigger.focus();
  await open();

  act(() => {
    queryInput()?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
  });

  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test('clicking outside the panel closes it', async () => {
  stubFetch();
  mount();
  await open();

  act(() => {
    dialog()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(dialog()).toBeNull();
});

test('loads the index once, when first opened', async () => {
  const { fetchMock } = stubFetch();
  mount();

  await open();
  act(() => {
    queryInput()?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
  });
  await open();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe('/_/search-index');
});

test('submitting sends the query and the index to the chat endpoint', async () => {
  const { chatBodies } = stubFetch();
  mount();
  await open();
  type('expose a component');

  await act(async () => {
    queryInput()?.form?.requestSubmit();
  });
  await vi.waitFor(() => expect(chatBodies).toHaveLength(1));

  expect(chatBodies[0]).toContain('{\\"query\\":\\"expose a component\\"}');
  expect(chatBodies[0]).toContain('/api/react/useUiChat');
  expect(chatBodies[0]).toContain('/docs/react/concept/components');
  expect(
    document.querySelector('button[aria-label="Cancel search"]'),
  ).not.toBeNull();
});

test('the clear button empties the query and refocuses it', async () => {
  stubFetch();
  mount();
  await open();
  type('hashbrown');
  const clear = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Clear search"]',
  );

  act(() => clear?.click());

  expect(queryInput()?.value).toBe('');
  expect(document.activeElement).toBe(queryInput());
  expect(document.querySelector('button[aria-label="Clear search"]')).toBeNull();
});

test('says so when the index fails to load, and keeps search disabled', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('nope', { status: 500 })),
  );
  mount();

  await open();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="alert"]')).not.toBeNull(),
  );

  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    'Search couldn’t load',
  );
  expect(
    document.querySelector<HTMLButtonElement>('button[type="submit"]')
      ?.disabled,
  ).toBe(true);
});
