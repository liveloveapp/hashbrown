import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const folder = 'tools/conformance/agent-frameworks/program';
const hash = (value) => createHash('sha256').update(value).digest('hex');

/** Read only regular physical files beneath the selected physical repository root. */
async function readPhysical(root, relative) {
  let selected = root;
  for (const segment of relative.split('/')) {
    selected = join(selected, segment);
    const stat = await lstat(selected);
    assert.ok(!stat.isSymbolicLink(), 'Retained source must remain physical');
  }
  assert.ok(
    (await lstat(selected)).isFile(),
    'Retained source must be a physical file',
  );
  return readFile(selected, 'utf8');
}

/**
 * Load explicitly reviewed historical source copies without executing code or using Git.
 * Each copy must match an unchanged qualification's exact source commit, source path and digest.
 * Declared copies never fall back to the moving checkout when missing or tampered.
 * @param root - Physical absolute repository root.
 * @param records - Unchanged additive qualification records with exact source inputs.
 * @returns Source-path evidence entries containing only verified retained UTF-8 bytes.
 */
export async function loadRetainedSources(root, records) {
  assert.ok(
    isAbsolute(root) && resolve(root) === root,
    'Physical repository root required',
  );
  assert.equal(await realpath(root), root, 'Physical repository root required');
  const manifest = JSON.parse(
    await readPhysical(root, `${folder}/retained-sources.json`),
  );
  assert.equal(manifest.schemaVersion, 1, 'Unsupported retained source schema');
  assert.ok(
    Array.isArray(manifest.sources),
    'Retained source declarations required',
  );
  const evidence = new Map();
  for (const entry of manifest.sources) {
    assert.match(
      entry.sourceCommit,
      /^[a-f0-9]{40}$/,
      'Exact retained source commit required',
    );
    assert.match(
      entry.sha256,
      /^[a-f0-9]{64}$/,
      'Exact retained source hash required',
    );
    assert.ok(
      typeof entry.path === 'string' &&
        entry.path.length > 0 &&
        !isAbsolute(entry.path) &&
        !entry.path.includes('\\') &&
        entry.path
          .split('/')
          .every((part) => part !== '' && part !== '.' && part !== '..'),
      'Repository-relative retained source path required',
    );
    const profile = records.find((record) => record.id === entry.profileId);
    assert.ok(profile, 'Unknown retained source qualification');
    assert.equal(
      entry.sourceCommit,
      profile.sourceCommit,
      'Retained source commit differs from qualification',
    );
    assert.ok(
      profile.sourceInputs.some(
        (input) => input.path === entry.path && input.sha256 === entry.sha256,
      ),
      'Retained source differs from qualified source input',
    );
    assert.equal(
      entry.snapshot,
      `retained-sources/${entry.sha256}.txt`,
      'Retained source snapshot path must be content addressed',
    );
    assert.ok(!evidence.has(entry.path), 'Duplicate retained source path');
    const content = await readPhysical(root, `${folder}/${entry.snapshot}`);
    assert.equal(
      hash(content),
      entry.sha256,
      `Retained source hash mismatch ${entry.path}`,
    );
    evidence.set(entry.path, { content, sha256: entry.sha256 });
  }
  return Object.fromEntries(evidence);
}
