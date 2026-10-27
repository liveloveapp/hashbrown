import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

/** Published SDK packages required by both framework consumers. */
export const SDK_NAMES = [
  '@hashbrownai/core',
  '@hashbrownai/react',
  '@hashbrownai/angular',
];
const inside = (root, file) =>
  file === root || file.startsWith(root + path.sep);

/** Requires the approved registry pins without local dependency substitution. */
export function validateManifest(manifest) {
  if ('overrides' in manifest || 'workspaces' in manifest)
    throw Error('Consumer overrides/workspaces are forbidden');
  for (const name of SDK_NAMES)
    if (manifest.dependencies?.[name] !== '0.8.3')
      throw Error(`Expected exact SDK pin: ${name}`);
  for (const version of Object.values({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })) {
    if (!/^\d+\.\d+\.\d+$/.test(version))
      throw Error('Consumer dependencies require exact registry versions');
  }
}

/** Rejects imports that escape the explicit source closure, including dynamic imports. */
export function validateSourceImports(file, text, files) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const check = (specifier) => {
    if (specifier.startsWith('.')) {
      const base = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), specifier),
      );
      if (
        ![base, base + '.ts', base + '.tsx', base + '.css'].some((candidate) =>
          files.includes(candidate),
        )
      )
        throw Error(`Unexpected relative import: ${file}: ${specifier}`);
    } else if (
      !/^(?:@hashbrownai\/(?:core|react|angular)|@angular\/[\w-]+|react(?:-dom)?(?:\/client|\/jsx-runtime)?|rxjs(?:\/operators)?|tslib)$/.test(
        specifier,
      )
    ) {
      throw Error(`Unexpected package import: ${file}: ${specifier}`);
    }
  };
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    )
      check(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]))
        throw Error('Computed source imports are forbidden');
      check(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

/** Requires a consumer outside the repository and all of its ancestor directories. */
export function validateIsolation(root, repository) {
  if (inside(repository, root) || inside(root, repository))
    throw Error('Consumer must be isolated from repository ancestry');
}

/** Checks the real filesystem origin of every SDK module emitted by a builder. */
export async function validateModuleOrigins(root, ids) {
  if (!ids.length) throw Error('Missing SDK module provenance');
  const sdkRoot = path.join(root, 'node_modules/@hashbrownai');
  return Promise.all(
    ids.map(async (id) => {
      const file = path.resolve(root, id.replace(/\?.*$/, ''));
      if (!inside(sdkRoot, file) || (await fs.realpath(file)) !== file)
        throw Error(`Invalid SDK module origin: ${id}`);
      return path.relative(root, file);
    }),
  );
}

/** Hashes all ordinary files below a generated source or build directory. */
export async function hashTree(directory, prefix = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Unexpected symlink: ${file}`);
    if (entry.isDirectory())
      Object.assign(result, await hashTree(file, prefix));
    else
      result[path.relative(prefix, file)] = crypto
        .createHash('sha256')
        .update(await fs.readFile(file))
        .digest('hex');
  }
  return result;
}

/** Validates package identity against the locked and installed official registry records. */
export function validateRegistryPackage(name, version, pkg, pin, installed) {
  const expected = `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`;
  if (
    pkg.name !== name ||
    pkg.version !== version ||
    pin?.version !== version ||
    pin?.resolved !== expected ||
    !/^sha512-[A-Za-z0-9+/]+=*$/.test(pin?.integrity ?? '') ||
    installed?.version !== version ||
    installed?.integrity !== pin.integrity ||
    installed?.resolved !== pin.resolved ||
    pin.link ||
    installed.link
  )
    throw Error(`Registry integrity mismatch: ${name}`);
}

/** Inspects exact registry installs, module origins and hashes; persist:false preserves the trusted baseline. */
export async function verifyConsumer(root, repository, options = {}) {
  validateIsolation(root, repository);
  const read = async (file) =>
    JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
  const manifest = await read('package.json');
  const lock = await read('package-lock.json');
  validateManifest(manifest);
  const installedLock = await read('node_modules/.package-lock.json');
  const packages = {};
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    const location = `node_modules/${name}`;
    const pkg = await read(`${location}/package.json`);
    const pin = lock.packages[location];
    const installed = installedLock.packages[location];
    validateRegistryPackage(name, version, pkg, pin, installed);
    if (
      (await fs.realpath(path.join(root, location))) !==
      path.join(root, location)
    )
      throw Error(`Unexpected package symlink: ${name}`);
    packages[name] = {
      version,
      resolved: pin.resolved,
      integrity: pin.integrity,
    };
  }
  const reactModules = await read('react-module-ids.json');
  const angularModules = Object.keys(
    (await read('dist/angular/browser-stats.json')).inputs,
  );
  const virtualInputs = new Set([
    '\0vite/modulepreload-polyfill.js',
    '\0vite/preload-helper.js',
    'angular:styles/global:styles',
  ]);
  for (const id of [...reactModules, ...angularModules]) {
    if (virtualInputs.has(id)) continue;
    if (id.startsWith('\0') || id.startsWith('angular:'))
      throw Error(`Unsupported virtual builder input: ${id}`);
    const file = path.resolve(root, id.replace(/\?.*$/, ''));
    if (inside(repository, file))
      throw Error(`Repository module in consumer build: ${id}`);
    const actual = await fs.realpath(file);
    if (inside(repository, actual))
      throw Error(`Repository module in consumer build: ${id}`);
    if (!inside(root, actual))
      throw Error(`External module in consumer build: ${id}`);
  }
  const reactIds = reactModules.filter((id) => id.includes('@hashbrownai/'));
  const angularIds = angularModules.filter((id) =>
    id.includes('@hashbrownai/'),
  );
  const moduleOrigins = {
    react: await validateModuleOrigins(root, reactIds),
    angular: await validateModuleOrigins(root, angularIds),
  };
  for (const [framework, ids] of Object.entries(moduleOrigins)) {
    for (const name of ['core', framework])
      if (
        !ids.some((id) => id.startsWith(`node_modules/@hashbrownai/${name}/`))
      )
        throw Error(`Missing ${framework} ${name} origin`);
  }
  const report = {
    directory: root,
    metadataPath: path.join(root, 'consumer-metadata.json'),
    artifacts: {
      react: path.join(root, 'dist/react'),
      angular: path.join(root, 'dist/angular/browser'),
    },
    packages,
    moduleOrigins,
    sources: {
      ...(await hashTree(path.join(root, 'react/src'), root)),
      ...(await hashTree(path.join(root, 'angular/src'), root)),
    },
    templates: await hashTree(path.join(root, 'templates')),
    bundles: await hashTree(path.join(root, 'dist'), root),
    installation: {
      command: 'npm ci --ignore-scripts --no-audit --no-fund',
      lockSha256: crypto
        .createHash('sha256')
        .update(await fs.readFile(path.join(root, 'package-lock.json')))
        .digest('hex'),
    },
  };
  if (options.persist !== false)
    await fs.writeFile(
      report.metadataPath,
      JSON.stringify(report, null, 2) + '\n',
    );
  return report;
}
