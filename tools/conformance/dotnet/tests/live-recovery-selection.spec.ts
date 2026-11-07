import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectReleaseRecoveryPackages } from '../harness/live-recovery-package';

const hash = (bytes: string) =>
  createHash('sha256').update(bytes).digest('hex');

async function untrustedPointer(root: string, name: string, metadata: object) {
  const metadataPath = join(root, `${name}-metadata.json`);
  const metadataBytes = JSON.stringify(metadata);
  await writeFile(metadataPath, metadataBytes);
  const pointer = join(root, `${name}-pointer.json`);
  const bytes = JSON.stringify({
    kind: 'source-candidate',
    metadata: metadataPath,
    sha256: hash(metadataBytes),
  });
  await writeFile(pointer, bytes);
  await writeFile(pointer + '.sha256', hash(bytes));
  return pointer;
}

test('exact target names and self-consistent pointer hashes do not certify candidate bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'release-selection-untrusted-'));

  try {
    const npmMetadata = await untrustedPointer(root, 'npm', {
      kind: 'source-candidate',
      version: '0.9.0',
      archives: { '@hashbrownai/core': { version: '0.9.0' } },
      installation: {},
      moduleOrigins: {},
    });
    const nugetMetadata = await untrustedPointer(root, 'nuget', {
      kind: 'source-candidate',
      identity: { id: 'Hashbrown.AspNetCore', version: '0.1.0-preview.2' },
      loaded: {
        identity: 'Hashbrown.AspNetCore, Version=0.1.0.0',
        sha256: 'a'.repeat(64),
      },
    });

    await expect(
      selectReleaseRecoveryPackages({
        mode: 'candidate',
        npmMetadata,
        nugetMetadata,
      }),
    ).rejects.toThrow('RECOVERY_SELECTION_INVALID');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('future public selection rejects passed flags without real official archive and installed receipts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'release-public-untrusted-'));

  try {
    const npmMetadata = await untrustedPointer(root, 'npm', {
      kind: 'official-registry',
      version: '0.9.0',
      registry: 'https://registry.npmjs.org/',
      integrityVerification: 'passed',
    });
    const nugetMetadata = await untrustedPointer(root, 'nuget', {
      identity: { id: 'Hashbrown.AspNetCore', version: '0.1.0-preview.2' },
      published: {
        signatureVerification: 'passed',
        payloadEquality: 'passed',
        repositorySignatureUrl: 'https://api.nuget.org/v3/index.json',
      },
    });

    await expect(
      selectReleaseRecoveryPackages({
        mode: 'public',
        npmMetadata,
        nugetMetadata,
      }),
    ).rejects.toThrow('RECOVERY_SELECTION_INVALID');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects historical, ranged and mixed origins even with locally resealed pointer metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'release-mixed-untrusted-'));

  try {
    for (const [npmVersion, nugetVersion, npmKind, nugetKind] of [
      ['0.8.3', '0.1.0-preview.1', 'source-candidate', 'source-candidate'],
      ['^0.9.0', '0.1.0-preview.2', 'source-candidate', 'source-candidate'],
      ['latest', '0.1.0-preview.2', 'source-candidate', 'source-candidate'],
      ['0.9.0', '[0.1.0-preview.2,)', 'official-registry', 'official-registry'],
      ['0.9.0', '0.1.0-preview.2', 'source-candidate', 'official-registry'],
      ['0.9.0', '0.1.0-preview.2', 'official-registry', 'source-candidate'],
      ['0.9.0', '0.1.0-preview.2', 'source', 'source-candidate'],
    ]) {
      const npmMetadata = await untrustedPointer(root, 'npm', {
        kind: npmKind,
        version: npmVersion,
      });
      const nugetMetadata = await untrustedPointer(root, 'nuget', {
        kind: nugetKind,
        identity: { id: 'Hashbrown.AspNetCore', version: nugetVersion },
      });

      for (const mode of ['candidate', 'public'] as const)
        await expect(
          selectReleaseRecoveryPackages({ mode, npmMetadata, nugetMetadata }),
        ).rejects.toThrow('RECOVERY_SELECTION_INVALID');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
