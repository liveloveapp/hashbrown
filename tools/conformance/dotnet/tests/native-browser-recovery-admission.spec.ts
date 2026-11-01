import { createDotnetProbeDirectory } from '../harness/dotnet-probe-directory';
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('native browser recovery requires explicit V2 capability and strict admission before native authority', async () => {
  const directory = await createDotnetProbeDirectory(
    'hashbrown-native-browser-recovery-admission-',
  );
  const source = await readFile(
    resolve(
      'tools/conformance/dotnet/tests/fixtures/native-browser-recovery-admission.cs.txt',
    ),
    'utf8',
  );
  const project = resolve(
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
  );

  try {
    await writeFile(
      join(directory, 'Probe.csproj'),
      `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><ProjectReference Include="${project}" /></ItemGroup></Project>`,
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
      'Native browser recovery admission passed.',
    );
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    throw new Error(
      `${failure.stdout ?? ''}\n${failure.stderr ?? String(error)}`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 150_000);
