import { createDotnetProbeDirectory } from '../harness/dotnet-probe-directory';
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('native Responses recovery retains canonical output and rejects information lost during adaptation', async () => {
  const directory = await createDotnetProbeDirectory('hashbrown-responses-evidence-');
  const project = resolve(
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
  );
  const source = await readFile(
    resolve(
      'tools/conformance/dotnet/tests/fixtures/responses-recovery-evidence.cs.txt',
    ),
    'utf8',
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
      { timeout: 60_000 },
    ).catch((error) => {
      throw new Error(String(error.stdout) + String(error.stderr));
    });

    expect(result.stdout).toContain(
      'Native Responses recovery evidence passed.',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
