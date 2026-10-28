import { assertPackageRoles } from '../nuget-consumer/role-shape.cjs';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/** Immutable browser-run selection propagated through all workers and restarts. */
export interface DotnetHostSelection {
  readonly HASHBROWN_DOTNET_HOST_MODE: string;
  readonly HASHBROWN_DOTNET_CONSUMER_METADATA?: string;
  readonly HASHBROWN_DOTNET_CONSUMER_SHA256?: string;
}

/** Qualified executable and expected actual loaded package identity. */
export interface DotnetHost {
  readonly command?: string;
  readonly workingDirectory?: string;
  readonly executable: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly loaded?: {
    readonly identity: string;
    readonly location: string;
    readonly sha256: string;
  };
}

const digest = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
const checked = (file: string, hash: string) => {
  if (
    !isAbsolute(file) ||
    realpathSync(file) !== file ||
    lstatSync(file).isSymbolicLink()
  )
    throw new Error(`Package descriptor symlink/path escape: ${file}`);
  if (digest(file) !== hash)
    throw new Error(`Package descriptor file hash changed: ${file}`);
};

/** Captures a required explicit source or pinned package selection without resolving any fallback. */
export function selectDotnetHost(
  environment: NodeJS.ProcessEnv = process.env,
): DotnetHostSelection {
  const mode = environment['HASHBROWN_DOTNET_HOST_MODE'];
  if (mode !== 'source' && mode !== 'package')
    throw new Error('Explicit .NET host mode required');
  return Object.freeze({
    HASHBROWN_DOTNET_HOST_MODE: mode,
    HASHBROWN_DOTNET_CONSUMER_METADATA:
      environment['HASHBROWN_DOTNET_CONSUMER_METADATA'],
    HASHBROWN_DOTNET_CONSUMER_SHA256:
      environment['HASHBROWN_DOTNET_CONSUMER_SHA256'],
  });
}

/** Rechecks pinned descriptors, executable/runtime closure, evaluated inputs and source hashes before every spawn. */
export function resolveDotnetHost(
  selection = selectDotnetHost(),
  roleName: 'fixture' | 'probe' = 'fixture',
): DotnetHost {
  if (selection.HASHBROWN_DOTNET_HOST_MODE === 'source') {
    if (roleName !== 'fixture')
      throw new Error('Package probe requires a package descriptor');
    return {
      executable: resolve(
        'dist/tools/conformance/dotnet/Hashbrown.Conformance.dll',
      ),
      environment: process.env as Record<string, string>,
    };
  }
  const started = performance.now();
  const pointerPath = selection.HASHBROWN_DOTNET_CONSUMER_METADATA;
  const expected = selection.HASHBROWN_DOTNET_CONSUMER_SHA256;
  if (!pointerPath || !expected || !/^[a-f0-9]{64}$/.test(expected))
    throw new Error('Pinned package descriptor required');
  checked(pointerPath, expected);
  if (readFileSync(pointerPath + '.sha256', 'utf8').trim() !== expected)
    throw new Error('Package pointer anchor changed');
  const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
  checked(pointer.metadata, pointer.sha256);
  const metadata = JSON.parse(readFileSync(pointer.metadata, 'utf8'));
  if (
    realpathSync(metadata.root) !== metadata.root ||
    !pointer.metadata.startsWith(metadata.root + '/')
  )
    throw new Error('Package root escape');
  assertPackageRoles(metadata);
  const role = metadata.roles[roleName];
  for (const [file, hash] of Object.entries(role.files))
    checked(join(metadata.root, file), hash as string);
  for (const [file, hash] of Object.entries(role.inputs))
    checked(file, hash as string);
  for (const [file, hash] of Object.entries(metadata.sources))
    checked(join(metadata.repository, file), hash as string);
  for (const file of ['NuGet.Config', 'global.json', metadata.archive])
    checked(join(metadata.root, file), metadata.files[file]);
  // A new inherited import must fail even though its path was absent from evaluated inputs.
  for (const directory of [
    metadata.root,
    join(metadata.root, 'roles'),
    join(metadata.root, role.directory),
  ]) {
    for (let current = directory; ; current = dirname(current)) {
      for (const entry of readdirSync(current))
        if (
          /^Directory\.(Build\.(props|targets)|Packages\.props)$/i.test(entry)
        )
          throw new Error('Package inherited import appeared');
      if (current === dirname(current)) break;
    }
  }
  for (const [file, hash] of Object.entries(role.runtimeInputs))
    checked(file, hash as string);
  const treeFiles = (root: string, relative = ''): string[] =>
    readdirSync(join(root, relative), { withFileTypes: true }).flatMap(
      (entry) => {
        if (entry.isSymbolicLink())
          throw new Error('Package source/runtime symlink appeared');
        const file = relative ? relative + '/' + entry.name : entry.name;
        return entry.isDirectory() ? treeFiles(root, file) : [file];
      },
    );
  const equalFiles = (actual: string[], expected: string[]) => {
    if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort()))
      throw new Error('Package source/runtime file closure changed');
  };
  equalFiles(
    treeFiles(join(metadata.root, role.directory)).map(
      (file) => role.directory + '/' + file,
    ),
    Object.keys(role.files),
  );
  for (const tree of metadata.sourceTrees)
    equalFiles(
      treeFiles(join(metadata.repository, tree.directory))
        .filter(
          (file) =>
            !tree.exclude.some((prefix: string) => file.startsWith(prefix)),
        )
        .map((file) => tree.directory + '/' + file),
      Object.keys(metadata.sources).filter((file) =>
        file.startsWith(tree.directory + '/'),
      ),
    );
  for (const tree of role.runtimeTrees)
    equalFiles(
      treeFiles(tree).map((file) => tree + '/' + file),
      Object.keys(role.runtimeInputs).filter((file) =>
        file.startsWith(tree + '/'),
      ),
    );
  const library = join(metadata.root, role.library);
  checked(library, metadata.loaded.sha256);
  const result = {
    command: role.launcher,
    workingDirectory: dirname(join(metadata.root, role.executable)),
    executable: join(metadata.root, role.executable),
    environment: {
      ...metadata.environment,
      HASHBROWN_DOTNET_PACKAGE_IDENTITY: 'true',
    },
    loaded: {
      identity: metadata.loaded.identity,
      location: library,
      sha256: metadata.loaded.sha256,
    },
  };
  const report = process.env['HASHBROWN_PACKAGE_SPAWN_REPORT'];
  if (report)
    appendFileSync(
      report,
      JSON.stringify({
        event: 'launch-guard',
        role: roleName,
        descriptor: expected,
        candidate: metadata.sha256,
        executable: result.executable,
        loaded: result.loaded,
        guardMs: performance.now() - started,
      }) + '\n',
    );
  return result;
}

/** Requires the worker's own actual loaded assembly report before considering it ready. */
export function verifyLoadedDotnetHost(host: DotnetHost, output: string): void {
  if (!host.loaded) return;
  const value = output.match(/HASHBROWN_PACKAGE_IDENTITY:(\{[^\r\n]+\})/)?.[1];
  if (
    !value ||
    JSON.stringify(JSON.parse(value)) !== JSON.stringify(host.loaded)
  )
    throw new Error('Actual loaded package identity/path/hash differs');
  const report = process.env['HASHBROWN_PACKAGE_SPAWN_REPORT'];
  if (report)
    appendFileSync(
      report,
      JSON.stringify({
        event: 'verified-loaded',
        descriptor: process.env['HASHBROWN_DOTNET_CONSUMER_SHA256'],
        executable: host.executable,
        loaded: JSON.parse(value),
      }) + '\n',
    );
}

/** Reviewed application configuration accepted by the deterministic package fixture. */
export const DOTNET_FIXTURE_CONFIGURATION = [
  'ASPNETCORE_URLS',
  'Provider',
  'ModelEndpoint',
  'Model',
  'ApiKey',
  'Workflow',
  'ModelApi',
  'FixtureOrigins',
  'InterruptConnectionString',
  'InterruptSchema',
  'ApprovalTtlSeconds',
  'CaptureGate',
  'CheckpointCode',
  'FixtureAcknowledgement',
  'FixtureNativeApprovals',
  'FixtureNativeSessions',
  'FixtureProgressPrelude',
  'InterruptCapacity',
  'NativeAgentName',
  'NativeFailSave',
  'NativeGate',
  'NativeLeaseSeconds',
  'NativeMaximumCalls',
  'NativePayloadCapacity',
  'NativeRegion',
  'NativeSelectorCapacity',
  'NativeTenant',
  'PreparationLeaseSeconds',
  'RegistryVersion',
] as const;

/** Application values may configure fixtures but cannot select runtime code or build inputs. */
export type DotnetFixtureConfiguration = Readonly<
  Partial<Record<(typeof DOTNET_FIXTURE_CONFIGURATION)[number], string>>
>;

/** Rejects every unreviewed override, including case variants, before acquiring model resources. */
export function validateHostOverrides(
  environment: Readonly<Record<string, string>>,
): void {
  const allowed = new Set(
    DOTNET_FIXTURE_CONFIGURATION.map((key) => key.toLowerCase()),
  );
  for (const key of Object.keys(environment))
    if (!allowed.has(key.toLowerCase()))
      throw new Error(`Package host environment injection: ${key}`);
}

/** Builds a package child environment exclusively from pinned launcher basics and reviewed app values. */
export function fixtureChildEnvironment(
  host: DotnetHost,
  configuration: DotnetFixtureConfiguration,
): Readonly<Record<string, string>> {
  if (!host.loaded) return { ...host.environment, ...configuration };
  validateHostOverrides(configuration);
  return {
    ...host.environment,
    ...Object.fromEntries(
      DOTNET_FIXTURE_CONFIGURATION.flatMap((name) => {
        const key = Object.keys(configuration).find(
          (key) => key.toLowerCase() === name.toLowerCase(),
        );
        const value = key
          ? configuration[key as keyof DotnetFixtureConfiguration]
          : undefined;
        return value === undefined ? [] : [[name, value]];
      }),
    ),
  };
}
