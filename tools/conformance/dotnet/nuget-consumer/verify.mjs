import { assertPackageRoles } from './role-shape.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

/** Independent NuGet/SDK identity approved for the first public package. */
export const IDENTITY = Object.freeze({
  id: 'Hashbrown.AspNetCore',
  version: '0.1.0-preview.1',
  sdk: '10.0.402',
});

const SDK_VERSION = /^(\d+)\.(\d+)\.(\d)(\d\d)$/;

/**
 * Accepts the pinned SDK or a later patch in its feature band, the same
 * versions `rollForward: latestPatch` resolves: 10.0.402 admits 10.0.4xx
 * from 402 up, never another band, minor, major or a prerelease.
 */
export function acceptsSdk(version, minimum) {
  const actual = SDK_VERSION.exec(version);
  const pinned = SDK_VERSION.exec(minimum);
  return Boolean(
    actual &&
    pinned &&
    actual[1] === pinned[1] &&
    actual[2] === pinned[2] &&
    actual[3] === pinned[3] &&
    Number(actual[4]) >= Number(pinned[4]),
  );
}

/** The global.json that pins `version` and rolls forward to its latest patch. */
export function sdkPolicy(version) {
  return JSON.stringify(
    { sdk: { version, rollForward: 'latestPatch', allowPrerelease: false } },
    null,
    2,
  );
}

/** Tests a normalized path boundary without accepting sibling prefixes. */
export function within(root, file) {
  return file === root || file.startsWith(root + path.sep);
}

/** Requires an external consumer with no repository ancestor in either direction. */
export function validateIsolation(root, repository) {
  assert.ok(
    path.isAbsolute(root) &&
      path.isAbsolute(repository) &&
      !within(root, repository) &&
      !within(repository, root),
    'Consumer isolation forbids repository ancestry',
  );
}

/** Rejects inherited build customizations before any child process executes. */
export async function validateAncestors(root) {
  for (let directory = root; ; directory = path.dirname(directory)) {
    for (const file of [
      'Directory.Build.props',
      'Directory.Build.targets',
      'Directory.Packages.props',
      ...(directory === root ? [] : ['NuGet.Config', 'nuget.config']),
    ]) {
      try {
        await fs.lstat(path.join(directory, file));
        throw Error(
          `Forbidden inherited configuration: ${path.join(directory, file)}`,
        );
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (directory === path.dirname(directory)) break;
  }
}

/** Creates an allowlisted child environment with consumer-owned package and CLI caches. */
export function buildEnvironment(environment, root) {
  return {
    ...Object.fromEntries(
      [
        'PATH',
        'DOTNET_ROOT',
        'SystemRoot',
        'COMSPEC',
        'LANG',
        'TMPDIR',
        'TEMP',
        'TMP',
      ]
        .filter((key) => environment[key])
        .map((key) => [key, environment[key]]),
    ),
    HOME: path.join(root, 'home'),
    DOTNET_CLI_HOME: path.join(root, 'home'),
    NUGET_PACKAGES: path.join(root, 'packages'),
    NUGET_HTTP_CACHE_PATH: path.join(root, 'http'),
    NUGET_PLUGINS_CACHE_PATH: path.join(root, 'plugins'),
    NUGET_PLUGIN_PATHS: '',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
    DOTNET_NOLOGO: '1',
    DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: 'true',
    DOTNET_MULTILEVEL_LOOKUP: '0',
    MSBUILDDISABLENODEREUSE: '1',
    UseSharedCompilation: 'false',
    DOTNET_PROCESSOR_COUNT: '2',
  };
}

/** Rejects injected restore, build, provider, or credential environment variables. */
export function validateEnvironment(environment, root) {
  assert.deepEqual(
    environment,
    buildEnvironment(environment, root),
    'Injected child environment',
  );
}

/** Generates disjoint exact source mappings from the reviewed dependency closure. */
export function createConfig(root, closure) {
  const escape = (text) =>
    text
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;');
  return `<?xml version="1.0" encoding="utf-8"?>\n<configuration><packageSources><clear /><add key="candidate" value="${escape(root)}/candidate-feed" /><add key="dependencies" value="${escape(root)}/dependency-feed" /></packageSources><fallbackPackageFolders><clear /></fallbackPackageFolders><packageSourceMapping><clear /><packageSource key="candidate"><package pattern="${IDENTITY.id}" /></packageSource><packageSource key="dependencies">${closure
    .map((item) => `<package pattern="${escape(item.id)}" />`)
    .sort()
    .join('')}</packageSource></packageSourceMapping></configuration>\n`;
}

/** Requires the exact reviewed config, including cleared sources/fallbacks and no wildcard overlap. */
export function validateConfig(config, root, closure) {
  assert.ok(
    closure.every(
      (item) =>
        item.id.toLowerCase() !== IDENTITY.id.toLowerCase() &&
        /^[a-z0-9_.-]+$/i.test(item.id),
    ),
    'Invalid source mapping closure',
  );
  assert.equal(
    config,
    createConfig(root, closure),
    'NuGet config/source mapping/fallback changed',
  );
}

/** Validates evaluated compilation, resolved references, and build import provenance. */
export function validateEvaluation(evaluation, root, repository, sdk, role) {
  const items = evaluation.Items ?? {},
    properties = evaluation.Properties ?? {};
  assert.equal(
    (items.ProjectReference ?? []).length,
    0,
    'Project reference fallback is forbidden',
  );
  assert.ok(
    (items.Compile ?? []).length > 0,
    'Missing evaluated compile items',
  );
  for (const item of items.Compile ?? [])
    assert.ok(
      (
        role?.compile ?? [
          'app/Program.cs',
          'app/obj/Release/net10.0/Consumer.GlobalUsings.g.cs',
        ]
      ).some((file) => item.FullPath === path.join(root, file)),
      `Compile path escape: ${item.FullPath}`,
    );
  for (const item of items.Reference ?? [])
    assert.ok(
      (item.NuGetSourceType === 'Package' &&
        within(
          path.join(
            root,
            'packages',
            (item.NuGetPackageId ?? '').toLowerCase(),
            (item.NuGetPackageVersion ?? '').toLowerCase(),
          ),
          item.FullPath,
        )) ||
        (['Microsoft.NETCore.App', 'Microsoft.AspNetCore.App'].includes(
          item.FrameworkReferenceName,
        ) &&
          within(path.join(sdk, 'packs'), item.FullPath)),
      'Explicit assembly reference/HintPath is forbidden',
    );
  for (const item of [
    ...(items.Reference ?? []),
    ...(items.ReferencePath ?? []),
  ]) {
    const file = item.HintPath || item.FullPath || item.Identity;
    assert.ok(
      file &&
        !within(repository, file) &&
        (within(root, file) || within(sdk, file)),
      `Reference or HintPath escape: ${file}`,
    );
  }
  for (const name of [
    'RestoreFallbackFolders',
    'RestoreAdditionalProjectSources',
    'RestoreAdditionalProjectFallbackFolders',
  ])
    assert.ok(!properties[name], `Restore fallback property: ${name}`);
  const allowedImport = (file) =>
    within(sdk, file) ||
    within(path.join(root, 'packages'), file) ||
    [
      `${role?.directory ?? 'app'}/Consumer.csproj`,
      `${role?.directory ?? 'app'}/obj/Consumer.csproj.nuget.g.props`,
      `${role?.directory ?? 'app'}/obj/Consumer.csproj.nuget.g.targets`,
    ].some((relative) => file === path.join(root, relative));
  for (const file of [
    ...(properties.MSBuildAllProjects ?? '').split(';').filter(Boolean),
    ...(evaluation.Imports ?? []),
  ])
    assert.ok(
      !within(repository, file) &&
        allowedImport(file) &&
        !/Directory\.(Build|Packages)\./i.test(file),
      `Build import escape: ${file}`,
    );
}

/** Requires only the exact candidate and approved package libraries from the owned local feeds. */
export function validateAssets(
  assets,
  root,
  identity,
  closure,
  candidateHash,
  directory = 'app',
) {
  const expected = Object.fromEntries([
    ...closure.map((item) => [`${item.id}/${item.version}`, item.contentHash]),
    [`${identity.id}/${identity.version}`, candidateHash],
  ]);
  assert.deepEqual(
    Object.keys(assets.libraries ?? {}).sort(),
    Object.keys(expected).sort(),
    'Assets candidate/package closure differs',
  );
  for (const [name, library] of Object.entries(assets.libraries)) {
    assert.equal(
      library.type,
      'package',
      `Assets project library forbidden: ${name}`,
    );
    assert.equal(
      library.sha512,
      expected[name],
      `Assets package hash differs: ${name}`,
    );
  }
  assert.deepEqual(
    Object.keys(assets.packageFolders).map((file) => path.resolve(file)),
    [path.join(root, 'packages')],
    'Assets package cache fallback',
  );
  assert.equal(
    assets.project.restore.projectPath,
    path.join(root, directory, 'Consumer.csproj'),
    'Stale assets project path',
  );
  assert.equal(
    assets.project.restore.packagesPath,
    path.join(root, 'packages'),
    'Assets package fallback',
  );
  assert.deepEqual(
    Object.keys(assets.project.restore.sources).sort(),
    [root + '/candidate-feed', root + '/dependency-feed'].sort(),
    'Assets source fallback',
  );
  assert.ok(
    !assets.project.restore.fallbackFolders?.length,
    'Assets fallback folders',
  );
  for (const libraries of Object.values(assets.targets))
    assert.ok(
      Object.values(libraries).every((item) => item.type === 'package'),
      'Assets target project library',
    );
}

/** Rejects escapes and symlinks in every path component before reading a file. */
export async function safeFile(root, relative) {
  assert.ok(
    relative &&
      !path.isAbsolute(relative) &&
      !relative.split(/[\\/]/).some((part) => part === '..' || part === '.'),
    'Relative file path escape',
  );
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    assert.ok(
      !(await fs.lstat(current)).isSymbolicLink(),
      `Symlink escape: ${current}`,
    );
  }
  assert.ok(
    within(await fs.realpath(root), await fs.realpath(current)),
    'Realpath escape',
  );
  return current;
}

/** Hashes a physical file using SHA-256 or an explicitly selected digest. */
export async function hashFile(file, algorithm = 'sha256', encoding = 'hex') {
  return createHash(algorithm)
    .update(await fs.readFile(file))
    .digest(encoding);
}

/** Captures immutable hashes of a reviewed relative file allowlist. */
export async function fingerprintFiles(root, files) {
  return Object.fromEntries(
    await Promise.all(
      [...files]
        .sort()
        .map(async (file) => [
          file,
          await hashFile(await safeFile(root, file)),
        ]),
    ),
  );
}

/** Recomputes hashes without modifying the trusted baseline. */
export async function verifyFiles(root, manifest) {
  for (const [file, digest] of Object.entries(manifest))
    assert.equal(
      await hashFile(await safeFile(root, file)),
      digest,
      `File hash changed: ${file}`,
    );
}

/** Reads metadata only after checking its separately anchored pointer digest. */
export async function readAnchoredMetadata(pointer) {
  assert.ok(
    path.isAbsolute(pointer.metadata) && /^[a-f0-9]{64}$/.test(pointer.sha256),
    'Invalid metadata anchor',
  );
  assert.ok(
    !(await fs.lstat(pointer.metadata)).isSymbolicLink(),
    'Metadata symlink escape',
  );
  assert.equal(
    await hashFile(pointer.metadata),
    pointer.sha256,
    'Metadata anchor hash differs',
  );
  return JSON.parse(await fs.readFile(pointer.metadata, 'utf8'));
}

/** Reads bounded NuGet ZIP entries directly with built-in ZIP/deflate primitives. */
export function readArchive(buffer) {
  assert.ok(buffer.length <= 64 * 1024 * 1024, 'Archive too large');
  let end = buffer.length - 22;
  while (
    end >= Math.max(0, buffer.length - 65558) &&
    buffer.readUInt32LE(end) !== 0x06054b50
  )
    end--;
  assert.ok(end >= 0, 'Missing ZIP directory');
  const count = buffer.readUInt16LE(end + 10),
    entries = {};
  let offset = buffer.readUInt32LE(end + 16),
    total = 0;
  for (let index = 0; index < count; index++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'Invalid ZIP entry');
    const method = buffer.readUInt16LE(offset + 10),
      compressed = buffer.readUInt32LE(offset + 20),
      size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28),
      extraLength = buffer.readUInt16LE(offset + 30),
      commentLength = buffer.readUInt16LE(offset + 32),
      local = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString();
    assert.ok(
      !path.isAbsolute(name) &&
        !name.includes('..') &&
        !name.includes('\\') &&
        !(name in entries),
      'Archive path escape/duplicate',
    );
    total += size;
    assert.ok(total <= 128 * 1024 * 1024, 'Expanded archive too large');
    const dataOffset =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(dataOffset, dataOffset + compressed);
    assert.ok(method === 0 || method === 8, 'Unsupported ZIP compression');
    entries[name] =
      method === 0 ? data : inflateRawSync(data, { maxOutputLength: size });
    assert.equal(entries[name].length, size, 'Archive entry size differs');
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Requires a repository signature and byte-identical complete unsigned package payloads. */
export function validatePublishedPayloads(
  published,
  qualified,
  identity,
  revision,
) {
  assert.ok(
    published['.signature.p7s']?.length,
    'Published archive signature missing',
  );
  assert.ok(!qualified['.signature.p7s'], 'Qualified archive must be unsigned');
  const names = Object.keys(published)
    .filter((name) => name !== '.signature.p7s')
    .sort();
  assert.deepEqual(
    names,
    Object.keys(qualified).sort(),
    'Published payload entry set differs',
  );
  for (const name of names)
    assert.ok(
      published[name].equals(qualified[name]),
      `Published payload differs: ${name}`,
    );
  for (const entries of [published, qualified]) {
    const nuspec = entries[identity.id + '.nuspec']?.toString();
    assert.ok(
      nuspec?.includes(`<id>${identity.id}</id>`) &&
        nuspec.includes(`<version>${identity.version}</version>`),
      'Archive candidate ID/version differs',
    );
    assert.ok(
      nuspec.includes(`commit="${revision}"`),
      'Archive repository revision differs',
    );
    assert.ok(
      entries[`lib/net10.0/${identity.id}.dll`]?.length,
      'Archive candidate DLL missing',
    );
  }
}

/** Cross-checks physical archive identity/revision and returns its actual implementation DLL. */
export function validateArchive(buffer, identity, revision) {
  const entries = readArchive(buffer);
  const nuspec = entries[identity.id + '.nuspec']?.toString();
  assert.ok(
    nuspec?.includes(`<id>${identity.id}</id>`) &&
      nuspec.includes(`<version>${identity.version}</version>`),
    'Archive candidate ID/version differs',
  );
  assert.ok(
    nuspec.includes(`commit="${revision}"`),
    'Archive repository revision differs',
  );
  const dll = entries[`lib/net10.0/${identity.id}.dll`];
  assert.ok(dll?.length, 'Archive candidate DLL missing');
  return dll;
}

/** Qualifies an existing immutable consumer before invoking any caller-owned effect. */
export async function verifyConsumer(pointer, effect) {
  const metadata = await readAnchoredMetadata(pointer);
  assertPackageRoles(metadata);
  assert.deepEqual(metadata.identity, IDENTITY, 'Candidate identity differs');
  assert.equal(
    await fs.realpath(metadata.root),
    metadata.root,
    'Consumer root realpath differs',
  );
  validateIsolation(metadata.root, metadata.repository);
  await validateAncestors(metadata.root);
  for (const file of [
    'Directory.Build.props',
    'Directory.Build.targets',
    'Directory.Packages.props',
  ]) {
    await fs.lstat(path.join(metadata.root, 'app', file)).then(
      () => {
        throw Error(`Forbidden inherited configuration: app/${file}`);
      },
      (error) => {
        if (error.code !== 'ENOENT') throw error;
      },
    );
  }
  await verifyFiles(metadata.root, metadata.files);
  validateSourceManifest(
    metadata.sources,
    await listSourceFiles(metadata.repository),
  );
  await verifyFiles(metadata.repository, metadata.sources);
  validateEnvironment(metadata.environment, metadata.root);
  validateConfig(
    await fs.readFile(path.join(metadata.root, 'NuGet.Config'), 'utf8'),
    metadata.root,
    metadata.closure,
  );
  const archive = await fs.readFile(
    await safeFile(metadata.root, metadata.archive),
  );
  assert.equal(
    createHash('sha256').update(archive).digest('hex'),
    metadata.sha256,
    'Archive SHA256 differs',
  );
  assert.equal(
    createHash('sha512').update(archive).digest('base64'),
    metadata.rawSha512 ?? metadata.sha512,
    'Archive SHA512 differs',
  );
  if (metadata.published) {
    const qualified = await fs.readFile(
      await safeFile(metadata.root, metadata.published.qualifiedArchive),
    );
    assert.equal(
      createHash('sha512').update(qualified).digest('base64'),
      metadata.sha512,
      'Qualified canonical hash differs',
    );
    validatePublishedPayloads(
      readArchive(archive),
      readArchive(qualified),
      metadata.identity,
      metadata.revision,
    );
  }
  const dll = validateArchive(archive, metadata.identity, metadata.revision);
  const digest = createHash('sha256').update(dll).digest('hex');
  assert.equal(
    await hashFile(
      path.join(
        metadata.root,
        'app/bin/Release/net10.0/Hashbrown.AspNetCore.dll',
      ),
    ),
    digest,
    'Output DLL is not candidate asset',
  );
  assert.equal(
    metadata.loaded.sha256,
    digest,
    'Loaded DLL is not candidate asset',
  );
  assert.equal(
    metadata.loaded.location,
    path.join(
      metadata.root,
      'app/bin/Release/net10.0/Hashbrown.AspNetCore.dll',
    ),
    'Loaded DLL location differs',
  );
  assert.ok(
    metadata.loaded.identity.startsWith(IDENTITY.id + ', Version='),
    'Loaded assembly identity differs',
  );
  await validateRestoredConsumer(
    metadata.root,
    metadata.identity,
    metadata.closure,
    metadata.sha512,
  );
  validateEvaluation(
    metadata.evaluation,
    metadata.root,
    metadata.repository,
    metadata.sdkRoot,
  );
  if (metadata.roles)
    for (const role of Object.values(metadata.roles)) {
      validateEvaluation(
        role.evaluation,
        metadata.root,
        metadata.repository,
        metadata.sdkRoot,
        role,
      );
      await verifyFiles(metadata.root, role.files);
      for (const [file, digest] of Object.entries({
        ...role.inputs,
        ...role.runtimeInputs,
      })) {
        assert.equal(await fs.realpath(file), file, 'Role input symlink');
        assert.equal(
          await hashFile(file),
          digest,
          'Role evaluated input changed',
        );
      }
    }
  if (effect) await effect(metadata);
  return metadata;
}

/** Requires the exact candidate range and every locked dependency hash/version. */
export function validateLock(lock, identity, closure, candidateHash) {
  assert.deepEqual(
    Object.keys(lock.dependencies),
    ['net10.0'],
    'Lock framework differs',
  );
  const dependencies = lock.dependencies['net10.0'];
  assert.deepEqual(
    Object.keys(dependencies).sort(),
    [identity.id, ...closure.map((item) => item.id)].sort(),
    'Lock package closure differs',
  );
  for (const item of [
    ...closure,
    { ...identity, contentHash: candidateHash },
  ]) {
    assert.equal(
      dependencies[item.id].resolved,
      item.version,
      `Lock version differs: ${item.id}`,
    );
    assert.equal(
      dependencies[item.id].contentHash,
      item.contentHash,
      `Lock hash differs: ${item.id}`,
    );
  }
  assert.equal(
    dependencies[identity.id].type,
    'Direct',
    'Candidate lock must be direct',
  );
  assert.equal(
    dependencies[identity.id].requested,
    `[${identity.version}, ${identity.version}]`,
    'Candidate lock range must be exact',
  );
}

/** Rejects workspace runtime libraries and requires the candidate implementation asset. */
export function validateDeps(deps, identity, closure) {
  const candidate = identity.id + '/' + identity.version;
  assert.deepEqual(
    Object.keys(deps.libraries).sort(),
    [
      'Consumer/1.0.0',
      candidate,
      ...closure.map((item) => item.id + '/' + item.version),
    ].sort(),
    'Runtime deps closure differs',
  );
  for (const [name, library] of Object.entries(deps.libraries))
    assert.equal(
      library.type,
      name === 'Consumer/1.0.0' ? 'project' : 'package',
      `Runtime deps library differs: ${name}`,
    );
  const target = deps.targets[deps.runtimeTarget.name];
  assert.ok(
    target?.[candidate]?.runtime?.['lib/net10.0/' + identity.id + '.dll'],
    'Runtime candidate DLL missing from deps',
  );
}

/** Binds NuGet extraction metadata to the exclusive physical feed and content digest. */
export function validateSourceMetadata(metadata, source, contentHash) {
  assert.equal(metadata.version, 2, 'NuGet source metadata version differs');
  assert.equal(metadata.source, source, 'NuGet source metadata fallback');
  assert.equal(metadata.contentHash, contentHash, 'NuGet source hash differs');
}

/** Checks candidate implementation bytes before the first application process or effect. */
export async function validateImplementation(candidateDll, output) {
  assert.equal(
    await fs.realpath(output),
    path.resolve(output),
    'Output DLL symlink/path escape',
  );
  assert.ok(
    !(await fs.lstat(output)).isSymbolicLink(),
    'Output DLL symlink escape',
  );
  assert.equal(
    await hashFile(output),
    createHash('sha256').update(candidateDll).digest('hex'),
    'Output DLL is not the candidate implementation',
  );
}

/** Checks restored asset, lock, runtime, and extraction provenance before application execution. */
export async function validateRestoredConsumer(
  root,
  identity,
  closure,
  candidateHash,
) {
  validateAssets(
    JSON.parse(
      await fs.readFile(path.join(root, 'app/obj/project.assets.json')),
    ),
    root,
    identity,
    closure,
    candidateHash,
  );
  validateLock(
    JSON.parse(await fs.readFile(path.join(root, 'app/packages.lock.json'))),
    identity,
    closure,
    candidateHash,
  );
  validateDeps(
    JSON.parse(
      await fs.readFile(
        path.join(root, 'app/bin/Release/net10.0/Consumer.deps.json'),
      ),
    ),
    identity,
    closure,
  );
  for (const item of [
    ...closure,
    { ...identity, contentHash: candidateHash },
  ]) {
    const extraction = JSON.parse(
      await fs.readFile(
        path.join(
          root,
          'packages',
          item.id.toLowerCase(),
          item.version.toLowerCase(),
          '.nupkg.metadata',
        ),
      ),
    );
    validateSourceMetadata(
      extraction,
      path.join(
        root,
        item.id === identity.id ? 'candidate-feed' : 'dependency-feed',
      ),
      item.contentHash,
    );
  }
}

/** Rejects source additions/removals as well as later content changes. */
export function validateSourceManifest(manifest, files) {
  assert.deepEqual(
    Object.keys(manifest).sort(),
    [...files].sort(),
    'Source file closure changed',
  );
}

/** Lists regular files recursively while rejecting links rather than silently following them. */
export async function listFiles(root, relative = '') {
  const files = [];
  for (const entry of await fs.readdir(path.join(root, relative), {
    withFileTypes: true,
  })) {
    assert.ok(
      !entry.isSymbolicLink(),
      `Symlink in consumer/source: ${entry.name}`,
    );
    const file = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(root, file)));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}

/** Lists the exact production/tooling source closure, excluding generated SDK output. */
export async function listSourceFiles(repository) {
  return [
    ...(await listFiles(path.join(repository, 'packages/dotnet')))
      .filter((file) => !/^(bin|obj|tools\/bin|tools\/obj)\//.test(file))
      .map((file) => 'packages/dotnet/' + file),
    ...(
      await listFiles(
        path.join(repository, 'tools/conformance/dotnet/nuget-consumer'),
      )
    ).map((file) => 'tools/conformance/dotnet/nuget-consumer/' + file),
    'LICENSE',
    'tools/conformance/dotnet/README.md',
    'tools/conformance/dotnet/verify-recipe.mjs',
    'tools/conformance/dotnet/verify-native-recipe.mjs',
    'tools/conformance/dotnet/native-recipe.test.mjs',
    'www/test/rehype-shiki.spec.ts',
    'www/content/docs/react/platform/dotnet.md',
    'www/content/docs/angular/platform/dotnet.md',
    'www/content/docs/react/platform/dotnet-native-tools.md',
    'www/content/docs/angular/platform/dotnet-native-tools.md',
    'tools/conformance/dotnet/project.json',
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
    'tools/conformance/dotnet/tests/nuget-consumer.spec.ts',
    'tools/conformance/dotnet/tests/dotnet-host.spec.ts',
    'tools/conformance/dotnet/tests/package-identities.spec.ts',
    'tools/conformance/dotnet/tests/package-upgrade.spec.ts',
    'tools/conformance/dotnet/tests/fixtures/pre-extraction-host.json',
    'tools/conformance/dotnet/Program.cs',
    'tools/conformance/dotnet/package.playwright.config.ts',
    'tools/conformance/dotnet/local-native-approval.playwright.config.ts',
    'tools/conformance/dotnet/dotnet.playwright.config.ts',
    'tools/conformance/dotnet/local-specs/native-approval.spec.ts',
    'tools/conformance/dotnet/tests/fixtures/package-identities.json',
    ...(
      await listFiles(path.join(repository, 'tools/conformance/dotnet/harness'))
    ).map((file) => 'tools/conformance/dotnet/harness/' + file),
    ...(
      await listFiles(path.join(repository, 'tools/conformance/dotnet/specs'))
    ).map((file) => 'tools/conformance/dotnet/specs/' + file),
    'tools/conformance/dotnet/tests/fixtures/live-approval-journal.cs.txt',
    ...(
      await listFiles(path.join(repository, 'tools/conformance/dotnet/Testing'))
    ).map((file) => 'tools/conformance/dotnet/Testing/' + file),
  ];
}
