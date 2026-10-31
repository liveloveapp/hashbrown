import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { run } from './prepare.mjs';
import { qualifyConsumer } from './qualify.mjs';
import {
  verifyConsumer,
  validateAssets,
  validateLock,
  validateDeps,
  validateEvaluation,
  validateImplementation,
  hashFile,
  safeFile,
} from './verify.mjs';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Requires the one exact candidate dependency and the public package namespace. */
export function validateRecipePackage(text) {
  const references = [
    ...text.matchAll(
      /<PackageReference Include="([^"]+)" Version="([^"]+)"\s*\/>/g,
    ),
  ].map((match) => [match[1], match[2]]);
  assert.ok(
    text.includes(
      'https://www.nuget.org/packages/Hashbrown.AspNetCore/0.1.0-preview.1',
    ) &&
      text.includes(
        'dotnet add package Hashbrown.AspNetCore --version "[0.1.0-preview.1]" --source https://api.nuget.org/v3/index.json',
      ) &&
      text.includes(
        'dotnet restore --source https://api.nuget.org/v3/index.json --use-lock-file',
      ) &&
      text.includes(
        'dotnet restore --source https://api.nuget.org/v3/index.json --locked-mode',
      ) &&
      !/not published to NuGet.org/i.test(text),
    'Exact NuGet.org installation contract required',
  );
  assert.deepEqual(
    references,
    [['Hashbrown.AspNetCore', '[0.1.0-preview.1]']],
    'Recipe must reference exactly the candidate package',
  );
  assert.ok(
    text.includes('using Hashbrown.AspNetCore;'),
    'Public package namespace required',
  );
  assert.doesNotMatch(
    text,
    /<ProjectReference|<HintPath|Hashbrown.Conformance.Integration/,
  );
}

/** Reads the mandatory anchored candidate pointer argument; artifact checks never pack. */
export function metadataArgument() {
  const index = process.argv.indexOf('--metadata');
  const metadata =
    index >= 0
      ? process.argv[index + 1]
      : process.argv
          .find((arg) => arg.startsWith('--metadata='))
          ?.slice('--metadata='.length);
  assert.ok(
    metadata && resolve(metadata) === metadata,
    'Absolute --metadata is required',
  );
  return metadata;
}

/** Compiles every declared source against one isolated, locked candidate dependency closure. */
export async function compileRecipes(variants, metadata, kind) {
  const pointerHash = await hashFile(metadata);
  await qualifyConsumer(metadata);
  assert.equal(await hashFile(metadata), pointerHash, 'Pointer changed');
  const pointer = JSON.parse(await fs.readFile(metadata, 'utf8'));
  const baseline = await verifyConsumer(pointer);
  const absolute = await fs.mkdtemp(join(baseline.root, `docs-${kind}-`));
  const directory = basename(absolute);
  const template = await fs.readFile(
    join(source, 'nuget-consumer/templates/Consumer.csproj.txt'),
    'utf8',
  );
  await fs.writeFile(join(absolute, 'Consumer.csproj'), template);
  const variantHash = async (file) =>
    hashFile(await safeFile(baseline.root, `${directory}/${file}`));
  const projectHash = await variantHash('Consumer.csproj');
  const declared = variants.map(({ program, ...identity }) => ({
    ...identity,
    sourceSha256: createHash('sha256').update(program).digest('hex'),
  }));
  await fs.writeFile(
    join(absolute, 'declared-programs.json'),
    JSON.stringify(declared, null, 2),
    { flag: 'wx' },
  );
  const declarationHash = await variantHash('declared-programs.json');
  const command = async (args, name) =>
    run(
      'dotnet',
      args,
      baseline.root,
      baseline.environment,
      join(baseline.root, `logs/docs-${kind}-${name}.log`),
    );
  await fs.writeFile(join(absolute, 'Program.cs'), variants[0].program);
  await command(
    [
      'restore',
      `${directory}/Consumer.csproj`,
      '--configfile',
      'NuGet.Config',
      '--use-lock-file',
      '--no-http-cache',
    ],
    'restore',
  );
  await command(
    [
      'restore',
      `${directory}/Consumer.csproj`,
      '--configfile',
      'NuGet.Config',
      '--locked-mode',
      '--no-http-cache',
    ],
    'locked',
  );
  const lockHash = await variantHash('packages.lock.json');
  const json = async (file) =>
    JSON.parse(await fs.readFile(join(absolute, file), 'utf8'));
  for (const [index, variant] of variants.entries()) {
    console.log(
      `Compiling ${kind} ${index + 1}/${variants.length}: ${JSON.stringify(declared[index])}`,
    );
    await fs.writeFile(join(absolute, 'Program.cs'), variant.program);
    assert.equal(
      await variantHash('Program.cs'),
      declared[index].sourceSha256,
      'Declared variant source differs',
    );
    assert.equal(await hashFile(metadata), pointerHash, 'Pointer changed');
    await verifyConsumer(pointer);
    await command(
      [
        'build',
        `${directory}/Consumer.csproj`,
        '--no-restore',
        '-c',
        'Release',
        '-t:Rebuild',
      ],
      `${index}-build`,
    );
    const output = await command(
      [
        'msbuild',
        `${directory}/Consumer.csproj`,
        '-t:ResolveReferences',
        '-p:Configuration=Release',
        '-getItem:Compile,ProjectReference,Reference,ReferencePath,PackageReference',
        '-getProperty:MSBuildAllProjects,RestoreFallbackFolders,RestoreAdditionalProjectSources,RestoreAdditionalProjectFallbackFolders,RestoreSources',
      ],
      `${index}-evaluation`,
    );
    const evaluation = JSON.parse(output.slice(output.indexOf('{')));
    await command(
      [
        'msbuild',
        `${directory}/Consumer.csproj`,
        '-p:Configuration=Release',
        `-preprocess:${absolute}/evaluated.xml`,
      ],
      `${index}-preprocess`,
    );
    evaluation.Imports = [
      ...(await fs.readFile(join(absolute, 'evaluated.xml'), 'utf8')).matchAll(
        /^\s*(\/[^\r\n]+\.(?:props|targets))\s*$/gm,
      ),
    ].map((match) => match[1].trim());
    for (const items of [
      evaluation.Items.Compile,
      evaluation.Items.Reference,
      evaluation.Items.ReferencePath,
      evaluation.Items.ProjectReference,
    ])
      for (const item of items)
        for (const key of ['FullPath', 'HintPath', 'Identity'])
          if (item[key] && isAbsolute(item[key]))
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
    validateEvaluation(
      evaluation,
      baseline.root,
      baseline.repository,
      baseline.sdkRoot,
      {
        directory,
        compile: [
          `${directory}/Program.cs`,
          `${directory}/obj/Release/net10.0/Consumer.GlobalUsings.g.cs`,
        ],
      },
    );
    assert.deepEqual(
      evaluation.Items.PackageReference.map((item) => [
        item.Identity,
        item.Version,
      ]),
      [[baseline.identity.id, `[${baseline.identity.version}]`]],
    );
    validateAssets(
      await json('obj/project.assets.json'),
      baseline.root,
      baseline.identity,
      baseline.closure,
      baseline.sha512,
      directory,
    );
    validateLock(
      await json('packages.lock.json'),
      baseline.identity,
      baseline.closure,
      baseline.sha512,
    );
    validateDeps(
      await json('bin/Release/net10.0/Consumer.deps.json'),
      baseline.identity,
      baseline.closure,
    );
    await validateImplementation(
      await fs.readFile(baseline.loaded.location),
      join(absolute, 'bin/Release/net10.0/Hashbrown.AspNetCore.dll'),
    );
    assert.equal(
      await variantHash('Program.cs'),
      declared[index].sourceSha256,
      'Source changed during compile',
    );
    assert.equal(
      await variantHash('Consumer.csproj'),
      projectHash,
      'Project changed',
    );
    assert.equal(
      await variantHash('packages.lock.json'),
      lockHash,
      'Lock changed',
    );
    assert.equal(
      await variantHash('declared-programs.json'),
      declarationHash,
      'Declarations changed',
    );
    assert.equal(await hashFile(metadata), pointerHash, 'Pointer changed');
    await verifyConsumer(pointer);
    await fs.writeFile(
      join(absolute, `qualified-${index}.json`),
      JSON.stringify(
        {
          ...declared[index],
          candidateSha256: baseline.sha256,
          assemblySha256: await hashFile(
            join(absolute, 'bin/Release/net10.0/Consumer.dll'),
          ),
          evaluation,
        },
        null,
        2,
      ),
      { flag: 'wx' },
    );
  }
  await qualifyConsumer(metadata);
  assert.equal(await hashFile(metadata), pointerHash, 'Pointer changed');
  console.log(`Qualified ${variants.length} exact ${kind} package programs`);
}
