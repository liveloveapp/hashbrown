import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const sdkNames = [
  '@hashbrownai/core',
  '@hashbrownai/react',
  '@hashbrownai/angular',
];
const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Requires an ordinary JSON record without inherited policy fields. */
function requireRecord(value, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error(`Invalid candidate ${label}`);
  return value;
}

/** Requires exactly the reviewed SDK inventory and well-formed archive identities. */
function validateArchiveRecords(records) {
  requireRecord(records, 'archive inventory');
  if (
    Object.keys(records).sort().join('\n') !== [...sdkNames].sort().join('\n')
  )
    throw Error('Candidate archive inventory differs');
  const paths = new Set();
  for (const name of sdkNames) {
    const record = requireRecord(records[name], 'archive identity');
    if (
      record.name !== name ||
      typeof record.version !== 'string' ||
      !exactVersion.test(record.version)
    )
      throw Error(`Invalid candidate archive identity: ${name}`);
    if (
      typeof record.archive !== 'string' ||
      !path.isAbsolute(record.archive) ||
      path.resolve(record.archive) !== record.archive ||
      !record.archive.endsWith('.tgz') ||
      record.archive.includes('\0') ||
      paths.has(record.archive)
    )
      throw Error(`Invalid candidate archive path: ${name}`);
    paths.add(record.archive);
    if (
      typeof record.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.sha256)
    )
      throw Error(`Invalid candidate archive hash: ${name}`);
    const integrity = record.integrity;
    if (typeof integrity !== 'string' || !integrity.startsWith('sha512-'))
      throw Error(`Invalid candidate archive integrity: ${name}`);
    const encoded = integrity.slice('sha512-'.length);
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length !== 64 || bytes.toString('base64') !== encoded)
      throw Error(`Invalid candidate archive integrity: ${name}`);
  }
}

/** Requires the original non-SDK dependency declarations without additions or omissions. */
function validateDependencyGraph(manifest, baseline) {
  for (const field of [
    'peerDependencies',
    'peerDependenciesMeta',
    'bundleDependencies',
    'bundledDependencies',
  ])
    if (
      Object.hasOwn(manifest, field) !== Object.hasOwn(baseline, field) ||
      !isDeepStrictEqual(manifest[field], baseline[field])
    )
      throw Error(
        `Candidate dependency field differs from locked baseline: ${field}`,
      );
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
  ]) {
    const actual = requireRecord(manifest[field] ?? {}, 'dependency graph');
    const expected = requireRecord(
      baseline[field] ?? {},
      'baseline dependency graph',
    );
    const names = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    for (const name of names) {
      if (field === 'dependencies' && sdkNames.includes(name)) continue;
      if (
        !Object.hasOwn(actual, name) ||
        !Object.hasOwn(expected, name) ||
        actual[name] !== expected[name] ||
        typeof actual[name] !== 'string' ||
        !exactVersion.test(actual[name])
      )
        throw Error(
          `Candidate dependency differs from locked baseline: ${name}`,
        );
    }
  }
}

/**
 * Validates local SDK archive declarations and preserves the retained dependency graph.
 *
 * This policy check does not establish tarball contents, installation or feature availability.
 */
export function validateManifest(manifest, archives, baseline) {
  requireRecord(manifest, 'manifest');
  requireRecord(baseline, 'baseline manifest');
  if ('overrides' in manifest || 'workspaces' in manifest)
    throw Error('Candidate overrides/workspaces are forbidden');
  validateArchiveRecords(archives);
  requireRecord(manifest.dependencies, 'dependency declarations');
  for (const name of sdkNames)
    if (manifest.dependencies[name] !== `file:${archives[name].archive}`)
      throw Error(`Candidate SDK requires its exact private archive: ${name}`);
  validateDependencyGraph(manifest, baseline);
}

/**
 * Checks regular physical candidate archive files and their SHA256/SHA512 bytes.
 *
 * Missing archives fail directly; no cache, registry or alternate archive is consulted.
 * Tarball package content and actual consumer compilation require separate qualification.
 */
export async function validateArchiveFiles(root, archives) {
  validateArchiveRecords(archives);
  if (
    typeof root !== 'string' ||
    !path.isAbsolute(root) ||
    path.resolve(root) !== root ||
    (await fs.realpath(root)) !== root
  )
    throw Error('Candidate archive root requires a physical absolute origin');
  for (const name of sdkNames) {
    const record = archives[name];
    const relative = path.relative(root, record.archive);
    if (
      !relative ||
      relative.startsWith('..' + path.sep) ||
      path.isAbsolute(relative)
    )
      throw Error(`Candidate archive origin escapes owned root: ${name}`);
    const info = await fs.lstat(record.archive);
    if (
      info.isSymbolicLink() ||
      !info.isFile() ||
      (await fs.realpath(record.archive)) !== record.archive
    )
      throw Error(`Candidate archive symlink or invalid file origin: ${name}`);
    const bytes = await fs.readFile(record.archive);
    if (
      crypto.createHash('sha256').update(bytes).digest('hex') !==
        record.sha256 ||
      `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}` !==
        record.integrity
    )
      throw Error(`Candidate archive hash/integrity changed: ${name}`);
  }
}
