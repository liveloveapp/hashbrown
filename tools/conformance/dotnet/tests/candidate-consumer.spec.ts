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

test('candidate package graphs remap only exact retained internal pins and generate consistent SDK lock metadata', () => {
  const body = `
const { createCandidateLock, validatePackageGraph } = await import(${JSON.stringify(qualifier)});
const baselineLock = JSON.parse(await fs.readFile(path.join(path.dirname(${JSON.stringify(baseline)}), 'package-lock.json'), 'utf8'));
const selected = Object.fromEntries(Object.entries(archives).map(([name, record]) => [name, { ...record, version: '0.9.0' }]));
const lock = createCandidateLock(baselineLock, selected, manifest);
validateLockGraph(lock, baselineLock, selected, manifest);
for (const name of names) {
  const previous = baselineLock.packages['node_modules/' + name];
  const packed = structuredClone(previous);
  packed.version = '0.9.0';
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const dependency of Object.keys(packed[field] ?? {})) {
      if (names.includes(dependency)) packed[field][dependency] = selected[dependency].version;
    }
  }
  validatePackageGraph(packed, previous, baselineLock, selected);
  for (const field of ['dependencies', 'peerDependencies']) {
    assert.deepEqual(lock.packages['node_modules/' + name][field], packed[field]);
  }
  const stale = structuredClone(lock);
  stale.packages['node_modules/' + name] = { ...stale.packages['node_modules/' + name], ...Object.fromEntries(['dependencies', 'peerDependencies'].filter(field => previous[field]).map(field => [field, previous[field]])) };
  if (JSON.stringify(stale) !== JSON.stringify(lock)) assert.throws(() => validateLockGraph(stale, baselineLock, selected, manifest), /frozen graph/i);
}
const previous = { peerDependencies: { '@hashbrownai/core': '0.8.3', react: '^19.0.0' }, dependencies: { rxjs: '7.8.2' } };
const packed = { peerDependencies: { '@hashbrownai/core': '0.9.0', react: '^19.0.0' }, dependencies: { rxjs: '7.8.2' } };
validatePackageGraph(packed, previous, baselineLock, selected);
for (const changed of [
  { ...packed, dependencies: { rxjs: '7.8.3' } },
  { ...packed, peerDependencies: { ...packed.peerDependencies, react: '^20.0.0' } },
  { ...packed, peerDependencies: { ...packed.peerDependencies, '@hashbrownai/core': '^0.9.0' } },
]) assert.throws(() => validatePackageGraph(changed, previous, baselineLock, selected), /graph|pin/i);
assert.throws(() => validatePackageGraph(packed, { ...previous, peerDependencies: { ...previous.peerDependencies, '@hashbrownai/core': '^0.8.3' } }, baselineLock, selected), /graph|pin/i);
for (const field of ['version', 'integrity', 'dependencies']) {
  const changed = structuredClone(lock);
  changed.packages['node_modules/react'][field] = field === 'dependencies' ? { injected: '1.0.0' } : 'altered';
  assert.throws(() => validateLockGraph(changed, baselineLock, selected, manifest), /frozen graph/i);
}
`;

  const result = probe(
    `const { validateLockGraph } = await import(${JSON.stringify(qualifier)});\n${body}`,
  );

  expect(result.trim()).toBe('passed');
});

test('only an explicit exact old-public SDK API control bypasses incompatible peer resolution', () => {
  const checker = pathToFileURL(
    resolve(__dirname, '../candidate-consumer/check.mjs'),
  ).href;
  const body = `
const { negativeInstallPolicy } = await import(${JSON.stringify(checker)});
const baselineLock = JSON.parse(await fs.readFile(path.join(path.dirname(${JSON.stringify(baseline)}), 'package-lock.json'), 'utf8'));
const selected = Object.fromEntries(names.map(name => [name, { ...archives[name], version: '0.9.0' }]));
const selectedCandidate = { baselineLock, archives: selected };
for (const name of names) {
  const previous = baselineLock.packages['node_modules/' + name];
  const selections = { [name]: { archive: '/private/tmp/owned-old/' + name.split('/')[1] + '.tgz', version: previous.version, integrity: previous.integrity } };
  const policy = negativeInstallPolicy(selectedCandidate, selections, 'old-public-missing-api');
  assert.deepEqual(policy.args, ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--legacy-peer-deps']);
  assert.match(policy.reason, /intentional.*old.*SDK.*peer/i);
  assert.equal(policy.sdk, name);
  for (const mode of ['strict', 'offline']) {
    const ordinary = negativeInstallPolicy(selectedCandidate, selections, mode);
    assert.ok(!ordinary.args.includes('--legacy-peer-deps'));
    assert.equal(ordinary.args.includes('--offline'), mode === 'offline');
    assert.equal(ordinary.reason, undefined);
  }
  for (const mutation of [
    { version: '0.9.0' }, { version: '^0.8.3' }, { integrity: 'altered' },
    { resolved: 'https://registry.npmjs.org/@hashbrownai/core/-/core-0.8.3.tgz' },
    { archive: '../core.tgz' }, { expectedFiles: {} },
  ]) assert.throws(() => negativeInstallPolicy(selectedCandidate, { [name]: { ...selections[name], ...mutation } }, 'old-public-missing-api'), /old|archive|selection|control/i);
  assert.throws(() => negativeInstallPolicy(selectedCandidate, { ...selections, react: { version: '19.3.1' } }, 'old-public-missing-api'), /old|selection|control/i);
}
assert.ok(!negativeInstallPolicy(selectedCandidate, {}, 'strict').args.includes('--legacy-peer-deps'));
assert.throws(() => negativeInstallPolicy(selectedCandidate, {}, 'old-public-missing-api'), /old|selection|control/i);
assert.throws(() => negativeInstallPolicy(selectedCandidate, selected, 'old-public-missing-api'), /old|selection|control/i);
assert.throws(() => negativeInstallPolicy(selectedCandidate, {}, 'legacy'), /policy|mode/i);
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('negative SDK installs retain every required external lock identity integrity and dependency edge', () => {
  const checker = pathToFileURL(
    resolve(__dirname, '../candidate-consumer/check.mjs'),
  ).href;
  const body = `
const { validateNegativeExternalGraph } = await import(${JSON.stringify(checker)});
const expected = JSON.parse(await fs.readFile(path.join(path.dirname(${JSON.stringify(baseline)}), 'package-lock.json'), 'utf8'));
const installed = structuredClone(expected);
delete installed.packages[''];
validateNegativeExternalGraph(installed, expected);
for (const field of ['version', 'resolved', 'integrity', 'dependencies', 'peerDependencies', 'peerDependenciesMeta', 'optionalDependencies']) {
  const changed = structuredClone(installed);
  changed.packages['node_modules/react'][field] = field.endsWith('Dependencies') || field === 'peerDependenciesMeta' ? { unapproved: '1.0.0' } : 'altered';
  assert.throws(() => validateNegativeExternalGraph(changed, expected), /external|frozen|graph/i);
}
const missing = structuredClone(installed);
delete missing.packages['node_modules/react'];
assert.throws(() => validateNegativeExternalGraph(missing, expected), /external|required|graph/i);
const added = structuredClone(installed);
added.packages['node_modules/unapproved'] = { version: '1.0.0', integrity: 'unknown' };
assert.throws(() => validateNegativeExternalGraph(added, expected), /external|unexpected|graph/i);
const optional = structuredClone(installed);
for (const [location, record] of Object.entries(expected.packages)) if (record.optional) delete optional.packages[location];
validateNegativeExternalGraph(optional, expected);
assert.deepEqual(expected, JSON.parse(await fs.readFile(path.join(path.dirname(${JSON.stringify(baseline)}), 'package-lock.json'), 'utf8')));
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('candidate security baseline changes only the reviewed AG-UI graph and preserves published evidence', () => {
  const policy = pathToFileURL(
    resolve(__dirname, '../candidate-consumer/dependency-baseline.mjs'),
  ).href;
  const body = `
const { readCandidateDependencyBaseline } = await import(${JSON.stringify(policy)});
const originalPath = path.join(path.dirname(${JSON.stringify(baseline)}), 'package-lock.json');
const before = await fs.readFile(originalPath);
const original = JSON.parse(before);
const selected = await readCandidateDependencyBaseline();
assert.deepEqual(selected.manifest, baseline);
assert.deepEqual(await fs.readFile(originalPath), before);
assert.equal(selected.lock.packages['node_modules/@hashbrownai/core'].dependencies['@ag-ui/core'], '1.0.4');
assert.equal(selected.lock.packages['node_modules/@hashbrownai/core'].dependencies['@ag-ui/client'], '1.0.4');
const changed = new Set(['node_modules/@hashbrownai/core', ...['client', 'core', 'encoder', 'proto'].map(name => 'node_modules/@ag-ui/' + name)]);
const removed = new Set(['node_modules/@ag-ui/client/node_modules/zod', 'node_modules/@ag-ui/proto/node_modules/zod']);
for (const [location, record] of Object.entries(original.packages)) {
  if (removed.has(location)) assert.equal(selected.lock.packages[location], undefined);
  else if (!changed.has(location)) assert.deepEqual(selected.lock.packages[location], record);
}
assert.deepEqual(Object.keys(selected.lock.packages).sort(), Object.keys(original.packages).filter(name => !removed.has(name)).sort());
for (const name of ['client', 'core', 'encoder', 'proto']) assert.equal(selected.lock.packages['node_modules/@ag-ui/' + name].version, '1.0.4');
assert.equal(original.packages['node_modules/@ag-ui/client'].version, '1.0.3');
assert.equal(selected.lock.packages['node_modules/zod'].version, '4.6.7');
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('old-core controls keep the real historical graph while old-framework controls use the candidate graph', () => {
  const checker = pathToFileURL(
    resolve(__dirname, '../candidate-consumer/check.mjs'),
  ).href;
  const policy = pathToFileURL(
    resolve(__dirname, '../candidate-consumer/dependency-baseline.mjs'),
  ).href;
  const body = `
const { createNegativeSelection } = await import(${JSON.stringify(checker)});
const { createCandidateLock } = await import(${JSON.stringify(qualifier)});
const { readCandidateDependencyBaseline } = await import(${JSON.stringify(policy)});
const selected = await readCandidateDependencyBaseline();
const current = Object.fromEntries(Object.entries(archives).map(([name, record]) => [name, { ...record, version: '0.9.0' }]));
const owner = { baselineLock: selected.historicalLock, dependencyBaselineLock: selected.lock, archives: current };
const lock = createCandidateLock(selected.lock, current, manifest);
const before = JSON.stringify({ lock, manifest });
for (const name of names) {
  const previous = selected.historicalLock.packages['node_modules/' + name];
  const choices = { [name]: { archive: '/private/tmp/old-' + name.split('/')[1] + '.tgz', version: '0.8.3', integrity: previous.integrity } };
  const result = createNegativeSelection(owner, lock, manifest, choices, 'old-public-missing-api');
  const oldCore = name === '@hashbrownai/core';
  assert.equal(result.lock.packages['node_modules/@ag-ui/core'].version, oldCore ? '1.0.3' : '1.0.4');
  assert.equal(Boolean(result.lock.packages['node_modules/@ag-ui/client/node_modules/zod']), oldCore);
  assert.deepEqual(result.lock.packages['node_modules/' + name].dependencies, previous.dependencies);
  assert.deepEqual(result.lock.packages['node_modules/' + name].peerDependencies, previous.peerDependencies);
  assert.equal(result.lock.packages['node_modules/' + name].integrity, previous.integrity);
  assert.deepEqual(result.baseline, oldCore ? selected.historicalLock : selected.lock);
  assert.equal(result.manifest.dependencies[name], 'file:' + choices[name].archive);
  assert.equal(JSON.stringify({ lock, manifest }), before);
  assert.throws(() => createNegativeSelection(owner, lock, manifest, { [name]: { ...choices[name], integrity: 'different' } }, 'old-public-missing-api'), /integrity/i);
}
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('candidate security policy rejects changed historical bytes and unreviewed record inventories', () => {
  const policyModule = pathToFileURL(
    resolve(__dirname, '../candidate-consumer/dependency-baseline.mjs'),
  ).href;
  const policyFile = resolve(
    __dirname,
    '../candidate-consumer/dependency-patch.json',
  );
  const body = `
const { applyCandidateDependencyPatch } = await import(${JSON.stringify(policyModule)});
const bytes = await fs.readFile(path.join(path.dirname(${JSON.stringify(baseline)}), 'package-lock.json'));
const policy = JSON.parse(await fs.readFile(${JSON.stringify(policyFile)}));
const before = JSON.stringify(policy);
for (const mutate of [
  value => { value.historicalLockSha256 = '0'.repeat(64); },
  value => { delete value.replacements['node_modules/@ag-ui/core']; },
  value => { value.replacements['node_modules/unreviewed'] = value.replacements['node_modules/@ag-ui/core']; },
  value => { value.replacements['node_modules/@ag-ui/core'].previousSha256 = '0'.repeat(64); },
  value => { value.replacements['node_modules/@ag-ui/core'].record.version = '1.0.5'; },
  value => { delete value.removals['node_modules/@ag-ui/client/node_modules/zod']; },
  value => { value.removals['node_modules/@ag-ui/client/node_modules/zod'] = '0'.repeat(64); },
]) {
  const changed = structuredClone(policy);
  mutate(changed);
  assert.throws(() => applyCandidateDependencyPatch(bytes, changed), /historical|candidate|reviewed/i);
}
assert.throws(() => applyCandidateDependencyPatch(Buffer.concat([bytes, Buffer.from('\\n')]), policy), /hash/i);
applyCandidateDependencyPatch(bytes, policy);
assert.equal(JSON.stringify(policy), before);
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});
