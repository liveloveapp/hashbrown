import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDeploySmokeArgs, runDeploySmoke } from './deploy-smoke.mjs';

test('parses the deploy smoke command line', () => {
  const options = parseDeploySmokeArgs([
    '--url',
    'https://hashbrown.dev',
    '--expect',
    'Hashbrown',
    '--name',
    'docs',
    '--dry-run',
    '--retries',
    '5',
    '--retry-delay-ms',
    '1000',
  ]);

  assert.deepEqual(options, {
    url: 'https://hashbrown.dev',
    expectedText: 'Hashbrown',
    name: 'docs',
    dryRun: true,
    retries: 5,
    retryDelayMs: 1000,
  });
});

test('formats dry-run output without performing a network request', async () => {
  const result = await runDeploySmoke({
    url: 'https://hashbrown.dev',
    expectedText: 'Hashbrown',
    name: 'docs',
    dryRun: true,
    fetchImpl: async () => {
      throw new Error('fetch should not run');
    },
  });

  assert.equal(result, 'dry-run:docs:https://hashbrown.dev:Hashbrown');
});

test('retries until the deployment responds with expected text', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) {
      return new Response('missing', {
        status: 503,
        statusText: 'Service Unavailable',
      });
    }

    return new Response('<html><title>Finance Sample</title></html>', {
      status: 200,
      statusText: 'OK',
    });
  };
  const sleeps = [];
  const sleep = async (delayMs) => {
    sleeps.push(delayMs);
  };

  const result = await runDeploySmoke({
    url: 'https://finance.hashbrown.dev',
    expectedText: 'Finance Sample',
    name: 'finance',
    retries: 1,
    retryDelayMs: 10,
    fetchImpl,
    sleep,
  });

  assert.equal(result, 'pass:finance:https://finance.hashbrown.dev:Finance Sample');
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [10]);
});

test('fails when the response does not contain expected text', async () => {
  await assert.rejects(
    runDeploySmoke({
      url: 'https://fast-food.hashbrown.dev',
      expectedText: 'Fast Food Nutrition Sample',
      name: 'fast-food',
      fetchImpl: async () =>
        new Response('<html><title>Wrong app</title></html>', {
          status: 200,
          statusText: 'OK',
        }),
    }),
    /missing expected text "Fast Food Nutrition Sample"/,
  );
});
