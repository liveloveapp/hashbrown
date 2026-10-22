import { expect, test } from 'vitest';
import {
  isLocalAnalyticsHost,
  shouldCaptureAnalytics,
} from '../../src/lib/analytics/capture-gate';

test('isLocalAnalyticsHost matches localhost, 127.0.0.1, ::1 and [::1]:3000', () => {
  const hosts = [
    'localhost',
    'localhost:3000',
    '127.0.0.1:4308',
    '::1',
    '[::1]:3000',
    'LOCALHOST:3000',
  ];

  const results = hosts.map((host) => isLocalAnalyticsHost(host));

  expect(results).toEqual(hosts.map(() => true));
});

test('isLocalAnalyticsHost rejects real hosts and non-strings', () => {
  const hosts = ['hashbrown.dev', 'localhost.example.com', '', undefined, 42];

  const results = hosts.map((host) => isLocalAnalyticsHost(host));

  expect(results).toEqual(hosts.map(() => false));
});

test('shouldCaptureAnalytics needs a token, and a capture-local opt-in on local hosts', () => {
  const noToken = shouldCaptureAnalytics({ token: ' ', host: 'hashbrown.dev' });
  const production = shouldCaptureAnalytics({
    token: 'phc',
    host: 'hashbrown.dev',
  });
  const local = shouldCaptureAnalytics({
    token: 'phc',
    host: 'localhost:3000',
  });
  const localOptIn = shouldCaptureAnalytics({
    token: 'phc',
    captureLocal: true,
    host: 'localhost:3000',
  });

  expect([noToken, production, local, localOptIn]).toEqual([
    false,
    true,
    false,
    true,
  ]);
});
