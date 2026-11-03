import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  fingerprintFiles,
  listFiles,
  validateEvaluation,
  validateAssets,
  validateLock,
  validateDeps,
  validateImplementation,
  hashFile,
  IDENTITY,
} from './verify.mjs';

/** Reviewed application-only sources. Integration implementation is supplied solely by PackageReference. */
export const TESTING = [
  'FixtureAcknowledgement.cs',
  'FixtureAuthenticationHandler.cs',
  'FixtureCaptureGate.cs',
  'FixtureCandidateResultEvidence.cs',
  'FixtureClock.cs',
  'FixtureIntegrationReflection.cs',
  'FixtureInterruptStore.cs',
  'FixtureLiveApprovalProof.cs',
  'FixtureLiveCleanup.cs',
  'FixtureLiveGate.cs',
  'FixtureLiveHttpHandler.cs',
  'FixtureLiveModelClient.cs',
  'FixtureNativeGate.cs',
  'FixtureNativeJournal.cs',
  'FixtureNativeRecoveryControls.cs',
  'FixturePackageIdentity.cs',
  'FixtureProgressClient.cs',
  'FixtureRecoveryControls.cs',
  'FixtureRetentionControls.cs',
  'FixtureServerIdentityControls.cs',
  'FixtureTools.cs',
];

/** Selects the highest numeric stable patch matching the approved generated net10.0 target. */
export function selectRuntime(runtimeList, name, targetFramework) {
  const target = targetFramework.match(/^net(10)\.(0)$/);
  assert.ok(target, 'Approved net10.0 target framework required');
  const candidates = runtimeList
    .split('\n')
    .map((line) => line.trim().match(/^([^ ]+) ([^ ]+) \[(.+)\]$/))
    .filter((match) => {
      if (!match || match[1] !== name) return false;
      const version = match[2].match(
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
      );
      return (
        version &&
        version.slice(1).every((part) => Number.isSafeInteger(Number(part))) &&
        Number(version[1]) === Number(target[1]) &&
        Number(version[2]) === Number(target[2])
      );
    });
  const match = candidates.reduce(
    (best, current) =>
      !best || Number(current[2].split('.')[2]) > Number(best[2].split('.')[2])
        ? current
        : best,
    undefined,
  );
  assert.ok(
    match,
    `Required ${targetFramework} shared runtime missing: ${name}`,
  );
  return match;
}

/** Builds the two reviewed application roles once in the external candidate root. */
export async function prepareRoles(
  root,
  repository,
  environment,
  closure,
  sha512,
  sdkRoot,
  run,
) {
  const template = await fs.readFile(
    path.join(
      repository,
      'tools/conformance/dotnet/nuget-consumer/templates/Consumer.csproj.txt',
    ),
    'utf8',
  );
  const targetFramework = template.match(
    /<TargetFramework>(net10[.]0)<\/TargetFramework>/,
  )?.[1];
  assert.ok(targetFramework, 'Approved net10.0 target framework required');
  const roles = {};
  const runtimeList = await run(
    'dotnet',
    ['--list-runtimes'],
    root,
    environment,
    path.join(root, 'logs/role-runtimes.log'),
  );
  const runtimeInputs = {};
  const runtimeVersions = {};
  for (const name of ['Microsoft.NETCore.App', 'Microsoft.AspNetCore.App']) {
    const match = selectRuntime(runtimeList, name, targetFramework);
    const runtime = await fs.realpath(path.join(match[3], match[2]));
    assert.ok(runtime.startsWith(sdkRoot + '/shared/'), 'Runtime SDK escape');
    runtimeVersions[name] = match[2];
    for (const file of await listFiles(runtime))
      runtimeInputs[path.join(runtime, file)] = await hashFile(
        path.join(runtime, file),
      );
  }
  const runtimeTrees = [path.join(sdkRoot, 'host/fxr')];
  for (const directory of runtimeTrees)
    for (const file of await listFiles(directory))
      runtimeInputs[path.join(directory, file)] = await hashFile(
        path.join(directory, file),
      );
  const launcher = await fs.realpath(path.join(sdkRoot, 'dotnet'));
  runtimeInputs[launcher] = await hashFile(launcher);
  for (const [name, program] of Object.entries({
    fixture: 'Program.cs',
    probe: 'tests/fixtures/live-approval-journal.cs.txt',
  })) {
    const directory = `roles/${name}`;
    const absolute = path.join(root, directory);
    await fs.mkdir(path.join(absolute, 'Testing'), { recursive: true });
    const files = ['Program.cs', ...TESTING.map((file) => `Testing/${file}`)];
    await fs.copyFile(
      path.join(repository, 'tools/conformance/dotnet', program),
      path.join(absolute, 'Program.cs'),
    );
    for (const file of TESTING)
      await fs.copyFile(
        path.join(repository, 'tools/conformance/dotnet/Testing', file),
        path.join(absolute, 'Testing', file),
      );
    await fs.writeFile(
      path.join(absolute, 'Consumer.csproj'),
      template.replace(
        '<Compile Include="Program.cs" />',
        files.map((file) => `<Compile Include="${file}" />`).join('\n'),
      ),
    );
    for (const args of [
      [
        'restore',
        `${directory}/Consumer.csproj`,
        '--configfile',
        'NuGet.Config',
        '--use-lock-file',
        '--no-http-cache',
      ],
      [
        'restore',
        `${directory}/Consumer.csproj`,
        '--configfile',
        'NuGet.Config',
        '--locked-mode',
        '--no-http-cache',
      ],
      [
        'build',
        `${directory}/Consumer.csproj`,
        '--no-restore',
        '-c',
        'Release',
      ],
    ])
      await run(
        'dotnet',
        args,
        root,
        environment,
        path.join(
          root,
          `logs/${name}-${args[0]}${args.includes('--locked-mode') ? '-locked' : ''}.log`,
        ),
      );
    const runtimeConfig = path.join(
      absolute,
      'bin/Release/net10.0/Consumer.runtimeconfig.json',
    );
    const runtime = JSON.parse(await fs.readFile(runtimeConfig));
    assert.equal(
      runtime.runtimeOptions.tfm,
      targetFramework,
      'Generated target framework differs',
    );
    runtime.runtimeOptions.rollForward = 'Disable';
    for (const framework of runtime.runtimeOptions.frameworks)
      framework.version = runtimeVersions[framework.name];
    await fs.writeFile(runtimeConfig, JSON.stringify(runtime, null, 2));
    validateAssets(
      JSON.parse(
        await fs.readFile(path.join(absolute, 'obj/project.assets.json')),
      ),
      root,
      IDENTITY,
      closure,
      sha512,
      directory,
    );
    validateLock(
      JSON.parse(await fs.readFile(path.join(absolute, 'packages.lock.json'))),
      IDENTITY,
      closure,
      sha512,
    );
    validateDeps(
      JSON.parse(
        await fs.readFile(
          path.join(absolute, 'bin/Release/net10.0/Consumer.deps.json'),
        ),
      ),
      IDENTITY,
      closure,
    );
    await validateImplementation(
      await fs.readFile(
        path.join(root, 'app/bin/Release/net10.0/Hashbrown.AspNetCore.dll'),
      ),
      path.join(absolute, 'bin/Release/net10.0/Hashbrown.AspNetCore.dll'),
    );
    const output = await run(
      'dotnet',
      [
        'msbuild',
        `${directory}/Consumer.csproj`,
        '-t:ResolveReferences',
        '-p:Configuration=Release',
        '-getItem:Compile,ProjectReference,Reference,ReferencePath,PackageReference',
        '-getProperty:MSBuildAllProjects,RestoreFallbackFolders,RestoreAdditionalProjectSources,RestoreAdditionalProjectFallbackFolders,RestoreSources',
      ],
      root,
      environment,
      path.join(root, `logs/${name}-evaluation.log`),
    );
    const evaluation = JSON.parse(output.slice(output.indexOf('{')));
    await run(
      'dotnet',
      [
        'msbuild',
        `${directory}/Consumer.csproj`,
        '-p:Configuration=Release',
        `-preprocess:${absolute}/evaluated.xml`,
      ],
      root,
      environment,
      path.join(root, `logs/${name}-preprocess.log`),
    );
    evaluation.Imports = [
      ...(
        await fs.readFile(path.join(absolute, 'evaluated.xml'), 'utf8')
      ).matchAll(/^\s*(\/[^\r\n]+\.(?:props|targets))\s*$/gm),
    ].map((match) => match[1].trim());
    for (const items of [
      evaluation.Items.Compile,
      evaluation.Items.Reference,
      evaluation.Items.ReferencePath,
      evaluation.Items.ProjectReference,
    ])
      for (const item of items)
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
    const compile = [
      ...files,
      'obj/Release/net10.0/Consumer.GlobalUsings.g.cs',
    ].map((file) => `${directory}/${file}`);
    validateEvaluation(evaluation, root, repository, sdkRoot, {
      directory,
      launcher,
      runtimeInputs,
      runtimeTrees,
      compile,
    });
    assert.deepEqual(
      evaluation.Items.PackageReference.map((item) => [
        item.Identity,
        item.Version,
      ]),
      [[IDENTITY.id, `[${IDENTITY.version}]`]],
    );
    await fs.writeFile(
      path.join(absolute, 'evaluation.json'),
      JSON.stringify(evaluation, null, 2),
    );
    const inputs = [
      ...new Set(
        [
          ...evaluation.Imports,
          ...evaluation.Properties.MSBuildAllProjects.split(';'),
          ...evaluation.Items.ReferencePath.map((item) => item.FullPath),
        ].filter(Boolean),
      ),
    ];
    roles[name] = {
      directory,
      launcher,
      runtimeInputs,
      runtimeTrees,
      compile,
      evaluation,
      executable: `${directory}/bin/Release/net10.0/Consumer.dll`,
      library: `${directory}/bin/Release/net10.0/Hashbrown.AspNetCore.dll`,
      files: await fingerprintFiles(
        root,
        (await listFiles(absolute)).map((file) => `${directory}/${file}`),
      ),
      inputs: Object.fromEntries(
        await Promise.all(
          inputs.map(async (file) => [file, await hashFile(file)]),
        ),
      ),
    };
  }
  return roles;
}
