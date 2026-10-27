import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { nativeStats } from '../harness/live-browser-fixture';
import { publicChildEnvironment } from '../harness/live-configuration';

for (const fault of [
  'none',
  'saved-receipt',
  'authorized-receipt',
  'public-content',
  'public-name',
  'public-arguments',
])
  test(`public genuine MAF live proof covers real journal, SDK and ${fault}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hashbrown-live-proof-'));
    const source = await readFile(
      resolve(
        'tools/conformance/dotnet/tests/fixtures/live-approval-journal.cs.txt',
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
      const result = await promisify(execFile)(
        process.env['DOTNET_HOST_PATH'] ?? 'dotnet',
        [
          'run',
          '--project',
          join(directory, 'Probe.csproj'),
          '--verbosity',
          'quiet',
          '--',
          fault,
        ],
        {
          timeout: 150_000,
          env: {
            ...publicChildEnvironment(process.env),
            DOTNET_TEST_POSTGRES: process.env['DOTNET_TEST_POSTGRES'],
          },
        },
      );

      if (fault === 'none') {
        const containers = result.stdout
          .split(/\r?\n/)
          .find((line) => line.startsWith('Native result containers: '));
        const snapshots = result.stdout
          .split(/\r?\n/)
          .filter((line) => line.startsWith('Live web stats: '))
          .map((line) =>
            nativeStats(JSON.parse(line.slice('Live web stats: '.length))),
          );

        expect(snapshots).toHaveLength(3);
        for (const [index, snapshot] of snapshots.entries()) {
          expect(snapshot.wire).toHaveLength(index + 1);
          expect(snapshot.wire).toEqual(
            Array.from({ length: index + 1 }, () => ({
              method: 'POST',
              path: '/v1/responses',
              authentication: 'bearer',
              maxOutputTokens: 384,
              store: false,
              status: 200,
            })),
          );
        }
        expect(containers).toBeDefined();
        process.stdout.write(`${containers}\n`);
      }
      expect(result.stdout).toContain(
        fault === 'none'
          ? 'Live approval real journal and native SDK proof passed; in-memory transport only.'
          : `Live approval negative observation rejected: ${fault}`,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 180_000);
