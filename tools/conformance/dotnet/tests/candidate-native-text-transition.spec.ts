import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

interface TransitionObservation {
  readonly api: string;
  readonly mutation: string;
  readonly available: boolean;
  readonly publicRequest: {
    readonly messages: readonly {
      readonly id: string;
      readonly content?: string;
      readonly toolCalls?: readonly {
        readonly id: string;
        readonly function: {
          readonly name: string;
          readonly arguments: string;
        };
      }[];
    }[];
  } | null;
  readonly browsers: readonly string[];
  readonly forwardedTerminal: boolean;
  readonly released: boolean;
  readonly releasedTerminal: {
    readonly outcome: {
      readonly interrupts: readonly { readonly toolCallId: string }[];
      readonly pendingToolCallIds: readonly string[];
    };
  } | null;
}

/** Compiles the actual production fold with a private captured-shape characterization fixture. */
async function observeTransitions(
  mode: string,
): Promise<TransitionObservation[]> {
  const directory = await mkdtemp(join(tmpdir(), 'hashbrown-text-transition-'));
  try {
    await writeFile(
      join(directory, 'Program.cs'),
      await readFile(
        resolve(
          'tools/conformance/dotnet/tests/fixtures/candidate-native-text-transition.cs.txt',
        ),
        'utf8',
      ),
    );
    await writeFile(
      join(directory, 'Projection.cs'),
      await readFile(
        resolve('packages/dotnet/src/NativeSessionProjection.cs'),
        'utf8',
      ),
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
        '--',
        mode,
      ],
      { timeout: 60_000, env: process.env },
    ).catch((error) => {
      throw new Error(String(error.stdout) + String(error.stderr));
    });
    const line = result.stdout
      .split('\n')
      .find((value) => value.startsWith('Transitions: '));
    if (line === undefined)
      throw new Error('Projection transition observations missing.');
    return JSON.parse(
      line.slice('Transitions: '.length),
    ) as TransitionObservation[];
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('actual pinned Chat and Responses text-end diagnostics preserve text, calls and held terminal', async () => {
  const expectedIds = [
    'split-browser-one',
    'split-protected-one',
    'split-browser-two',
    'split-protected-two',
  ];

  const observations = await observeTransitions('positive');

  expect(observations.map((value) => value.api)).toEqual(['chat', 'responses']);
  for (const observation of observations) {
    expect(observation.available).toBe(true);
    expect(observation.forwardedTerminal).toBe(false);
    expect(observation.released).toBe(true);
    expect(observation.browsers).toEqual([
      'split-browser-one',
      'split-browser-two',
    ]);
    const messages = observation.publicRequest?.messages;
    if (messages === undefined)
      throw new Error('Available projection has no public messages.');
    expect(messages.map((message) => message.content ?? '').join('')).toBe(
      'PromptFirst actual announcement café Second actual announcement 🛫 ',
    );
    const locations = messages.flatMap((message) =>
      (message.toolCalls ?? []).map((call) => ({ parent: message.id, call })),
    );
    expect(locations.map(({ call }) => call.id)).toEqual(expectedIds);
    expect(
      locations.map(({ call }) => JSON.parse(call.function.arguments)),
    ).toEqual([
      { city: 'First owned city' },
      { code: 'PDX' },
      { city: 'Second owned city' },
      { code: 'SEA' },
    ]);
    expect(locations.map(({ parent }) => parent)).toEqual(
      observation.api === 'chat'
        ? ['chat-parent', 'chat-parent', 'chat-parent', 'chat-parent']
        : ['msg-one', 'msg-one', 'msg-two', 'msg-two'],
    );
    expect(
      observation.releasedTerminal?.outcome.interrupts.map(
        (item) => item.toolCallId,
      ),
    ).toEqual(['split-protected-one', 'split-protected-two']);
    expect(observation.releasedTerminal?.outcome.pendingToolCallIds).toEqual(
      observation.browsers,
    );
  }
}, 120_000);

test('deferred text-end diagnostics confer no authority across missing, forged or cross-message updates', async () => {
  const mutations = [
    'missing-next',
    'terminal-next',
    'step-next',
    'second-end',
    'missing-next-raw',
    'changed-next-raw',
    'wrong-end-id',
    'wrong-raw-message',
    'wrong-parent',
    'forged-call-id',
    'foreign-tool',
    'changed-arguments',
    'missing-approval-witness',
    'missing-provider-witness',
    'wrong-content-index',
    'untrusted-alias',
    'unsupported-sibling',
    'raw-extra-key',
    'raw-metadata',
    'continuation',
    'annotations',
    'wrong-role',
    'missing-sibling',
    'later-arguments',
  ];

  const observations = await observeTransitions('negative');

  expect(observations).toHaveLength(mutations.length * 2 - 1);
  for (const api of ['chat', 'responses']) {
    expect(
      observations
        .filter((item) => item.api === api)
        .map((item) => item.mutation),
    ).toEqual(
      api === 'chat'
        ? mutations.filter(
            (mutation) => mutation !== 'missing-provider-witness',
          )
        : mutations,
    );
  }
  for (const observation of observations) {
    expect({
      api: observation.api,
      mutation: observation.mutation,
      available: observation.available,
    }).toEqual({
      api: observation.api,
      mutation: observation.mutation,
      available: false,
    });
    expect(observation.publicRequest).toBeNull();
    expect(observation.forwardedTerminal).toBe(false);
    expect(observation.released).toBe(false);
    expect(observation.releasedTerminal).toBeNull();
  }
}, 120_000);
