import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCapture, verifyCapture } from './harness/evidence.mjs';
import { runLangGraphScenario } from './node/langgraph.mjs';
import { runMastraDelegationScenario } from './node/mastra-delegation.mjs';
import { runMastraScenario } from './node/mastra.mjs';
import { installedVersions } from './node/scenario.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const corpus = resolve(
  directory,
  '../../../packages/core/src/models/fixtures/agent-frameworks',
);
const mode = process.argv[2];
assert.ok(['--write', '--check'].includes(mode), 'Use --write or --check');
const manifest = JSON.parse(
  await readFile(resolve(directory, 'node/package.json'), 'utf8'),
);
assert.deepEqual(
  installedVersions(Object.keys(manifest.devDependencies)),
  manifest.devDependencies,
  'Installed framework versions must match the approved exact pins',
);
const sources = [
  resolve(directory, 'generate.mjs'),
  resolve(directory, 'node/package-lock.json'),
];
for (const folder of ['harness', 'node']) {
  for (const name of (await readdir(resolve(directory, folder))).sort()) {
    if (name.endsWith('.mjs')) sources.push(resolve(directory, folder, name));
  }
}
const hash = createHash('sha256');
for (const path of sources.sort()) {
  hash.update(relative(directory, path));
  hash.update('\0');
  hash.update(await readFile(path));
  hash.update('\0');
}
const sourceSha256 = hash.digest('hex');
const scenarios = [
  ['langgraph-server-tool.json', () => runLangGraphScenario()],
  [
    'langgraph-native-subgraph.json',
    () => runLangGraphScenario({ profile: 'native-subgraph' }),
  ],
  ['mastra-native-delegation.json', () => runMastraDelegationScenario()],
  [
    'mastra-buffered-server-tool.json',
    () => runMastraScenario({ profile: 'buffered' }),
  ],
  [
    'mastra-live-server-tool.json',
    () => runMastraScenario({ profile: 'live' }),
  ],
];
if (mode === '--write') await mkdir(corpus, { recursive: true });
for (const [filename, run] of scenarios) {
  const current = createCapture(await run(), sourceSha256);
  const path = resolve(corpus, filename);
  if (mode === '--write')
    await writeFile(path, `${JSON.stringify(current, null, 2)}\n`);
  else verifyCapture(JSON.parse(await readFile(path, 'utf8')), current);
  console.log(`${mode === '--write' ? 'Captured' : 'Verified'} ${filename}`);
}
assert.deepEqual(
  (await readdir(corpus)).filter((name) => name.endsWith('.json')).sort(),
  scenarios.map(([filename]) => filename).sort(),
  'Corpus must match the real scenario inventory',
);
