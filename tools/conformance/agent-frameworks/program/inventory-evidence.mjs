import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
const prefix = 'tools/conformance/agent-frameworks/';
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const key = (profile) => `${profile.framework}/${profile.profile}`;

/** Create a pure verifier binding repository-relative references to exact retained bytes. */
export function createEvidenceVerifier(evidence) {
  return (reference) => {
    assert.ok(
      reference.path &&
        !isAbsolute(reference.path) &&
        !reference.path.split('/').includes('..'),
      'Evidence must be repository-relative',
    );
    const file = evidence[reference.path];
    assert.ok(file, `Missing evidence file ${reference.path}`);
    assert.equal(
      sha256(file.content),
      file.sha256,
      `Tampered evidence ${reference.path}`,
    );
    assert.equal(
      file.sha256,
      reference.sha256,
      `Source hash mismatch ${reference.path}`,
    );
    return file.content;
  };
}

/** Enumerate the unchanged original generate.mjs fingerprint input rules from disk. */
export async function producerSourcePaths(root) {
  const paths = [prefix + 'generate.mjs', prefix + 'node/package-lock.json'];
  for (const folder of ['harness', 'node']) {
    for (const name of await readdir(resolve(root, prefix, folder))) {
      if (name.endsWith('.mjs')) paths.push(prefix + folder + '/' + name);
    }
  }
  return paths.sort();
}

/** Validate original producer fingerprint bytes and the complete supplied source set. */
export function verifyProducerSources(qualification, evidence, verifyFile) {
  if (!qualification.producerSources) return;
  const paths = qualification.producerSources
    .map((source) => source.path)
    .sort();
  assert.equal(new Set(paths).size, paths.length, 'Duplicate producer sources');
  const expected = Object.keys(evidence)
    .filter(
      (path) =>
        path === prefix + 'generate.mjs' ||
        path === prefix + 'node/package-lock.json' ||
        new RegExp('^' + prefix + '(harness|node)/[^/]+\\.mjs$').test(path),
    )
    .sort();
  assert.deepEqual(paths, expected, 'Missing producer source inputs');
  const fingerprint = createHash('sha256');
  for (const path of paths) {
    const source = qualification.producerSources.find(
      (reference) => reference.path === path,
    );
    fingerprint.update(path.slice(prefix.length));
    fingerprint.update('\0');
    fingerprint.update(verifyFile(source));
    fingerprint.update('\0');
  }
  assert.equal(
    fingerprint.digest('hex'),
    qualification.producerSourceSha256,
    'Producer source fingerprint mismatch',
  );
}

/** Bind a historical native profile to exact versions, capture metadata and provenance. */
export function verifyProfileProvenance(
  record,
  original,
  qualification,
  verifyFile,
) {
  assert.deepEqual(
    record.versions,
    original.versions,
    'Qualification version mismatch',
  );
  for (const version of Object.values(record.versions))
    assert.match(
      version,
      /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/,
      'Exact versions required',
    );
  assert.match(
    record.sourceCommit,
    /^[a-f0-9]{40}$/,
    'Exact source commit required',
  );
  assert.match(
    record.qualifiedAt,
    /^\d{4}-\d{2}-\d{2}$/,
    'Qualification date must be YYYY-MM-DD',
  );
  assert.equal(
    new Date(record.qualifiedAt).toISOString().slice(0, 10),
    record.qualifiedAt,
    'Invalid qualification date',
  );
  assert.match(record.ciRun, /^\d+$/, 'Numeric CI run ID required');
  assert.equal(
    record.ciUrl,
    `https://github.com/liveloveapp/hashbrown/actions/runs/${record.ciRun}`,
    'Exact CI run URL required',
  );
  assert.ok(
    record.qualifiedAt &&
      record.sourceCommit &&
      record.ciRun &&
      record.runtime &&
      record.protocol,
    'Missing qualification provenance',
  );
  assert.equal(
    record.mode,
    'native',
    'Legacy native qualification cannot become a recipe',
  );
  assert.equal(
    Boolean(record.recipe),
    record.mode === 'recipe',
    'Native/recipe conflation',
  );
  if (record.recipe)
    assert.ok(
      record.recipe.id && record.recipe.version,
      'Recipe identity/version required',
    );
  const capture = JSON.parse(verifyFile(record.capture));
  assert.equal(key(capture), key(record), 'Capture profile mismatch');
  assert.deepEqual(
    capture.versions,
    record.versions,
    'Capture version mismatch',
  );
  assert.equal(
    capture.provenance.eventsSha256,
    sha256(JSON.stringify(capture.events)),
    'Capture event integrity mismatch',
  );
  assert.equal(
    capture.provenance.sourceSha256,
    record.capture.sourceSha256,
    'Capture source mismatch',
  );
  if (qualification.producerSourceSha256)
    assert.equal(
      record.capture.sourceSha256,
      qualification.producerSourceSha256,
      'Capture producer mismatch',
    );
  assert.equal(
    capture.evidence.realFrameworkExecution,
    true,
    'Actual framework execution required',
  );
  if (record.capture.metadata)
    assert.deepEqual(
      record.capture.metadata,
      capture.evidence,
      'Capture metadata mismatch',
    );
}
