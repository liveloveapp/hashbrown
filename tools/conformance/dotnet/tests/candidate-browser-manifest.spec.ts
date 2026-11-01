import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const manifestUrl = pathToFileURL(
  resolve(__dirname, '../harness/candidate-browser-manifest.ts'),
).href;
const reporterUrl = pathToFileURL(
  resolve(__dirname, '../harness/candidate-browser-reporter.ts'),
).href;
const runnerUrl = pathToFileURL(
  resolve(__dirname, '../candidate-consumer/browser-runner.mjs'),
).href;
const compositions = [
  'react.openai.chat',
  'react.openai.responses',
  'react.azure.chat',
  'react.azure.responses',
  'angular.openai.chat',
  'angular.openai.responses',
  'angular.azure.chat',
  'angular.azure.responses',
];
const primary = [
  'browser.known-string',
  'browser.known-object',
  'browser.known-null',
  'browser.unavailable',
  'mixed.approve.known',
  'mixed.approve.unavailable',
  'mixed.decline.known',
  'mixed.decline.unavailable',
  'mixed.cancel.known',
  'mixed.cancel.unavailable',
  'multiple.grouped.history',
  'multiple.split.history',
  'restart.before-restore',
  'replica.before-settlement',
  'race.same-revision',
  'local.stale-token',
  'local.incomplete-outcomes',
  'local.incomplete-decisions',
  'local.pending-mutation-gate',
  'failure.ack-disconnect',
  'failure.preack-disconnect',
  'failure.malformed-ack',
  'failure.timeout',
  'failure.cancel-after-ack',
  'failure.definitive-rejection',
  'version.v1',
  'version.malformed.unsupported-capability',
  'version.malformed.mismatched-revision',
  'version.malformed.duplicate-call-ids',
  'version.malformed.missing-call-id',
  'version.malformed.extra-capability-field',
  'version.downgrade',
  'server.busy',
  'server.expired',
  'server.corrupt',
  'server.unknown-effect.dispatch-marker-committed',
  'server.unknown-effect.effect-persisted',
  'display.html',
  'display.reserved-marker',
  'display.near-marker',
  'thread.explicit-new',
];
const siblings = [
  ['structured-chat', 'sibling.known-object'],
  ['completion', 'sibling.known-string'],
  ['structured-completion', 'sibling.known-null'],
  ['ui-completion', 'sibling.with-message-unavailable-cancel'],
  ['ui-chat', 'sibling.unavailable'],
  ['ui-completion', 'sibling.known-object'],
];
const originalExpected = compositions
  .flatMap((composition) => [
    ...primary.map((scenario) => `${composition}.chat.${scenario}`),
    ...siblings.map(
      ([facade, scenario]) => `${composition}.${facade}.${scenario}`,
    ),
  ])
  .sort();
const expected = originalExpected.filter(
  (id) =>
    ![
      'react.openai.chat.chat.multiple.split.history',
      'react.azure.chat.chat.multiple.split.history',
      'angular.openai.chat.chat.multiple.split.history',
      'angular.azure.chat.chat.multiple.split.history',
    ].includes(id),
);

/** Runs ESM contract assertions without acquiring any browser, package, worker, database or server. */
function probe(body: string): string {
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
import assert from 'node:assert/strict';
const manifestUrl = ${JSON.stringify(manifestUrl)};
const reporterUrl = ${JSON.stringify(reporterUrl)};
const runnerUrl = ${JSON.stringify(runnerUrl)};
${body}
console.log('passed');`,
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
}

test('candidate manifest enumerates exactly approved legal composition/facade/scenario IDs with independent variant rows', () => {
  const result = probe(`
const { candidateBrowserManifest } = await import(manifestUrl);
assert.equal(typeof candidateBrowserManifest, 'function');
const records = candidateBrowserManifest('all');
assert.deepEqual(records.map(record => record.id).sort(), ${JSON.stringify(expected)});
assert.equal(new Set(records.map(record => record.id)).size, records.length);
for (const record of records) {
  assert.equal(record.id, record.composition + '.' + record.facade + '.' + record.scenario);
  assert.ok(Object.isFrozen(record), 'Manifest records must be immutable');
  assert.ok(!('status' in record), 'Expected records cannot pretend execution occurred');
}
assert.ok(Object.isFrozen(records));
`);

  expect(result.trim()).toBe('passed');
});

test('candidate pilot is explicitly one real known-string composition and cannot be mistaken for full coverage', () => {
  const result = probe(`
const { candidateBrowserManifest } = await import(manifestUrl);
assert.deepEqual(candidateBrowserManifest('pilot').map(record => record.id), ['react.openai.chat.chat.browser.known-string']);
assert.throws(() => candidateBrowserManifest('smoke'), /mode|pilot|all/i);
assert.throws(() => candidateBrowserManifest(), /mode|pilot|all/i);
`);

  expect(result.trim()).toBe('passed');
});

test('candidate reporter requires exact results and surfaces missing unexpected duplicate failed and skipped rows', () => {
  const result = probe(`
const { validateCandidateBrowserResults } = await import(reporterUrl);
const manifest = [{ id: 'a' }, { id: 'b' }];
assert.deepEqual(validateCandidateBrowserResults(manifest, [{ id: 'a', status: 'passed' }, { id: 'b', status: 'passed' }]), {
  passed: true, missingIds: [], unexpectedIds: [], duplicateIds: [], failedIds: [], skippedIds: [],
});
const actual = validateCandidateBrowserResults(manifest, [{ id: 'a', status: 'failed' }, { id: 'a', status: 'skipped' }, { id: 'extra', status: 'passed' }]);
assert.deepEqual(actual, { passed: false, missingIds: ['b'], unexpectedIds: ['extra'], duplicateIds: ['a'], failedIds: ['a'], skippedIds: ['a'] });
assert.throws(() => validateCandidateBrowserResults(manifest, [{ id: 'a', status: 'unknown' }]), /status|result/i);
assert.throws(() => validateCandidateBrowserResults([{ id: 'a' }, { id: 'a' }], []), /duplicate|manifest/i);
`);

  expect(result.trim()).toBe('passed');
});

test('candidate runner selects explicit positional pilot or all mode while retaining strict two-pointer parsing', () => {
  const result = probe(`
const candidate = await import(runnerUrl);
const flags = ['--npm-metadata=/private/tmp/candidate-npm.json', '--metadata=/private/tmp/candidate-nuget.json'];
for (const mode of ['pilot', 'all']) assert.deepEqual(candidate.parseCandidateBrowserInvocation([mode, ...flags]), {
  mode, npmMetadataPath: '/private/tmp/candidate-npm.json', nugetMetadataPath: '/private/tmp/candidate-nuget.json',
});
for (const args of [flags, ['smoke', ...flags], ['pilot', ...flags, '--prepare'], ['all', ...flags, '--source'], ['pilot', '--metadata=/private/tmp/only.json']])
  assert.throws(() => candidate.parseCandidateBrowserInvocation(args), /mode|pointer|argument|metadata|pilot|all/i);
assert.throws(() => candidate.parseCandidateArguments(['pilot', ...flags]), /argument/i);
`);

  expect(result.trim()).toBe('passed');
});

test('candidate runner cannot acquire runtime resources before both explicit pointers qualify', () => {
  const result = probe(`
const candidate = await import(runnerUrl);
const invocation = { mode: 'pilot', npmMetadataPath: '/private/tmp/candidate-npm.json', nugetMetadataPath: '/private/tmp/candidate-nuget.json' };
for (const rejected of ['npm', 'nuget']) {
  const calls = [];
  await assert.rejects(candidate.runCandidateBrowser(invocation, {
    qualifyNpm: async pointer => { calls.push('npm'); assert.equal(pointer, invocation.npmMetadataPath); if (rejected === 'npm') throw Error('npm refused'); return {}; },
    qualifyNuget: async pointer => { calls.push('nuget'); assert.equal(pointer, invocation.nugetMetadataPath); throw Error('nuget refused'); },
    acquire: async () => { calls.push('runtime'); throw Error('Runtime was acquired too early'); },
  }), /refused/);
  assert.deepEqual(calls, rejected === 'npm' ? ['npm'] : ['npm', 'nuget']);
}
`);

  expect(result.trim()).toBe('passed');
});

test('candidate child environment carries explicit qualified package bindings and never inherits credentials or runtime injection', () => {
  const result = probe(`
const { candidateBrowserChildEnvironment } = await import(runnerUrl);
const source = { PATH: '/owned/bin', HOME: '/inherited/home', OPENAI_API_KEY: 'secret', AZURE_OPENAI_API_KEY: 'secret', NODE_OPTIONS: '--import=evil', DOTNET_STARTUP_HOOKS: '/evil', HASHBROWN_DOTNET_HOST_MODE: 'source', HASHBROWN_DOTNET_CONSUMER_METADATA: '/evil', npm_config_registry: 'https://evil', DOTNET_TEST_POSTGRES: 'owned-db', LANG: 'en_US.UTF-8' };
const trusted = { mode: 'pilot', packagePointer: '/private/tmp/raw-package.json', packagePointerSha256: 'a'.repeat(64), npmMetadataPath: '/private/tmp/npm-wrapper.json', nugetMetadataPath: '/private/tmp/nuget-wrapper.json', evidenceDirectory: '/private/tmp/evidence', origins: { react: 'http://127.0.0.1:4301', angular: 'http://127.0.0.1:4302' } };
const result = candidateBrowserChildEnvironment(source, trusted);
assert.equal(result.PATH, source.PATH);
assert.equal(result.DOTNET_TEST_POSTGRES, source.DOTNET_TEST_POSTGRES);
assert.equal(result.HASHBROWN_DOTNET_HOST_MODE, 'package');
assert.equal(result.HASHBROWN_DOTNET_CONSUMER_METADATA, trusted.packagePointer);
assert.equal(result.HASHBROWN_DOTNET_CONSUMER_SHA256, trusted.packagePointerSha256);
assert.equal(result.HASHBROWN_CANDIDATE_NPM_METADATA, trusted.npmMetadataPath);
assert.equal(result.HASHBROWN_CANDIDATE_NUGET_METADATA, trusted.nugetMetadataPath);
assert.equal(result.HASHBROWN_CANDIDATE_BROWSER_MODE, 'pilot');
assert.equal(result.HASHBROWN_PACKAGE_REACT_URL, trusted.origins.react);
assert.equal(result.HASHBROWN_PACKAGE_ANGULAR_URL, trusted.origins.angular);
for (const key of ['HOME', 'OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY', 'NODE_OPTIONS', 'DOTNET_STARTUP_HOOKS', 'npm_config_registry']) assert.ok(!(key in result), key);
assert.ok(!Object.values(result).includes('secret'));
`);

  expect(result.trim()).toBe('passed');
});

test('candidate legal inventory removes exactly the four pinned Chat current-split keys while preserving every other obligation', () => {
  const result = probe(`
const { candidateBrowserManifest } = await import(manifestUrl);
const original = ${JSON.stringify(originalExpected)};
const removed = ['react.openai.chat.chat.multiple.split.history', 'react.azure.chat.chat.multiple.split.history', 'angular.openai.chat.chat.multiple.split.history', 'angular.azure.chat.chat.multiple.split.history'].sort();
const actual = candidateBrowserManifest('all').map(record => record.id).sort();
assert.deepEqual(original.filter(id => !actual.includes(id)).sort(), removed, 'Only the four characterized pinned Chat split keys leave the legal inventory');
assert.deepEqual(actual.filter(id => !original.includes(id)), [], 'No renamed or substitute unsupported row may be added');
assert.deepEqual(actual, original.filter(id => !removed.includes(id)), 'All other composition, scenario, facade and outcome obligations remain');
`);

  expect(result.trim()).toBe('passed');
});
