import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const verifier = pathToFileURL(
  resolve(__dirname, '../candidate-consumer/verify.mjs'),
).href;
const baseline = resolve(__dirname, '../live-consumer/package.json');
const qualifier = pathToFileURL(
  resolve(__dirname, '../candidate-consumer/qualify.mjs'),
).href;

test('candidate installed SDK resolution accepts only exact selected absolute or canonical owned archive-relative encoding', () => {
  const body = `
const { validateInstalledResolution } = await import(${JSON.stringify(qualifier)});
const root = '/private/tmp/candidate-resolution-policy';
const archive = root + '/archives/hashbrownai-core-0.8.3.tgz';
const selected = 'file:' + archive;
const context = {
  root,
  location: 'node_modules/@hashbrownai/core',
  archives: { '@hashbrownai/core': { archive } },
};
validateInstalledResolution(selected, selected, context);
validateInstalledResolution('file:archives/hashbrownai-core-0.8.3.tgz', selected, context);
for (const installed of [
  'file:../archives/hashbrownai-core-0.8.3.tgz',
  'file:archives/../archives/hashbrownai-core-0.8.3.tgz',
  'file:./archives/hashbrownai-core-0.8.3.tgz',
  'file:archives/different-core-0.8.3.tgz',
  'file:' + root + '/other/hashbrownai-core-0.8.3.tgz',
  'workspace:*', 'link:archives/hashbrownai-core-0.8.3.tgz',
  'https://registry.npmjs.org/@hashbrownai/core/-/core-0.8.3.tgz',
]) assert.throws(() => validateInstalledResolution(installed, selected, context), /resolved|archive|candidate/i);
const thirdParty = { ...context, location: 'node_modules/react' };
const registry = 'https://registry.npmjs.org/react/-/react-19.3.1.tgz';
validateInstalledResolution(registry, registry, thirdParty);
assert.throws(() => validateInstalledResolution('file:archives/react-19.3.1.tgz', registry, thirdParty), /resolved|archive|candidate/i);
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

/** Runs the candidate policy in its native ESM runtime without package installation. */
function probe(body: string): string {
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import * as candidate from ${JSON.stringify(verifier)};
const baseline = JSON.parse(await fs.readFile(${JSON.stringify(baseline)}, 'utf8'));
const names = ['@hashbrownai/core', '@hashbrownai/react', '@hashbrownai/angular'];
const archives = Object.fromEntries(names.map(name => [name, {
  name,
  version: '0.8.3',
  archive: '/private/tmp/candidate-artifacts/' + name.split('/')[1] + '.tgz',
  sha256: 'a'.repeat(64),
  integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64'),
}]));
const manifest = {
  ...baseline,
  name: 'hashbrown-dotnet-candidate-consumer',
  dependencies: {
    ...baseline.dependencies,
    ...Object.fromEntries(names.map(name => [name, 'file:' + archives[name].archive])),
  },
};
${body}
console.log('passed');`,
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
}

test('candidate manifest rejects each published SDK pin while accepting exact private archive declarations', () => {
  const body = `
candidate.validateManifest(manifest, archives, baseline);
for (const name of names) {
  for (const published of ['0.8.3', 'https://registry.npmjs.org/' + name + '/-/' + name.split('/')[1] + '-0.8.3.tgz']) {
    assert.throws(() => candidate.validateManifest({
      ...manifest,
      dependencies: { ...manifest.dependencies, [name]: published },
    }, archives, baseline), /candidate|archive/i);
  }
}
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('candidate manifest rejects aliases directory dependencies and unapproved archive substitutions', () => {
  const body = `
for (const replacement of ['workspace:*', 'link:/repo/core', 'file:/repo/packages/core', 'file:../core.tgz', 'npm:@hashbrownai/core@0.8.3', 'file:/private/tmp/other-core.tgz']) {
  assert.throws(() => candidate.validateManifest({
    ...manifest,
    dependencies: { ...manifest.dependencies, '@hashbrownai/core': replacement },
  }, archives, baseline), /candidate|archive/i);
}
for (const extra of [{ overrides: {} }, { workspaces: [] }]) {
  assert.throws(() => candidate.validateManifest({ ...manifest, ...extra }, archives, baseline), /overrides|workspaces/i);
}
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('candidate manifest preserves every non-SDK dependency from the frozen public baseline', () => {
  const body = `
for (const dependencies of [
  { ...manifest.dependencies, react: '19.3.2' },
  { ...manifest.dependencies, typescript: '^6.0.3' },
  { ...manifest.dependencies, 'new-package': '1.0.0' },
  Object.fromEntries(Object.entries(manifest.dependencies).filter(([name]) => name !== 'rxjs')),
]) {
  assert.throws(() => candidate.validateManifest({ ...manifest, dependencies }, archives, baseline), /dependency|baseline|locked/i);
}
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('candidate manifest rejects malformed archive identities and incomplete record inventories', () => {
  const body = `
for (const mutation of [
  { name: '@hashbrownai/react' }, { version: '^0.8.3' },
  { archive: 'relative.tgz' }, { archive: '/private/tmp/core' },
  { sha256: 'A'.repeat(64) }, { sha256: 'a'.repeat(63) },
  { integrity: 'sha512-invalid' }, { integrity: 'sha256-' + Buffer.alloc(64).toString('base64') },
]) {
  const changed = { ...archives, '@hashbrownai/core': { ...archives['@hashbrownai/core'], ...mutation } };
  assert.throws(() => candidate.validateManifest(manifest, changed, baseline), /candidate|archive|identity|integrity|hash/i);
}
const missing = { ...archives };
delete missing['@hashbrownai/angular'];
assert.throws(() => candidate.validateManifest(manifest, missing, baseline), /candidate|archive|inventory/i);
assert.throws(() => candidate.validateManifest(manifest, { ...archives, extra: archives['@hashbrownai/core'] }, baseline), /candidate|archive|inventory/i);
assert.throws(() => candidate.validateManifest({ ...manifest, devDependencies: { injected: '1.0.0' } }, archives, baseline), /dependency|baseline|locked/i);
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('candidate manifest preserves frozen peer metadata and bundled dependency declarations', () => {
  const body = `
for (const extra of [
  { peerDependencies: { injected: '1.0.0' } },
  { peerDependenciesMeta: { react: { optional: true } } },
  { bundleDependencies: ['react'] },
  { bundledDependencies: ['react'] },
]) {
  assert.throws(() => candidate.validateManifest({ ...manifest, ...extra }, archives, baseline), /dependency|baseline|locked/i);
}
const frozen = {
  ...baseline,
  peerDependencies: { react: '19.3.1' },
  peerDependenciesMeta: { react: { optional: true } },
  bundleDependencies: ['react'],
  bundledDependencies: ['react'],
};
candidate.validateManifest({ ...manifest, ...Object.fromEntries(
  ['peerDependencies', 'peerDependenciesMeta', 'bundleDependencies', 'bundledDependencies'].map(field => [field, frozen[field]])
) }, archives, frozen);
for (const mutation of [
  { peerDependencies: { react: '19.3.2' } },
  { peerDependenciesMeta: { react: { optional: false } } },
  { bundleDependencies: [] },
  { bundledDependencies: [] },
]) {
  assert.throws(() => candidate.validateManifest({ ...manifest, ...frozen, dependencies: manifest.dependencies, ...mutation }, archives, frozen), /dependency|baseline|locked/i);
}
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('candidate consumer inventory includes added root sources configs and owned npm config bytes', () => {
  const body = `
const { consumerInventory } = await import(${JSON.stringify(qualifier)});
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'candidate-root-inventory-')));
try {
  for (const directory of ['react', 'angular', 'dist', 'home', 'npm-cache', 'logs', 'archives', 'node_modules']) await fs.mkdir(path.join(root, directory));
  for (const file of ['package.json', 'package-lock.json', 'contracts.ts', 'tsconfig.contracts.json', 'build.mjs', 'react-module-ids.json', 'empty.npmrc', 'empty-global.npmrc']) await fs.writeFile(path.join(root, file), '');
  const before = await consumerInventory(root);
  for (const file of ['unreviewed.ts', 'tsconfig.extra.json', '.npmrc']) {
    await fs.writeFile(path.join(root, file), 'Unreviewed root source/config');
    assert.notDeepEqual(await consumerInventory(root), before, 'Added root file must enter closed inventory: ' + file);
    await fs.rm(path.join(root, file));
  }
  assert.ok(Object.hasOwn(before, 'empty.npmrc'));
  assert.ok(Object.hasOwn(before, 'empty-global.npmrc'));
  await fs.writeFile(path.join(root, 'empty.npmrc'), 'node-options=unapproved');
  assert.notDeepEqual(await consumerInventory(root), before, 'Owned npm config bytes are immutable');
  await fs.writeFile(path.join(root, 'empty.npmrc'), '');
  for (const directory of ['home', 'npm-cache', 'logs']) await fs.writeFile(path.join(root, directory, 'mutable'), 'controlled mutable bytes');
  assert.deepEqual(await consumerInventory(root), before, 'Explicit mutable areas are checked separately');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('candidate archive verification rejects changed bytes missing archives and symlinks before cache use', () => {
  const body = `
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'candidate-archive-unit-')));
try {
  const records = {};
  for (const name of names) {
    const archive = path.join(root, name.split('/')[1] + '.tgz');
    const bytes = Buffer.from('hash-policy-unit-' + name);
    await fs.writeFile(archive, bytes);
    records[name] = {
      ...archives[name], archive,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      integrity: 'sha512-' + crypto.createHash('sha512').update(bytes).digest('base64'),
    };
  }
  // This helper proves filesystem/hash refusal only; these bytes are not npm package evidence.
  await candidate.validateArchiveFiles(root, records);
  const core = records['@hashbrownai/core'].archive;
  const original = await fs.readFile(core);
  await fs.writeFile(core, 'different bytes');
  await assert.rejects(candidate.validateArchiveFiles(root, records), /hash|integrity|changed/i);
  await fs.writeFile(core, original);
  await fs.rename(core, core + '.saved');
  await fs.mkdir(path.join(root, 'shared-cache'));
  await fs.writeFile(path.join(root, 'shared-cache', 'core-0.8.3.tgz'), original);
  await assert.rejects(candidate.validateArchiveFiles(root, records), /missing|ENOENT|archive/i);
  await fs.symlink(core + '.saved', core);
  await assert.rejects(candidate.validateArchiveFiles(root, records), /symlink|link|origin/i);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});
