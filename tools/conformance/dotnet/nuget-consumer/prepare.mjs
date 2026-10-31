import assert from 'node:assert/strict';
import { publishedArguments } from './run.mjs';
import { prepareRoles } from './roles.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  IDENTITY,
  buildEnvironment,
  validateEnvironment,
  validateIsolation,
  validateAncestors,
  createConfig,
  validateConfig,
  validateArchive,
  validatePublishedPayloads,
  readArchive,
  validateImplementation,
  validateAssets,
  validateEvaluation,
  listFiles,
  listSourceFiles,
  validateSourceManifest,
  fingerprintFiles,
  verifyFiles,
  hashFile,
  validateRestoredConsumer,
  verifyConsumer,
  acceptsSdk,
} from './verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../..');

/** Runs a bounded SDK command and retains its complete bounded output in owned diagnostics. */
export async function run(
  command,
  args,
  cwd,
  environment,
  log,
  expectedFailure = false,
) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
    killSignal: 'SIGKILL',
  });
  await fs.writeFile(
    log,
    JSON.stringify({
      command,
      args,
      cwd,
      status: result.status,
      signal: result.signal,
      error: result.error?.message,
    }) +
      '\n' +
      (result.stdout ?? '') +
      (result.stderr ?? ''),
  );
  if (
    result.error ||
    (expectedFailure ? result.status === 0 : result.status !== 0)
  )
    throw Error(
      `Consumer command ${expectedFailure ? 'unexpectedly succeeded' : 'failed'}: ${log}`,
    );
  return result.stdout;
}

/** Stages only hash-verified third-party nupkgs; the candidate can never come from a shared cache. */
export async function stageDependencies(
  seedPaths,
  destination,
  closure,
  hashes,
) {
  for (const item of closure) {
    assert.notEqual(
      item.id.toLowerCase(),
      IDENTITY.id.toLowerCase(),
      'Candidate cannot be seeded from cache',
    );
    const name = `${item.id.toLowerCase()}.${item.version.toLowerCase()}.nupkg`;
    const source = seedPaths[closure.indexOf(item)];
    assert.equal(
      hashes[source].contentHash,
      item.contentHash,
      `Third-party cache hash differs: ${item.id}`,
    );
    const staged = path.join(destination, name);
    await fs.copyFile(source, staged, fs.constants.COPYFILE_EXCL);
    assert.equal(
      await hashFile(staged),
      hashes[source].rawSha256,
      'Seed archive changed during staging',
    );
  }
}

/** Writes a usable forbidden-cache sentinel with the SDK canonical content hash. */
export async function writeRestoreSentinel(
  sentinel,
  candidate,
  source,
  contentHash,
) {
  assert.match(
    contentHash,
    /^[A-Za-z0-9+/]{86}==$/,
    'Canonical sentinel hash required',
  );
  await fs.mkdir(sentinel, { recursive: true });
  await fs.copyFile(
    candidate,
    path.join(sentinel, path.basename(candidate).toLowerCase()),
  );
  for (const [entry, bytes] of Object.entries(
    readArchive(await fs.readFile(candidate)),
  )) {
    if (entry.endsWith('/')) continue;
    const destination = path.join(
      sentinel,
      entry.endsWith('.nuspec') ? entry.toLowerCase() : entry,
    );
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  }
  await fs.writeFile(
    path.join(sentinel, '.nupkg.metadata'),
    JSON.stringify({
      version: 2,
      contentHash,
      source,
    }),
  );
  await fs.writeFile(
    path.join(
      sentinel,
      `${IDENTITY.id.toLowerCase()}.${IDENTITY.version}.nupkg.sha512`,
    ),
    await hashFile(candidate, 'sha512', 'base64'),
  );
}

/** Proves an actual restore cannot discover a fake matching package in an inherited global cache. */
export async function proveRestoreFailure(
  root,
  environment,
  candidate,
  config,
  candidateHash,
) {
  const negative = path.join(root, 'restore-negative');
  await fs.mkdir(negative);
  await fs.mkdir(path.join(negative, 'app'));
  await fs.mkdir(path.join(negative, 'candidate-feed'));
  await fs.cp(
    path.join(root, 'dependency-feed'),
    path.join(negative, 'dependency-feed'),
    { recursive: true },
  );
  await fs.copyFile(
    path.join(root, 'global.json'),
    path.join(negative, 'global.json'),
  );
  await fs.copyFile(
    path.join(root, 'app/Consumer.csproj'),
    path.join(negative, 'app/Consumer.csproj'),
  );
  const sentinel = path.join(
    negative,
    'forbidden-global-cache',
    IDENTITY.id.toLowerCase(),
    IDENTITY.version,
  );
  await writeRestoreSentinel(
    sentinel,
    candidate,
    path.join(negative, 'candidate-feed'),
    candidateHash,
  );
  const removedCandidate = path.join(
    negative,
    'candidate-feed',
    path.basename(candidate),
  );
  await fs.copyFile(candidate, removedCandidate);
  await fs.rm(removedCandidate);
  const negativeConfig = config.replaceAll(root, negative);
  await fs.writeFile(path.join(negative, 'NuGet.Config'), negativeConfig);
  const injected = {
    ...environment,
    NUGET_PACKAGES: path.dirname(path.dirname(sentinel)),
    RestoreSources: path.join(root, 'candidate-feed'),
    RestoreFallbackFolders: path.dirname(path.dirname(sentinel)),
    OPENAI_API_KEY: 'forbidden-canary',
  };
  const controlled = buildEnvironment(injected, negative);
  validateEnvironment(controlled, negative);
  for (const directory of ['home', 'packages', 'http', 'plugins'])
    await fs.mkdir(path.join(negative, directory));
  await run(
    'dotnet',
    [
      'restore',
      'app/Consumer.csproj',
      '--configfile',
      'NuGet.Config',
      '--packages',
      path.dirname(path.dirname(sentinel)),
      '--no-http-cache',
      '--force',
      '-p:NuGetAudit=false',
    ],
    negative,
    controlled,
    path.join(root, 'logs/restore-sentinel-positive.log'),
  );
  assert.ok(
    (
      await fs.stat(path.join(sentinel, 'lib/net10.0/Hashbrown.AspNetCore.dll'))
    ).isFile(),
    'Sentinel must be a usable installed candidate',
  );
  await fs.rm(path.join(negative, 'app/obj'), { recursive: true, force: true });
  assert.deepEqual(
    await fs.readdir(path.join(negative, 'packages')),
    [],
    'Negative restore requires a fresh empty cache',
  );
  const output = await run(
    'dotnet',
    [
      'restore',
      'app/Consumer.csproj',
      '--configfile',
      'NuGet.Config',
      '--no-http-cache',
      '--force',
      '-p:NuGetAudit=false',
    ],
    negative,
    controlled,
    path.join(root, 'logs/restore-negative.log'),
    true,
  );
  assert.match(
    output,
    /NU1101|NU1102/,
    'Actual negative restore must report missing candidate',
  );
  assert.ok(
    output.includes(IDENTITY.id),
    'Negative restore must identify missing candidate',
  );
  assert.equal(
    await hashFile(path.join(sentinel, path.basename(candidate).toLowerCase())),
    await hashFile(candidate),
    'Forbidden cache sentinel changed',
  );
  return {
    status: 'rejected',
    sentinel,
    freshCache: path.join(negative, 'packages'),
    log: 'logs/restore-negative.log',
  };
}

/** Stages public bytes after SDK trust, NuGet.org identity, payload, and canonical-hash checks. */
export async function stagePublishedCandidate(
  root,
  imported,
  identity,
  revision,
  hashDirectory,
  environment,
  execute = run,
) {
  publishedArguments(imported);
  const publicBytes = await fs.readFile(imported.publishedArchive);
  const qualifiedBytes = await fs.readFile(imported.qualifiedArchive);
  validatePublishedPayloads(
    readArchive(publicBytes),
    readArchive(qualifiedBytes),
    identity,
    revision,
  );
  const archivePath = path.join(
    root,
    'candidate-feed',
    `${identity.id}.${identity.version}.nupkg`,
  );
  await fs.writeFile(archivePath, publicBytes, { flag: 'wx' });
  const qualifiedArchive = 'qualified.nupkg';
  await fs.writeFile(path.join(root, qualifiedArchive), qualifiedBytes, {
    flag: 'wx',
  });
  await execute(
    'dotnet',
    ['nuget', 'verify', '--all', archivePath],
    root,
    environment,
    path.join(root, 'logs/published-signature.log'),
  );
  const hashes = JSON.parse(
    (
      await execute(
        'dotnet',
        [
          path.join(hashDirectory, 'bin/Release/net10.0/PackageHash.dll'),
          '--published-archive',
          archivePath,
          path.join(root, qualifiedArchive),
        ],
        root,
        environment,
        path.join(root, 'logs/published-hashes.log'),
      )
    )
      .trim()
      .split('\n')
      .at(-1),
  );
  assert.equal(
    hashes[archivePath].repositorySignatureUrl,
    'https://api.nuget.org/v3/index.json',
    'Published repository signature differs',
  );
  assert.equal(
    hashes[archivePath].contentHash,
    hashes[path.join(root, qualifiedArchive)].contentHash,
    'Published canonical hash differs',
  );
  assert.equal(
    hashes[path.join(root, qualifiedArchive)].contentHash,
    await hashFile(path.join(root, qualifiedArchive), 'sha512', 'base64'),
    'Unsigned canonical hash differs',
  );
  const symbols = await fs.readFile(
    imported.qualifiedArchive.replace(/\.nupkg$/, '.snupkg'),
  );
  const symbolEntries = readArchive(symbols);
  const nuspec = symbolEntries[identity.id + '.nuspec']?.toString();
  assert.ok(
    symbolEntries[`lib/net10.0/${identity.id}.pdb`]?.length,
    'Qualified portable symbols missing',
  );
  assert.ok(
    nuspec?.includes(`<id>${identity.id}</id>`) &&
      nuspec.includes(`<version>${identity.version}</version>`) &&
      nuspec.includes(`commit="${revision}"`),
    'Qualified symbols identity/revision differs',
  );
  await fs.writeFile(
    path.join(
      root,
      'candidate-feed',
      `${identity.id}.${identity.version}.snupkg`,
    ),
    symbols,
    { flag: 'wx' },
  );
  return {
    qualifiedArchive,
    signatureVerification: 'passed',
    signatureLog: 'logs/published-signature.log',
    repositorySignatureUrl: 'https://api.nuget.org/v3/index.json',
    payloadEquality: 'passed',
    canonicalHash: hashes[archivePath].contentHash,
  };
}

/** Prepares one source-packed or verified public candidate and anchors its external PackageReference proof. */
export async function prepareConsumer(pointerPath, imported = {}) {
  publishedArguments(imported);
  assert.ok(
    path.isAbsolute(pointerPath),
    '--metadata must be an absolute pointer path',
  );
  const root = await fs.realpath(
    await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), 'hashbrown-nuget-consumer-'),
    ),
  );
  try {
    validateIsolation(root, repository);
    await validateAncestors(root);
    for (const directory of [
      'app',
      'candidate-feed',
      'dependency-feed',
      'home',
      'packages',
      'http',
      'plugins',
      'logs',
      'pack-obj',
      'pack-bin',
    ])
      await fs.mkdir(path.join(root, directory));
    const environment = buildEnvironment(process.env, root);
    validateEnvironment(environment, root);
    const sourceFiles = await listSourceFiles(repository);
    const sources = await fingerprintFiles(repository, sourceFiles);
    const revision = (
      await run(
        'git',
        ['rev-parse', 'HEAD'],
        repository,
        environment,
        path.join(root, 'logs/revision.log'),
      )
    ).trim();
    const sdkVersion = (
      await run(
        'dotnet',
        ['--version'],
        path.join(repository, 'packages/dotnet'),
        environment,
        path.join(root, 'logs/sdk.log'),
      )
    ).trim();
    assert.ok(acceptsSdk(sdkVersion, IDENTITY.sdk), 'Unexpected SDK');
    const sdkInfo = await run(
      'dotnet',
      ['--list-sdks'],
      root,
      environment,
      path.join(root, 'logs/sdk-roots.log'),
    );
    const sdkDirectory = sdkInfo
      .split('\n')
      .find((line) => line.startsWith(sdkVersion + ' '))
      ?.match(/\[(.+)\]/)?.[1];
    assert.ok(sdkDirectory, 'SDK install path missing');
    const sdkRoot = await fs.realpath(path.dirname(sdkDirectory));
    const projectText = await fs.readFile(
      path.join(repository, 'packages/dotnet/Hashbrown.AspNetCore.csproj'),
      'utf8',
    );
    assert.ok(
      projectText.includes(`<PackageId>${IDENTITY.id}</PackageId>`) &&
        projectText.includes(`<Version>${IDENTITY.version}</Version>`),
      'Source package identity differs',
    );
    const reviewed = JSON.parse(
      await fs.readFile(
        path.join(repository, 'packages/dotnet/packages.lock.json'),
      ),
    );
    const closure = Object.entries(reviewed.dependencies['net10.0']).map(
      ([id, dependency]) => ({
        id,
        version: dependency.resolved,
        contentHash: dependency.contentHash,
      }),
    );
    assert.equal(closure.length, 28, 'Reviewed dependency closure differs');
    const config = createConfig(root, closure);
    validateConfig(config, root, closure);
    await fs.writeFile(path.join(root, 'NuGet.Config'), config);
    await fs.copyFile(
      path.join(repository, 'packages/dotnet/global.json'),
      path.join(root, 'global.json'),
    );
    const cache = process.env.NUGET_PACKAGES;
    assert.ok(
      !cache || path.isAbsolute(cache),
      'Optional seed cache must be absolute',
    );
    const hashDirectory = path.join(root, 'package-hash');
    await fs.mkdir(hashDirectory);
    await fs.copyFile(
      path.join(here, 'templates/package-hash.cs'),
      path.join(hashDirectory, 'Program.cs'),
    );
    await fs.writeFile(
      path.join(hashDirectory, 'PackageHash.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><OutputType>Exe</OutputType><ImplicitUsings>enable</ImplicitUsings><NuGetAudit>false</NuGetAudit></PropertyGroup><ItemGroup><Reference Include="$(MSBuildSDKsPath)/../NuGet.*.dll" /><Reference Include="$(MSBuildSDKsPath)/../System.Security.Cryptography.Pkcs.dll" /><Reference Include="$(MSBuildSDKsPath)/../Newtonsoft.Json.dll" /></ItemGroup></Project>',
    );
    await run(
      'dotnet',
      [
        'build',
        'package-hash/PackageHash.csproj',
        '--configfile',
        'NuGet.Config',
        '-c',
        'Release',
      ],
      root,
      environment,
      path.join(root, 'logs/package-hash-build.log'),
    );
    const seedDirectory = path.join(root, 'seed-downloads');
    await fs.mkdir(seedDirectory);
    const seedPaths = [];
    for (const item of closure) {
      const name = `${item.id.toLowerCase()}.${item.version.toLowerCase()}.nupkg`;
      const cached =
        cache &&
        path.join(
          cache,
          item.id.toLowerCase(),
          item.version.toLowerCase(),
          name,
        );
      if (
        cached &&
        (await fs.stat(cached).then(
          (stat) => stat.isFile(),
          () => false,
        ))
      )
        seedPaths.push(cached);
      else {
        const url = `https://api.nuget.org/v3-flatcontainer/${item.id.toLowerCase()}/${item.version.toLowerCase()}/${name}`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30_000),
          redirect: 'error',
          credentials: 'omit',
        });
        assert.equal(
          response.status,
          200,
          `Approved dependency download failed: ${item.id}`,
        );
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          assert.ok(
            size <= 64 * 1024 * 1024,
            'Dependency download exceeds bound',
          );
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        const destination = path.join(seedDirectory, name);
        await fs.writeFile(destination, bytes, { flag: 'wx' });
        seedPaths.push(destination);
      }
    }
    const hashOutput = await run(
      'dotnet',
      [
        path.join(hashDirectory, 'bin/Release/net10.0/PackageHash.dll'),
        ...seedPaths,
      ],
      root,
      environment,
      path.join(root, 'logs/package-hashes.log'),
    );
    const seedHashes = JSON.parse(hashOutput.trim().split('\n').at(-1));
    await stageDependencies(
      seedPaths,
      path.join(root, 'dependency-feed'),
      closure,
      seedHashes,
    );
    let published;
    if (imported.publishedArchive) {
      published = await stagePublishedCandidate(
        root,
        imported,
        IDENTITY,
        revision,
        hashDirectory,
        environment,
      );
    } else {
      await fs.copyFile(
        path.join(repository, 'packages/dotnet/packages.lock.json'),
        path.join(root, 'source.lock.json'),
      );
      const properties = [
        `-p:BaseIntermediateOutputPath=${root}/pack-obj/`,
        `-p:MSBuildProjectExtensionsPath=${root}/pack-obj/`,
        `-p:BaseOutputPath=${root}/pack-bin/`,
        `-p:NuGetLockFilePath=${root}/source.lock.json`,
        '-p:NuGetAudit=false',
        '-p:ImportDirectoryBuildProps=false',
        '-p:ImportDirectoryBuildTargets=false',
      ];
      const sourceProject = path.join(
        repository,
        'packages/dotnet/Hashbrown.AspNetCore.csproj',
      );
      await run(
        'dotnet',
        [
          'restore',
          sourceProject,
          '--locked-mode',
          '--configfile',
          path.join(root, 'NuGet.Config'),
          ...properties,
        ],
        root,
        environment,
        path.join(root, 'logs/source-restore.log'),
      );
      await run(
        'dotnet',
        [
          'pack',
          sourceProject,
          '--no-restore',
          '-c',
          'Release',
          ...properties,
          `-p:PackageOutputPath=${root}/candidate-feed`,
          `-p:RepositoryCommit=${revision}`,
          `-p:SourceRevisionId=${revision}`,
        ],
        root,
        environment,
        path.join(root, 'logs/pack.log'),
      );
    }
    const archive = `candidate-feed/${IDENTITY.id}.${IDENTITY.version}.nupkg`;
    const archivePath = path.join(root, archive);
    validateArchive(await fs.readFile(archivePath), IDENTITY, revision);
    await fs.copyFile(
      path.join(here, 'templates/Consumer.csproj.txt'),
      path.join(root, 'app/Consumer.csproj'),
    );
    await fs.copyFile(
      path.join(here, 'templates/public-smoke.cs'),
      path.join(root, 'app/Program.cs'),
    );
    // This destructive missing-feed experiment owns a separate root/cache. The valid consumer is restored afterward for the first time.
    const rawSha512 = await hashFile(archivePath, 'sha512', 'base64');
    const sha512 = published?.canonicalHash ?? rawSha512;
    const restoreNegative = await proveRestoreFailure(
      root,
      environment,
      archivePath,
      config,
      sha512,
    );
    await run(
      'dotnet',
      [
        'restore',
        'app/Consumer.csproj',
        '--configfile',
        'NuGet.Config',
        '--use-lock-file',
        '--no-http-cache',
      ],
      root,
      environment,
      path.join(root, 'logs/consumer-restore.log'),
    );
    validateAssets(
      JSON.parse(
        await fs.readFile(path.join(root, 'app/obj/project.assets.json')),
      ),
      root,
      IDENTITY,
      closure,
      sha512,
    );
    const lock = JSON.parse(
      await fs.readFile(path.join(root, 'app/packages.lock.json')),
    );
    assert.equal(
      lock.dependencies['net10.0'][IDENTITY.id].resolved,
      IDENTITY.version,
      'Candidate lock identity differs',
    );
    assert.equal(
      lock.dependencies['net10.0'][IDENTITY.id].contentHash,
      sha512,
      'Candidate lock hash differs',
    );
    await run(
      'dotnet',
      [
        'restore',
        'app/Consumer.csproj',
        '--configfile',
        'NuGet.Config',
        '--locked-mode',
        '--no-http-cache',
      ],
      root,
      environment,
      path.join(root, 'logs/consumer-locked-restore.log'),
    );
    await run(
      'dotnet',
      ['build', 'app/Consumer.csproj', '--no-restore', '-c', 'Release'],
      root,
      environment,
      path.join(root, 'logs/consumer-build.log'),
    );
    await validateImplementation(
      validateArchive(await fs.readFile(archivePath), IDENTITY, revision),
      path.join(root, 'app/bin/Release/net10.0/Hashbrown.AspNetCore.dll'),
    );
    await validateRestoredConsumer(root, IDENTITY, closure, sha512);
    const apiDirectory = path.join(root, 'api-tool');
    await fs.mkdir(apiDirectory);
    for (const file of ['ApiSnapshot.csproj', 'Program.cs'])
      await fs.copyFile(
        path.join(repository, 'packages/dotnet/tools', file),
        path.join(apiDirectory, file),
      );
    await run(
      'dotnet',
      [
        'build',
        'api-tool/ApiSnapshot.csproj',
        '-c',
        'Release',
        '--configfile',
        path.join(root, 'NuGet.Config'),
      ],
      root,
      environment,
      path.join(root, 'logs/api-build.log'),
    );
    await run(
      'dotnet',
      [
        path.join(root, 'api-tool/bin/Release/net10.0/ApiSnapshot.dll'),
        path.join(root, 'app/bin/Release/net10.0/Hashbrown.AspNetCore.dll'),
        IDENTITY.id,
        path.join(root, 'public-api.json'),
        path.join(
          root,
          'packages/hashbrown.aspnetcore',
          IDENTITY.version,
          'lib/net10.0/Hashbrown.AspNetCore.xml',
        ),
      ],
      root,
      environment,
      path.join(root, 'logs/api-check.log'),
    );
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(root, 'public-api.json'))),
      JSON.parse(
        await fs.readFile(
          path.join(repository, 'packages/dotnet/api/public-api.json'),
        ),
      ),
      'Actual package public API differs from reviewed original assembly baseline',
    );
    const evaluated = await run(
      'dotnet',
      [
        'msbuild',
        'app/Consumer.csproj',
        '-t:ResolveReferences',
        '-p:Configuration=Release',
        '-getItem:Compile,ProjectReference,Reference,ReferencePath,PackageReference',
        '-getProperty:MSBuildAllProjects,RestoreFallbackFolders,RestoreAdditionalProjectSources,RestoreAdditionalProjectFallbackFolders,RestoreSources',
      ],
      root,
      environment,
      path.join(root, 'logs/evaluation.log'),
    );
    const evaluation = JSON.parse(evaluated.slice(evaluated.indexOf('{')));
    await run(
      'dotnet',
      [
        'msbuild',
        'app/Consumer.csproj',
        '-p:Configuration=Release',
        `-preprocess:${root}/evaluated.xml`,
      ],
      root,
      environment,
      path.join(root, 'logs/preprocess.log'),
    );
    const preprocessed = await fs.readFile(
      path.join(root, 'evaluated.xml'),
      'utf8',
    );
    evaluation.Imports = [
      ...preprocessed.matchAll(/^\s*(\/[^\r\n]+\.(?:props|targets))\s*$/gm),
    ].map((match) => match[1].trim());
    // SDK may spell /tmp while macOS realpath spells /private/tmp; compare physical origins.
    for (const name of [
      'Compile',
      'Reference',
      'ReferencePath',
      'ProjectReference',
    ])
      for (const item of evaluation.Items[name] ?? [])
        for (const key of ['FullPath', 'HintPath', 'Identity'])
          if (item[key] && path.isAbsolute(item[key]))
            item[key] = await fs.realpath(item[key]);
    evaluation.Properties.MSBuildAllProjects = (
      await Promise.all(
        evaluation.Properties.MSBuildAllProjects.split(';')
          .filter(Boolean)
          .map((file) => fs.realpath(file)),
      )
    ).join(';');
    evaluation.Imports = await Promise.all(
      evaluation.Imports.map((file) => fs.realpath(file)),
    );
    validateEvaluation(evaluation, root, repository, sdkRoot);
    await fs.writeFile(
      path.join(root, 'evaluation.json'),
      JSON.stringify(evaluation, null, 2),
    );
    const runtime = await run(
      'dotnet',
      [path.join(root, 'app/bin/Release/net10.0/Consumer.dll')],
      root,
      environment,
      path.join(root, 'logs/public-smoke.log'),
    );
    const loaded = JSON.parse(runtime.trim().split('\n').at(-1));
    assert.equal(loaded.effects, 1, 'Public smoke protected effects differ');
    await fs.writeFile(
      path.join(root, 'loaded.json'),
      JSON.stringify(loaded, null, 2),
    );
    // Deliberately name a genuinely internal implementation, then ask the actual compiler to reject it in a separate project.
    const internalDirectory = path.join(root, 'internal-negative');
    await fs.mkdir(internalDirectory);
    await fs.copyFile(
      path.join(root, 'app/Consumer.csproj'),
      path.join(internalDirectory, 'Consumer.csproj'),
    );
    await fs.writeFile(
      path.join(internalDirectory, 'Program.cs'),
      'using Hashbrown.AspNetCore;\nSystem.Console.WriteLine(typeof(InterruptValidation));\n',
    );
    const internalFailure = await run(
      'dotnet',
      [
        'build',
        'internal-negative/Consumer.csproj',
        '--configfile',
        'NuGet.Config',
        '-c',
        'Release',
      ],
      root,
      environment,
      path.join(root, 'logs/internal-negative.log'),
      true,
    );
    assert.match(
      internalFailure,
      /CS0122.*InterruptValidation|InterruptValidation.*CS0122/,
      'Internal compile must fail for inaccessible implementation',
    );
    const roles = await prepareRoles(
      root,
      repository,
      environment,
      closure,
      sha512,
      sdkRoot,
      run,
    );
    const rootFiles = (await listFiles(root)).filter(
      (file) =>
        !file.startsWith('logs/') &&
        !file.startsWith('restore-negative/') &&
        !file.startsWith('internal-negative/') &&
        !file.startsWith('home/') &&
        !file.startsWith('http/') &&
        !file.startsWith('plugins/'),
    );
    validateSourceManifest(sources, await listSourceFiles(repository));
    await verifyFiles(repository, sources);
    const metadata = {
      schema: 1,
      root,
      repository,
      identity: IDENTITY,
      revision,
      sdkRoot,
      archive,
      sha256: await hashFile(archivePath),
      sha512,
      ...(published ? { rawSha512, published } : {}),
      closure,
      seeds: seedPaths.map((file, index) => ({
        ...closure[index],
        ...seedHashes[file],
      })),
      environment,
      evaluation,
      roles,
      loaded,
      restoreNegative,
      files: await fingerprintFiles(root, rootFiles),
      sources,
      sourceTrees: [
        {
          directory: 'packages/dotnet',
          exclude: ['bin/', 'obj/', 'tools/bin/', 'tools/obj/'],
        },
        ...['nuget-consumer', 'Testing', 'harness', 'specs'].map((name) => ({
          directory: 'tools/conformance/dotnet/' + name,
          exclude: [],
        })),
      ],
    };
    const metadataPath = path.join(root, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), {
      flag: 'wx',
      mode: 0o444,
    });
    const pointer = {
      metadata: metadataPath,
      sha256: await hashFile(metadataPath),
    };
    await verifyConsumer(pointer);
    await fs.mkdir(path.dirname(pointerPath), { recursive: true });
    await fs.writeFile(pointerPath, JSON.stringify(pointer, null, 2) + '\n');
    await fs.writeFile(
      pointerPath + '.sha256',
      createHash('sha256')
        .update(await fs.readFile(pointerPath))
        .digest('hex') + '\n',
    );
    return {
      metadata: pointer.metadata,
      metadataSha256: pointer.sha256,
      root,
      candidate: archivePath,
      sha256: metadata.sha256,
      sha512,
      revision,
    };
  } catch (error) {
    throw Error(`${error.message}\nRetained failed preparation: ${root}`, {
      cause: error,
    });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const index = process.argv.indexOf('--metadata');
  const pointerPath =
    index >= 0
      ? process.argv[index + 1]
      : process.argv
          .find((arg) => arg.startsWith('--metadata='))
          ?.slice('--metadata='.length);
  try {
    assert.equal(
      process.argv.includes('--published-archive'),
      process.argv.includes('--qualified-archive'),
      'Both archive arguments required',
    );
    console.log(
      JSON.stringify(
        await prepareConsumer(
          pointerPath,
          process.argv.includes('--published-archive') ||
            process.argv.includes('--qualified-archive')
            ? {
                publishedArchive:
                  process.argv[process.argv.indexOf('--published-archive') + 1],
                qualifiedArchive:
                  process.argv[process.argv.indexOf('--qualified-archive') + 1],
              }
            : {},
        ),
      ),
    );
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
