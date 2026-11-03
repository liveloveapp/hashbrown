/* eslint-disable @nx/enforce-module-boundaries -- Compares native projection with the private SDK reducer and actions, which have no public entry point. */
import { type AGUIEvent, type Message } from '@ag-ui/core';
import {
  apiActions,
  internalActions,
} from '../../../../packages/core/src/actions';
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

/** Requires an observed fixture value before parsing or asserting its contents. */
function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Expected fixture value to be present.');
  return value;
}

test('native projection bounds and folds genuine SSE while holding terminal publication', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'hashbrown-native-projection-'),
  );
  const fixture = resolve(
    'tools/conformance/dotnet/tests/fixtures/native-session-projection.cs.txt',
  );
  const production = resolve('packages/dotnet/src/NativeSessionProjection.cs');

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
      join(directory, 'RequestException.cs'),
      'namespace Hashbrown.AspNetCore; internal sealed class NativeSessionRequestException(int status) : System.InvalidOperationException { internal int Status { get; } = status; }',
    );
    await writeFile(
      join(directory, 'Probe.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><PackageReference Include="AGUI.Abstractions" Version="1.0.1" /></ItemGroup></Project>',
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
    if (lifecycleOutput === undefined) {
      throw new Error('Native projection lifecycle output is missing');
    }
    const cases = JSON.parse(lifecycleOutput.slice(lifecyclePrefix.length)) as {
      name: string;
      original: { messages: Readonly<Message>[] };
      events: AGUIEvent[];
      messages: Readonly<Message>[];
    }[];
    expect(cases).toHaveLength(7);
    const browserBatchPrefix = 'Native projection browser batch: ';
    const browserBatchOutput = result.stdout
      .split('\n')
      .find((line) => line.startsWith(browserBatchPrefix));
    expect(browserBatchOutput).toBeDefined();
    if (browserBatchOutput === undefined) {
      throw new Error('Native projection browser batch output is missing');
    }
    const browserBatch = JSON.parse(
      browserBatchOutput.slice(browserBatchPrefix.length),
    ) as (typeof cases)[number];
    const richOutput = result.stdout
      .split('\n')
      .find((line) => line.startsWith('Native projection rich batch: '));
    expect(richOutput).toBeDefined();
    const richCases = JSON.parse(
      requireValue(richOutput).slice('Native projection rich batch: '.length),
    ) as typeof cases;
    expect(richCases).toHaveLength(2);
    const anonymousOutput = result.stdout
      .split('\n')
      .find((line) => line.startsWith('Native projection anonymous browser: '));
    expect(anonymousOutput).toBeDefined();
    const anonymousCases = JSON.parse(
      requireValue(anonymousOutput).slice(
        'Native projection anonymous browser: '.length,
      ),
    ) as typeof cases;
    expect(anonymousCases).toHaveLength(2);
    const serverOutput = result.stdout
      .split('\n')
      .find((line) => line.startsWith('Native projection anonymous server: '));
    expect(serverOutput).toBeDefined();
    const serverCases = JSON.parse(
      requireValue(serverOutput).slice(
        'Native projection anonymous server: '.length,
      ),
    ) as typeof cases;
    expect(serverCases).toHaveLength(1);
    for (const subject of [
      ...cases,
      browserBatch,
      ...richCases,
      ...anonymousCases,
      ...serverCases,
    ]) {
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
