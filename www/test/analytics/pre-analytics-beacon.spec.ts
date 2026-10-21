import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  installPreAnalyticsBeacon,
  PRE_ANALYTICS_EVENT,
  preAnalyticsBeaconScript,
} from '../../src/lib/analytics/pre-analytics-beacon';

const CONFIG = { token: 'phc_test', captureLocal: false };

type Listener = () => void;

function eventTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: (type: string, fn: Listener) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(fn));
    },
    removeEventListener: (type: string, fn: Listener) => {
      listeners.get(type)?.delete(fn);
    },
    dispatch: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
  };
}

let win: ReturnType<typeof eventTarget> & Record<string, unknown>;
let doc: ReturnType<typeof eventTarget> & Record<string, unknown>;
let sendBeacon: ReturnType<typeof vi.fn>;

function setup(host: string, pathname = '/', referrer = '') {
  win = Object.assign(eventTarget(), { innerWidth: 1024 });
  doc = Object.assign(eventTarget(), { referrer, visibilityState: 'visible' });
  sendBeacon = vi.fn(() => true);
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('location', { host, pathname, search: '?email=a%40b.c' });
  vi.stubGlobal('navigator', {
    sendBeacon,
    connection: { effectiveType: '4g' },
  });
}

async function sent(call = 0) {
  const [url, blob] = sendBeacon.mock.calls[call] as [string, Blob];
  return { url, type: blob.type, body: JSON.parse(await blob.text()) };
}

beforeEach(() => setup('hashbrown.dev', '/docs'));
afterEach(() => vi.unstubAllGlobals());

test('beacon fires once on pagehide and is disarmed after init', async () => {
  installPreAnalyticsBeacon(CONFIG);

  win.dispatch('pagehide');
  win.dispatch('pagehide');

  expect(sendBeacon).toHaveBeenCalledTimes(1);
  const { url, type, body } = await sent();
  expect(url).toBe('/_/ingest/i/v0/e/?ip=0&beacon=1');
  expect(type).toBe('application/json');
  expect(body).toMatchObject({
    api_key: 'phc_test',
    event: 'marketing:pre_analytics_exit',
    properties: {
      $process_person_profile: false,
      $lib: 'hashbrown-pre-analytics-beacon',
      trigger: 'pagehide',
      source_page: '/docs',
      viewport_width: 1024,
      effective_type: '4g',
      referrer_host: null,
    },
  });
  expect(JSON.stringify(body)).not.toContain('a%40b.c');
  expect(typeof body.distinct_id).toBe('string');
  expect(typeof body.timestamp).toBe('string');
  expect(typeof body.properties.elapsed_ms).toBe('number');
});

test('a hidden page sends once with the visibilitychange trigger', async () => {
  installPreAnalyticsBeacon(CONFIG);

  doc.dispatch('visibilitychange');
  doc.visibilityState = 'hidden';
  doc.dispatch('visibilitychange');
  win.dispatch('pagehide');

  expect(sendBeacon).toHaveBeenCalledTimes(1);
  expect((await sent()).body.properties.trigger).toBe('visibilitychange');
});

test('disarm stops the beacon from sending', () => {
  installPreAnalyticsBeacon(CONFIG);
  const handle = win.__hashbrownPreAnalytics as { disarm(): void };

  handle.disarm();
  win.dispatch('pagehide');

  expect(sendBeacon).not.toHaveBeenCalled();
});

test('installs nothing without a token or on local hosts without capture-local', () => {
  installPreAnalyticsBeacon({ ...CONFIG, token: '' });
  const noToken = win.__hashbrownPreAnalytics;
  setup('localhost:3000');
  installPreAnalyticsBeacon(CONFIG);
  const local = win.__hashbrownPreAnalytics;
  setup('localhost:3000');
  installPreAnalyticsBeacon({ ...CONFIG, captureLocal: true });

  expect(noToken).toBeUndefined();
  expect(local).toBeUndefined();
  expect(win.__hashbrownPreAnalytics).toBeDefined();
});

test('the shipped script string is self-contained and its event matches the constant', async () => {
  const script = preAnalyticsBeaconScript(CONFIG);

  new Function(script)();
  win.dispatch('pagehide');

  expect(PRE_ANALYTICS_EVENT).toBe('marketing:pre_analytics_exit');
  expect((await sent()).body.event).toBe(PRE_ANALYTICS_EVENT);
});

test('beacon script escapes < as \\u003c', () => {
  const script = preAnalyticsBeaconScript({
    token: '</script><script>alert(1)</script>',
    captureLocal: false,
  });

  expect(script).not.toContain('</script>');
  expect(script).toContain('\\u003c/script>');
});
