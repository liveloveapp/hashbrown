/* eslint-disable @nx/enforce-module-boundaries -- Exercises real HTTP recovery snapshots through both recipe readers and the unchanged source SDK restoration guard. */
import { createChatRuntime } from '../../../../packages/core/src/chat-runtime';
import { s } from '../../../../packages/core/src/schema';
import * as reactRecovery from '../../hosts/react/src/recovery';
import * as angularRecovery from '../../hosts/angular/src/recovery';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('native approval host enforces the protected boundary', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'hashbrown-native-approval-host-'),
  );
  const source = await readFile(
    resolve(
      'tools/conformance/dotnet/tests/fixtures/native-approval-host.cs.txt',
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
      { timeout: 150_000, env: process.env },
    );

    expect(result.stdout).toContain('Native approval host contracts passed.');
    const prefix = 'Native approval recovery evidence: ';
    const output = result.stdout
      .split('\n')
      .find((line) => line.startsWith(prefix));
    if (output === undefined) {
      throw new Error('Native host did not emit recovery evidence.');
    }
    const recovered = JSON.parse(output.slice(prefix.length)) as {
      name: string;
      envelope: unknown;
    }[];
    expect(recovered.map((item) => item.name)).toEqual([
      'native-pending',
      'declined-completed',
      'cancelled-completed',
      'browser-first-mixed-pending',
      'server-first-mixed-pending',
      'siblings-mixed-pending',
    ]);
    for (const reader of [reactRecovery, angularRecovery]) {
      for (const item of recovered) {
        const envelope = reader.readRecovery(item.envelope);
        if (!envelope.snapshot) {
          expect(reader.recoveryBlocked(envelope)).toBe(true);
          expect(reader.recoveryStatus(envelope)).toContain(
            'Start a new thread',
          );
          continue;
        }
        let transports = 0;
        let handlers = 0;
        const runtime = createChatRuntime({
          system: '',
          debounce: 0,
          tools: [
            {
              name: 'frontend',
              description: 'browser',
              schema: s.object('input', { city: s.string('city') }),
              handler: async () => {
                handlers++;
                return 'unexpected';
              },
            },
          ],
          transport: {
            name: 'read-only-restoration',
            send: async () => {
              transports++;
              throw new Error('Recovery must not execute');
            },
          },
        });

        runtime.restoreConversation(envelope.snapshot, {
          expectedRevision: runtime.recovery().revision,
          structuredHistory: 'preserve-diagnostics',
        });
        const cleanup = runtime.start();
        for (let index = 0; index < 10; index++)
          await new Promise((resolve) => setTimeout(resolve, 0));

        expect(reader.recoveryBlocked(envelope)).toBe(false);
        expect(runtime.pendingInterrupts()?.interrupts).toEqual(
          envelope.snapshot.interrupts,
        );
        expect(transports).toBe(0);
        expect(handlers).toBe(0);
        cleanup();
      }
    }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    throw new Error(
      `${failure.stdout ?? ''}\n${failure.stderr ?? String(error)}`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 180_000);
