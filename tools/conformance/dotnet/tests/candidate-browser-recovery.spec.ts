import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const runner = pathToFileURL(
  resolve(__dirname, '../candidate-consumer/browser-runner.mjs'),
).href;

/** Inspects argument admission without acquiring servers, workers, databases or browsers. */
function probe(body: string): string {
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
import assert from 'node:assert/strict';
import * as candidate from ${JSON.stringify(runner)};
const npm = '/private/tmp/candidate-browser-npm.json';
const nuget = '/private/tmp/candidate-browser-nuget.json';
${body}
console.log('passed');`,
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
}

test('candidate browser runner requires both distinct explicit absolute candidate pointers', () => {
  const body = `
assert.deepEqual(candidate.parseCandidateArguments([
  '--npm-metadata=' + npm, '--metadata=' + nuget,
]), { npmMetadataPath: npm, nugetMetadataPath: nuget });
for (const args of [
  [], ['--npm-metadata=' + npm], ['--metadata=' + nuget],
  ['--npm-metadata=relative.json', '--metadata=' + nuget],
  ['--npm-metadata=' + npm, '--metadata=relative.json'],
  ['--npm-metadata=' + npm, '--metadata=' + npm],
  ['--npm-metadata=', '--metadata=' + nuget],
  ['--npm-metadata=' + npm, '--metadata='],
]) {
  assert.throws(() => candidate.parseCandidateArguments(args), /pointer|absolute|metadata|distinct/i);
}
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('candidate browser runner rejects duplicate flags source fallback and unrecognized arguments', () => {
  const body = `
const required = ['--npm-metadata=' + npm, '--metadata=' + nuget];
for (const extra of [
  '--npm-metadata=' + npm, '--metadata=' + nuget,
  '--source', '--host-mode=source', '--prepare', '--allow-published',
  '--unknown', 'unowned.json',
]) {
  assert.throws(() => candidate.parseCandidateArguments([...required, extra]), /duplicate|argument|unsupported|unknown/i);
}
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('candidate browser runner never substitutes environment defaults for missing pointer flags', () => {
  const body = `
process.env.HASHBROWN_LIVE_CONSUMER_METADATA = npm;
process.env.HASHBROWN_DOTNET_PACKAGE_METADATA = nuget;
process.env.HASHBROWN_DOTNET_HOST_MODE = 'source';
assert.throws(() => candidate.parseCandidateArguments([]), /pointer|metadata/i);
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});
