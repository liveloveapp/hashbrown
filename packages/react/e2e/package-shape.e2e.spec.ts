import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

type PackageJson = {
  dependencies?: Record<string, string>;
  main?: string;
  module?: string;
  types?: string;
  exports?: {
    '.'?: {
      types?: string;
      import?: string;
      require?: string;
    };
  };
};

const workspaceRoot = resolve(__dirname, '../../..');
const reactDistPath = join(workspaceRoot, 'dist/packages/react');
const coreDistPath = join(workspaceRoot, 'dist/packages/core');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const typescriptPath = join(workspaceRoot, 'node_modules/typescript/bin/tsc');
const childProcessTimeoutMs = 90_000;

function readReactPackageJson(): PackageJson {
  return JSON.parse(
    readFileSync(join(reactDistPath, 'package.json'), 'utf8'),
  ) as PackageJson;
}

function assertProcessSucceeded(
  label: string,
  command: string,
  args: string[],
  result: SpawnSyncReturns<string>,
): void {
  if (!result.error && !result.signal && result.status === 0) {
    return;
  }

  const processError = result.error as NodeJS.ErrnoException | undefined;
  const failureDetails = [
    processError
      ? `${processError.code ?? processError.name}: ${processError.message}`
      : undefined,
    result.signal ? `signal ${result.signal}` : undefined,
    result.status !== null ? `exit status ${result.status}` : undefined,
  ].filter(Boolean);
  throw new Error(
    `${label} failed (${failureDetails.join(', ')})\n` +
      `Command: ${command} ${args.join(' ')}\n` +
      `stdout:\n${result.stdout || '<empty>'}\n` +
      `stderr:\n${result.stderr || '<empty>'}`,
  );
}

function runNodePackageCheck(script: string, sandboxPath: string) {
  const args = ['--input-type=module', '--eval', script];
  const result = spawnSync(process.execPath, args, {
    cwd: sandboxPath,
    env: {
      ...process.env,
      NODE_PATH: join(sandboxPath, 'node_modules'),
    },
    encoding: 'utf8',
    timeout: childProcessTimeoutMs,
  });
  assertProcessSucceeded('Consumer Node check', process.execPath, args, result);

  return result;
}

function runNpm(args: string[], cwd: string): string {
  const result = spawnSync(npmCommand, args, {
    cwd,
    encoding: 'utf8',
    timeout: childProcessTimeoutMs,
  });
  assertProcessSucceeded('npm command', npmCommand, args, result);

  return result.stdout;
}

function packPackage(packagePath: string, packPath: string): string {
  const output = runNpm(
    ['pack', packagePath, '--json', '--pack-destination', packPath],
    workspaceRoot,
  );
  const packs = JSON.parse(output) as Array<{ filename?: string }>;
  const filename = packs[0]?.filename;
  if (!filename) {
    throw new Error(`npm pack did not report a filename for ${packagePath}`);
  }

  return join(packPath, filename);
}

function createPackageSandbox(): string {
  const sandboxPath = mkdtempSync(join(tmpdir(), 'hashbrown-react-package-'));
  try {
    const packPath = join(sandboxPath, 'packs');
    mkdirSync(packPath);
    writeFileSync(
      join(sandboxPath, 'package.json'),
      JSON.stringify({
        name: 'hashbrown-react-package-e2e',
        private: true,
        type: 'module',
      }),
    );
    const coreTarball = packPackage(coreDistPath, packPath);
    const reactTarball = packPackage(reactDistPath, packPath);
    runNpm(
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        coreTarball,
        reactTarball,
        'react@19.2.8',
        'react-dom@19.2.8',
        '@types/react@19.2.9',
      ],
      sandboxPath,
    );

    return sandboxPath;
  } catch (error) {
    rmSync(sandboxPath, { recursive: true, force: true });
    throw error;
  }
}

test('published React package metadata exposes ESM and CJS entrypoints', () => {
  const packageJson = readReactPackageJson();

  expect(packageJson.types).toBe('./index.d.ts');
  expect(packageJson.module).toBe('./index.mjs');
  expect(packageJson.main).toBe('./index.cjs');
  expect(packageJson.dependencies?.['@cacheplane/partial-json']).toBe('0.2.2');
  expect(packageJson.exports?.['.']).toEqual({
    types: './index.d.ts',
    import: './index.mjs',
    require: './index.cjs',
  });
  expect(existsSync(join(reactDistPath, 'index.d.ts'))).toBe(true);
  expect(existsSync(join(reactDistPath, 'index.mjs'))).toBe(true);
  expect(existsSync(join(reactDistPath, 'index.cjs'))).toBe(true);
});

test('packed React and core packages install and load in a clean consumer', () => {
  const sandboxPath = createPackageSandbox();

  try {
    writeFileSync(
      join(sandboxPath, 'consumer.ts'),
      `
        import type {
          HashbrownProviderOptions,
          UiChatOptions,
          UiCompletionOptions,
          UseStructuredChatOptions,
          UseStructuredCompletionOptions,
        } from '@hashbrownai/react';

        declare const providerOptions: HashbrownProviderOptions;
        declare const structuredChatOptions: UseStructuredChatOptions<any, any>;
        declare const structuredCompletionOptions: UseStructuredCompletionOptions<any, any>;
        declare const uiChatOptions: UiChatOptions<any>;
        declare const uiCompletionOptions: UiCompletionOptions<any, any>;

        // @ts-expect-error Structured-output emulation is no longer configurable.
        providerOptions.emulateStructuredOutput;
        // @ts-expect-error Structured-output modes are owned by the server adapter.
        structuredChatOptions.structuredOutput;
        // @ts-expect-error Structured-output modes are owned by the server adapter.
        structuredCompletionOptions.structuredOutput;
        // @ts-expect-error Structured-output modes are owned by the server adapter.
        uiChatOptions.structuredOutput;
        // @ts-expect-error Structured-output modes are owned by the server adapter.
        uiCompletionOptions.structuredOutput;
      `,
    );
    const compileArgs = [
      typescriptPath,
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'Node16',
      '--moduleResolution',
      'Node16',
      '--lib',
      'ES2022,DOM',
      'consumer.ts',
    ];
    const compileResult = spawnSync(process.execPath, compileArgs, {
      cwd: sandboxPath,
      encoding: 'utf8',
      timeout: childProcessTimeoutMs,
    });
    const result = runNodePackageCheck(
      `
        import { createRequire } from 'node:module';

        const require = createRequire(import.meta.url);
        const cjs = require('@hashbrownai/react');
        const cjsCore = require('@hashbrownai/core');
        const esm = await import('@hashbrownai/react');
        const esmCore = await import('@hashbrownai/core');

        if (typeof cjsCore.HttpTransport !== 'function') {
          throw new Error('CJS core did not load the AG-UI transport dependency tree');
        }

        if (typeof esmCore.HttpTransport !== 'function') {
          throw new Error('ESM core did not load the AG-UI transport dependency tree');
        }

        if (typeof cjs.HashbrownProvider !== 'function') {
          throw new Error('CJS entrypoint did not expose HashbrownProvider');
        }

        if (typeof esm.HashbrownProvider !== 'function') {
          throw new Error('ESM entrypoint did not expose HashbrownProvider');
        }
      `,
      sandboxPath,
    );

    assertProcessSucceeded(
      'Consumer TypeScript check',
      process.execPath,
      compileArgs,
      compileResult,
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  } finally {
    rmSync(sandboxPath, { recursive: true, force: true });
  }
}, 120_000);
