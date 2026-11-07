import * as assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { runRecoveryQualifier } from './live-recovery-qualifier-process';
import { type DotnetHostSelection, resolveDotnetHost } from './dotnet-host';
import type { ReleaseRecoveryBudget } from './live-recovery-budget';
import { recoveryDigest } from './live-recovery-evidence';

/** Explicit current candidate or future exact public package choice; source mode is unavailable. */
export interface ReleaseRecoveryPackageRequest {
  readonly mode: 'candidate' | 'public';
  readonly npmMetadata: string;
  readonly nugetMetadata: string;
}
/** Allowlisted actual package identities and independently anchored pointers. */
export interface ReleaseRecoveryProvenance {
  readonly kind: 'source-candidate' | 'official-registry';
  readonly npmVersion: '0.9.0';
  readonly nugetVersion: '0.1.0-preview.2';
  readonly npmPointerSha256: string;
  readonly nugetPointerSha256: string;
  readonly packagePointerSha256: string;
  readonly loadedIdentity: string;
  readonly loadedSha256: string;
  readonly npmProducerRevision: string;
  readonly nugetProducerRevision: string;
  readonly closureSha256: string;
}
/** Qualified execution context and final drain-time requalification, without credential material. */
export interface ReleaseRecoveryPackages {
  readonly request: ReleaseRecoveryPackageRequest;
  readonly selection: DotnetHostSelection;
  readonly artifacts: Readonly<{ react: string; angular: string }>;
  readonly provenance: ReleaseRecoveryProvenance;
  readonly anchor: string;
  readonly assertAnchored: () => Promise<void>;
  readonly requalify: (
    deadline?: Pick<
      ReleaseRecoveryBudget,
      'signal' | 'remainingMs' | 'assertActive'
    >,
  ) => Promise<void>;
}

async function pointerHash(file: string): Promise<string> {
  assert.ok(
    isAbsolute(file) &&
      resolve(file) === file &&
      (await realpath(file)) === file &&
      (await lstat(file)).isFile(),
  );
  const value = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
  assert.equal((await readFile(file + '.sha256', 'utf8')).trim(), value);
  return value;
}

/** Qualifies exact physical package origins before credential reads and binds all restarts to the same bytes. */
export async function selectReleaseRecoveryPackages(
  request: ReleaseRecoveryPackageRequest,
  deadline?: Pick<
    ReleaseRecoveryBudget,
    'signal' | 'remainingMs' | 'assertActive'
  >,
): Promise<ReleaseRecoveryPackages> {
  try {
    deadline?.assertActive();
    assert.ok(request.mode === 'candidate' || request.mode === 'public');
    assert.ok(request.npmMetadata !== request.nugetMetadata);
    const npmPointerSha256 = await pointerHash(request.npmMetadata);
    const nugetPointerSha256 = await pointerHash(request.nugetMetadata);
    const output = await runRecoveryQualifier(
      resolve(__dirname, '../release-consumer/select.mjs'),
      [request.mode, request.npmMetadata, request.nugetMetadata],
      process.env,
      deadline ? Math.max(1, deadline.remainingMs()) : 900_000,
      deadline?.signal,
    );
    const { npm, nuget } = JSON.parse(output);
    const names = [
      '@hashbrownai/core',
      '@hashbrownai/react',
      '@hashbrownai/angular',
    ];
    assert.deepEqual(Object.keys(npm.archives).sort(), [...names].sort());
    for (const name of names) assert.equal(npm.archives[name].version, '0.9.0');
    assert.equal(nuget.identity.id, 'Hashbrown.AspNetCore');
    assert.equal(nuget.identity.version, '0.1.0-preview.2');
    assert.ok(
      request.mode === 'candidate'
        ? !nuget.published && npm.kind === 'source-candidate'
        : nuget.published && npm.kind === 'official-registry',
    );
    assert.match(npm.revision, /^[a-f0-9]{40}$/);
    assert.match(nuget.revision, /^[a-f0-9]{40}$/);
    const packagePointerSha256 = await pointerHash(nuget.packagePointer);
    const selection = Object.freeze({
      HASHBROWN_DOTNET_HOST_MODE: 'package',
      HASHBROWN_DOTNET_CONSUMER_METADATA: nuget.packagePointer,
      HASHBROWN_DOTNET_CONSUMER_SHA256: packagePointerSha256,
    });
    const fixture = resolveDotnetHost(selection, 'fixture');
    const probe = resolveDotnetHost(selection, 'probe');
    assert.ok(fixture.loaded && probe.loaded);
    assert.equal(fixture.loaded.sha256, probe.loaded.sha256);
    assert.equal(fixture.loaded.sha256, nuget.loaded.sha256);
    assert.equal(fixture.loaded.identity, nuget.loaded.identity);
    for (const framework of ['react', 'angular'] as const) {
      assert.ok(isAbsolute(npm.artifacts[framework]));
      assert.equal(
        await realpath(npm.artifacts[framework]),
        npm.artifacts[framework],
      );
    }
    assert.equal(await pointerHash(request.npmMetadata), npmPointerSha256);
    assert.equal(await pointerHash(request.nugetMetadata), nugetPointerSha256);
    const provenance: ReleaseRecoveryProvenance = Object.freeze({
      kind:
        request.mode === 'candidate' ? 'source-candidate' : 'official-registry',
      npmVersion: '0.9.0',
      nugetVersion: '0.1.0-preview.2',
      npmPointerSha256,
      nugetPointerSha256,
      packagePointerSha256,
      loadedIdentity: nuget.loaded.identity,
      loadedSha256: nuget.loaded.sha256,
      npmProducerRevision: npm.revision,
      nugetProducerRevision: nuget.revision,
      closureSha256: recoveryDigest({
        npm: {
          archives: npm.archives,
          sources: npm.sources ?? npm.producer.sources,
          consumer: npm.consumer,
          installation: npm.installation,
          moduleOrigins: npm.moduleOrigins,
        },
        nuget: {
          sources: nuget.sources,
          files: nuget.files,
          roles: nuget.roles,
          sha256: nuget.sha256,
          sha512: nuget.sha512,
          published: nuget.published ?? null,
          producerArchiveSha256: nuget.producerArchiveSha256 ?? null,
        },
      }),
    });
    const anchor = recoveryDigest(provenance);
    deadline?.assertActive();
    const assertAnchored = async () => {
      assert.equal(
        await pointerHash(request.npmMetadata),
        npmPointerSha256,
        'RECOVERY_PROVENANCE_CHANGED',
      );
      assert.equal(
        await pointerHash(request.nugetMetadata),
        nugetPointerSha256,
        'RECOVERY_PROVENANCE_CHANGED',
      );
      assert.equal(
        await pointerHash(nuget.packagePointer),
        packagePointerSha256,
        'RECOVERY_PROVENANCE_CHANGED',
      );
      // The original fixture role was deeply qualified above. Recheck its physical loaded assembly at case boundaries.
      assert.equal(
        await realpath(fixture.loaded!.location),
        fixture.loaded!.location,
      );
      assert.ok((await lstat(fixture.loaded!.location)).isFile());
      assert.equal(
        createHash('sha256')
          .update(await readFile(fixture.loaded!.location))
          .digest('hex'),
        provenance.loadedSha256,
        'RECOVERY_PROVENANCE_CHANGED',
      );
    };
    return Object.freeze({
      request: Object.freeze({ ...request }),
      selection,
      artifacts: Object.freeze({ ...npm.artifacts }),
      provenance,
      anchor,
      assertAnchored,
      requalify: async (
        deadline?: Pick<
          ReleaseRecoveryBudget,
          'signal' | 'remainingMs' | 'assertActive'
        >,
      ) => {
        const current = await selectReleaseRecoveryPackages(request, deadline);
        assert.equal(current.anchor, anchor, 'RECOVERY_PROVENANCE_CHANGED');
      },
    });
  } catch {
    throw new Error('RECOVERY_SELECTION_INVALID');
  }
}
