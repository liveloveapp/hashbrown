import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const artifacts = resolve(root, '../../dist/packages/dotnet');
const dependencies = {
  'Microsoft.Agents.AI.Hosting.AGUI.AspNetCore': '1.26.0-preview.261023.1',
  'Microsoft.Agents.AI': '1.26.0',
  'AGUI.Abstractions': '1.0.1',
  'AGUI.Server': '1.0.1',
  'Microsoft.Extensions.AI.OpenAI': '10.10.1',
  OpenAI: '2.14.0',
  'Azure.Core': '1.63.0',
  'Azure.AI.OpenAI': '2.1.0',
  Npgsql: '10.0.3',
};

/** Reject any unreviewed public contract change. */
export function compareApi(baseline, current) {
  assert.deepEqual(current, baseline, 'Public API differs from the reviewed extraction baseline');
}

/** Require documentation for the reviewed authored declarations, excluding synthesized record API. */
export function verifyXmlDocumentation(xml, authored = JSON.parse(readFileSync(resolve(root, 'api/documented-members.json'), 'utf8'))) {
  const documented = new Set([...xml.matchAll(/<member name="([^"]+)"/g)].map(([, name]) => name));
  for (const member of authored) assert.ok(documented.has(member), `Missing XML documentation for ${member}`);
}

/** Validate distributable contents and exact dependency constraints. */
export function verifyPackage(directory = artifacts) {
  const packagePath = resolve(directory, 'Hashbrown.AspNetCore.0.1.0-preview.1.nupkg');
  const symbolsPath = resolve(directory, 'Hashbrown.AspNetCore.0.1.0-preview.1.snupkg');
  const entries = execFileSync('unzip', ['-Z1', packagePath], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(entries.filter((entry) => entry.startsWith('lib/') && !entry.endsWith('/')).every((entry) => entry.startsWith('lib/net10.0/')), 'Package may target only net10.0');
  const extract = (entry) => execFileSync('unzip', ['-p', packagePath, entry], { encoding: 'utf8' });

  for (const entry of ['lib/net10.0/Hashbrown.AspNetCore.dll', 'lib/net10.0/Hashbrown.AspNetCore.xml', 'README.md', 'LICENSE']) assert.ok(entries.includes(entry), `Missing ${entry}`);
  assert.ok(existsSync(resolve(root, 'obj/Release/net10.0/ref/Hashbrown.AspNetCore.dll')), 'Missing build reference assembly');
  assert.ok(entries.every((entry) => !/(?:contentFiles|Program|Testing|appsettings|credentials|\.cs$|Conformance)/i.test(entry)), 'Host or source content leaked into package');
  verifyXmlDocumentation(extract('lib/net10.0/Hashbrown.AspNetCore.xml'));
  const nuspec = extract('Hashbrown.AspNetCore.nuspec');
  assert.match(nuspec, /<frameworkReferences>\s*<group targetFramework="net10\.0">\s*<frameworkReference name="Microsoft\.AspNetCore\.App"\s*\/>\s*<\/group>\s*<\/frameworkReferences>/);
  assert.match(nuspec, /<license type="expression">MIT<\/license>/);
  assert.match(nuspec, /<repository[^>]+type="git"[^>]+url="https:\/\/github.com\/liveloveapp\/hashbrown"[^>]+commit="[a-f0-9]{40}"/);
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.ok(nuspec.includes(`commit="${revision}"`), 'Package repository revision must match HEAD');
  const actual = Object.fromEntries([...nuspec.matchAll(/<dependency id="([^"]+)" version="([^"]+)"/g)].map(([, id, version]) => [id, version]));
  assert.deepEqual(actual, Object.fromEntries(Object.entries(dependencies).map(([id, version]) => [id, `[${version}]`])));
  const symbols = execFileSync('unzip', ['-Z1', symbolsPath], { encoding: 'utf8' });
  assert.match(symbols, /lib\/net10.0\/Hashbrown.AspNetCore.pdb/);
  const pdb = execFileSync('unzip', ['-p', symbolsPath, 'lib/net10.0/Hashbrown.AspNetCore.pdb']);
  assert.equal(pdb.subarray(0, 4).toString(), 'BSJB', 'Symbols must be portable PDB');
  const api = JSON.parse(readFileSync(resolve(directory, 'public-api.json'), 'utf8'));
  assert.ok(api.types.every((type) => type.name.startsWith('Hashbrown.AspNetCore.')), 'Public namespace leak');
  compareApi(JSON.parse(readFileSync(resolve(root, 'api/public-api.json'), 'utf8')), api);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--api-only')) compareApi(JSON.parse(readFileSync(resolve(root, 'api/public-api.json'), 'utf8')), JSON.parse(readFileSync(resolve(artifacts, 'public-api.json'), 'utf8')));
  else verifyPackage();
  console.log('Package contract verified.');
}
