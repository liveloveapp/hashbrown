import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('native PostgreSQL schema2 migration preserves v1 authority and fails closed', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'hashbrown-native-approval-store-'),
  );
  const source = await readFile(
    resolve(
      'tools/conformance/dotnet/tests/fixtures/native-approval-store.cs.txt',
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
    await writeFile(
      join(directory, 'native-session-v1.sql.txt'),
      await readFile(
        resolve(
          'tools/conformance/dotnet/tests/fixtures/native-session-v1.sql.txt',
        ),
        'utf8',
      ),
    );
    const result = await execute(
      process.env['DOTNET_HOST_PATH'] ?? 'dotnet',
      [
        'run',
        '--project',
        join(directory, 'Probe.csproj'),
        '--verbosity',
        'quiet',
      ],
      {
        timeout: 120_000,
        env: {
          ...process.env,
          NATIVE_V1_DDL: join(directory, 'native-session-v1.sql.txt'),
        },
      },
    );

    expect(result.stdout).toContain('Native approval schema contracts passed.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 150_000);
