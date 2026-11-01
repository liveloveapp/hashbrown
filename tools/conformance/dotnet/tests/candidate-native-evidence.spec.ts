import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createDotnetProbeDirectory } from '../harness/dotnet-probe-directory';
import { withDurableCluster } from '../harness/durable-fixture';
import { type DotnetFixture, postRun, runInput } from '../harness/http-fixture';

const alice = { 'X-Fixture-Principal': 'alice' };
const threadId = 'fixture-thread';
const prompt = 'Candidate native evidence';
const browserId = 'candidate-browser';
const protectedCalls = [
  { id: 'candidate-approved', code: 'PDX', decision: 'approve' },
  { id: 'candidate-declined', code: 'SEA', decision: 'decline' },
  { id: 'candidate-cancelled', code: 'SFO', decision: 'cancel' },
] as const;
const browserTool = {
  name: 'getWeather',
  description: 'Get weather',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
    additionalProperties: false,
  },
};
const nativeEnvironment = {
  Workflow: '',
  FixtureNativeSessions: 'true',
  FixtureNativeApprovals: 'true',
  FixtureCandidateRecoveryEvidence: 'true',
};

/** Genuine public recovery response; test code never manufactures a capability. */
interface Recovery {
  schemaVersion: number;
  disposition: string;
  serverRevision: number;
  snapshot: {
    messages: Record<string, unknown>[];
    interrupts: { id: string; toolCallId: string }[];
    pendingBrowserRecovery: { callIds: string[]; serverRevision: number };
  };
}

/** Immutable native fixture witness, independent of public/provider projection. */
interface ResultWitness {
  seq: number;
  monotonicMs: number;
  workerId: string;
  threadId: string;
  runId: string;
  callId: string;
  requestId: string;
  batchId: string;
  admittedGeneration: number;
  admittedRevision: number;
  domain:
    | 'handler-return'
    | 'native-invocation-return'
    | 'native-outward-before-public-projection';
  nativeType: string;
  jsonKind?: string;
  rawJson?: string;
  text?: string;
  isNull: boolean;
}

/** Scoped read-only witness envelope; faults cannot count as successful evidence. */
interface Evidence {
  workerId: string;
  faulted: boolean;
  records: ResultWitness[];
}

/** Actual PostgreSQL state independently links admissions, members and effects. */
interface NativeState {
  session: {
    id: string;
    state: string;
    generation: number;
    revision: number;
    payload: string;
  };
  batches: {
    batch_id: string;
    state: string;
    published_revision: number;
    admitted_generation: number | null;
    admitted_revision: number | null;
  }[];
  members: {
    call_id: string;
    request_id: string;
    batch_id: string;
    admitted_generation: number | null;
    admitted_revision: number | null;
  }[];
  effects: {
    call_id: string;
    request_id: string;
    batch_id: string;
    admitted_generation: number;
    admitted_revision: number;
    code: string;
  }[];
}

/** Reads independent actual rows without invoking journal authority. */
async function state(fixture: DotnetFixture): Promise<NativeState> {
  const response = await fetch(
    `${fixture.url}/__test/native-recovery-state?threadId=${threadId}`,
    { headers: alice },
  );
  expect(response.status).toBe(200);
  return response.json();
}

/** Reads genuine per-worker operation counts before and after a refused request. */
async function stages(fixture: DotnetFixture) {
  const response = await fetch(`${fixture.url}/__test/native-stage`);
  expect(response.status).toBe(200);
  return response.json() as Promise<{ counts: Record<string, number> }>;
}

/** Requests authenticated, scoped, immutable native evidence from the fixture. */
async function evidence(
  fixture: DotnetFixture,
  selectedThread = threadId,
  principal = 'alice',
): Promise<Evidence> {
  const response = await fetch(
    `${fixture.url}/__test/candidate-native-evidence?threadId=${encodeURIComponent(selectedThread)}`,
    { headers: { 'X-Fixture-Principal': principal } },
  );
  expect(response.status).toBe(200);
  return response.json();
}

/** Publishes genuine browser and protected calls through the selected native provider. */
async function publish(fixture: DotnetFixture): Promise<Recovery> {
  // Aimock breaks equally eligible matches by registration order.
  for (const id of [browserId, ...protectedCalls.map((call) => call.id)])
    fixture.mock.onToolResult(id, { content: 'Candidate complete' });
  fixture.mock.onMessage(prompt, {
    toolCalls: [
      { id: browserId, name: 'getWeather', arguments: { city: 'Paris' } },
      ...protectedCalls.map(({ id, code }) => ({
        id,
        name: 'lookupAirport',
        arguments: { code },
      })),
    ],
  });

  const initial = await postRun(
    fixture,
    { ...runInput(prompt), tools: [browserTool] },
    alice,
  );
  const response = await fetch(
    `${fixture.url}/threads/${threadId}/native-session`,
    {
      method: 'POST',
      headers: {
        ...alice,
        'Content-Type': 'application/json',
        'Hashbrown-Recovery-Version': '2',
      },
      body: JSON.stringify({ tools: [browserTool], forwardedProps: {} }),
    },
  );

  expect(initial.events.at(-1)?.type).toBe('RUN_FINISHED');
  expect(response.status).toBe(200);
  const recovery: Recovery = await response.json();
  expect(recovery.schemaVersion).toBe(2);
  expect(recovery.disposition).toBe('Pending');
  expect(recovery.serverRevision).toBeGreaterThan(0);
  expect(recovery.snapshot.pendingBrowserRecovery).toEqual({
    protocolVersion: 1,
    callIds: [browserId],
    serverRevision: recovery.serverRevision,
  });
  const published = await state(fixture);
  expect(published.session.state).toBe('Ready');
  expect(published.session.revision).toBe(recovery.serverRevision);
  expect(published.effects).toEqual([]);
  expect(
    recovery.snapshot.interrupts.map((item) => item.toolCallId).sort(),
  ).toEqual(protectedCalls.map((call) => call.id).sort());
  const pendingBatches = published.batches.filter(
    (batch) => batch.state === 'Pending',
  );
  expect(pendingBatches).toHaveLength(1);
  const pendingBatch = pendingBatches[0];
  expect(pendingBatch.published_revision).toBeGreaterThan(0);
  expect(pendingBatch.published_revision).toBeLessThanOrEqual(
    recovery.serverRevision,
  );
  expect(published.members.map((member) => member.call_id).sort()).toEqual(
    [browserId, ...protectedCalls.map((call) => call.id)].sort(),
  );
  for (const member of published.members)
    expect(member.batch_id).toBe(pendingBatch.batch_id);
  for (const interrupt of recovery.snapshot.interrupts) {
    const member = published.members.find(
      (item) => item.call_id === interrupt.toolCallId,
    );
    expect(member).toBeDefined();
    expect(member?.request_id).toBe(interrupt.id);
  }
  return recovery;
}

/** Settles complete actual outcomes and original protected interrupt identifiers. */
function settlement(recovery: Recovery, content = 'Known browser result') {
  const entries = protectedCalls.map(({ id, decision }) => {
    const interrupt = recovery.snapshot.interrupts.find(
      (item) => item.toolCallId === id,
    );
    if (!interrupt) throw new Error(`Missing genuine interrupt for ${id}`);
    return decision === 'cancel'
      ? { interruptId: interrupt.id, status: 'cancelled' }
      : {
          interruptId: interrupt.id,
          status: 'resolved',
          payload: { approved: decision === 'approve' },
        };
  });
  return {
    ...runInput(prompt),
    tools: [browserTool],
    messages: [
      ...recovery.snapshot.messages,
      {
        id: crypto.randomUUID(),
        role: 'tool',
        toolCallId: browserId,
        content,
      },
    ],
    resume: entries,
    forwardedProps: {
      hashbrown: {
        recovery: {
          version: 1,
          serverRevision: recovery.serverRevision,
          outcomes: [{ toolCallId: browserId, status: 'result' }],
        },
      },
    },
  };
}

for (const provider of ['openai', 'azure'] as const)
  for (const api of ['chat-completions', 'responses'] as const)
    test(`candidate native evidence observes actual approved, declined and cancelled results before projection: ${provider}/${api}`, async () => {
      await withDurableCluster(
        provider,
        async ({ start }) => {
          const fixture = await start();
          const recovery = await publish(fixture);
          const before = await evidence(fixture);
          const submitted = settlement(recovery);

          const result = await postRun(fixture, submitted, alice);
          const observed = await evidence(fixture);
          const settled = await state(fixture);
          const unrelated = await evidence(fixture, crypto.randomUUID());
          const otherPrincipal = await evidence(fixture, threadId, 'bob');

          expect(before).toMatchObject({ faulted: false, records: [] });
          expect(result.response.status).toBe(200);
          expect(result.events.at(-1)?.type).toBe('RUN_FINISHED');
          expect(observed.faulted).toBe(false);
          expect(observed.workerId).toBe(before.workerId);
          expect(observed.workerId.length).toBeGreaterThan(0);
          expect(unrelated.records).toEqual([]);
          expect(otherPrincipal.records).toEqual([]);
          expect(observed.records.map((record) => record.seq)).toEqual(
            [...observed.records.map((record) => record.seq)].sort(
              (a, b) => a - b,
            ),
          );
          expect(
            new Set(observed.records.map((record) => record.seq)).size,
          ).toBe(observed.records.length);
          const handler = observed.records.filter(
            (record) => record.domain === 'handler-return',
          );
          expect(handler).toHaveLength(1);
          expect(handler[0]).toMatchObject({
            callId: 'candidate-approved',
            jsonKind: 'Object',
            isNull: false,
          });
          expect(handler[0].nativeType.length).toBeGreaterThan(0);
          expect([
            'System.Text.Json.JsonElement',
            'System.String',
            'null',
          ]).not.toContain(handler[0].nativeType);
          expect(JSON.parse(handler[0].rawJson ?? 'null')).toEqual({
            code: 'PDX',
            name: 'Portland International Airport',
          });
          const invocation = observed.records.filter(
            (record) => record.domain === 'native-invocation-return',
          );
          const outward = observed.records.filter(
            (record) =>
              record.domain === 'native-outward-before-public-projection',
          );
          expect(invocation).toHaveLength(1);
          expect(invocation[0]).toMatchObject({
            callId: 'candidate-approved',
            nativeType: 'System.Text.Json.JsonElement',
            jsonKind: 'Object',
            isNull: false,
          });
          expect(JSON.parse(invocation[0].rawJson ?? 'null')).toEqual({
            code: 'PDX',
            name: 'Portland International Airport',
          });
          expect(JSON.parse(invocation[0].rawJson ?? 'null')).toEqual(
            JSON.parse(handler[0].rawJson ?? 'null'),
          );
          expect(handler[0].seq).toBeLessThan(invocation[0].seq);
          expect(outward.map((record) => record.callId).sort()).toEqual(
            protectedCalls.map((call) => call.id).sort(),
          );
          expect(
            outward.find((record) => record.callId === 'candidate-approved'),
          ).toMatchObject({
            nativeType: invocation[0].nativeType,
            jsonKind: invocation[0].jsonKind,
            rawJson: invocation[0].rawJson,
          });
          expect(
            outward.find((record) => record.callId === 'candidate-declined'),
          ).toMatchObject({
            nativeType: 'System.String',
            text: 'Tool call invocation rejected.',
            isNull: false,
          });
          expect(
            outward.find((record) => record.callId === 'candidate-cancelled'),
          ).toMatchObject({
            nativeType: 'System.String',
            text: 'Tool call invocation rejected. Cancelled by caller.',
            isNull: false,
          });
          for (const record of [...handler, ...invocation, ...outward]) {
            const member = settled.members.find(
              (item) => item.call_id === record.callId,
            );
            expect(member).toBeDefined();
            expect(record).toMatchObject({
              workerId: observed.workerId,
              threadId,
              runId: submitted.runId,
              requestId: member?.request_id,
              batchId: member?.batch_id,
              admittedGeneration: member?.admitted_generation,
              admittedRevision: member?.admitted_revision,
            });
            expect(record.monotonicMs).toBeGreaterThanOrEqual(0);
          }
          expect(settled.effects).toEqual([
            expect.objectContaining({
              call_id: 'candidate-approved',
              code: 'PDX',
              request_id: invocation[0].requestId,
              batch_id: invocation[0].batchId,
              admitted_generation: invocation[0].admittedGeneration,
              admitted_revision: invocation[0].admittedRevision,
            }),
          ]);
          const continuation = fixture.requests.at(-1);
          expect(fixture.requests).toHaveLength(2);
          expect(continuation?.path).toContain(
            api === 'responses' ? '/responses' : '/chat/completions',
          );
          expect(continuation?.authentication).not.toBe('missing');
          expect(JSON.stringify(continuation?.body)).toContain(
            'candidate-approved',
          );
          observed.records[0].callId = 'caller-mutated';
          expect((await evidence(fixture)).records).not.toContainEqual(
            expect.objectContaining({ callId: 'caller-mutated' }),
          );
        },
        { ...nativeEnvironment, ModelApi: api },
      );
    }, 120_000);

test('candidate native evidence is absent before any accepted recovery result and stale settlement cannot produce a witness', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const fixture = await start();
      const recovery = await publish(fixture);
      const original = await state(fixture);
      const counts = await stages(fixture);
      const invalid = settlement(recovery);
      invalid.forwardedProps.hashbrown.recovery.serverRevision =
        recovery.serverRevision + 1;

      const refused = await postRun(fixture, invalid, alice);
      const observed = await evidence(fixture);

      expect(refused.response.status).toBe(409);
      expect(observed).toMatchObject({ faulted: false, records: [] });
      expect(await state(fixture)).toEqual(original);
      const refusedCounts = (await stages(fixture)).counts;
      for (const operation of [
        'cold-acquire-success',
        'reservation-success',
        'Run.Forward',
        'Deserialize.Forward',
      ])
        expect(refusedCounts[operation] ?? 0).toBe(
          counts.counts[operation] ?? 0,
        );
      expect(fixture.requests).toHaveLength(1);
      const unauthenticated = await fetch(
        `${fixture.url}/__test/candidate-native-evidence?threadId=${threadId}`,
      );
      expect(unauthenticated.status).toBe(401);
    },
    nativeEnvironment,
  );
}, 120_000);

test('finite NativePublicBytes rejects an actual oversized recovery entity before acquisition, native preparation or provider execution', async () => {
  const cap = 16_384;
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const fixture = await start();
      const recovery = await publish(fixture);
      const original = await state(fixture);
      const counts = await stages(fixture);
      const oversized = settlement(recovery, 'x'.repeat(cap * 2));
      const actualBytes = Buffer.byteLength(JSON.stringify(oversized), 'utf8');
      const small = settlement(recovery);

      const refused = await fetch(`${fixture.url}/run`, {
        method: 'POST',
        headers: { ...alice, 'Content-Type': 'application/json' },
        body: JSON.stringify(oversized),
      });
      try {
        expect(refused.status).toBe(413);
      } finally {
        await refused.body?.cancel();
      }

      expect(Buffer.byteLength(JSON.stringify(small), 'utf8')).toBeLessThan(
        cap,
      );
      expect(actualBytes).toBeGreaterThan(cap);
      expect(await state(fixture)).toEqual(original);
      expect(await stages(fixture)).toEqual(counts);
      expect(fixture.requests).toHaveLength(1);
      expect(await evidence(fixture)).toMatchObject({
        faulted: false,
        records: [],
      });
      const accepted = await postRun(fixture, small, alice);
      expect(accepted.response.status).toBe(200);
      expect(accepted.events.at(-1)?.type).toBe('RUN_FINISHED');
      expect((await state(fixture)).effects).toHaveLength(1);
    },
    { ...nativeEnvironment, NativePublicBytes: String(cap) },
  );
}, 120_000);

for (const observer of ['installed', 'null'] as const)
  test(`invalid actual native result cannot emit accepted result evidence or read unsupported getters with observer ${observer}`, async () => {
    const directory = await createDotnetProbeDirectory(
      'hashbrown-candidate-result-',
    );
    const original = await readFile(
      resolve(
        'tools/conformance/dotnet/tests/fixtures/native-browser-recovery-wire.cs.txt',
      ),
      'utf8',
    );
    const start = original.indexOf(
      '        var hook = typeof(NativeSessionAgentFactory).GetMethod("CreateObservedForTests"',
    );
    const end = original.indexOf('        var initialAgent = Agent(', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const source =
      observer === 'installed'
        ? original
        : original.slice(0, start) +
          '        AIAgent Agent(IChatClient client) => NativeSessionAgentFactory.Create(client, "native", registered.ToArray(), catalog, accessor);\n' +
          original.slice(end);
    const manifest = [
      {
        id: `candidate-invalid-result-${observer}`,
        provider: 'openai',
        api: 'chat-completions',
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
        codec: 'unsupported-getter',
      },
    ];

    try {
      await writeFile(
        join(directory, 'Probe.csproj'),
        `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><ProjectReference Include="${resolve('tools/conformance/dotnet/Hashbrown.Conformance.csproj')}" /></ItemGroup></Project>`,
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
        ],
        {
          timeout: 240_000,
          maxBuffer: 32 * 1024 * 1024,
          env: {
            ...process.env,
            HASHBROWN_BROWSER_WIRE_CASES: JSON.stringify(manifest),
          },
        },
      );

      const line = result.stdout
        .split('\n')
        .find((value) => value.startsWith('Recovery wire: '));
      if (!line) throw new Error('Missing actual native-result probe output');
      const rows = JSON.parse(line.slice('Recovery wire: '.length)) as {
        id: string;
        setupError?: string;
        getterReads: number;
        effects: number;
        body: unknown;
        stages: string[];
        routeBody: string;
      }[];
      expect(rows.map((row) => row.id)).toEqual(manifest.map((row) => row.id));
      expect(rows[0].setupError).toBeUndefined();
      expect(rows[0].effects).toBe(1);
      expect(rows[0].getterReads).toBe(0);
      expect(rows[0].body).toBeNull();
      expect(rows[0].routeBody).not.toContain('RUN_FINISHED');
      expect(rows[0].stages).not.toContain('Native.Result.Observed');
      if (observer === 'null') expect(rows[0].stages).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 300_000);

/** Runs a focused real .NET probe against the current fixture assembly without changing its sources. */
async function candidateProbe(
  source: string,
  environment: Record<string, string> = {},
) {
  const directory = await createDotnetProbeDirectory(
    'hashbrown-candidate-fine-',
  );
  try {
    await writeFile(
      join(directory, 'Probe.csproj'),
      `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><ProjectReference Include="${resolve('tools/conformance/dotnet/Hashbrown.Conformance.csproj')}" /></ItemGroup></Project>`,
    );
    await writeFile(join(directory, 'Program.cs'), source);
    return await promisify(execFile)(
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
        env: { ...process.env, ...environment },
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('finite NativePublicBytes parser preserves default and both bounds while refusing malformed or out-of-range fixture options', async () => {
  const inputs = [
    null,
    '1024',
    '16384',
    '1048576',
    '',
    '0',
    '1023',
    '1048577',
    '-1024',
    '+1024',
    '1.5',
    '1e4',
    ' 1024',
    '1024 ',
    '１０２４',
    '999999999999999999999',
  ];
  const source = `
using System.Reflection;
using System.Text.Json;
using Hashbrown.Conformance.Testing;
var type = typeof(FixtureTools).Assembly.GetType("Hashbrown.Conformance.Testing.FixtureCandidateResultEvidence", true)!;
var parse = type.GetMethod("ReadPublicBytes", BindingFlags.Static | BindingFlags.NonPublic)!;
var inputs = JsonSerializer.Deserialize<string?[]>(Environment.GetEnvironmentVariable("CANDIDATE_CAP_INPUTS")!)!;
var rows = new List<object>();
foreach (var input in inputs) {
  try { rows.Add(new { input, value = (int)parse.Invoke(null, new object?[] { input })!, error = (string?)null }); }
  catch (TargetInvocationException error) { rows.Add(new { input, value = (int?)null, error = error.InnerException!.GetType().FullName }); }
}
Console.WriteLine("Candidate cap parser: " + JsonSerializer.Serialize(rows));
`;

  const result = await candidateProbe(source, {
    CANDIDATE_CAP_INPUTS: JSON.stringify(inputs),
  });

  const line = result.stdout
    .split('\n')
    .find((value) => value.startsWith('Candidate cap parser: '));
  if (!line) throw new Error('Missing actual finite cap parser proof');
  const rows = JSON.parse(line.slice('Candidate cap parser: '.length)) as {
    input: string | null;
    value: number | null;
    error: string | null;
  }[];
  expect(rows.map((row) => row.input)).toEqual(inputs);
  expect(rows.slice(0, 4)).toEqual([
    { input: null, value: 1048576, error: null },
    { input: '1024', value: 1024, error: null },
    { input: '16384', value: 16384, error: null },
    { input: '1048576', value: 1048576, error: null },
  ]);
  for (const row of rows.slice(4))
    expect(row).toMatchObject({
      value: null,
      error: 'System.ArgumentException',
    });
}, 300_000);

for (const callback of ['returns', 'throws'] as const)
  test(`passive accepted-result observer ${callback} preserves exact actual JSON result, canonical projection and native provider completion`, async () => {
    const original = await readFile(
      resolve(
        'tools/conformance/dotnet/tests/fixtures/native-browser-recovery-wire.cs.txt',
      ),
      'utf8',
    );
    const needle =
      '            var stage = parsed["stage"]!.GetValue<string>(); stages.Enqueue(stage);';
    expect(original.split(needle)).toHaveLength(2);
    const source = original.replace(
      needle,
      needle +
        `
            if (stage == "Native.Result.Observed") {
                stageDiagnostics.Enqueue(JsonSerializer.Deserialize<JsonElement>(value));
                ${callback === 'throws' ? 'throw new InvalidOperationException("Owned passive observer failure");' : ''}
            }`,
    );
    const manifest = [
      {
        id: `candidate-passive-${callback}`,
        provider: 'openai',
        api: 'responses',
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
        codec: 'raw-json',
      },
    ];

    const result = await candidateProbe(source, {
      HASHBROWN_BROWSER_WIRE_CASES: JSON.stringify(manifest),
    });

    const line = result.stdout
      .split('\n')
      .find((value) => value.startsWith('Recovery wire: '));
    if (!line) throw new Error('Missing actual passive observer execution');
    const rows = JSON.parse(line.slice('Recovery wire: '.length)) as {
      id: string;
      setupError?: string;
      effects: number;
      getterReads: number;
      routeBody: string;
      body: {
        input: { type: string; call_id?: string; output?: string }[];
        store: boolean;
      };
      saved: {
        messages: { role: string; toolCallId?: string; content?: string }[];
      };
      stageDiagnostics: { stage: string; value: string }[];
    }[];
    expect(rows.map((row) => row.id)).toEqual(manifest.map((row) => row.id));
    const row = rows[0];
    expect(row.setupError).toBeUndefined();
    expect(row.effects).toBe(1);
    expect(row.getterReads).toBe(0);
    expect(row.routeBody).toContain('RUN_FINISHED');
    expect(row.routeBody).not.toContain('RUN_ERROR');
    const observed = row.stageDiagnostics
      .filter((record) => record.stage === 'Native.Result.Observed')
      .map(
        (record) =>
          JSON.parse(record.value) as {
            callId: string;
            nativeType: string;
            jsonKind: string;
            rawJson: string;
          },
      );
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({
      callId: 'protected',
      nativeType: 'System.Text.Json.JsonElement',
      jsonKind: 'Object',
      rawJson:
        '{\n  "known": true,\n  "unicode": "café",\n  "nested": [1, 2]\n}',
    });
    expect(
      row.saved.messages.find(
        (message) =>
          message.role === 'tool' && message.toolCallId === 'protected',
      )?.content,
    ).toBe(observed[0].rawJson);
    expect(row.body.store).toBe(false);
    expect(
      row.body.input.find(
        (item) =>
          item.type === 'function_call_output' && item.call_id === 'protected',
      )?.output,
    ).toBe(observed[0].rawJson);
  }, 300_000);
