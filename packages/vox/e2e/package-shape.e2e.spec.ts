import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type PackageExport = {
  types?: string;
  import?: string;
  require?: string;
  default?: string;
};

type PackageJson = {
  main?: string;
  module?: string;
  types?: string;
  exports?: {
    '.'?: PackageExport;
    './loader'?: PackageExport;
    './loader-single'?: PackageExport;
  };
};

const workspaceRoot = resolve(__dirname, '../../..');
const voxDistPath = join(workspaceRoot, 'dist/packages/vox');

function readVoxPackageJson(): PackageJson {
  return JSON.parse(
    readFileSync(join(voxDistPath, 'package.json'), 'utf8'),
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
  const sandboxPath = mkdtempSync(join(tmpdir(), 'hashbrown-vox-package-'));
  const scopePath = join(sandboxPath, 'node_modules/@hashbrownai');
  mkdirSync(scopePath, { recursive: true });
  cpSync(voxDistPath, join(scopePath, 'vox'), { recursive: true });

  return sandboxPath;
}

function expectPackagePathsToExist(paths: (string | undefined)[]) {
  for (const path of new Set(paths)) {
    expect(path).toBeDefined();
    expect(existsSync(join(voxDistPath, path ?? ''))).toBe(true);
  }
}

test('published Vox package metadata exposes existing ESM and CJS entrypoints', () => {
  const packageJson = readVoxPackageJson();
  const rootExport = packageJson.exports?.['.'];

  expect(packageJson.types).toBe('./index.d.ts');
  expect(packageJson.module).toBe('./index.mjs');
  expect(packageJson.main).toBe('./index.cjs');
  expect(rootExport).toEqual({
    types: './index.d.ts',
    import: './index.mjs',
    require: './index.cjs',
    default: './index.cjs',
  });
  expectPackagePathsToExist([
    packageJson.types,
    packageJson.module,
    packageJson.main,
    rootExport?.types,
    rootExport?.import,
    rootExport?.require,
    rootExport?.default,
  ]);
});

test('published Vox package metadata exposes existing loader entrypoints', () => {
  const packageJson = readVoxPackageJson();
  const loaderExport = packageJson.exports?.['./loader'];
  const loaderSingleExport = packageJson.exports?.['./loader-single'];
  const expectedLoaderExport = {
    types: './assets/vad_audio_worklet.single.d.ts',
    import: './assets/vad_audio_worklet.single.js',
    require: './assets/vad_audio_worklet.single.js',
    default: './assets/vad_audio_worklet.single.js',
  };

  expect(loaderExport).toEqual(expectedLoaderExport);
  expect(loaderSingleExport).toEqual(expectedLoaderExport);
  expectPackagePathsToExist([
    loaderExport?.types,
    loaderExport?.import,
    loaderExport?.require,
    loaderExport?.default,
    loaderSingleExport?.types,
    loaderSingleExport?.import,
    loaderSingleExport?.require,
    loaderSingleExport?.default,
  ]);
});

test('published Vox package can be imported and required by package name', () => {
  const sandboxPath = createPackageSandbox();

  try {
    const result = runNodePackageCheck(
      `
        import { existsSync } from 'node:fs';
        import { createRequire } from 'node:module';
        import { fileURLToPath } from 'node:url';

        const require = createRequire(import.meta.url);
        const cjs = require('@hashbrownai/vox');
        const esm = await import('@hashbrownai/vox');
        const loaderRequirePath = require.resolve('@hashbrownai/vox/loader');
        const loaderImportPath = fileURLToPath(
          import.meta.resolve('@hashbrownai/vox/loader'),
        );
        const loaderSingleRequirePath = require.resolve(
          '@hashbrownai/vox/loader-single',
        );
        const loaderSingleImportPath = fileURLToPath(
          import.meta.resolve('@hashbrownai/vox/loader-single'),
        );

        if (typeof cjs.VAD !== 'function') {
          throw new Error('CJS entrypoint did not expose VAD');
        }

        if (typeof esm.VAD !== 'function') {
          throw new Error('ESM entrypoint did not expose VAD');
        }

        for (const loaderPath of [
          loaderRequirePath,
          loaderImportPath,
          loaderSingleRequirePath,
          loaderSingleImportPath,
        ]) {
          if (!existsSync(loaderPath)) {
            throw new Error('Loader entrypoint did not resolve to a file');
          }
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
