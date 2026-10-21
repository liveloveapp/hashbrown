import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const json = (path: string) =>
  JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const PACKAGES = [
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
];

test('in-repo manifests carry no lifecycle scripts', () => {
  const scripts = PACKAGES.map(
    (name) => json(`packages/${name}/package.json`).scripts?.postinstall,
  );

  expect(scripts).toEqual(PACKAGES.map(() => undefined));
  expect(json('package.json').scripts.postinstall).toBeUndefined();
});

test('every package build assembles the install collector after compile', () => {
  for (const name of PACKAGES) {
    const project = json(`packages/${name}/project.json`);

    expect(project.targets.build.options.command).toBe(
      `node tools/growth/install/assemble-package.mjs ${name}`,
    );
    expect(project.targets.build.dependsOn).toContain('compile');
    expect(project.targets.compile).toBeDefined();
  }
});

test('core reads the installation token through the imports map', () => {
  const pkg = json('packages/core/package.json');

  expect(pkg.imports['#development-install']).toEqual({
    development: {
      import: './development-install.mjs',
      require: './development-install.cjs',
    },
    import: './development-install.null.mjs',
    require: './development-install.null.cjs',
  });
  expect(pkg.files).toEqual(
    expect.arrayContaining(['install/*.cjs', 'development-install.*']),
  );
  expect(
    json('packages/core/project.json').targets.compile.options.external,
  ).toEqual(['#development-install']);
  expect(
    json('tsconfig.base.json').compilerOptions.paths['#development-install'],
  ).toEqual(['packages/core/src/growth/development-install.default.ts']);
});

test('react and angular embed their published version', () => {
  for (const name of ['react', 'angular']) {
    const version = json(`packages/${name}/package.json`).version;

    const source = readFileSync(
      resolve(root, `packages/${name}/src/package-version.ts`),
      'utf8',
    );

    expect(source).toContain(
      `export const PACKAGE_VERSION = ${JSON.stringify(version)};`,
    );
    expect(
      json(`packages/${name}/project.json`).targets.compile.dependsOn,
    ).toContain('prepare');
  }
});
