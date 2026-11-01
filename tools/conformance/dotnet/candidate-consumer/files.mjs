import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

/** Repository owning the candidate producer and qualification sources. */
export const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/** Exact SDK packages required by both candidate framework consumers. */
export const sdkNames = [
  '@hashbrownai/core',
  '@hashbrownai/react',
  '@hashbrownai/angular',
];

/** Exact owned source copies shared by preparation and later qualification. */
export const candidateConsumerCopies = Object.freeze({
  'react/src/app.tsx': 'react-app.tsx',
  'react/src/main.tsx': 'react-main.tsx',
  'react/src/recovery.ts': 'recovery.ts',
  'react/src/deadline-transport.ts': 'deadline-transport.ts',
  'angular/src/app.ts': 'angular-app.ts',
  'angular/src/main.ts': 'angular-main.ts',
  'angular/src/recovery.ts': 'recovery.ts',
  'angular/src/deadline-transport.ts': 'deadline-transport.ts',
  'react/src/react/chat.tsx': 'react/chat.tsx',
  'react/src/react/structured-chat.tsx': 'react/structured-chat.tsx',
  'react/src/react/completion.tsx': 'react/completion.tsx',
  'react/src/react/structured-completion.tsx':
    'react/structured-completion.tsx',
  'react/src/react/ui-chat.tsx': 'react/ui-chat.tsx',
  'react/src/react/ui-completion.tsx': 'react/ui-completion.tsx',
  'react/src/react/panel.tsx': 'react/panel.tsx',
  'react/src/react/candidate-card.tsx': 'react/candidate-card.tsx',
  'react/src/candidate-runtime.ts': 'candidate-runtime.ts',
  'angular/src/angular/chat.ts': 'angular/chat.ts',
  'angular/src/angular/structured-chat.ts': 'angular/structured-chat.ts',
  'angular/src/angular/completion.ts': 'angular/completion.ts',
  'angular/src/angular/structured-completion.ts':
    'angular/structured-completion.ts',
  'angular/src/angular/ui-chat.ts': 'angular/ui-chat.ts',
  'angular/src/angular/ui-completion.ts': 'angular/ui-completion.ts',
  'angular/src/angular/panel.ts': 'angular/panel.ts',
  'angular/src/angular/candidate-card.ts': 'angular/candidate-card.ts',
  'angular/src/candidate-runtime.ts': 'candidate-runtime.ts',
  'contracts.ts': 'contracts.ts',
});

/** Computes a content hash without consulting package caches. */
export function digest(bytes, algorithm = 'sha256', encoding = 'hex') {
  return crypto.createHash(algorithm).update(bytes).digest(encoding);
}

/** Reads a physical ordinary file, rejecting aliases and symlink ancestors. */
export async function readPhysical(file) {
  assert.ok(
    path.isAbsolute(file) && path.resolve(file) === file,
    'Absolute physical file required',
  );
  assert.equal(await fs.realpath(file), file, `Symlink origin: ${file}`);
  assert.ok((await fs.lstat(file)).isFile(), `Ordinary file required: ${file}`);
  return fs.readFile(file);
}

/** Inventories every ordinary file recursively and rejects symbolic links. */
export async function tree(directory, base = directory, exclude = []) {
  assert.equal(await fs.realpath(directory), directory, 'Tree symlink origin');
  const result = {};
  for (const entry of (
    await fs.readdir(directory, { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    const relative = path.relative(base, file);
    if (
      exclude.some(
        (value) => relative === value || relative.startsWith(value + path.sep),
      )
    )
      continue;
    assert.ok(!entry.isSymbolicLink(), `Tree symlink: ${file}`);
    if (entry.isDirectory())
      Object.assign(result, await tree(file, base, exclude));
    else {
      assert.ok(entry.isFile(), `Unsupported tree entry: ${file}`);
      result[relative] = digest(await readPhysical(file));
    }
  }
  return result;
}

/** Captures the exact SDK producer and candidate executable source inventory. */
export async function sourceInventory() {
  const result = {};
  for (const directory of [
    'packages/core',
    'packages/react',
    'packages/angular',
    'tools/growth/install',
    'tools/conformance/dotnet',
  ]) {
    const root = path.join(repository, directory);
    const entries = await tree(root, root, [
      'node_modules',
      'bin',
      'obj',
      'nuget-consumer/bin',
      'nuget-consumer/obj',
    ]);
    for (const [file, hash] of Object.entries(entries))
      result[directory + '/' + file] = hash;
  }
  for (const entry of await fs.readdir(repository))
    if (
      /^(?:package(?:-lock)?\.json|nx\.json|tsconfig.*\.json|jest\.preset\.js|eslint\.config\.mjs|\.nvmrc|LICENSE)$/.test(
        entry,
      )
    )
      result[entry] = digest(await readPhysical(path.join(repository, entry)));
  return result;
}

/** Reads an npm tarball's regular package files without extracting executable content. */
export function archiveFiles(bytes) {
  const tar = gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 });
  const files = {};
  let extended = {};
  const text = (buffer) => buffer.toString('utf8').replace(/\0.*$/s, '');
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const checksum = Number.parseInt(text(header.subarray(148, 156)).trim(), 8);
    const actual = header.reduce(
      (sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value),
      0,
    );
    assert.equal(actual, checksum, 'Invalid npm tar header checksum');
    const size = Number.parseInt(text(header.subarray(124, 136)).trim(), 8);
    assert.ok(
      Number.isSafeInteger(size) &&
        size >= 0 &&
        offset + 512 + size <= tar.length,
      'Invalid npm tar entry size',
    );
    const contents = tar.subarray(offset + 512, offset + 512 + size);
    const type = text(header.subarray(156, 157));
    if (type === 'x') {
      extended = {};
      let index = 0;
      while (index < contents.length) {
        const space = contents.indexOf(32, index);
        const length = Number(contents.subarray(index, space).toString());
        assert.ok(
          space > index &&
            Number.isSafeInteger(length) &&
            length > 0 &&
            index + length <= contents.length,
          'Invalid npm extended header',
        );
        const line = contents
          .subarray(space + 1, index + length - 1)
          .toString();
        const equals = line.indexOf('=');
        assert.ok(equals > 0, 'Invalid npm extended property');
        extended[line.slice(0, equals)] = line.slice(equals + 1);
        index += length;
      }
    } else {
      const prefix = text(header.subarray(345, 500));
      const name =
        extended.path ??
        (prefix ? prefix + '/' : '') + text(header.subarray(0, 100));
      assert.ok(
        name.startsWith('package/') &&
          path.posix.normalize(name) === name &&
          !name.includes('\\'),
        'Npm archive path escape',
      );
      assert.ok(
        type === '' || type === '0' || type === '5',
        'Npm archive links or special entries forbidden',
      );
      if (type !== '5') {
        const file = name.slice('package/'.length);
        assert.ok(
          file && !Object.hasOwn(files, file),
          'Duplicate npm archive file',
        );
        files[file] = Buffer.from(contents);
      }
      extended = {};
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.ok(files['package.json'], 'Npm archive package manifest missing');
  return files;
}

/** Requires exact hash inventories including detection of newly added files. */
export function equalInventory(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label} inventory changed`);
}
