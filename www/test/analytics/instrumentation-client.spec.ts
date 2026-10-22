import { expect, test, vi } from 'vitest';

vi.mock('posthog-js', () => ({ default: { init: vi.fn() } }));

async function load(host: string, token: string, captureLocal?: string) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_TOKEN', token);
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL', captureLocal ?? '');
  const disarm = vi.fn();
  vi.stubGlobal('window', {
    location: { host },
    __hashbrownPreAnalytics: { disarm },
  });
  const init = vi.mocked((await import('posthog-js')).default.init);
  init.mockClear();
  const mod = await import('../../instrumentation-client');
  return {
    init,
    disarm,
    options: mod.POSTHOG_INIT_OPTIONS,
    stripUrlQuery: mod.stripUrlQuery,
  };
}

test('POSTHOG_INIT_OPTIONS equals the pinned object', async () => {
  const { options, stripUrlQuery } = await load('hashbrown.dev', 'tok');

  expect(options).toEqual({
    api_host: '/_/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    capture_pageview: 'history_change',
    capture_pageleave: 'if_capture_pageview',
    autocapture: true,
    capture_performance: { web_vitals: true },
    person_profiles: 'always',
    disable_surveys: true,
    before_send: stripUrlQuery,
  });
});

test("capture_pageview is the literal 'history_change'", async () => {
  const { options } = await load('hashbrown.dev', 'tok');

  expect(options.capture_pageview).toBe('history_change');
});

test('init runs with a token on a production host and on localhost only with capture-local', async () => {
  const production = await load('hashbrown.dev', 'tok');
  const prodCalls = production.init.mock.calls.length;
  const prodArgs = production.init.mock.calls[0];
  const localDefault = await load('localhost:3000', 'tok');
  const localDefaultCalls = localDefault.init.mock.calls.length;
  const localOptIn = await load('localhost:3000', 'tok', 'true');

  expect(prodCalls).toBe(1);
  expect(prodArgs).toEqual(['tok', production.options]);
  expect(localDefaultCalls).toBe(0);
  expect(localOptIn.init).toHaveBeenCalledWith('tok', localOptIn.options);
});

test('disarm runs once, after init, and also when there is no token', async () => {
  const withToken = await load('hashbrown.dev', 'tok');
  const withTokenOrder = [
    withToken.init.mock.invocationCallOrder[0],
    withToken.disarm.mock.invocationCallOrder[0],
  ];
  const noToken = await load('hashbrown.dev', '');

  expect(withToken.disarm).toHaveBeenCalledTimes(1);
  expect(withTokenOrder[1]).toBeGreaterThan(withTokenOrder[0]);
  expect(noToken.init).not.toHaveBeenCalled();
  expect(noToken.disarm).toHaveBeenCalledTimes(1);
});

test('stripUrlQuery removes query and hash from URL properties only', async () => {
  const { stripUrlQuery } = await load('hashbrown.dev', 'tok');
  const event = {
    uuid: 'u',
    event: '$pageview',
    properties: {
      $current_url: 'https://hashbrown.dev/docs?utm=x#y',
      $referrer: 'https://example.com/a?b=c#d',
      $pathname: '/docs',
    },
    $set_once: {
      $initial_current_url: 'https://hashbrown.dev/?utm=x#y',
      $initial_referrer: 'https://example.com/?q=1',
      $initial_os: 'Mac',
    },
  };
  const plain = { uuid: 'p', event: 'e', properties: { a: 1 } };

  const stripped = stripUrlQuery(event);

  expect(stripped).toEqual({
    uuid: 'u',
    event: '$pageview',
    properties: {
      $current_url: 'https://hashbrown.dev/docs',
      $referrer: 'https://example.com/a',
      $pathname: '/docs',
    },
    $set_once: {
      $initial_current_url: 'https://hashbrown.dev/',
      $initial_referrer: 'https://example.com/',
      $initial_os: 'Mac',
    },
  });
  expect(event.properties.$current_url).toContain('?utm=x');
  expect(stripUrlQuery(plain)).toEqual(plain);
  expect(stripUrlQuery(null)).toBeNull();
});
