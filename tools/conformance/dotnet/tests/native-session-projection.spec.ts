import { type AGUIEvent, type Message } from '@ag-ui/core';
import { apiActions, internalActions } from '../../../../packages/core/src/actions';
import {
  initialAgUiMessagesState,
  reducer,
} from '../../../../packages/core/src/reducers/ag-ui-messages.reducer';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('native projection bounds and folds genuine SSE while holding terminal publication', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hashbrown-native-projection-'));
  const fixture = resolve(
    'tools/conformance/dotnet/tests/fixtures/native-session-projection.cs.txt',
  );
  const production = resolve(
    'tools/conformance/dotnet/Integration/NativeSessionProjection.cs',
  );

  try {
    await writeFile(
      join(directory, 'Program.cs'),
      await readFile(fixture, 'utf8'),
    );
    await writeFile(
      join(directory, 'Projection.cs'),
      await readFile(production, 'utf8'),
    );
    await writeFile(
      join(directory, 'Probe.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><PackageReference Include="AGUI.Abstractions" Version="1.0.1" /></ItemGroup></Project>',
    );
    const result = await execute(
      process.env['DOTNET_HOST_PATH'] ?? 'dotnet',
      ['run', '--project', join(directory, 'Probe.csproj'), '--verbosity', 'quiet'],
      { timeout: 60_000, env: process.env },
    ).catch((error) => {
      throw new Error(String(error.stdout) + String(error.stderr));
    });

    expect(result.stdout).toContain('Native session projection passed.');
    const lifecyclePrefix = 'Native projection lifecycle: ';
    const lifecycleOutput = result.stdout
      .split('\n')
      .find((line) => line.startsWith(lifecyclePrefix));
    expect(lifecycleOutput).toBeDefined();
    const cases = JSON.parse(lifecycleOutput!.slice(lifecyclePrefix.length)) as {
      name: string;
      original: { messages: Readonly<Message>[] };
      events: AGUIEvent[];
      messages: Readonly<Message>[];
    }[];
    expect(cases).toHaveLength(7);
    for (const subject of cases) {
      const active = reducer(
        {
          ...initialAgUiMessagesState,
          committed: subject.original.messages,
        },
        internalActions.generationAttemptStarted(),
      );

      const sdk = subject.events.reduce(
        (state, event) =>
          reducer(state, apiActions.generateMessageEvent(event)),
        active,
      );

      expect(sdk.protocolError).toBeUndefined();
      expect({ name: subject.name, messages: subject.messages }).toEqual({
        name: subject.name,
        messages: sdk.draft,
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);
