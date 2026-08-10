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
          const cjs = require('@hashbrownai/core');
          const esm = await import(
            pathToFileURL(join(dirname(packageJsonPath), packageJson.module))
          );

          for (const [format, core] of [
            ['CJS', cjs],
            ['ESM', esm],
          ]) {
            const parsed = core.finalizeJsonParse(
              core.parseChunk(
                core.createParserState(),
                '{"value":2}',
              ),
            );
            const value = core.getResolvedValue(parsed);

            if (parsed.error || value.value !== 2) {
              throw new Error(
                \`\${format} parser returned \${JSON.stringify(value)}\`,
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
