import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const consumerRoot = mkdtempSync(join(tmpdir(), 'hashbrown-angular-22-'));
const packagesRoot = join(consumerRoot, 'packages');

function run(command, args, cwd = workspaceRoot) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function pack(packageRoot) {
  const output = execFileSync(
    'npm',
    ['pack', packageRoot, '--pack-destination', packagesRoot, '--json'],
    { cwd: workspaceRoot, encoding: 'utf8' },
  );
  const result = JSON.parse(output);
  if (!Array.isArray(result) || typeof result[0]?.filename !== 'string') {
    throw new Error(
      `npm pack returned an unexpected result for ${packageRoot}`,
    );
  }
  return join(packagesRoot, result[0].filename);
}

try {
  mkdirSync(packagesRoot, { recursive: true });
  const coreTarball = pack('dist/packages/core');
  const angularTarball = pack('dist/packages/angular');

  writeFileSync(
    join(consumerRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'hashbrown-angular-22-consumer',
        private: true,
        type: 'module',
        dependencies: {
          '@angular/common': '22.0.7',
          '@angular/core': '22.0.7',
          '@angular/platform-browser': '22.0.7',
          '@hashbrownai/angular': `file:${angularTarball}`,
          '@hashbrownai/core': `file:${coreTarball}`,
          rxjs: '7.8.2',
          tslib: '2.8.1',
        },
        devDependencies: {
          typescript: '5.9.3',
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumerRoot, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ['ES2022', 'DOM'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          // Hashbrown core exposes QuickJS implementation types from its
          // declarations; this compatibility check is scoped to Angular's
          // public provider surface and peer resolution.
          skipLibCheck: true,
          strict: true,
          target: 'ES2022',
        },
        files: ['main.ts'],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumerRoot, 'main.ts'),
    `import type { ApplicationConfig } from '@angular/core';\n` +
      `import { provideHashbrown } from '@hashbrownai/angular';\n\n` +
      `export const appConfig: ApplicationConfig = {\n` +
      `  providers: [provideHashbrown({ baseUrl: '/api/chat' })],\n` +
      `};\n`,
  );

  run(
    'npm',
    [
      'install',
      '--strict-peer-deps',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    consumerRoot,
  );
  run('npx', ['tsc', '--project', 'tsconfig.json'], consumerRoot);
  console.log(
    'Packed @hashbrownai/angular consumer is compatible with Angular 22.',
  );
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
}
