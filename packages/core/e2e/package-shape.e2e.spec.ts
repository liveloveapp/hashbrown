import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type PackedPackage = {
  filename: string;
};

const workspaceRoot = resolve(__dirname, '../../..');
const coreDistPath = join(workspaceRoot, 'dist/packages/core');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
    encoding: 'utf8',
  });
}

function createPackageSandbox(): string {
  const sandboxPath = mkdtempSync(join(tmpdir(), 'hashbrown-core-package-'));
  const packResult = run(
    npmCommand,
    ['pack', coreDistPath, '--pack-destination', sandboxPath, '--json'],
    workspaceRoot,
  );

  if (packResult.status !== 0) {
    throw new Error(packResult.stderr || packResult.stdout);
  }

  const [packedPackage] = JSON.parse(packResult.stdout) as PackedPackage[];
  if (!packedPackage) {
    throw new Error('npm pack did not return a package');
  }

  const installResult = run(
    npmCommand,
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
      join(sandboxPath, packedPackage.filename),
    ],
    sandboxPath,
  );

  if (installResult.status !== 0) {
    throw new Error(installResult.stderr || installResult.stdout);
  }

  return sandboxPath;
}

test('packed Core package includes generated chunks and supports ESM and CJS', () => {
  const sandboxPath = createPackageSandbox();
  const installedCorePath = join(sandboxPath, 'node_modules/@hashbrownai/core');
  const generatedIndexFiles = readdirSync(coreDistPath).filter((file) =>
    file.startsWith('index'),
  );

  try {
    const result = run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
          import { createRequire } from 'node:module';
          import { dirname, join } from 'node:path';
          import { pathToFileURL } from 'node:url';

          const require = createRequire(import.meta.url);
          const packageJsonPath = require.resolve(
            '@hashbrownai/core/package.json',
          );
          const packageJson = require(packageJsonPath);
          const agUiCoreVersion = packageJson.dependencies?.['@ag-ui/core'];
          const agUiClientVersion = packageJson.dependencies?.['@ag-ui/client'];
          if (
            agUiCoreVersion !== '0.0.58' ||
            agUiClientVersion !== agUiCoreVersion
          ) {
            throw new Error(
              'Core must declare exact matching @ag-ui/core and @ag-ui/client dependencies',
            );
          }
          const cjs = require('@hashbrownai/core');
          const cjsPartialJson = require('@cacheplane/partial-json');
          const esm = await import(
            pathToFileURL(join(dirname(packageJsonPath), packageJson.module))
          );
          const esmPartialJson = await import('@cacheplane/partial-json');

          for (const [format, core, partialJson] of [
            ['CJS', cjs, cjsPartialJson],
            ['ESM', esm, esmPartialJson],
          ]) {
            const legacyExports = [
              'createParserState',
              'finalizeJsonParse',
              'getResolvedValue',
              'parseChunk',
            ].filter((name) => name in core);
            const parsed = partialJson.finish(
              partialJson.push(partialJson.create(), '{"value":2}'),
            );
            const schema = core.s.object('result', {
              value: core.s.number('value'),
            });
            const output = core.s.fromJsonAst(schema, parsed);

            if (
              legacyExports.length > 0 ||
              output.result.state !== 'match' ||
              output.result.value.value !== 2
            ) {
              throw new Error(
                \`\${format} parser boundary returned \${JSON.stringify({
                  legacyExports,
                  output,
                })}\`,
              );
            }
          }
        `,
      ],
      sandboxPath,
    );

    expect(
      generatedIndexFiles.filter(
        (file) => !existsSync(join(installedCorePath, file)),
      ),
    ).toEqual([]);
    expect({
      status: result.status,
      signal: result.signal,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      signal: null,
      stderr: '',
    });
  } finally {
    rmSync(sandboxPath, { recursive: true, force: true });
  }
});
