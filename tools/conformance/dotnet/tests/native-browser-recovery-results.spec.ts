import { createDotnetProbeDirectory } from '../harness/dotnet-probe-directory';
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** Requires an observed fixture value before parsing or asserting its contents. */
function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Expected fixture value to be present.');
  return value;
}
const codecs = [
  'unsupported-getter',
  'default-string',
  'raw-string',
  'raw-json',
  'default-null',
  'default-void',
  'unsupported-ai-content',
  'unsupported-ai-content-array',
  'oversize-string',
  'deep-json',
  'aggregate-results',
  'refuse-complete',
  'lease-lost',
  'mutate-after-complete',
] as const;
const selected = process.env['HASHBROWN_BROWSER_RESULT_PROFILE'];
if (selected && !codecs.includes(selected as (typeof codecs)[number]))
  throw new Error(`Unknown native result profile: ${selected}`);
const manifest = codecs
  .filter((codec) => !selected || codec === selected)
  .flatMap((codec) =>
    ['openai', 'azure'].flatMap((provider) =>
      ['chat-completions', 'responses'].map((api) => ({
        id: `${provider}-${api}-${codec}`,
        codec,
        provider,
        api,
        capture: false,
        mixed: true,
        outcome: 'string',
        decision: 'approved',
        order: 'browser-first',
        split: false,
        browserCount: 1,
        protectedCount: codec === 'aggregate-results' ? 2 : 1,
        rich: false,
        missingIds: false,
      })),
    ),
  );

test('actual recovered native returns require a bounded independent witness before provider serialization without reading unsupported getters', async () => {
  const directory = await createDotnetProbeDirectory(
    'hashbrown-browser-results-',
  );
  const project = resolve(
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
  );
  const source = await readFile(
    resolve(
      'tools/conformance/dotnet/tests/fixtures/native-browser-recovery-wire.cs.txt',
    ),
    'utf8',
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
      {
        timeout: 240_000,
        maxBuffer: 32 * 1024 * 1024,
        env: {
          ...process.env,
          HASHBROWN_BROWSER_WIRE_CASES: JSON.stringify(manifest),
        },
      },
    ).catch((error) => {
      const failure = error as {
        message?: string;
        stdout?: string;
        stderr?: string;
      };
      throw new Error(
        `${failure.message ?? 'Result child failed'}\n${(failure.stderr ?? '').slice(-12_000)}\n${(failure.stdout ?? '').slice(-8_000)}`,
      );
    });

    const line = result.stdout
      .split('\n')
      .find((value) => value.startsWith('Recovery wire: '));
    expect(line).toBeDefined();
    const rows = JSON.parse(
      requireValue(line).slice('Recovery wire: '.length),
    ) as {
      id: string;
      codec: string;
      api: string;
      setupError?: string;
      effects: number;
      mutationBeforeRaw: string | null;
      mutationAfterRaw: string | null;
      mutationsAfterDurableComplete: number;
      getterReads: number;
      completeAttempts: number;
      fenceState: string;
      invocationStates: { Id: string; State: string }[];
      body: Record<string, unknown> | null;
      wires: Record<string, unknown>[];
      routeBody: string;
      ordinaryBody: string | null;
      ordinaryBodies: (string | null)[];
      saved: Record<string, unknown> | null;
      originalCalls: { id: string; output: string }[];
    }[];
    if (process.env['HASHBROWN_BROWSER_RESULT_EVIDENCE'])
      await writeFile(
        requireValue(process.env['HASHBROWN_BROWSER_RESULT_EVIDENCE']),
        JSON.stringify(rows),
      );
    expect(rows.map((row) => row.id)).toEqual(
      manifest.map((subject) => subject.id),
    );
    for (const row of rows) {
      expect({ id: row.id, setupError: row.setupError }).toEqual({
        id: row.id,
        setupError: undefined,
      });
      expect(row.effects).toBe(row.codec === 'aggregate-results' ? 2 : 1);
      expect(row.getterReads).toBe(0);
      if (row.codec === 'mutate-after-complete') {
        expect(row.mutationBeforeRaw).toBe('{"value":"before"}');
        expect(row.mutationAfterRaw).toBe('{"value":"after!"}');
        expect(row.mutationsAfterDurableComplete).toBe(1);
      }
      if (
        [
          'unsupported-getter',
          'unsupported-ai-content',
          'unsupported-ai-content-array',
          'oversize-string',
          'deep-json',
          'aggregate-results',
          'refuse-complete',
          'lease-lost',
          'mutate-after-complete',
        ].includes(row.codec)
      ) {
        expect(row.body).toBeNull();
        expect(row.wires).toEqual([]);
        expect(row.routeBody).not.toContain('RUN_FINISHED');
        expect(row.saved).toBeNull();
        expect(row.fenceState).toBe('Blocked');
        if (row.codec !== 'aggregate-results')
          expect(row.completeAttempts).toBe(
            ['refuse-complete', 'lease-lost', 'mutate-after-complete'].includes(
              row.codec,
            )
              ? 1
              : 0,
          );
        if (row.codec === 'aggregate-results') {
          expect(Number.isSafeInteger(row.completeAttempts)).toBe(true);
          expect(row.completeAttempts).toBeGreaterThanOrEqual(0);
          expect(row.completeAttempts).toBeLessThanOrEqual(1);
          expect(row.invocationStates).toHaveLength(2);
          expect(
            row.invocationStates.some((item) => item.State === 'Started'),
          ).toBe(true);
          expect(
            row.invocationStates.every(
              (item) => item.State === 'Started' || item.State === 'Completed',
            ),
          ).toBe(true);
        } else
          expect(row.invocationStates).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                Id: 'protected',
                State:
                  row.codec === 'mutate-after-complete'
                    ? 'Completed'
                    : 'Started',
              }),
            ]),
          );
      } else {
        expect(row.routeBody).toContain('RUN_FINISHED');
        expect(row.ordinaryBodies).toHaveLength(2);
        for (const ordinary of row.ordinaryBodies)
          expect(ordinary).toContain('RUN_FINISHED');
        expect(row.fenceState).toBe('Ready');
        expect(row.wires).toHaveLength(3);
        for (const body of row.wires) {
          const history = (
            row.api === 'responses' ? body.input : body.messages
          ) as Record<string, unknown>[];
          const results = history
            .filter((item) =>
              row.api === 'responses'
                ? item.type === 'function_call_output'
                : item.role === 'tool',
            )
            .map((item) => ({
              id: row.api === 'responses' ? item.call_id : item.tool_call_id,
              output: row.api === 'responses' ? item.output : item.content,
            }));
          expect(results).toEqual(
            row.originalCalls.map(({ id, output }) => ({ id, output })),
          );
        }
        const savedResults = (
          requireValue(row.saved).messages as {
            role: string;
            toolCallId?: string;
            content?: string;
          }[]
        )
          .filter((item) => item.role === 'tool')
          .map((item) => ({ id: item.toolCallId, output: item.content }));
        expect(savedResults).toEqual(
          row.originalCalls.map(({ id, output }) => ({ id, output })),
        );
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 270_000);
