import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDirectory = new URL(
  '../../../dist/packages/angular/',
  import.meta.url,
);
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const angularDistPath = fileURLToPath(packageDirectory);
const coreDistPath = join(workspaceRoot, 'dist/packages/core');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const childProcessTimeoutMs = 90_000;

function assertProcessSucceeded(label, command, args, result) {
  if (!result.error && !result.signal && result.status === 0) {
    return;
  }

  const failureDetails = [
    result.error
      ? `${result.error.code ?? result.error.name}: ${result.error.message}`
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

function runNpm(args, cwd) {
  const result = spawnSync(npmCommand, args, {
    cwd,
    encoding: 'utf8',
    timeout: childProcessTimeoutMs,
  });
  assertProcessSucceeded('npm command', npmCommand, args, result);

  return result.stdout;
}

function packPackage(packagePath, packPath) {
  const output = runNpm(
    ['pack', packagePath, '--json', '--pack-destination', packPath],
    workspaceRoot,
  );
  const filename = JSON.parse(output)[0]?.filename;
  if (!filename) {
    throw new Error(`npm pack did not report a filename for ${packagePath}`);
  }

  return join(packPath, filename);
}

function createPackageSandbox() {
  const sandboxPath = mkdtempSync(join(tmpdir(), 'hashbrown-angular-package-'));
  try {
    const packPath = join(sandboxPath, 'packs');
    mkdirSync(packPath);
    writeFileSync(
      join(sandboxPath, 'package.json'),
      JSON.stringify({
        name: 'hashbrown-angular-package-e2e',
        private: true,
        type: 'module',
      }),
    );
    const coreTarball = packPackage(coreDistPath, packPath);
    const angularTarball = packPackage(angularDistPath, packPath);
    runNpm(
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        coreTarball,
        angularTarball,
        '@angular/common@22.1.1',
        '@angular/compiler@22.1.1',
        '@angular/core@22.1.1',
      ],
      sandboxPath,
    );

    return sandboxPath;
  } catch (error) {
    rmSync(sandboxPath, { recursive: true, force: true });
    throw error;
  }
}

test('published package declares the Angular 22 compatibility boundary', async () => {
  const [packageContents, bundle] = await Promise.all([
    readFile(new URL('package.json', packageDirectory), 'utf8'),
    readFile(
      new URL('fesm2022/hashbrownai-angular.mjs', packageDirectory),
      'utf8',
    ),
  ]);
  const packageJson = JSON.parse(packageContents);

  assert.equal(packageJson.peerDependencies['@angular/core'], '^22.0.0');
  assert.equal(packageJson.peerDependencies['@angular/common'], '^22.0.0');
  assert.equal(packageJson.dependencies['@cacheplane/partial-json'], '0.2.2');
  assert.match(bundle, /from '@cacheplane\/partial-json'/);
  assert.match(bundle, /ChangeDetectionStrategy\.Eager/);
});

test(
  'packed Angular and core packages install and load in a clean consumer',
  { timeout: 120_000 },
  () => {
    const sandboxPath = createPackageSandbox();

    try {
      const args = [
        '--input-type=module',
        '--eval',
        `
            import { createRequire } from 'node:module';

            const require = createRequire(import.meta.url);
            await import('@angular/compiler');
            const angular = await import('@hashbrownai/angular');
            const cjsCore = require('@hashbrownai/core');
            const esmCore = await import('@hashbrownai/core');

            if (typeof angular.provideHashbrown !== 'function') {
              throw new Error('Angular entrypoint did not expose provideHashbrown');
            }

            if (typeof cjsCore.HttpTransport !== 'function') {
              throw new Error('CJS core did not load the AG-UI transport dependency tree');
            }

            if (typeof esmCore.HttpTransport !== 'function') {
              throw new Error('ESM core did not load the AG-UI transport dependency tree');
            }
          `,
      ];
      const result = spawnSync(process.execPath, args, {
        cwd: sandboxPath,
        encoding: 'utf8',
        timeout: childProcessTimeoutMs,
      });
      assertProcessSucceeded(
        'Consumer Node check',
        process.execPath,
        args,
        result,
      );

      assert.equal(result.stderr, '');
      assert.equal(result.status, 0);
    } finally {
      rmSync(sandboxPath, { recursive: true, force: true });
    }
  },
);
