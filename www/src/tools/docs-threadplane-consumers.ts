import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { build as viteBuild } from 'vite';

/** Frameworks supported by the installed documentation consumers. */
export type ThreadplaneConsumerSdk = 'react' | 'angular';

/** Locations used to create disposable consumer files. */
export interface ThreadplaneConsumerOptions {
  readonly workRoot?: string;
  readonly workspaceRoot?: string;
}

/** The source revision used by the local React packages. */
export const threadplaneReferenceRevision =
  '2c7f01fa958441f3ed94e2559987217be284e94a';

/** Evidence read from the disposable pinned source checkout before local installation. */
export interface ThreadplaneSourceEvidence {
  readonly revision: string;
  readonly modifiedFiles: readonly string[];
  readonly missingOutputs: readonly string[];
}

/** Requires the intended clean source revision and existing build outputs. */
export function assertThreadplaneSourceEvidence(
  evidence: ThreadplaneSourceEvidence,
): void {
  if (evidence.revision !== threadplaneReferenceRevision)
    throw new Error(
      `Threadplane source revision must be ${threadplaneReferenceRevision}; found ${evidence.revision}.`,
    );
  if (evidence.modifiedFiles.length)
    throw new Error(
      `Threadplane source has modified tracked files: ${evidence.modifiedFiles.join(', ')}.`,
    );
  if (evidence.missingOutputs.length)
    throw new Error(
      `Build the pinned Threadplane React packages first. Missing outputs: ${evidence.missingOutputs.join(', ')}.`,
    );
}

/** Chooses consumers before any preparation or installation starts. */
export function selectThreadplaneConsumerSdks(
  value: string | undefined,
): readonly ThreadplaneConsumerSdk[] {
  if (value === undefined || value === 'all') return ['react', 'angular'];
  if (value === 'react' || value === 'angular') return [value];
  throw new Error(`Unknown consumer SDK ${value}. Use react, angular, or all.`);
}

/** Requires an installed tool's canonical path to remain inside its consumer. */
export function assertThreadplaneInstalledPath(
  consumerRoot: string,
  installedPath: string,
): void {
  const modules = resolve(consumerRoot, 'node_modules');
  if (!resolve(installedPath).startsWith(`${modules}${sep}`))
    throw new Error(
      `Installed consumer tools must resolve inside ${modules}; found ${installedPath}. Prepare the consumer with --include=dev.`,
    );
}

/** Verifies the disposable checkout without fetching, modifying, or rebuilding it. */
export function verifyThreadplaneSourceCheckout(
  options: ThreadplaneConsumerOptions = {},
): ThreadplaneSourceEvidence {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const workRoot = resolve(
    options.workRoot ?? resolve(workspaceRoot, 'dist/docs-threadplane'),
  );
  const sourceRoot = resolve(workRoot, 'threadplane');
  if (!existsSync(resolve(sourceRoot, '.git')))
    throw new Error(
      `Create the pinned Threadplane source checkout at ${sourceRoot} before preparing the React consumer.`,
    );
  const revision = execFileSync(
    'git',
    ['-C', sourceRoot, 'rev-parse', 'HEAD'],
    {
      encoding: 'utf8',
    },
  ).trim();
  const modifiedFiles = execFileSync(
    'git',
    ['-C', sourceRoot, 'diff', '--name-only', 'HEAD'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  const outputs = [
    ...['core', 'content', 'react'].flatMap((name) => [
      `dist/libs/${name}/package.json`,
      `dist/libs/${name}/src/index.js`,
      `dist/libs/${name}/src/index.d.ts`,
    ]),
    'dist/libs/react/src/chat/index.js',
    'dist/libs/react/src/chat/index.d.ts',
    'dist/libs/react/src/chat/styles.css',
  ];
  const evidence = {
    revision,
    modifiedFiles,
    missingOutputs: outputs.filter(
      (file) => !existsSync(resolve(sourceRoot, file)),
    ),
  };
  assertThreadplaneSourceEvidence(evidence);
  return evidence;
}

/** A temporary application's dependency manifest, separate from repository dependencies. */
export interface ThreadplaneConsumerManifest {
  readonly name: string;
  readonly private: boolean;
  readonly type: string;
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
}

/** Creates the dependency manifest for one external consumer. */
export function createThreadplaneConsumerManifest(
  sdk: ThreadplaneConsumerSdk,
): ThreadplaneConsumerManifest {
  return {
    name: `hashbrown-docs-threadplane-${sdk}`,
    private: true,
    type: 'module',
    dependencies:
      sdk === 'react'
        ? {
            '@ag-ui/core': '1.0.2',
            '@ag-ui/encoder': '1.0.2',
            '@hashbrownai/core': '0.8.0',
            '@hashbrownai/openai': '0.8.0',
            '@hashbrownai/react': '0.8.0',
            '@threadplane/core': 'file:../threadplane/dist/libs/core',
            '@threadplane/content': 'file:../threadplane/dist/libs/content',
            '@threadplane/react': 'file:../threadplane/dist/libs/react',
            express: '4.22.2',
            openai: '6.49.0',
            react: '19.2.8',
            'react-dom': '19.2.8',
          }
        : {
            '@ag-ui/client': '1.0.2',
            '@ag-ui/core': '1.0.2',
            '@angular/common': '22.1.1',
            '@angular/compiler': '22.1.1',
            '@angular/core': '22.1.1',
            '@angular/platform-browser': '22.1.1',
            '@angular/router': '22.1.1',
            '@threadplane/chat': '0.3.3',
            '@threadplane/ag-ui': '0.3.3',
            marked: '^16.0.0',
            rxjs: '7.8.2',
          },
    devDependencies:
      sdk === 'react'
        ? {
            '@types/express': '4.17.25',
            '@types/node': '20.19.9',
            '@types/react': '19.2.9',
            '@types/react-dom': '19.2.4',
            typescript: '6.0.3',
            vite: '8.2.4',
          }
        : {
            '@angular/build': '22.1.1',
            '@angular/cli': '22.1.1',
            '@angular/compiler-cli': '22.1.1',
            typescript: '6.0.3',
          },
  };
}

/** Installed-package compiler configuration; no repository source aliases are permitted. */
export interface ThreadplaneConsumerTsconfig {
  readonly compilerOptions: Record<string, unknown>;
  readonly angularCompilerOptions?: Record<string, unknown>;
  readonly include: readonly string[];
}

/** Creates a consumer compiler configuration without workspace source aliases. */
export function createThreadplaneConsumerTsconfig(
  sdk: ThreadplaneConsumerSdk,
): ThreadplaneConsumerTsconfig {
  const compilerOptions = {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
  };
  return sdk === 'react'
    ? {
        compilerOptions: {
          ...compilerOptions,
          jsx: 'react-jsx',
          noEmit: true,
          types: ['vite/client', 'react', 'react-dom'],
        },
        include: ['src/**/*.ts', 'src/**/*.tsx'],
      }
    : {
        compilerOptions: {
          ...compilerOptions,
          experimentalDecorators: true,
          rootDir: 'src',
          outDir: './out-tsc/app',
          types: [],
        },
        angularCompilerOptions: {
          strictTemplates: true,
          strictInjectionParameters: true,
          strictInputAccessModifiers: true,
        },
        include: ['src/**/*.ts'],
      };
}

/** Creates the standard Angular application workspace configuration. */
export function createThreadplaneAngularWorkspace() {
  return {
    version: 1,
    projects: {
      consumer: {
        projectType: 'application',
        root: '',
        sourceRoot: 'src',
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
            configurations: {
              production: {
                optimization: true,
                outputHashing: 'all',
                sourceMap: false,
              },
            },
            defaultConfiguration: 'production',
          },
        },
      },
    },
    cli: { analytics: false },
  };
}

/** Selects the installed compiler and production bundler. */
export function getThreadplaneConsumerBuildPlan(sdk: ThreadplaneConsumerSdk) {
  return sdk === 'react'
    ? {
        compiler: 'node_modules/typescript/bin/tsc',
        compilerArgs: ['-p', 'tsconfig.json'],
        bundler: 'vite',
      }
    : {
        compiler: 'node_modules/@angular/cli/bin/ng.js',
        compilerArgs: ['build', '--configuration', 'production'],
        bundler: 'angular-application',
      };
}

/** Selects installation arguments for regular external package copies. */
export function threadplaneConsumerInstallArgs(sdk: ThreadplaneConsumerSdk) {
  return [
    'install',
    '--include=dev',
    ...(sdk === 'react' ? ['--install-links'] : []),
    '--no-audit',
    '--no-fund',
  ];
}

/** Copies the checked example into its disposable consumer root. */
export function prepareThreadplaneConsumer(
  sdk: ThreadplaneConsumerSdk,
  options: ThreadplaneConsumerOptions = {},
) {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const workRoot = resolve(
    options.workRoot ?? resolve(workspaceRoot, 'dist/docs-threadplane'),
  );
  const root = resolve(workRoot, sdk);
  const files =
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
  mkdirSync(root, { recursive: true });
  writeFileSync(
    resolve(root, 'package.json'),
    `${JSON.stringify(createThreadplaneConsumerManifest(sdk), null, 2)}\n`,
  );
  writeFileSync(
    resolve(root, 'tsconfig.json'),
    `${JSON.stringify(createThreadplaneConsumerTsconfig(sdk), null, 2)}\n`,
  );
  if (sdk === 'angular')
    writeFileSync(
      resolve(root, 'angular.json'),
      `${JSON.stringify(createThreadplaneAngularWorkspace(), null, 2)}\n`,
    );
  for (const file of files) {
    const destination = resolve(root, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(
      resolve(workspaceRoot, 'www/examples/threadplane-consumers', sdk, file),
      destination,
    );
  }
  return { root, outDir: resolve(root, 'dist') };
}

/**
 * Builds a prepared consumer through its installed compiler and bundler.
 * Installation is a separate, explicit parent-owned step.
 */
export async function buildInstalledThreadplaneConsumer(
  sdk: ThreadplaneConsumerSdk,
  options: ThreadplaneConsumerOptions = {},
) {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const workRoot = resolve(
    options.workRoot ?? resolve(workspaceRoot, 'dist/docs-threadplane'),
  );
  const root = resolve(workRoot, sdk);
  const outDir = resolve(root, 'dist');
  const plan = getThreadplaneConsumerBuildPlan(sdk);
  const compilerFile = resolve(root, plan.compiler);
  if (!existsSync(compilerFile))
    throw new Error(
      `Missing installed ${sdk} compiler ${compilerFile}. Prepare the consumer with --include=dev.`,
    );
  const canonicalRoot = realpathSync(root);
  const compiler = realpathSync(compilerFile);
  assertThreadplaneInstalledPath(canonicalRoot, compiler);
  const installed = createRequire(resolve(root, 'package.json'));
  const tools =
    sdk === 'react'
      ? ['typescript/package.json', 'vite']
      : [
          '@angular/build/package.json',
          '@angular/compiler-cli/package.json',
          'typescript/package.json',
        ];
  for (const tool of tools)
    assertThreadplaneInstalledPath(
      canonicalRoot,
      realpathSync(installed.resolve(tool)),
    );
  const compilation = spawnSync(
    process.execPath,
    [compiler, ...plan.compilerArgs],
    { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_PATH: '' } },
  );
  if (compilation.error) throw compilation.error;
  if (compilation.status !== 0)
    throw new Error(
      `${sdk} consumer compilation failed (${compilation.status ?? compilation.signal}).`,
    );
  if (sdk === 'react') {
    const bundler = realpathSync(installed.resolve('vite'));
    assertThreadplaneInstalledPath(canonicalRoot, bundler);
    const vite = (await import(pathToFileURL(bundler).href)) as {
      build: typeof viteBuild;
    };
    await vite.build({
      configFile: false,
      root,
      resolve: { dedupe: ['react', 'react-dom'] },
      build: { outDir, emptyOutDir: true },
    });
  }
  return { root, outDir, index: resolve(outDir, 'index.html') };
}
