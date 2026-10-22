// Runs after each package's compile step: adds the install collector to the
// built package in dist/packages/<name> and wires its postinstall entry.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const require = createRequire(import.meta.url);
const { moduleSource } = require('./bridge.cjs');

const installDirectory = import.meta.dirname;
const workspaceRoot = resolve(installDirectory, '../../..');

/** Collector modules copied into `install/` of every published package. */
export const COLLECTOR_MODULES = [
  'postinstall',
  'collector',
  'policy',
  'git-context',
  'identity',
  'files',
  'bridge',
].map((name) => `${name}.cjs`);

/** Postinstall script added to every published manifest. */
export const POSTINSTALL_SCRIPT = 'node install/postinstall.cjs';

/** The `imports` entry core's published manifest must carry. */
export const DEVELOPMENT_INSTALL_IMPORT = {
  development: {
    import: './development-install.mjs',
    require: './development-install.cjs',
    default: './development-install.mjs',
  },
  import: './development-install.null.mjs',
  require: './development-install.null.cjs',
  default: './development-install.null.mjs',
};

const PACKAGES = new Set([
  'core',
  'react',
  'angular',
  'openai',
  'anthropic',
  'azure',
  'bedrock',
  'google',
  'ollama',
  'typesafe',
]);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const fail = (message) => {
  throw new Error(`assemble-package: ${message}`);
};

/**
 * Returns the null bridge files core ships at its package root, keyed by file name.
 * The postinstall step later overwrites the two non-null files in development installs.
 */
export const coreBridgeFiles = () => ({
  'development-install.mjs': moduleSource(null, 'esm'),
  'development-install.cjs': moduleSource(null, 'cjs'),
  'development-install.null.mjs': moduleSource(null, 'esm'),
  'development-install.null.cjs': moduleSource(null, 'cjs'),
  'development-install.d.ts':
    'export declare const installationToken: string | null;\n',
});

/**
 * Assembles the built package `name` in `dist/packages/<name>`: copies the
 * collector modules, adds the postinstall script, and for core writes the null
 * bridge files. Throws when a manifest does not have the expected shape.
 */
export function assemblePackage(name, root = workspaceRoot) {
  if (!PACKAGES.has(name)) fail(`unknown package "${name}"`);

  const source = readJson(join(root, 'packages', name, 'package.json'));
  if (source.scripts?.postinstall !== undefined) {
    fail(`packages/${name}/package.json must not declare a postinstall script`);
  }

  const distRoot = join(root, 'dist', 'packages', name);
  const manifestPath = join(distRoot, 'package.json');
  const manifest = readJson(manifestPath);

  if (name === 'core') {
    if (
      !isDeepStrictEqual(
        manifest.imports?.['#development-install'],
        DEVELOPMENT_INSTALL_IMPORT,
      )
    ) {
      fail(
        'dist/packages/core/package.json is missing the "#development-install" imports entry',
      );
    }
    for (const [file, contents] of Object.entries(coreBridgeFiles())) {
      writeFileSync(join(distRoot, file), contents);
    }
  }

  const installRoot = join(distRoot, 'install');
  mkdirSync(installRoot, { recursive: true });
  for (const file of COLLECTOR_MODULES) {
    copyFileSync(join(installDirectory, file), join(installRoot, file));
  }

  const assembled = {
    ...manifest,
    scripts: { ...manifest.scripts, postinstall: POSTINSTALL_SCRIPT },
  };
  writeFileSync(manifestPath, `${JSON.stringify(assembled, null, 2)}\n`);
}

if (process.argv[1] === import.meta.filename) {
  try {
    assemblePackage(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
