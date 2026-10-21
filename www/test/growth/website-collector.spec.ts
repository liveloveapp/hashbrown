// @vitest-environment jsdom
import { parseCollectionBatch } from '@hashbrownai-internal/growth';
import { expect, test, vi } from 'vitest';

import { filterWebsiteCollection } from '../../src/lib/growth/collection-route';
import {
  createWebsiteCollector,
  isWebsiteCollectionEnabled,
  type StorageLike,
  type WebsiteBatch,
  type WebsiteDelivery,
} from '../../src/lib/growth/website-collector';

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

function setup(
  options: {
    enabled?: boolean;
    start?: number;
    storage?: { local?: StorageLike; session?: StorageLike };
    collectorVersion?: string;
    referrer?: string;
  } = {},
) {
  let clock = options.start ?? Date.parse('2026-10-21T12:00:00.000Z');
  let counter = 0;
  const posted: WebsiteBatch[] = [];
  const responses: WebsiteDelivery[] = [];
  const collector = createWebsiteCollector({
    enabled: options.enabled ?? true,
    post: async (batch) => {
      posted.push(batch);
      return responses.shift() ?? { status: 200 };
    },
    now: () => new Date(clock),
    storage: options.storage ?? {
      local: memoryStorage(),
      session: memoryStorage(),
    },
    subjectIdFactory: () =>
      `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    collectorVersion: options.collectorVersion ?? '0.1.0',
    context: () => ({
      search: '?utm_source=X',
      referrer: options.referrer ?? 'https://a.dev/',
    }),
  });
  return {
    collector,
    posted,
    responses,
    advance: (ms: number) => void (clock += ms),
    hide: () => collector.flushOnHide(),
    kinds: () => posted.flatMap((b) => b.events.map((e) => e.kind)),
  };
}

test('session_started fires once per 30-minute session and renews on activity', async () => {
  vi.useFakeTimers();
  try {
    const t = setup();

    t.collector.observePath('/docs');
    t.advance(29 * 60_000);
    t.collector.observePath('/blog');
    t.advance(29 * 60_000);
    t.collector.observePath('/api');
    await t.collector.flush();
    t.advance(31 * 60_000);
    t.collector.observePath('/docs');
    await t.collector.flush();

    expect(
      t.kinds().filter((k) => k === 'website.session_started'),
    ).toHaveLength(2);
    expect(t.posted[0].events[0].properties).toEqual({
      campaignSource: 'x',
      referrerHost: 'a.dev',
    });
  } finally {
    vi.useRealTimers();
  }
});

test('content_viewed fires once per pathname per session and skips unknown pages', async () => {
  vi.useFakeTimers();
  try {
    const t = setup();

    t.collector.observePath('/docs/react/concept/tools');
    t.collector.observePath('/docs/react/concept/tools');
    t.collector.observePath('/pricing');
    t.collector.observePath('/blog/post');
    await t.collector.flush();

    const viewed = t.posted
      .flatMap((b) => b.events)
      .filter((e) => e.kind === 'website.content_viewed')
      .map((e) => e.properties);
    expect(viewed).toEqual([
      { contentId: 'docs/react/concept/tools', topic: 'concepts' },
      { contentId: 'blog/post', topic: 'blog' },
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test('batches are route-valid under the PR 2 contract and the website filter', async () => {
  vi.useFakeTimers();
  try {
    const t = setup({ referrer: 'https://example.com./start' });
    const paths = [
      '/docs',
      '/docs/react/concept/components',
      '/docs/angular/concept/components',
      '/api',
      '/blog',
    ];

    for (let i = 0; i < 45; i++) t.collector.observePath(`/blog/post-${i}`);
    for (const path of paths) t.collector.observePath(path);
    await vi.advanceTimersByTimeAsync(1000);
    await t.collector.flush();

    expect(t.posted.length).toBeGreaterThan(2);
    for (const batch of t.posted) {
      expect(batch.events.length).toBeLessThanOrEqual(20);
      const parsed = parseCollectionBatch(
        'website',
        batch,
        new Date('2026-10-21T12:00:00Z'),
      );
      expect(() => filterWebsiteCollection(parsed)).not.toThrow();
    }
    const kept = t.posted
      .map((b) =>
        parseCollectionBatch('website', b, new Date('2026-10-21T12:00:00Z')),
      )
      .flatMap((b) => filterWebsiteCollection(b).events)
      .filter((e) => e.kind === 'website.content_viewed')
      .map((e) => e.properties.contentId);
    expect(kept).toEqual(
      expect.arrayContaining([
        'docs',
        'docs/react/concept/components',
        'docs/angular/concept/components',
        'api',
        'blog',
      ]),
    );
    expect(t.posted[0].events[0].properties).toEqual({ campaignSource: 'x' });
  } finally {
    vi.useRealTimers();
  }
});

test('a renewed session after idle carries no acquisition properties', async () => {
  vi.useFakeTimers();
  try {
    const t = setup();

    t.collector.observePath('/docs');
    await t.collector.flush();
    t.advance(31 * 60_000);
    t.collector.observePath('/api');
    await t.collector.flush();

    const started = t.posted
      .flatMap((b) => b.events)
      .filter((e) => e.kind === 'website.session_started')
      .map((e) => e.properties);
    expect(started).toEqual([
      { campaignSource: 'x', referrerHost: 'a.dev' },
      {},
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test('an empty collector version reports www-dev', async () => {
  vi.useFakeTimers();
  try {
    const t = setup({ collectorVersion: '' });

    t.collector.observePath('/docs');
    await t.collector.flush();

    expect(t.posted[0].events.map((e) => e.collectorVersion)).toEqual([
      'www-dev',
      'www-dev',
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test('pagehide starts every pending chunk at once, even behind a 429 wait', async () => {
  vi.useFakeTimers();
  try {
    const t = setup();
    t.responses.push({ status: 429, retryAfterMs: 30_000 });
    t.collector.observePath('/docs');
    const waiting = t.collector.flush();
    await vi.advanceTimersByTimeAsync(10);
    for (let i = 0; i < 25; i++) t.collector.observePath(`/blog/post-${i}`);
    const before = t.posted.length;

    t.hide();

    expect(before).toBe(1);
    expect(t.posted.length - before).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    await waiting;
  } finally {
    vi.useRealTimers();
  }
});

test('the subject falls back to session storage, then to memory', async () => {
  vi.useFakeTimers();
  try {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const sessionOnly = setup({
      storage: { local: broken, session: memoryStorage() },
    });
    const memoryOnly = setup({ storage: { local: broken, session: broken } });

    sessionOnly.collector.observePath('/docs');
    memoryOnly.collector.observePath('/docs');
    await sessionOnly.collector.flush();
    await memoryOnly.collector.flush();

    expect(sessionOnly.posted[0].events[0].subject.scope).toBe('session');
    expect(memoryOnly.posted[0].events[0].subject.scope).toBe('memory');
  } finally {
    vi.useRealTimers();
  }
});

test('a 429 waits Retry-After once; other failures drop silently', async () => {
  vi.useFakeTimers();
  try {
    const limited = setup();
    limited.responses.push(
      { status: 429, retryAfterMs: 5000 },
      { status: 429 },
    );
    const failing = setup();
    failing.responses.push({ status: 500 });

    limited.collector.observePath('/docs');
    const done = limited.collector.flush();
    await vi.advanceTimersByTimeAsync(4999);
    const before = limited.posted.length;
    await vi.advanceTimersByTimeAsync(1);
    await done;
    failing.collector.observePath('/docs');
    await failing.collector.flush();

    expect(before).toBe(1);
    expect(limited.posted).toHaveLength(2);
    expect(failing.posted).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});

test('disabled, webdriver, and opt-out flags send nothing', async () => {
  vi.useFakeTimers();
  const win = window as { __HASHBROWN_TELEMETRY_DISABLED__?: boolean };
  try {
    const off = setup({ enabled: false });
    const hostileNavigator = { webdriver: true };

    off.collector.observePath('/docs');
    await off.collector.flush();
    const flagOff = isWebsiteCollectionEnabled(undefined);
    const local = isWebsiteCollectionEnabled('true');
    vi.stubGlobal('location', { ...window.location, host: 'hashbrown.dev' });
    const on = isWebsiteCollectionEnabled('true');
    win.__HASHBROWN_TELEMETRY_DISABLED__ = true;
    const globalOptOut = isWebsiteCollectionEnabled('true');
    delete win.__HASHBROWN_TELEMETRY_DISABLED__;
    window.localStorage.setItem('HASHBROWN_TELEMETRY_DISABLED', '1');
    const storageOptOut = isWebsiteCollectionEnabled('true');
    window.localStorage.removeItem('HASHBROWN_TELEMETRY_DISABLED');
    vi.stubGlobal('navigator', hostileNavigator);
    const webdriver = isWebsiteCollectionEnabled('true');

    expect(off.posted).toEqual([]);
    expect({ flagOff, local }).toEqual({ flagOff: false, local: false });
    expect(on).toBe(true);
    expect([globalOptOut, storageOptOut, webdriver]).toEqual([
      false,
      false,
      false,
    ]);
  } finally {
    vi.unstubAllGlobals();
    delete win.__HASHBROWN_TELEMETRY_DISABLED__;
    window.localStorage.removeItem('HASHBROWN_TELEMETRY_DISABLED');
    vi.useRealTimers();
  }
});
