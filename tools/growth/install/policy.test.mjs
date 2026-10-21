import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const policy = require('./policy.cjs');
const DEFAULT = 'https://hashbrown.dev/_/growth/collect/v1/install';

test('disabled honours every opt-out key', () => {
  const cases = [
    'DO_NOT_TRACK',
    'npm_config_do_not_track',
    'NPM_CONFIG_DO_NOT_TRACK',
    'HASHBROWN_TELEMETRY_DISABLED',
  ];

  const results = cases.map((key) => policy.disabled({ [key]: 'true' }));

  assert.deepEqual(results, [true, true, true, true]);
  assert.equal(policy.disabled({ DO_NOT_TRACK: '0' }), false);
});

test('environment reports github actions as ci with matching evidence', () => {
  const env = { GITHUB_ACTIONS: 'true', CI: 'true' };

  const result = policy.environment(env, false, 'npm');

  assert.deepEqual(result, {
    environment: 'ci',
    environmentEvidence: 'github_actions',
    ciProvider: 'github_actions',
  });
});

test('environment reports an interactive npm as local', () => {
  const result = policy.environment({}, true, 'npm');

  assert.deepEqual(result, {
    environment: 'local',
    environmentEvidence: 'interactive_package_manager',
  });
});

test('environment reports unknown when neither', () => {
  const result = policy.environment({}, false, 'unknown');

  assert.deepEqual(result, {
    environment: 'unknown',
    environmentEvidence: 'unknown',
  });
});

test('packageManager parses the npm user agent', () => {
  const result = policy.packageManager('pnpm/9.1.0 npm/? node/v20');

  assert.deepEqual(result, {
    packageManager: 'pnpm',
    packageManagerVersion: '9.1.0',
  });
  assert.deepEqual(policy.packageManager(undefined), {
    packageManager: 'unknown',
  });
});

test('endpoint accepts only a loopback override', () => {
  const loopback = 'http://127.0.0.1:3000/_/growth/collect/v1/install';

  assert.equal(
    policy.endpoint({ HASHBROWN_TELEMETRY_ENDPOINT: loopback }),
    loopback,
  );
  assert.equal(
    policy.endpoint({
      HASHBROWN_TELEMETRY_ENDPOINT: 'http://localhost:3000/x',
    }),
    'http://localhost:3000/x',
  );
  assert.equal(
    policy.endpoint({ HASHBROWN_TELEMETRY_ENDPOINT: 'http://[::1]:3000/x' }),
    'http://[::1]:3000/x',
  );
  assert.equal(
    policy.endpoint({
      HASHBROWN_TELEMETRY_ENDPOINT: 'https://evil.example/collect',
    }),
    DEFAULT,
  );
  assert.equal(
    policy.endpoint({ HASHBROWN_TELEMETRY_ENDPOINT: 'ftp://127.0.0.1/x' }),
    DEFAULT,
  );
  assert.equal(
    policy.endpoint({ HASHBROWN_TELEMETRY_ENDPOINT: 'not a url' }),
    DEFAULT,
  );
  assert.equal(policy.endpoint({}), DEFAULT);
});
