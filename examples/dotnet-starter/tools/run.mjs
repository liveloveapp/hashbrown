import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  resolvePreparedMetadata,
  validateStaticRoot,
} from './candidate-contract.mjs';
import { options, repository, run } from './consumer.mjs';
import { verifyPrepared } from './verify-candidate.mjs';

/** Performs explicit checks/builds/runs against a selected prepared external consumer. */
export async function execute(mode, selection) {
  assert.ok(
    ['build', 'test', 'lint-candidate', 'serve'].includes(mode),
    'Mode must be build, test, lint-candidate or serve.',
  );
  const pointer = resolvePreparedMetadata(mode, selection, process.env);
  const metadata = await verifyPrepared(pointer);
  const { root, environment } = metadata;
  if (mode === 'build') {
    for (const config of ['react/tsconfig.json', 'angular/tsconfig.json'])
      await run(
        process.execPath,
        ['node_modules/typescript/bin/tsc', '--noEmit', '-p', config],
        root,
        environment,
        config.replace('/', '-') + '.log',
      );
    await run(
      process.execPath,
      ['build.mjs'],
      root,
      environment,
      'clients-rebuild.log',
    );
    await run(
      'dotnet',
      [
        'restore',
        'server/Starter.csproj',
        '--configfile',
        'NuGet.Config',
        '--locked-mode',
      ],
      root,
      environment,
      'server-recheck-lock.log',
    );
    await run(
      'dotnet',
      ['build', 'server/Starter.csproj', '--no-restore', '-c', 'Release'],
      root,
      environment,
      'server-rebuild.log',
    );
    await verifyPrepared(pointer);
  } else if (mode === 'test') {
    const output = await run(
      process.execPath,
      [
        '--test',
        path.join(repository, 'examples/dotnet-starter/tools/starter.test.mjs'),
      ],
      repository,
      environment,
      'starter-helper-tests.log',
      root,
    );
    process.stdout.write(output);
    process.stdout.write(
      await run(
        'dotnet',
        [
          path.join(root, 'tests/bin/Release/net10.0/Starter.Tests.dll'),
          path.join(root, 'server/bin/Release/net10.0/Starter.dll'),
        ],
        root,
        environment,
        'starter-bcl-tests.log',
      ),
    );
    await verifyPrepared(pointer);
  } else if (mode === 'lint-candidate') {
    await run(
      process.execPath,
      [
        path.join(repository, 'node_modules/eslint/bin/eslint.js'),
        'examples/dotnet-starter/**/*.{ts,tsx,mjs}',
      ],
      repository,
      environment,
      'starter-eslint.log',
      root,
    );
    await run(
      process.execPath,
      [
        path.join(repository, 'node_modules/prettier/bin/prettier.cjs'),
        '--check',
        'examples/dotnet-starter/**/*.{ts,tsx,mjs,json,css,html,md}',
      ],
      repository,
      environment,
      'starter-prettier.log',
      root,
    );
    for (const project of [
      'server/Starter.csproj',
      'tests/Starter.Tests.csproj',
    ])
      await run(
        'dotnet',
        ['format', project, '--verify-no-changes', '--no-restore'],
        root,
        environment,
        project.split('/')[0] + '-format.log',
      );
    await verifyPrepared(pointer);
  } else {
    const staticRoot = await validateStaticRoot(root, selection.framework);
    const serverEnvironment = { ...environment, ClientRoot: staticRoot };
    // Server-only allowlist. No frontend configuration or generated artifact receives these values.
    for (const key of [
      'ASPNETCORE_ENVIRONMENT',
      'DevelopmentIdentityEnabled',
      'LocalOrigin',
      'ConnectionStrings__NativeJournal',
      'NativeSchema',
      'Provider',
      'ModelEndpoint',
      'Model',
      'ModelApi',
      'ApiKey',
      'OPENAI_API_KEY',
      'AZURE_OPENAI_API_KEY',
      'AzureAuthentication',
      'ManagedIdentityClientId',
    ])
      if (process.env[key]) serverEnvironment[key] = process.env[key];
    const child = spawn(
      'dotnet',
      [path.join(root, 'server/bin/Release/net10.0/Starter.dll')],
      {
        cwd: path.join(root, 'server'),
        env: serverEnvironment,
        stdio: 'inherit',
      },
    );
    const stop = (signal) => child.kill(signal);
    const interrupt = () => stop('SIGINT');
    const terminate = () => stop('SIGTERM');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    try {
      await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) =>
          code === 0
            ? resolve()
            : reject(Error('Starter exited unsuccessfully.')),
        );
      });
    } finally {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
    }
    await verifyPrepared(pointer);
  }
  return metadata;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, ...args] = process.argv.slice(2);
  await execute(mode, options(args, ['metadata', 'framework']));
}
