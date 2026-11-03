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
  {
    id: 'mixed-string-approved',
    mixed: true,
    outcome: 'string',
    decision: 'approved',
    order: 'browser-first',
    split: false,
    browserCount: 1,
    protectedCount: 1,
    rich: true,
    missingIds: false,
  },
  {
    id: 'mixed-null-declined',
    mixed: true,
    outcome: 'null',
    decision: 'declined',
    order: 'protected-first',
    split: true,
    browserCount: 1,
    protectedCount: 1,
    rich: false,
    missingIds: false,
  },
  {
    id: 'mixed-object-cancelled',
    mixed: true,
    outcome: 'object',
    decision: 'cancelled',
    order: 'interleaved',
    split: false,
    browserCount: 2,
    protectedCount: 2,
    rich: false,
    missingIds: false,
  },
  {
    id: 'mixed-unavailable-approved',
    mixed: true,
    outcome: 'unavailable',
    decision: 'approved',
    order: 'interleaved',
    split: true,
    browserCount: 2,
    protectedCount: 2,
    rich: false,
    missingIds: true,
  },
  {
    id: 'browser-string',
    mixed: false,
    outcome: 'string',
    decision: null,
    order: 'browser-first',
    split: true,
    browserCount: 2,
    protectedCount: 0,
    rich: false,
    missingIds: false,
  },
  {
    id: 'browser-null',
    mixed: false,
    outcome: 'null',
    decision: null,
    order: 'browser-first',
    split: false,
    browserCount: 2,
    protectedCount: 0,
    rich: true,
    missingIds: false,
  },
  {
    id: 'browser-object',
    mixed: false,
    outcome: 'object',
    decision: null,
    order: 'browser-first',
    split: true,
    browserCount: 1,
    protectedCount: 0,
    rich: false,
    missingIds: true,
  },
  {
    id: 'browser-unavailable',
    mixed: false,
    outcome: 'unavailable',
    decision: null,
    order: 'browser-first',
    split: false,
    browserCount: 1,
    protectedCount: 0,
    rich: false,
    missingIds: false,
  },
] as const;
/** Explicit public-route scenario; failed admission/legacy characterizations are counted separately from successes. */
type WireCase = {
  id: string;
  provider: string;
  api: string;
  capture: boolean;
  mixed: boolean;
  outcome: string;
  decision: string | null;
  order: string;
  split: boolean;
  browserCount: number;
  protectedCount: number;
  rich: boolean;
  missingIds: boolean;
  flow?: string;
  decisions?: readonly string[];
  heldCount?: number;
  heldFresh?: boolean;
};
const extendedProfiles = [
  {
    id: 'mixed-three-kinds-grouped',
    mixed: true,
    outcome: 'object',
    decision: null,
    decisions: ['approved', 'declined', 'cancelled'],
    order: 'interleaved',
    split: false,
    browserCount: 2,
    protectedCount: 3,
    rich: true,
    missingIds: false,
  },
  {
    id: 'mixed-three-kinds-split',
    mixed: true,
    outcome: 'unavailable',
    decision: null,
    decisions: ['approved', 'declined', 'cancelled'],
    order: 'interleaved',
    split: true,
    browserCount: 2,
    protectedCount: 3,
    rich: false,
    missingIds: true,
  },
  {
    id: 'fresh-read',
    flow: 'fresh-read',
    mixed: true,
    outcome: 'string',
    decision: 'approved',
    order: 'browser-first',
    split: false,
    browserCount: 1,
    protectedCount: 1,
    rich: false,
    missingIds: false,
  },
  {
    id: 'warm-native',
    flow: 'warm-native',
    mixed: true,
    outcome: 'string',
    decision: 'approved',
    order: 'protected-first',
    split: false,
    browserCount: 0,
    protectedCount: 1,
    rich: false,
    missingIds: false,
  },
  {
    id: 'warm-mixed-cancel',
    flow: 'warm-mixed-cancel',
    mixed: true,
    outcome: 'string',
    decision: 'approved',
    order: 'browser-first',
    split: false,
    browserCount: 1,
    protectedCount: 1,
    rich: false,
    missingIds: false,
  },
  {
    id: 'reuse-original-id',
    flow: 'reuse-original-id',
    mixed: true,
    outcome: 'string',
    decision: 'approved',
    order: 'browser-first',
    split: false,
    browserCount: 1,
    protectedCount: 1,
    rich: false,
    missingIds: false,
  },
  {
    id: 'deferred-read',
    flow: 'deferred-read',
    mixed: true,
    outcome: 'string',
    decision: 'approved',
    order: 'browser-first',
    split: false,
    browserCount: 1,
    protectedCount: 1,
    rich: false,
    missingIds: false,
  },
  {
    id: 'held-browser-only',
    flow: 'deferred-read',
    heldCount: 1,
    mixed: false,
    outcome: 'object',
    decision: null,
    order: 'browser-first',
    split: false,
    browserCount: 2,
    protectedCount: 0,
    rich: false,
    missingIds: false,
  },
  {
    id: 'held-two-reverse',
    flow: 'deferred-read',
    heldCount: 2,
    mixed: true,
    outcome: 'string',
    decision: 'approved',
    order: 'protected-first',
    split: false,
    browserCount: 1,
    protectedCount: 1,
    rich: false,
    missingIds: false,
  },
  {
    id: 'held-three-rich',
    flow: 'deferred-read',
    heldCount: 3,
    mixed: true,
    outcome: 'string',
    decision: null,
    decisions: ['approved', 'declined', 'cancelled'],
    order: 'interleaved',
    split: false,
    browserCount: 2,
    protectedCount: 3,
    rich: true,
    missingIds: false,
  },
  {
    id: 'held-three-split-null',
    flow: 'deferred-read',
    heldCount: 3,
    mixed: true,
    outcome: 'unavailable',
    decision: null,
    decisions: ['approved', 'declined', 'cancelled'],
    order: 'interleaved',
    split: true,
    browserCount: 2,
    protectedCount: 3,
    rich: false,
    missingIds: true,
  },
  {
    id: 'held-two-fresh',
    flow: 'deferred-read',
    heldCount: 2,
    heldFresh: true,
    mixed: true,
    outcome: 'null',
    decision: 'approved',
    order: 'browser-first',
    split: false,
    browserCount: 1,
    protectedCount: 1,
    rich: false,
    missingIds: false,
  },
] as const;
const declaredManifest: readonly WireCase[] = ['openai', 'azure'].flatMap(
  (provider) =>
    ['chat-completions', 'responses'].flatMap((api) => [
      {
        id: `${provider}-${api}-capture`,
        provider,
        api,
        capture: true,
        mixed: true,
        outcome: 'string',
        decision: 'declined',
        order: 'browser-first',
        split: false,
        browserCount: 1,
        protectedCount: 1,
        rich: false,
        missingIds: false,
      },
      ...[...profiles, ...extendedProfiles].map((profile) => ({
        ...profile,
        id: `${provider}-${api}-${profile.id}`,
        provider,
        api,
        capture: false,
      })),
    ]),
);

const requestedProfile = process.env['HASHBROWN_BROWSER_WIRE_PROFILE'];
const knownProfiles = [
  'capture',
  ...profiles.map((profile) => profile.id),
  ...extendedProfiles.map((profile) => profile.id),
];
if (
  requestedProfile &&
  !knownProfiles.includes(requestedProfile as (typeof knownProfiles)[number])
) {
  throw new Error(`Unknown native browser wire profile: ${requestedProfile}`);
}
const manifest = requestedProfile
  ? declaredManifest.filter((subject) =>
      subject.id.endsWith(`-${requestedProfile}`),
    )
  : declaredManifest;
if (manifest.length !== (requestedProfile ? 4 : declaredManifest.length)) {
  throw new Error('Native browser wire manifest selection is incomplete.');
}

test('production recovery preserves exact provider wires through two subsequent fresh ordinary sessions and fenced policy controls', async () => {
  const directory = await createDotnetProbeDirectory('hashbrown-browser-wire-');
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
        `${failure.message ?? 'Wire child failed'}\n${(failure.stderr ?? '').slice(-12_000)}\n${(failure.stdout ?? '').slice(-8_000)}`,
      );
    });

    const line = result.stdout
      .split('\n')
      .find((value) => value.startsWith('Recovery wire: '));
    expect(line).toBeDefined();
    const rows = JSON.parse(
      requireValue(line).slice('Recovery wire: '.length),
    ) as {
      provider: string;
      api: string;
      body: Record<string, unknown> | null;
      flow: string | null;
      heldEffects: Record<string, number>;
      freshEffects: number;
      initialFreshEffects: number;
      initialInvocationStates: { Id: string; State: string }[];
      fenceState: string;
      initialWire?: string;
      initialUpdates?: unknown[];
      id: string;
      capture: boolean;
      setupError?: string;
      effects: number;
      stop: string | null;
      stages: string[];
      initialStageCount: number;
      optionsInput: string | null;
      routeBody: string;
      declarationOnly: boolean;
      providerCalls: string[];
      routeStatus: number;
      routeErrors: string[];
      providerStatus: number | null;
      initialTerminal: {
        outcome?: {
          interrupts?: { toolCallId: string }[];
          pendingToolCallIds?: string[];
        };
      };
      admittedMessages: unknown[];
      original: Record<string, unknown>;
      saved: Record<string, unknown> | null;
      ordinarySaved: Record<string, unknown> | null;
      opaque: string | null;
      ordinaryOpaque: string | null;
      ordinaryBody: string | null;
      originalCalls: {
        id: string;
        name: string;
        arguments: string;
        output: string;
      }[];
      expectedCallsByWire: {
        id: string;
        name: string;
        arguments: string;
        output: string;
      }[][];
      ordinaryBodies: (string | null)[];
      ordinarySnapshots: (Record<string, unknown> | null)[];
      ordinaryOpaques: (string | null)[];
      optionsInputs: string[];
      invocationStates: { Id: string; State: string }[];
      wires: Record<string, unknown>[];
    }[];
    if (process.env['HASHBROWN_BROWSER_WIRE_EVIDENCE']) {
      await writeFile(
        requireValue(process.env['HASHBROWN_BROWSER_WIRE_EVIDENCE']),
        JSON.stringify(rows),
      );
    }
    console.error(
      'Recovery wire summary: ' +
        JSON.stringify(
          rows.map((row) => ({
            id: row.id,
            setupError: row.setupError,
            routeStatus: row.routeStatus,
            captured: row.body != null,
            stop: row.stop,
            routeErrors: row.routeErrors
              ?.slice(-1)
              .map((error) => error.split('\n')[0]),
          })),
        ),
    );
    expect(rows.map(({ id }) => id)).toEqual(manifest.map(({ id }) => id));
    for (const [index, row] of rows.entries()) {
      const subject = manifest[index];
      expect(row.flow ?? undefined).toBe(subject.flow);
      expect({ id: row.id, setupError: row.setupError }).toEqual({
        id: subject.id,
        setupError: undefined,
      });
      const heldIds =
        subject.flow === 'deferred-read'
          ? subject.heldCount
            ? ['z-held', 'y-held', 'a-held'].slice(0, subject.heldCount)
            : ['deferred-read']
          : [];
      if (subject.flow === 'deferred-read') {
        expect(row.initialFreshEffects).toBe(0);
        for (const id of heldIds) {
          expect(row.initialInvocationStates).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ Id: id, State: 'Captured' }),
            ]),
          );
          expect(row.originalCalls.some((call) => call.id === id)).toBe(false);
          expect(JSON.stringify(row.admittedMessages)).not.toContain(id);
        }
      }
      if (subject.flow === 'warm-mixed-cancel') {
        const resumed = row.stages.slice(row.initialStageCount);
        expect(resumed).toContain('Reserve.Committed');
        expect(resumed).toContain('Deserialize.Completed');
        expect(resumed).toContain('Run.Forward');
        const originalCalls = (
          row.original.messages as {
            toolCalls?: { id: string; metadata?: unknown }[];
          }[]
        ).flatMap((message) => message.toolCalls ?? []);
        const admittedCalls = (
          row.admittedMessages as {
            toolCalls?: { id: string; metadata?: unknown }[];
          }[]
        ).flatMap((message) => message.toolCalls ?? []);
        expect(
          originalCalls.find((call) => call.id === 'browser')?.metadata,
        ).toBeUndefined();
        expect(
          admittedCalls.find((call) => call.id === 'browser')?.metadata,
        ).toEqual({
          'b4.step': {
            v: 1,
            kind: 'server',
            status: 'cancelled',
            settledAt: 123,
          },
        });
        expect(
          row.originalCalls.find((call) => call.id === 'browser')?.output,
        ).toBe(
          'Tool call invocation rejected. No approval response was provided for this approval required tool call.',
        );
      }
      if (subject.flow === 'reuse-original-id') {
        expect(row.wires).toHaveLength(1);
        expect(row.effects).toBe(1);
        expect(row.freshEffects).toBe(0);
        expect(row.routeBody).not.toContain('RUN_FINISHED');
        expect(row.fenceState).toBe('Blocked');
        expect(row.invocationStates).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ Id: 'protected', State: 'Completed' }),
          ]),
        );
      }
      expect({
        provider: row.provider,
        api: row.api,
        routeStatus: row.routeStatus,
        routeErrors: row.routeErrors,
        captured: row.body !== null,
      }).toEqual(expect.objectContaining({ captured: true }));
      expect(row.body).not.toBeNull();
      if (subject.mixed) {
        const pendingBrowserIds = row.originalCalls
          .filter(
            (call) => call.name === 'frontend' && call.id !== 'prior-call',
          )
          .map((call) => call.id);
        if (pendingBrowserIds.length > 0)
          expect(row.initialTerminal.outcome?.pendingToolCallIds).toEqual(
            pendingBrowserIds,
          );
        else
          expect(row.initialTerminal.outcome).not.toHaveProperty(
            'pendingToolCallIds',
          );
        expect(
          row.initialTerminal.outcome?.interrupts?.map(
            (interrupt) => interrupt.toolCallId,
          ),
        ).toEqual(
          row.originalCalls
            .filter((call) => call.name === 'backend')
            .map((call) => call.id),
        );
      }
      expect(row.providerStatus).toBe(row.capture ? 400 : 200);
      expect(row.declarationOnly).toBe(true);
      expect(row.stop).toBe(row.capture ? 'ClientResultException' : null);
      expect(row.effects).toBe(
        subject.decisions
          ? subject.decisions.filter((decision) => decision === 'approved')
              .length
          : subject.decision === 'approved'
            ? subject.protectedCount
            : 0,
      );
      expect(row.freshEffects).toBe(
        subject.flow === 'deferred-read'
          ? heldIds.length + (subject.heldFresh ? 1 : 0)
          : subject.flow === 'fresh-read'
            ? 1
            : 0,
      );
      if (heldIds.length > 0)
        expect(row.heldEffects).toEqual(
          Object.fromEntries(
            ['read', 'readTwo', 'readThree']
              .slice(0, heldIds.length)
              .map((name) => [
                name,
                name === 'read' && subject.heldFresh ? 2 : 1,
              ]),
          ),
        );
      expect(row.stages).toContain('Deserialize.Completed');
      if (subject.mixed) expect(row.stages).toContain('Reserve.Committed');
      expect(row.optionsInput).not.toBeNull();
      expect(JSON.parse(requireValue(row.optionsInput))).toEqual(
        expect.objectContaining({ threadId: subject.id }),
      );
      expect(row.optionsInputs).toHaveLength(row.wires.length);
      for (const options of row.optionsInputs) {
        expect(JSON.parse(options)).toEqual(
          expect.objectContaining({ threadId: subject.id }),
        );
        expect(options).not.toContain('"recovery"');
      }
      expect(row.optionsInput).not.toContain('"recovery"');
      expect(JSON.stringify(row.body)).not.toContain('"recovery"');
      for (const [wireIndex, body] of row.wires.entries()) {
        const history = (
          row.api === 'responses' ? body.input : body.messages
        ) as Record<string, unknown>[];
        const pending = new Set<string>();
        const calls: { id: string; name: unknown; arguments: unknown }[] = [];
        const results: { id: string; output: unknown }[] = [];
        for (const item of history) {
          const output =
            row.api === 'responses'
              ? item.type === 'function_call_output'
              : item.role === 'tool';
          if (
            !output &&
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
            expect(calls.map((value) => value.id)).not.toContain(id);
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
          if (output) {
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
        const expectedCalls = row.expectedCallsByWire[wireIndex];
        expect(calls).toEqual(
          expectedCalls.map((call) => ({
            id: call.id,
            name: call.name,
            arguments: JSON.parse(call.arguments),
          })),
        );
        const expectedResults = expectedCalls.map((call) => ({
          id: call.id,
          output: call.output,
        }));
        expect(results).toEqual(expectedResults);
        expect(JSON.stringify(history)).toContain('exact system');
        expect(JSON.stringify(history)).toContain('current question');
        if (subject.rich) {
          expect(JSON.stringify(history)).toContain('prior answer');
          expect(JSON.stringify(history)).toContain(
            'current announcement text',
          );
          expect(JSON.stringify(history)).toContain('unrelated later text');
        }
        if (row.api === 'responses') {
          expect(body.store).toBe(false);
          expect(body).not.toHaveProperty('previous_response_id');
          expect(body).not.toHaveProperty('conversation');
        }
      }
      if (subject.flow === 'reuse-original-id') continue;
      if (row.capture) {
        expect(row.routeBody).not.toContain('RUN_FINISHED');
      } else {
        if (subject.flow === 'deferred-read') {
          const recoveryStages = row.stages.slice(row.initialStageCount);
          const sealed = recoveryStages.indexOf('Recovery.Held.Sealed');
          expect(sealed).toBeGreaterThanOrEqual(0);
          expect(
            recoveryStages.indexOf('Recovery.Held.CallsObserved'),
          ).toBeLessThan(sealed);
          expect(
            recoveryStages.indexOf('Recovery.Provider.Projected'),
          ).toBeGreaterThan(sealed);
          expect(
            recoveryStages.filter((stage) => stage === 'Recovery.Held.Sealed'),
          ).toHaveLength(1);
          const nativeEvents = row.routeBody
            .split(/\r?\n\r?\n/)
            .filter(Boolean)
            .map(
              (frame) =>
                JSON.parse(
                  requireValue(
                    frame.split('\n').find((line) => line.startsWith('data:')),
                  ).slice(5),
                ) as {
                  type: string;
                  toolCallId?: string;
                  parentMessageId?: string;
                },
            );
          const announcements = nativeEvents.filter(
            (event) =>
              event.type === 'TOOL_CALL_START' &&
              heldIds.includes(event.toolCallId ?? ''),
          );
          expect(announcements.map((event) => event.toolCallId)).toEqual(
            heldIds,
          );
          expect(
            nativeEvents
              .filter(
                (event) =>
                  event.type === 'TOOL_CALL_RESULT' &&
                  heldIds.includes(event.toolCallId ?? ''),
              )
              .map((event) => event.toolCallId),
          ).toEqual(heldIds);
          for (const announcement of announcements) {
            const parent = announcement.parentMessageId;
            expect(parent).toBeDefined();
            expect(
              (row.original.messages as { id: string }[]).some(
                (message) => message.id === parent,
              ),
            ).toBe(false);
            const visible = (
              requireValue(row.saved).messages as {
                id: string;
                toolCalls?: { id: string }[];
              }[]
            ).find((message) => message.id === parent);
            expect(
              visible?.toolCalls?.some(
                (call) => call.id === announcement.toolCallId,
              ),
            ).toBe(true);
          }
          for (const id of heldIds)
            expect(row.invocationStates).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ Id: id, State: 'Completed' }),
              ]),
            );
        }
        expect(row.ordinaryBodies).toHaveLength(2);
        for (const body of [row.routeBody, ...row.ordinaryBodies]) {
          const events = requireValue(body)
            .split(/\r?\n\r?\n/)
            .filter(Boolean)
            .map(
              (frame) =>
                JSON.parse(
                  requireValue(
                    frame.split('\n').find((line) => line.startsWith('data:')),
                  ).slice(5),
                ) as { type: string },
            );
          expect(events[0].type).toBe('RUN_STARTED');
          expect(
            events.filter((event) => event.type === 'RUN_FINISHED'),
          ).toHaveLength(1);
          expect(events.at(-1)?.type).toBe('RUN_FINISHED');
          expect(events.some((event) => event.type === 'RUN_ERROR')).toBe(
            false,
          );
        }
        expect(
          row.stages
            .slice(row.initialStageCount)
            .filter((stage) => stage === 'Deserialize.Completed'),
        ).toHaveLength(3);
        expect(
          row.stages
            .slice(row.initialStageCount)
            .filter((stage) => stage === 'Serialize.Completed'),
        ).toHaveLength(3);
        expect(row.stages.slice(0, row.initialStageCount)).toContain(
          'Serialize.Completed',
        );
        expect(row.wires).toHaveLength(
          subject.flow === 'fresh-read' || subject.heldFresh ? 4 : 3,
        );
        expect(row.ordinarySnapshots).toHaveLength(2);
        expect(row.ordinaryOpaques).toHaveLength(2);
        for (const saved of [row.saved, ...row.ordinarySnapshots]) {
          expect(saved).not.toBeNull();
          expect(requireValue(saved).tools).toEqual(row.original.tools);
          expect(requireValue(saved).state).toEqual(row.original.state);
          expect(requireValue(saved).forwardedProps).toEqual(
            row.original.forwardedProps,
          );
          expect(
            (requireValue(saved).messages as unknown[]).slice(
              0,
              row.admittedMessages.length,
            ),
          ).toEqual(row.admittedMessages);
          const results = (
            requireValue(saved).messages as {
              role: string;
              toolCallId?: string;
              content?: string;
            }[]
          ).filter((message) => message.role === 'tool');
          const decisionFor = (id: string) =>
            subject.decisions?.[
              id === 'protected' ? 0 : Number(id.slice('protected-'.length)) - 1
            ] ?? subject.decision;
          const nativeResults = row.originalCalls
            .filter((call) => call.name === 'backend')
            .sort(
              (a, b) =>
                Number(decisionFor(a.id) === 'approved') -
                Number(decisionFor(b.id) === 'approved'),
            );
          const expectedCanonicalResults = [
            ...row.originalCalls.filter((call) => call.name === 'frontend'),
            ...nativeResults,
            ...heldIds.map((id, index) => ({
              id,
              output: JSON.stringify(
                ['fresh read result', 'held read two', 'held read three'][
                  index
                ],
              ),
            })),
            ...(subject.flow === 'fresh-read' || subject.heldFresh
              ? [
                  {
                    id: 'fresh-read',
                    output: JSON.stringify('fresh read result'),
                  },
                ]
              : []),
          ].map((call) => ({ id: call.id, output: call.output }));
          expect(
            results.map((result) => ({
              id: result.toolCallId,
              output: result.content,
            })),
          ).toEqual(expectedCanonicalResults);
          expect(JSON.stringify(saved)).not.toContain('"recovery"');
        }
        for (const opaque of [row.opaque, ...row.ordinaryOpaques]) {
          expect(opaque).not.toBeNull();
          expect(JSON.parse(requireValue(opaque))).toEqual(expect.any(Object));
          expect(opaque).not.toContain('"recovery"');
        }
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 270_000);
