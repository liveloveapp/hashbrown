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
const profiles = [
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
const supported = [
  'default-string',
  'raw-string',
  'raw-json',
  'default-null',
  'default-void',
];
const selected = process.env['HASHBROWN_HELD_RESULT_PROFILE'];
if (selected && !profiles.includes(selected as (typeof profiles)[number]))
  throw new Error(`Unknown held result profile: ${selected}`);
const manifest = profiles
  .filter((profile) => !selected || profile === selected)
  .flatMap((heldCodec) =>
    ['openai', 'azure'].flatMap((provider) =>
      ['chat-completions', 'responses'].map((api) => ({
        id: `${provider}-${api}-held-${heldCodec}`,
        heldCodec,
        codec:
          heldCodec === 'aggregate-results' ? 'aggregate-results' : undefined,
        provider,
        api,
        capture: false,
        mixed: true,
        outcome: 'string',
        decision: 'approved',
        order: 'browser-first',
        split: false,
        browserCount: 1,
        protectedCount: 1,
        rich: false,
        missingIds: false,
        flow: 'deferred-read',
      })),
    ),
  );

test('held actual returns have separate getter-free value authority and durable H-specific fences', async () => {
  const directory = await createDotnetProbeDirectory('hashbrown-held-results-');
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
        `${failure.message ?? 'Held result child failed'}\n${(failure.stderr ?? '').slice(-12_000)}\n${(failure.stdout ?? '').slice(-8_000)}`,
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
      heldCodec: string;
      api: string;
      setupError?: string;
      effects: number;
      freshEffects: number;
      initialFreshEffects: number;
      getterReads: number;
      mutationBeforeRaw: string | null;
      mutationAfterRaw: string | null;
      mutationsAfterDurableComplete: number;
      completeAttempts: number;
      fenceState: string;
      invocationStates: { Id: string; State: string }[];
      body: unknown;
      wires: Record<string, unknown>[];
      stages: string[];
      initialStageCount: number;
      routeBody: string;
      ordinaryBodies: (string | null)[];
      saved: Record<string, unknown> | null;
      admittedMessages: unknown[];
      original: Record<string, unknown>;
      opaque: string | null;
      ordinaryOpaques: (string | null)[];
    }[];
    if (process.env['HASHBROWN_HELD_RESULT_EVIDENCE'])
      await writeFile(
        requireValue(process.env['HASHBROWN_HELD_RESULT_EVIDENCE']),
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
      expect(row.initialFreshEffects).toBe(0);
      expect(row.effects).toBe(1);
      expect(row.freshEffects).toBe(1);
      expect(row.getterReads).toBe(0);
      expect(row.invocationStates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ Id: 'protected', State: 'Completed' }),
        ]),
      );
      if (!supported.includes(row.heldCodec)) {
        expect(row.body).toBeNull();
        expect(row.wires).toEqual([]);
        expect(row.routeBody).not.toContain('RUN_FINISHED');
        expect(row.saved).toBeNull();
        expect(row.fenceState).toBe('Blocked');
        expect(row.completeAttempts).toBe(
          ['refuse-complete', 'lease-lost', 'mutate-after-complete'].includes(
            row.heldCodec,
          )
            ? 1
            : 0,
        );
        expect(row.invocationStates).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              Id: 'deferred-read',
              State:
                row.heldCodec === 'mutate-after-complete'
                  ? 'Completed'
                  : 'Started',
            }),
          ]),
        );
        expect(row.stages.slice(row.initialStageCount)).not.toContain(
          'Recovery.Held.Sealed',
        );
        if (row.heldCodec === 'mutate-after-complete') {
          expect(row.mutationBeforeRaw).toBe('{"value":"before"}');
          expect(row.mutationAfterRaw).toBe('{"value":"after!"}');
          expect(row.mutationsAfterDurableComplete).toBe(1);
        }
      } else {
        expect(row.fenceState).toBe('Ready');
        expect(row.completeAttempts).toBe(1);
        expect(row.wires).toHaveLength(3);
        expect(row.ordinaryBodies).toHaveLength(2);
        for (const body of [row.routeBody, ...row.ordinaryBodies]) {
          const events = requireValue(body)
            .split(/\r?\n\r?\n/)
            .filter(Boolean)
            .map(
              (frame) =>
                JSON.parse(
                  requireValue(
                    frame
                      .split('\n')
                      .find((value) => value.startsWith('data:')),
                  ).slice(5),
                ) as { type: string },
            );
          expect(events[0]?.type).toBe('RUN_STARTED');
          expect(
            events.filter((event) => event.type === 'RUN_FINISHED'),
          ).toHaveLength(1);
          expect(events.at(-1)?.type).toBe('RUN_FINISHED');
          expect(events.some((event) => event.type === 'RUN_ERROR')).toBe(
            false,
          );
        }
        const expected = [
          { id: 'browser', output: 'exact known browser result' },
          { id: 'protected', output: JSON.stringify('protected effect') },
          {
            id: 'deferred-read',
            output:
              row.heldCodec === 'raw-json'
                ? '{\n  "known": true,\n  "unicode": "café",\n  "nested": [1, 2]\n}'
                : row.heldCodec === 'default-string'
                  ? JSON.stringify('exact café "quoted" \\ slash')
                  : row.heldCodec === 'raw-string'
                    ? 'exact café "quoted" \\ slash'
                    : row.heldCodec === 'default-null'
                      ? 'null'
                      : 'Success: Function completed.',
          },
        ];
        for (const body of row.wires) {
          const history = (
            row.api === 'responses' ? body.input : body.messages
          ) as Record<string, unknown>[];
          const pending = new Set<string>();
          const results: { id: unknown; output: unknown }[] = [];
          const calls: { id: unknown; name: unknown; arguments: unknown }[] =
            [];
          for (const item of history) {
            const isOutput =
              row.api === 'responses'
                ? item.type === 'function_call_output'
                : item.role === 'tool';
            if (
              !isOutput &&
              !(row.api === 'responses' && item.type === 'function_call')
            )
              expect([...pending]).toEqual([]);
            const announced =
              row.api === 'responses'
                ? item.type === 'function_call'
                  ? [item]
                  : []
                : ((item.tool_calls ?? []) as Record<string, unknown>[]);
            for (const call of announced) {
              const id = (
                row.api === 'responses' ? call.call_id : call.id
              ) as string;
              expect(calls.some((value) => value.id === id)).toBe(false);
              pending.add(id);
              const fn =
                row.api === 'responses'
                  ? call
                  : (call.function as Record<string, unknown>);
              calls.push({
                id,
                name: fn.name,
                arguments: JSON.parse(fn.arguments as string),
              });
            }
            if (isOutput) {
              const id = (
                row.api === 'responses' ? item.call_id : item.tool_call_id
              ) as string;
              expect(pending.delete(id)).toBe(true);
              results.push({
                id,
                output: row.api === 'responses' ? item.output : item.content,
              });
            }
          }
          expect([...pending]).toEqual([]);
          expect(calls).toEqual([
            { id: 'browser', name: 'frontend', arguments: {} },
            { id: 'protected', name: 'backend', arguments: {} },
            { id: 'deferred-read', name: 'read', arguments: {} },
          ]);
          expect(results).toEqual(expected);
          expect(JSON.stringify(body)).not.toContain('"recovery"');
          if (row.api === 'responses') {
            expect(body.store).toBe(false);
            expect(body).not.toHaveProperty('previous_response_id');
            expect(body).not.toHaveProperty('conversation');
          }
        }
        expect(
          (requireValue(row.saved).messages as unknown[]).slice(
            0,
            row.admittedMessages.length,
          ),
        ).toEqual(row.admittedMessages);
        for (const property of ['tools', 'state', 'forwardedProps'])
          expect(requireValue(row.saved)[property]).toEqual(
            row.original[property],
          );
        for (const opaque of [row.opaque, ...row.ordinaryOpaques]) {
          expect(opaque).not.toBeNull();
          expect(JSON.parse(requireValue(opaque))).toEqual(expect.any(Object));
          expect(opaque).not.toContain('"recovery"');
        }
        expect(row.invocationStates).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              Id: 'deferred-read',
              State: 'Completed',
            }),
          ]),
        );
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 270_000);
