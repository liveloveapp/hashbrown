import { createDotnetProbeDirectory } from '../harness/dotnet-probe-directory';
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('native PostgreSQL whole approval batches are irreversible and rejection-bound', async () => {
  const directory = await createDotnetProbeDirectory('hashbrown-native-store-');
  const source = await readFile(
    resolve(
      'tools/conformance/dotnet/tests/fixtures/native-approval-decisions.cs.txt',
    ),
    'utf8',
  );
  const project = resolve(
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
  );

  try {
    await writeFile(
      join(directory, 'Probe.csproj'),
      `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><ProjectReference Include="${project}" /></ItemGroup></Project>`,
    );
    await writeFile(join(directory, 'Program.cs'), source);
    const result = await execute(
      process.env['DOTNET_HOST_PATH'] ?? 'dotnet',
      [
        'run',
        '--project',
        join(directory, 'Probe.csproj'),
        '--verbosity',
        'quiet',
      ],
      { timeout: 120_000, env: process.env },
    );

    expect(result.stdout).toContain(
      'Native approval decision contracts passed.',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 150_000);
