import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

type PackageJson = {
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

function readReactPackageJson(): PackageJson {
  return JSON.parse(
    readFileSync(join(reactDistPath, 'package.json'), 'utf8'),
  ) as PackageJson;
}

function runNodePackageCheck(script: string, sandboxPath: string) {
  return spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    {
      cwd: sandboxPath,
      env: {
        ...process.env,
        NODE_PATH: join(sandboxPath, 'node_modules'),
      },
      encoding: 'utf8',
    },
  );
}

function createPackageSandbox(): string {
  const sandboxPath = mkdtempSync(join(tmpdir(), 'hashbrown-react-package-'));
  const nodeModulesPath = join(sandboxPath, 'node_modules');
  const scopePath = join(nodeModulesPath, '@hashbrownai');
  mkdirSync(scopePath, { recursive: true });
  cpSync(reactDistPath, join(scopePath, 'react'), { recursive: true });
  cpSync(coreDistPath, join(scopePath, 'core'), { recursive: true });
  symlinkSync(
    join(workspaceRoot, 'node_modules/react'),
    join(nodeModulesPath, 'react'),
    'dir',
  );
  symlinkSync(
    join(workspaceRoot, 'node_modules/react-dom'),
    join(nodeModulesPath, 'react-dom'),
    'dir',
  );
  return sandboxPath;
}

test('published React package metadata exposes ESM and CJS entrypoints', () => {
  const packageJson = readReactPackageJson();

  expect(packageJson.types).toBe('./index.d.ts');
  expect(packageJson.module).toBe('./index.mjs');
  expect(packageJson.main).toBe('./index.cjs');
  expect(packageJson.exports?.['.']).toEqual({
    types: './index.d.ts',
    import: './index.mjs',
    require: './index.cjs',
  });
  expect(existsSync(join(reactDistPath, 'index.d.ts'))).toBe(true);
  expect(existsSync(join(reactDistPath, 'index.mjs'))).toBe(true);
  expect(existsSync(join(reactDistPath, 'index.cjs'))).toBe(true);
});

test('published React package can be imported and required by package name', () => {
  const sandboxPath = createPackageSandbox();

  try {
    const result = runNodePackageCheck(
      `
        import { createRequire } from 'node:module';

        const require = createRequire(import.meta.url);
        const cjs = require('@hashbrownai/react');
        const esm = await import('@hashbrownai/react');

        if (typeof cjs.HashbrownProvider !== 'function') {
          throw new Error('CJS entrypoint did not expose HashbrownProvider');
        }

        if (typeof esm.HashbrownProvider !== 'function') {
          throw new Error('ESM entrypoint did not expose HashbrownProvider');
        }
      `,
      sandboxPath,
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  } finally {
    rmSync(sandboxPath, { recursive: true, force: true });
  }
});
