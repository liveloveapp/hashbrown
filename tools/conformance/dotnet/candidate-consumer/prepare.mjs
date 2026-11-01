import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  archiveFiles,
  candidateConsumerCopies,
  digest,
  repository,
  sdkNames,
  sourceInventory,
  tree,
} from './files.mjs';
import { validateArchiveFiles, validateManifest } from './verify.mjs';
import {
  consumerInventory,
  qualifyNugetCandidate,
  verifyCandidate,
} from './qualify.mjs';
import { prepareConsumer as prepareNuget } from '../nuget-consumer/prepare.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Refuses existing pointers and aliases before running any producer operation. */
async function requireNewPointer(pointerPath) {
  assert.ok(
    typeof pointerPath === 'string' &&
      path.isAbsolute(pointerPath) &&
      path.resolve(pointerPath) === pointerPath,
    'Absolute fresh candidate pointer required',
  );
  await fs.mkdir(path.dirname(pointerPath), { recursive: true });
  assert.equal(
    await fs.realpath(path.dirname(pointerPath)),
    path.dirname(pointerPath),
    'Candidate pointer parent symlink forbidden',
  );
  for (const file of [pointerPath, pointerPath + '.sha256']) {
    try {
      await fs.lstat(file);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw Error(
      `Existing candidate/public pointer cannot be replaced: ${file}`,
    );
  }
}

/** Supplies owned package caches and OS context without inherited credentials or npm policy. */
export function candidateEnvironment(root) {
  const result = {};
  for (const key of [
    'PATH',
    'TMPDIR',
    'TEMP',
    'TMP',
    'SystemRoot',
    'COMSPEC',
    'LANG',
  ])
    if (process.env[key]) result[key] = process.env[key];
  return {
    ...result,
    HOME: path.join(root, 'home'),
    npm_config_cache: path.join(root, 'npm-cache'),
    npm_config_userconfig: path.join(root, 'empty.npmrc'),
    npm_config_globalconfig: path.join(root, 'empty-global.npmrc'),
    npm_config_registry: 'https://registry.npmjs.org',
    npm_config_ignore_scripts: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    NX_DAEMON: 'false',
  };
}

/** Executes an explicit preparation step with bounded captured diagnostics. */
export function run(command, args, cwd, environment, log) {
  if (log) console.error(`CANDIDATE_STEP start ${path.basename(log)}`);
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (log) {
    // Logs are evidence outside source inventories and contain only the restricted child environment's output.
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    return fs.writeFile(log, output).then(() => {
      if (result.error || result.status !== 0)
        throw Error(
          `Candidate ${command} failed (${result.status ?? 'spawn'}): ${log}`,
          { cause: result.error },
        );
      console.error(`CANDIDATE_STEP end ${path.basename(log)}`);
      return result.stdout;
    });
  }
  if (result.error || result.status !== 0)
    throw Error(`Candidate ${command} failed (${result.status ?? 'spawn'})`, {
      cause: result.error,
    });
  return Promise.resolve(result.stdout);
}

/** Writes a fresh anchored pointer without replacing a previously selected candidate. */
export async function writePointer(pointerPath, metadataPath) {
  assert.ok(
    path.isAbsolute(pointerPath) && path.resolve(pointerPath) === pointerPath,
    'Absolute candidate pointer required',
  );
  const pointer = {
    kind: 'source-candidate',
    metadata: metadataPath,
    sha256: digest(await fs.readFile(metadataPath)),
  };
  await fs.mkdir(path.dirname(pointerPath), { recursive: true });
  const bytes = JSON.stringify(pointer, null, 2) + '\n';
  await fs.writeFile(pointerPath, bytes, { flag: 'wx', mode: 0o444 });
  await fs.writeFile(pointerPath + '.sha256', digest(bytes) + '\n', {
    flag: 'wx',
    mode: 0o444,
  });
}

/** Copies the minimal actual framework consumers and strict public declaration probe. */
async function copyConsumers(root) {
  const copies = candidateConsumerCopies;
  for (const [file, template] of Object.entries(copies)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.copyFile(
      path.join(here, 'templates', template),
      path.join(root, file),
    );
  }
  const compilerOptions = {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    skipLibCheck: true,
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    types: [],
  };
  await fs.writeFile(
    path.join(root, 'tsconfig.contracts.json'),
    JSON.stringify({ compilerOptions, files: ['contracts.ts'] }, null, 2),
  );
  for (const framework of ['react', 'angular']) {
    await fs.writeFile(
      path.join(root, framework, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            ...compilerOptions,
            ...(framework === 'react'
              ? { jsx: 'react-jsx' }
              : {
                  experimentalDecorators: true,
                  useDefineForClassFields: false,
                }),
          },
          ...(framework === 'angular'
            ? { angularCompilerOptions: { strictTemplates: true } }
            : {}),
          include: ['src'],
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(root, framework, 'index.html'),
      `<!doctype html><html><head><meta charset="UTF-8"><title>Candidate ${framework}</title></head><body>${framework === 'react' ? '<div id="root"></div>' : '<candidate-app></candidate-app>'}<script type="module" src="/src/main.${framework === 'react' ? 'tsx' : 'ts'}"></script></body></html>`,
    );
  }
  await fs.copyFile(
    path.join(root, 'angular/index.html'),
    path.join(root, 'angular/src/index.html'),
  );
  await fs.copyFile(path.join(here, 'build.mjs'), path.join(root, 'build.mjs'));
}

/** Prepares source-built tarballs and a fresh isolated npm consumer, without publishing. */
export async function prepareNpmCandidate(pointerPath) {
  await requireNewPointer(pointerPath);
  const root = await fs.realpath(
    await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), 'hashbrown-candidate-browser-'),
    ),
  );
  console.error(`CANDIDATE_ROOT ${root}`);
  for (const directory of ['home', 'npm-cache', 'archives', 'logs'])
    await fs.mkdir(path.join(root, directory));
  for (const file of ['empty.npmrc', 'empty-global.npmrc'])
    await fs.writeFile(path.join(root, file), '');
  const environment = candidateEnvironment(root);
  const revision = (
    await run(
      'git',
      ['rev-parse', 'HEAD'],
      repository,
      environment,
      path.join(root, 'logs/revision.log'),
    )
  ).trim();
  for (const name of ['core', 'react', 'angular'])
    await run(
      'npx',
      ['nx', 'build', name, '--skipNxCache'],
      repository,
      environment,
      path.join(root, `logs/build-${name}.log`),
    );
  const sources = await sourceInventory();
  const producer = {};
  const archives = {};
  const baseline = JSON.parse(
    await fs.readFile(path.join(here, '../live-consumer/package.json')),
  );
  const baselineLock = JSON.parse(
    await fs.readFile(path.join(here, '../live-consumer/package-lock.json')),
  );
  for (const name of sdkNames) {
    const short = name.split('/')[1];
    const directory = path.join(repository, 'dist/packages', short);
    producer[short] = await tree(directory);
    const packed = JSON.parse(
      await run(
        'npm',
        [
          'pack',
          directory,
          '--json',
          '--ignore-scripts',
          '--pack-destination',
          path.join(root, 'archives'),
        ],
        root,
        environment,
        path.join(root, `logs/pack-${short}.log`),
      ),
    );
    assert.equal(packed.length, 1, 'One candidate npm archive required');
    const archive = path.join(
      root,
      'archives',
      path.basename(packed[0].filename),
    );
    const bytes = await fs.readFile(archive);
    const files = archiveFiles(bytes);
    const pkg = JSON.parse(files['package.json']);
    assert.equal(pkg.name, name, 'Packed SDK identity differs');
    const previous = baselineLock.packages[`node_modules/${name}`];
    for (const field of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
      'peerDependenciesMeta',
      'bundleDependencies',
      'bundledDependencies',
    ])
      assert.deepEqual(
        pkg[field],
        previous[field],
        `Packed ${name} ${field} conflicts with retained graph`,
      );
    archives[name] = {
      name,
      version: pkg.version,
      archive,
      sha256: digest(bytes),
      integrity: 'sha512-' + digest(bytes, 'sha512', 'base64'),
    };
    await fs.chmod(archive, 0o444);
  }
  const manifest = {
    ...baseline,
    name: 'hashbrown-dotnet-candidate-consumer',
    dependencies: {
      ...baseline.dependencies,
      ...Object.fromEntries(
        sdkNames.map((name) => [name, 'file:' + archives[name].archive]),
      ),
    },
  };
  validateManifest(manifest, archives, baseline);
  const lock = structuredClone(baselineLock);
  lock.name = manifest.name;
  lock.packages[''] = {
    ...lock.packages[''],
    name: manifest.name,
    dependencies: manifest.dependencies,
  };
  for (const name of sdkNames)
    Object.assign(lock.packages[`node_modules/${name}`], {
      version: archives[name].version,
      resolved: 'file:' + archives[name].archive,
      integrity: archives[name].integrity,
    });
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(manifest, null, 2),
  );
  await fs.writeFile(
    path.join(root, 'package-lock.json'),
    JSON.stringify(lock, null, 2),
  );
  await copyConsumers(root);
  await validateArchiveFiles(root, archives);
  await run(
    'npm',
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    root,
    environment,
    path.join(root, 'logs/npm-ci.log'),
  );
  for (const config of [
    'tsconfig.contracts.json',
    'react/tsconfig.json',
    'angular/tsconfig.json',
  ])
    await run(
      process.execPath,
      ['node_modules/typescript/bin/tsc', '--noEmit', '-p', config],
      root,
      environment,
      path.join(root, `logs/${config.replaceAll('/', '-')}.log`),
    );
  await run(
    process.execPath,
    ['build.mjs'],
    root,
    environment,
    path.join(root, 'logs/framework-build.log'),
  );
  const metadata = {
    schema: 1,
    kind: 'source-candidate',
    root,
    repository,
    revision,
    sources,
    producer,
    archives,
    sourceIdentity: {
      baseRevision: revision,
      workingTreeSha256: digest(JSON.stringify(sources)),
      includesUncommittedSources: true,
    },
    node: {
      executable: await fs.realpath(process.execPath),
      version: process.version,
      sha256: digest(await fs.readFile(await fs.realpath(process.execPath))),
    },
    baselineManifest: baseline,
    baselineLock,
    consumer: await consumerInventory(root),
    artifacts: {
      react: path.join(root, 'dist/react'),
      angular: path.join(root, 'dist/angular/browser'),
    },
    checkLogs: Object.fromEntries(
      await Promise.all(
        [
          'revision',
          'build-core',
          'build-react',
          'build-angular',
          'pack-core',
          'pack-react',
          'pack-angular',
          'npm-ci',
          'tsconfig.contracts.json',
          'react-tsconfig.json',
          'angular-tsconfig.json',
          'framework-build',
        ].map(async (name) => {
          const file = `logs/${name}.log`;
          return [file, digest(await fs.readFile(path.join(root, file)))];
        }),
      ),
    ),
  };
  Object.assign(metadata, await verifyCandidate(metadata));
  const metadataPath = path.join(root, 'candidate-metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), {
    flag: 'wx',
    mode: 0o444,
  });
  await writePointer(pointerPath, metadataPath);
  return metadata;
}

/** Prepares a separately anchored candidate NuGet consumer through the existing strict guards. */
export async function prepareNugetCandidate(pointerPath) {
  await requireNewPointer(pointerPath);
  const underlying = pointerPath + '.source-package';
  await requireNewPointer(underlying);
  await prepareNuget(underlying);
  const result = await qualifyNugetCandidate(underlying, true);
  const metadataPath = path.join(result.root, 'candidate-browser-binding.json');
  await fs.writeFile(
    metadataPath,
    JSON.stringify(
      {
        schema: 1,
        kind: 'source-candidate',
        packagePointer: underlying,
        packagePointerSha256: digest(await fs.readFile(underlying)),
        sources: await sourceInventory(),
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o444 },
  );
  await writePointer(pointerPath, metadataPath);
  return result;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const mode = args.shift();
  const match = args.length === 1 && args[0].match(/^--metadata=(\/.*)$/);
  if (!match || !['npm', 'nuget'].includes(mode))
    throw Error(
      'Use prepare.mjs <npm|nuget> --metadata=<absolute fresh candidate pointer>',
    );
  try {
    const result =
      mode === 'npm'
        ? await prepareNpmCandidate(match[1])
        : await prepareNugetCandidate(match[1]);
    console.log(
      JSON.stringify({
        kind: 'source-candidate',
        root: result.root,
        pointer: match[1],
      }),
    );
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
