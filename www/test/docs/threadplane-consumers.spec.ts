import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import {
  assertThreadplaneInstalledPath,
  assertThreadplaneSourceEvidence,
  createThreadplaneAngularWorkspace,
  createThreadplaneConsumerManifest,
  createThreadplaneConsumerTsconfig,
  getThreadplaneConsumerBuildPlan,
  prepareThreadplaneConsumer,
  selectThreadplaneConsumerSdks,
  threadplaneConsumerInstallArgs,
  threadplaneReferenceRevision,
} from '../../src/tools/docs-threadplane-consumers';

test('React consumer pins published Hashbrown and framework runtimes plus copied local Threadplane packages', () => {
  const manifest = createThreadplaneConsumerManifest('react');

  expect(manifest.private).toBe(true);
  expect(manifest.dependencies).toMatchObject({
    '@hashbrownai/core': '0.8.0',
    '@hashbrownai/react': '0.8.0',
    '@hashbrownai/openai': '0.8.0',
    react: '19.2.8',
    'react-dom': '19.2.8',
    '@threadplane/core': 'file:../threadplane/dist/libs/core',
    '@threadplane/content': 'file:../threadplane/dist/libs/content',
    '@threadplane/react': 'file:../threadplane/dist/libs/react',
  });
  expect(manifest.devDependencies).toMatchObject({
    typescript: '6.0.3',
    vite: '8.2.4',
    '@types/react': '19.2.9',
    '@types/react-dom': '19.2.4',
  });
  expect(threadplaneConsumerInstallArgs('react')).toContain('--install-links');
  expect(threadplaneConsumerInstallArgs('react')).toContain('--include=dev');
  expect(threadplaneReferenceRevision).toBe(
    '2c7f01fa958441f3ed94e2559987217be284e94a',
  );
});

test('Angular consumer installs public Threadplane and one matching Angular compiler/runtime set', () => {
  const manifest = createThreadplaneConsumerManifest('angular');

  expect(manifest.dependencies).toMatchObject({
    '@threadplane/chat': '0.3.3',
    '@threadplane/ag-ui': '0.3.3',
    '@ag-ui/client': '1.0.2',
    '@ag-ui/core': '1.0.2',
    marked: '^16.0.0',
  });
  for (const name of [
    'core',
    'common',
    'compiler',
    'platform-browser',
    'router',
  ]) {
    expect(manifest.dependencies[`@angular/${name}`]).toBe('22.1.1');
  }
  expect(manifest.devDependencies['@angular/compiler-cli']).toBe('22.1.1');
  expect(manifest.devDependencies['@angular/build']).toBe('22.1.1');
  expect(manifest.devDependencies['@angular/cli']).toBe('22.1.1');
  expect(manifest.devDependencies.typescript).toBe('6.0.3');
  expect(threadplaneConsumerInstallArgs('angular')).toContain('--include=dev');
  expect(
    Object.values(manifest.dependencies).some((value) =>
      value.startsWith('file:'),
    ),
  ).toBe(false);
});

test('installed consumer tools must resolve below their own node_modules rather than a parent workspace', () => {
  const consumer = '/work/dist/docs-threadplane/react';

  expect(() =>
    assertThreadplaneInstalledPath(
      consumer,
      `${consumer}/node_modules/vite/dist/node/index.js`,
    ),
  ).not.toThrow();
  expect(() =>
    assertThreadplaneInstalledPath(
      consumer,
      '/work/node_modules/vite/dist/node/index.js',
    ),
  ).toThrow(/consumer|inside/i);
  expect(() =>
    assertThreadplaneInstalledPath(
      consumer,
      `${consumer}/node_modules-other/vite/index.js`,
    ),
  ).toThrow(/consumer|inside/i);
});

test('installed consumers compile real package imports without source aliases and use the standard Angular application builder', () => {
  const react = createThreadplaneConsumerTsconfig('react');
  const angular = createThreadplaneConsumerTsconfig('angular');

  expect(react.compilerOptions).not.toHaveProperty('paths');
  expect(angular.compilerOptions).not.toHaveProperty('paths');
  expect(react.compilerOptions).toMatchObject({
    strict: true,
    noEmit: true,
    jsx: 'react-jsx',
  });
  expect(react.compilerOptions.types).toContain('vite/client');
  expect(angular.compilerOptions).toMatchObject({
    strict: true,
    outDir: './out-tsc/app',
    rootDir: 'src',
  });
  expect(angular.angularCompilerOptions).toMatchObject({
    strictTemplates: true,
  });
  expect(getThreadplaneConsumerBuildPlan('react')).toMatchObject({
    compiler: 'node_modules/typescript/bin/tsc',
    compilerArgs: ['-p', 'tsconfig.json'],
    bundler: 'vite',
  });
  expect(getThreadplaneConsumerBuildPlan('angular')).toMatchObject({
    compiler: 'node_modules/@angular/cli/bin/ng.js',
    compilerArgs: ['build', '--configuration', 'production'],
    bundler: 'angular-application',
  });
  expect(createThreadplaneAngularWorkspace()).toMatchObject({
    projects: {
      consumer: {
        architect: {
          build: {
            builder: '@angular/build:application',
            options: {
              browser: 'src/main.ts',
              index: 'index.html',
              tsConfig: 'tsconfig.json',
              styles: ['src/styles.css'],
              outputPath: { base: 'dist', browser: '' },
            },
          },
        },
      },
    },
  });
});

test('preparation requires the pinned clean source revision and all prebuilt React packages', () => {
  const evidence = {
    revision: threadplaneReferenceRevision,
    modifiedFiles: [] as string[],
    missingOutputs: [] as string[],
  };

  expect(() => assertThreadplaneSourceEvidence(evidence)).not.toThrow();
  expect(() =>
    assertThreadplaneSourceEvidence({
      ...evidence,
      revision: 'another-revision',
    }),
  ).toThrow(/revision/i);
  expect(() =>
    assertThreadplaneSourceEvidence({
      ...evidence,
      modifiedFiles: ['libs/react/src/chat/chat-input.tsx'],
    }),
  ).toThrow(/modified/i);
  expect(() =>
    assertThreadplaneSourceEvidence({
      ...evidence,
      missingOutputs: ['dist/libs/react/package.json'],
    }),
  ).toThrow(/build/i);
});

test('preparation selects explicit SDKs and rejects unknown values before doing work', () => {
  expect(selectThreadplaneConsumerSdks(undefined)).toEqual([
    'react',
    'angular',
  ]);
  expect(selectThreadplaneConsumerSdks('react')).toEqual(['react']);
  expect(selectThreadplaneConsumerSdks('angular')).toEqual(['angular']);
  expect(() => selectThreadplaneConsumerSdks('other')).toThrow(/SDK/i);
});

test('Nx exposes separate preparation and recording targets and lints checked consumers', () => {
  const project = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../project.json'), 'utf8'),
  );

  expect(
    project.targets['docs-threadplane-prepare']?.options.command,
  ).toContain('prepare-docs-threadplane.ts');
  expect(project.targets['docs-threadplane-demo']?.options.command).toContain(
    'record-docs-threadplane.ts',
  );
  expect(project.targets.lint.options.command).toContain(
    'www/examples/threadplane-consumers',
  );
});

test('preparation writes disposable manifests and copies checked component, mount, host and styles exactly', () => {
  const workRoot = mkdtempSync(
    join(tmpdir(), 'hashbrown-threadplane-consumers-'),
  );
  const workspaceRoot = resolve(import.meta.dirname, '../../..');

  try {
    for (const sdk of ['react', 'angular'] as const) {
      const consumer = prepareThreadplaneConsumer(sdk, {
        workRoot,
        workspaceRoot,
      });
      const sourceRoot = resolve(
        workspaceRoot,
        'www/examples/threadplane-consumers',
        sdk,
      );
      const sourceFiles =
        sdk === 'react'
          ? [
              'src/ThreadplaneChat.tsx',
              'src/main.tsx',
              'index.html',
              'src/styles.css',
            ]
          : [
              'src/app/threadplane-chat.ts',
              'src/main.ts',
              'index.html',
              'src/styles.css',
            ];

      expect(consumer.root).toBe(join(workRoot, sdk));
      expect(consumer.outDir).toBe(join(workRoot, sdk, 'dist'));
      expect(existsSync(join(consumer.root, 'package.json'))).toBe(true);
      expect(
        JSON.parse(readFileSync(join(consumer.root, 'package.json'), 'utf8')),
      ).toEqual(createThreadplaneConsumerManifest(sdk));
      for (const file of sourceFiles) {
        expect(existsSync(join(sourceRoot, file))).toBe(true);
        expect(existsSync(join(consumer.root, file))).toBe(true);
        expect(readFileSync(join(consumer.root, file), 'utf8')).toBe(
          readFileSync(join(sourceRoot, file), 'utf8'),
        );
      }
    }
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
});
