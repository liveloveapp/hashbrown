import { readCandidateDependencyBaseline } from '../candidate-consumer/dependency-baseline.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  archiveFiles,
  candidateConsumerCopies,
  digest,
  readPhysical,
  sdkNames,
  tree,
} from '../candidate-consumer/files.mjs';
import { candidateEnvironment, run } from '../candidate-consumer/prepare.mjs';
import {
  createCandidateLock,
  installationInventory,
} from '../candidate-consumer/qualify.mjs';
import {
  qualifyPublicProducer,
  qualifyPublicNpm,
  qualifyPublicNuget,
} from './qualify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = async (file) => JSON.parse(await readPhysical(file));

/** Refuses overwrites and source/candidate fallback before acquiring any public preparation resources. */
async function fresh(pointer) {
  assert.ok(
    path.isAbsolute(pointer) && path.resolve(pointer) === pointer,
    'Absolute fresh public pointer required',
  );
  await fs.mkdir(path.dirname(pointer), { recursive: true });
  assert.equal(await fs.realpath(path.dirname(pointer)), path.dirname(pointer));
  for (const file of [pointer, pointer + '.sha256']) {
    await fs.lstat(file).then(
      () => {
        throw new Error('Existing pointer cannot be replaced');
      },
      (error) => {
        if (error.code !== 'ENOENT') throw error;
      },
    );
  }
}
async function seal(pointer, metadataPath) {
  const bytes = JSON.stringify({
    kind: 'official-registry',
    metadata: metadataPath,
    sha256: digest(await readPhysical(metadataPath)),
  });
  await fs.writeFile(pointer, bytes, { flag: 'wx', mode: 0o444 });
  await fs.writeFile(pointer + '.sha256', digest(bytes), {
    flag: 'wx',
    mode: 0o444,
  });
}
async function download(url) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(
    response.status,
    200,
    'Exact official version unavailable; publication remains separately authorized',
  );
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    assert.ok(length <= 64 * 1024 * 1024);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Builds public consumers using the existing exact templates and dependency graph, without publishing anything. */
async function copyConsumers(root) {
  for (const [file, template] of Object.entries(candidateConsumerCopies)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.copyFile(
      path.join(here, '../candidate-consumer/templates', template),
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
    JSON.stringify({ compilerOptions, files: ['contracts.ts'] }),
  );
  for (const framework of ['react', 'angular']) {
    await fs.writeFile(
      path.join(root, framework, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          ...compilerOptions,
          ...(framework === 'react'
            ? { jsx: 'react-jsx' }
            : { experimentalDecorators: true, useDefineForClassFields: false }),
        },
        ...(framework === 'angular'
          ? { angularCompilerOptions: { strictTemplates: true } }
          : {}),
        include: ['src'],
      }),
    );
    await fs.writeFile(
      path.join(root, framework, 'index.html'),
      `<!doctype html><html><head><meta charset="UTF-8"><title>Release ${framework}</title></head><body>${framework === 'react' ? '<div id="root"></div>' : '<candidate-app></candidate-app>'}<script type="module" src="/src/main.${framework === 'react' ? 'tsx' : 'ts'}"></script></body></html>`,
    );
  }
  await fs.copyFile(
    path.join(root, 'angular/index.html'),
    path.join(root, 'angular/src/index.html'),
  );
  await fs.copyFile(
    path.join(here, '../candidate-consumer/build.mjs'),
    path.join(root, 'build.mjs'),
  );
}

/** Prepares exact already-published npm 0.9.0 consumers with independent actual producer and registry receipts. */
export async function preparePublicNpm(pointer, producerPath) {
  await fresh(pointer);
  const producer = await read(producerPath);
  await qualifyPublicProducer(producer);
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'hashbrown-public-recovery-')),
  );
  for (const directory of ['home', 'npm-cache', 'archives', 'logs'])
    await fs.mkdir(path.join(root, directory));
  for (const file of ['empty.npmrc', 'empty-global.npmrc'])
    await fs.writeFile(path.join(root, file), '');
  const environment = candidateEnvironment(root);
  const { manifest: baseline, lock: baselineLock } =
    await readCandidateDependencyBaseline();
  const archives = {};
  for (const name of sdkNames) {
    const receipt = JSON.parse(
      await download(
        `https://registry.npmjs.org/${encodeURIComponent(name)}/0.9.0`,
      ),
    );
    const resolved = `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-0.9.0.tgz`;
    assert.equal(receipt.dist.tarball, resolved);
    assert.equal(receipt.gitHead, producer.revision);
    const bytes = await download(resolved);
    const archive = path.join(
      root,
      'archives',
      name.split('/')[1] + '-0.9.0.tgz',
    );
    await fs.writeFile(archive, bytes, { flag: 'wx', mode: 0o444 });
    const integrity = 'sha512-' + digest(bytes, 'sha512', 'base64');
    assert.equal(receipt.dist.integrity, integrity);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(archiveFiles(bytes)).map(([file, value]) => [
          file,
          digest(value),
        ]),
      ),
      producer.packages[name],
    );
    archives[name] = {
      name,
      version: '0.9.0',
      resolved,
      archive,
      sha256: digest(bytes),
      integrity,
    };
  }
  const manifest = {
    ...baseline,
    name: 'hashbrown-dotnet-public-release-recovery',
    dependencies: {
      ...baseline.dependencies,
      ...Object.fromEntries(sdkNames.map((name) => [name, '0.9.0'])),
    },
  };
  const lock = createCandidateLock(baselineLock, archives, manifest);
  for (const name of sdkNames)
    lock.packages[`node_modules/${name}`].resolved = archives[name].resolved;
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(manifest, null, 2),
  );
  await fs.writeFile(
    path.join(root, 'package-lock.json'),
    JSON.stringify(lock, null, 2),
  );
  await copyConsumers(root);
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
      path.join(root, 'logs/' + config.replaceAll('/', '-') + '.log'),
    );
  await run(
    process.execPath,
    ['build.mjs'],
    root,
    environment,
    path.join(root, 'logs/build.log'),
  );
  const moduleOrigins = {};
  for (const framework of ['react', 'angular']) {
    const ids =
      framework === 'react'
        ? await read(path.join(root, 'react-module-ids.json'))
        : Object.keys(
            (await read(path.join(root, 'dist/angular/browser-stats.json')))
              .inputs,
          );
    moduleOrigins[framework] = ids
      .map((id) => path.resolve(root, id.replace(/\?.*$/, '')))
      .filter((file) =>
        file.startsWith(
          path.join(root, 'node_modules/@hashbrownai') + path.sep,
        ),
      )
      .map((file) => path.relative(root, file))
      .sort();
  }
  const metadata = {
    kind: 'official-registry',
    root,
    revision: producer.revision,
    producer,
    archives,
    artifacts: {
      react: path.join(root, 'dist/react'),
      angular: path.join(root, 'dist/angular/browser'),
    },
    consumer: await tree(root, root, [
      'home',
      'npm-cache',
      'logs',
      'archives',
      'node_modules',
      'release-metadata.json',
    ]),
    installation: await installationInventory(root),
    moduleOrigins,
  };
  const file = path.join(root, 'release-metadata.json');
  await fs.writeFile(file, JSON.stringify(metadata), {
    flag: 'wx',
    mode: 0o444,
  });
  await seal(pointer, file);
  await qualifyPublicNpm(pointer);
  return { kind: 'official-registry', pointer, root };
}

/** Binds an actually signed exact NuGet consumer prepared against its actual producer; no package publication occurs. */
export async function bindPublicNuget(pointer, packagePointer, producerPath) {
  await fresh(pointer);
  const producer = await read(producerPath);
  await qualifyPublicProducer(producer);
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'hashbrown-public-nuget-binding-')),
  );
  const metadata = {
    kind: 'official-registry',
    packagePointer,
    packagePointerSha256: digest(await readPhysical(packagePointer)),
    producer,
  };
  const file = path.join(root, 'release-metadata.json');
  await fs.writeFile(file, JSON.stringify(metadata), {
    flag: 'wx',
    mode: 0o444,
  });
  await seal(pointer, file);
  await qualifyPublicNuget(pointer);
  return { kind: 'official-registry', pointer, root };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, ...args] = process.argv.slice(2);
  const options = {};
  for (const arg of args) {
    const match = /^--(metadata|producer|package-pointer)=(\/.*)$/.exec(arg);
    assert.ok(
      match && !options[match[1]],
      'Exact fresh public preparation inputs required',
    );
    options[match[1]] = match[2];
  }
  assert.ok(
    options.metadata &&
      options.producer &&
      (mode === 'npm' || (mode === 'nuget' && options['package-pointer'])),
  );
  (mode === 'npm'
    ? preparePublicNpm(options.metadata, options.producer)
    : bindPublicNuget(
        options.metadata,
        options['package-pointer'],
        options.producer,
      )
  ).then(
    (result) => process.stdout.write(JSON.stringify(result) + '\n'),
    () => {
      process.stderr.write('RECOVERY_PUBLIC_PREPARATION_FAILED\n');
      process.exitCode = 1;
    },
  );
}
