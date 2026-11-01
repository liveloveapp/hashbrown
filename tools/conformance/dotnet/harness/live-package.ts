import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  DOTNET_FIXTURE_CONFIGURATION,
  type DotnetHost,
  type DotnetHostSelection,
  resolveDotnetHost,
} from './dotnet-host';

/** Immutable public release accepted by this qualification milestone. */
export const LIVE_PUBLIC_RELEASE = Object.freeze({
  id: 'Hashbrown.AspNetCore',
  version: '0.1.0-preview.1',
  revision: 'df1340f713d3b65165a494eb09e53246298df858',
  archiveSha256:
    '288cdd59c3f123ea4f69bc044b4eed3eeae8ffd1ab53df64f9555148cd1d2f57',
  assemblySha256:
    '37c98d354cca12fb6b32e94210e747bd7b825881436fea9eae291de72ea3a9e2',
});
const digest = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

/** Validates immutable public bytes and role closure without loading credentials or accepting source fallback. */
export function selectPublicLivePackage(pointerPath: string) {
  try {
    if (
      !isAbsolute(pointerPath) ||
      realpathSync(pointerPath) !== pointerPath ||
      lstatSync(pointerPath).isSymbolicLink()
    )
      throw new Error();
    const pointerSha256 = digest(pointerPath);
    if (readFileSync(pointerPath + '.sha256', 'utf8').trim() !== pointerSha256)
      throw new Error();
    const pointer = read(pointerPath);
    if (digest(pointer.metadata) !== pointer.sha256) throw new Error();
    const metadata = read(pointer.metadata);
    const published = metadata.published;
    if (
      metadata.identity.id !== LIVE_PUBLIC_RELEASE.id ||
      metadata.identity.version !== LIVE_PUBLIC_RELEASE.version ||
      metadata.revision !== LIVE_PUBLIC_RELEASE.revision ||
      metadata.sha256 !== LIVE_PUBLIC_RELEASE.archiveSha256 ||
      metadata.loaded.sha256 !== LIVE_PUBLIC_RELEASE.assemblySha256 ||
      published?.signatureVerification !== 'passed' ||
      published?.payloadEquality !== 'passed' ||
      published?.repositorySignatureUrl !==
        'https://api.nuget.org/v3/index.json' ||
      published.canonicalHash !== metadata.sha512 ||
      !metadata.files[published.qualifiedArchive] ||
      digest(join(metadata.root, metadata.archive)) !==
        LIVE_PUBLIC_RELEASE.archiveSha256
    )
      throw new Error();
    const selection: DotnetHostSelection = Object.freeze({
      HASHBROWN_DOTNET_HOST_MODE: 'package',
      HASHBROWN_DOTNET_CONSUMER_METADATA: pointerPath,
      HASHBROWN_DOTNET_CONSUMER_SHA256: pointerSha256,
    });
    resolveDotnetHost(selection, 'fixture');
    resolveDotnetHost(selection, 'probe');
    const runnerSources = Object.fromEntries(
      readdirSync(__dirname)
        .filter((file) => /\.ts$/.test(file))
        .sort()
        .map((file) => [file, digest(join(__dirname, file))]),
    );
    runnerSources['../nuget-consumer/role-shape.cjs'] = digest(
      join(__dirname, '../nuget-consumer/role-shape.cjs'),
    );
    const runnerRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: resolve(__dirname, '../../../..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!/^[a-f0-9]{40}$/.test(runnerRevision)) throw new Error();
    const provenance = Object.freeze({
      runnerRevision,
      ...LIVE_PUBLIC_RELEASE,
      pointerSha256,
      metadataSha256: pointer.sha256,
      canonicalSha512: metadata.sha512,
      loadedIdentity: metadata.loaded.identity,
      releaseSourcesSha256: createHash('sha256')
        .update(JSON.stringify(metadata.sources))
        .digest('hex'),
      runnerSources,
    });
    return Object.freeze({ selection, provenance });
  } catch {
    throw new Error('LIVE_NUGET_INVALID');
  }
}

/** Merges only reviewed application values; pinned package runtime context remains authoritative. */
export function livePackageChildEnvironment(
  host: DotnetHost,
  environment: Readonly<Record<string, string>>,
  cleanup: boolean,
): Readonly<Record<string, string>> {
  const allowed: readonly string[] = cleanup
    ? [
        'ASPNETCORE_URLS',
        'FixtureDropSchemaOnly',
        'InterruptSchema',
        'InterruptConnectionString',
      ]
    : [
        ...DOTNET_FIXTURE_CONFIGURATION,
        'FixtureLive',
        'FixtureLiveGroup',
        'AzureAuthentication',
      ];
  const application = Object.fromEntries(
    allowed.flatMap((key) =>
      environment[key] === undefined ||
      (key === 'ApiKey' && environment['AzureAuthentication'] === 'azure-cli')
        ? []
        : [[key, environment[key]]],
    ),
  );
  if (!cleanup && environment['AzureAuthentication'] === 'azure-cli') {
    const configuration = environment['AZURE_CONFIG_DIR'];
    if (configuration) application['AZURE_CONFIG_DIR'] = configuration;
  }
  return Object.freeze({ ...application, ...host.environment });
}

/** Independently rechecks both registries after drain with separate non-provider deadlines. */
export async function finalizeLiveProvenance(
  nuget: (signal: AbortSignal) => Promise<unknown>,
  npm: (signal: AbortSignal) => Promise<unknown>,
): Promise<{ nuget: string; npm: string }> {
  const check = async (
    operation: (signal: AbortSignal) => Promise<unknown>,
  ) => {
    try {
      await operation(AbortSignal.timeout(30_000));
      return 'passed';
    } catch {
      return 'failed';
    }
  };
  const nugetResult = await check(nuget);
  const npmResult = await check(npm);
  return { nuget: nugetResult, npm: npmResult };
}
