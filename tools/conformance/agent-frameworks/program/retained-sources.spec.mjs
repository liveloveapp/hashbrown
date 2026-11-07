import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { loadRetainedSources } from './retained-sources.mjs';
import { loadInventory } from './inventory.mjs';

const folder = 'tools/conformance/agent-frameworks/program';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sourceCommit = '321ed09862352de985091d401efc11c000d4d4e1';
const sourcePath = '.github/workflows/pr-main.yml';
const original = 'historical, qualified workflow bytes\n';
const digest = hash(original);

async function fixture(action) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'framework-retained-')),
  );
  const records = [
    {
      id: 'example/recipe',
      sourceCommit,
      sourceInputs: [{ path: sourcePath, sha256: digest }],
    },
  ];
  const manifest = {
    schemaVersion: 1,
    sources: [
      {
        profileId: records[0].id,
        sourceCommit,
        path: sourcePath,
        sha256: digest,
        snapshot: `retained-sources/${digest}.txt`,
      },
    ],
  };
  const snapshot = join(root, folder, manifest.sources[0].snapshot);
  const index = join(root, folder, 'retained-sources.json');
  await mkdir(dirname(snapshot), { recursive: true });
  await mkdir(dirname(join(root, sourcePath)), { recursive: true });
  await writeFile(snapshot, original);
  await writeFile(index, JSON.stringify(manifest));
  await writeFile(
    join(root, sourcePath),
    'current, legitimately changed workflow\n',
  );
  try {
    await action({ root, records, manifest, snapshot, index });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('loads exact retained source bytes without adopting changed current source or mutating qualification', async () => {
  await fixture(async ({ root, records }) => {
    const before = JSON.stringify(records);

    const evidence = await loadRetainedSources(root, records);

    assert.deepEqual(evidence, {
      [sourcePath]: { content: original, sha256: digest },
    });
    assert.equal(JSON.stringify(records), before);
    assert.notEqual(await readFile(join(root, sourcePath), 'utf8'), original);
  });
});

test('missing retained source fails closed even when current checkout bytes match', async () => {
  await fixture(async ({ root, records, snapshot }) => {
    await rm(snapshot);
    await writeFile(join(root, sourcePath), original);

    await assert.rejects(loadRetainedSources(root, records), /ENOENT|Missing/);
  });
});

test('tampered retained source fails closed even when current checkout bytes match', async () => {
  await fixture(async ({ root, records, snapshot }) => {
    await writeFile(snapshot, 'tampered');
    await writeFile(join(root, sourcePath), original);

    await assert.rejects(
      loadRetainedSources(root, records),
      /Retained source hash mismatch/,
    );
  });
});

test('retained source manifest cannot change a qualification identity, source commitment or source hash', async () => {
  for (const mutate of [
    (manifest) => {
      manifest.sources[0].profileId = 'unreviewed/profile';
    },
    (manifest) => {
      manifest.sources[0].sourceCommit = 'f'.repeat(40);
    },
    (manifest) => {
      manifest.sources[0].sha256 = 'f'.repeat(64);
    },
    (manifest) => {
      manifest.sources[0].path = 'capture.json';
    },
    (manifest) => {
      manifest.sources.push({ ...manifest.sources[0] });
    },
  ]) {
    await fixture(async ({ root, records, manifest, index }) => {
      mutate(manifest);
      await writeFile(index, JSON.stringify(manifest));

      await assert.rejects(loadRetainedSources(root, records));
    });
  }
});

test('retained source paths cannot escape the reviewed content-addressed snapshot directory', async () => {
  for (const path of [
    '../outside',
    '/absolute',
    'retained-sources/other.txt',
    `retained-sources/../${digest}.txt`,
  ]) {
    await fixture(async ({ root, records, manifest, index }) => {
      manifest.sources[0].snapshot = path;
      await writeFile(index, JSON.stringify(manifest));

      await assert.rejects(loadRetainedSources(root, records), /snapshot path/);
    });
  }
});

test('retained source snapshots and manifest must remain physical files', async () => {
  for (const target of ['snapshot', 'manifest']) {
    await fixture(async ({ root, records, snapshot, index }) => {
      const selected = target === 'snapshot' ? snapshot : index;
      const content = await readFile(selected);
      const outside = join(root, 'alias-target.txt');
      await writeFile(outside, content);
      await rm(selected);
      await symlink(outside, selected);

      await assert.rejects(loadRetainedSources(root, records), /physical/);
    });
  }
});

test('framework inventory preserves exact historical qualification after current CI sources change', async () => {
  const records = JSON.parse(
    await readFile(
      new URL('./pydantic-qualification.json', import.meta.url),
      'utf8',
    ),
  ).records;

  const inventory = await loadInventory();

  for (const record of records) {
    const profile = inventory.profiles.find(
      (profile) => profile.id === record.id,
    );
    assert.deepEqual(profile.qualification, record);
  }
});
