import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('native approval admission enforces the protected boundary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hashbrown-native-approval-admission-'));
  const source = await readFile(resolve('tools/conformance/dotnet/tests/fixtures/native-approval-admission.cs.txt'), 'utf8');
  const project = resolve('tools/conformance/dotnet/Hashbrown.Conformance.csproj');

  try {
    await writeFile(join(directory, 'Probe.csproj'), `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><ProjectReference Include="${project}" /></ItemGroup></Project>`);
    await writeFile(join(directory, 'Program.cs'), source);
    const result = await execute(process.env['DOTNET_HOST_PATH'] ?? 'dotnet', ['run', '--project', join(directory, 'Probe.csproj'), '--verbosity', 'quiet'], { timeout: 150_000, env: process.env });

    expect(result.stdout).toContain('Native approval admission contracts passed.');
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    throw new Error(`${failure.stdout ?? ''}\n${failure.stderr ?? String(error)}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 180_000);
