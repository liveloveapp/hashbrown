import { appendFileSync } from 'node:fs';
import { control, withDurableCluster } from '../harness/durable-fixture';
import { type DotnetFixture, postRun, runInput } from '../harness/http-fixture';

const alice = { 'X-Fixture-Principal': 'alice' };
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
const unavailable =
  '{"hashbrownRecovery":{"version":1,"status":"result-unavailable","effect":"unknown","message":"The browser result is unavailable after recovery. The operation may already have occurred. No retry was performed."}}';
interface Recovery {
  schemaVersion: number;
  disposition: string;
  serverRevision: number;
  snapshot?: {
    messages: object[];
    interrupts?: { id: string }[];
    pendingBrowserRecovery?: { callIds: string[]; serverRevision: number };
  };
}
interface Observation {
  session: {
    state: string;
    generation: number;
    revision: number;
    claim_revision: number;
    token: string | null;
    lease_until: string | null;
    payload: string;
    admitted_request: string | null;
    expires_at: string;
  };
  batches: object[];
  members: object[];
  invocations: object[];
  effects: object[];
}

/** Reads real journal bytes and epochs without invoking journal authority or maintenance. */
async function state(fixture: DotnetFixture): Promise<Observation> {
  const response = await fetch(
    `${fixture.url}/__test/native-recovery-state?threadId=fixture-thread`,
    { headers: alice },
  );
  expect(response.status).toBe(200);
  return response.json();
}

/** Separately counts actual native diagnostics and delegated journal operations. */
async function stages(fixture: DotnetFixture) {
  const response = await fetch(`${fixture.url}/__test/native-stage`);
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    stage: string;
    counts: Record<string, number>;
  }>;
}

/** Waits for an observed post-transaction barrier, never a guessed lease duration. */
async function barrier(fixture: DotnetFixture, expected: string) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const observed = await stages(fixture);
    if (observed.stage === expected) return observed;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `Missing actual barrier ${expected}: ${fixture.diagnostics()}`,
  );
}

/** Negotiates V2 using only original public configuration. */
async function recover(fixture: DotnetFixture): Promise<Recovery> {
  const response = await fetch(
    `${fixture.url}/threads/fixture-thread/native-session`,
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
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return response.json();
}

/** Builds the complete explicit request from a genuinely published server snapshot. */
function settlement(
  recovery: Recovery,
  known: boolean,
  decision: 'approve' | 'decline' | 'cancel' = 'approve',
) {
  if (!recovery.snapshot?.pendingBrowserRecovery)
    throw new Error('Expected actual V2 pending browser capability');
  return {
    ...runInput('Cold crash fixture'),
    tools: [browserTool],
    messages: [
      ...recovery.snapshot.messages,
      {
        id: crypto.randomUUID(),
        role: 'tool',
        toolCallId: recovery.snapshot.pendingBrowserRecovery.callIds[0],
        content: known ? 'Known exact result' : unavailable,
      },
    ],
    resume: recovery.snapshot.interrupts?.map(({ id }) =>
      decision === 'cancel'
        ? { interruptId: id, status: 'cancelled' }
        : {
            interruptId: id,
            status: 'resolved',
            payload: { approved: decision === 'approve' },
          },
    ),
    forwardedProps: {
      hashbrown: {
        recovery: {
          version: 1,
          serverRevision: recovery.serverRevision,
          outcomes: [
            {
              toolCallId: recovery.snapshot.pendingBrowserRecovery.callIds[0],
              status: known ? 'result' : 'unavailable',
            },
          ],
        },
      },
    },
  };
}

/** Holds a real incomplete HTTP response through actual worker death. */
function observe(fixture: DotnetFixture, input: unknown) {
  const done = postRun(fixture, input, alice).then(
    (result) => ({ status: result.response.status, body: result.body }),
    (error: unknown) => ({ error: String(error) }),
  );
  return { done };
}

/** Persists independent process, row and counter evidence when explicitly requested. */
function record(value: object) {
  const destination = process.env['HASHBROWN_BROWSER_DURABILITY_EVIDENCE'];
  if (destination) appendFileSync(destination, `${JSON.stringify(value)}\n`);
}

for (const mixed of [true, false])
  for (const known of [true, false])
    test(`cold ${mixed ? 'mixed before reservation' : 'browser-only after acquisition'} SIGKILL ${known ? 'known' : 'unavailable'} recovers only through maintenance and a fresh revision`, async () => {
      await withDurableCluster(
        'openai',
        async ({ start }) => {
          const publisher = await start();
          publisher.mock.onMessage('Cold crash fixture', {
            toolCalls: [
              {
                id: 'crash-browser',
                name: 'getWeather',
                arguments: { city: 'Paris' },
              },
              ...(mixed
                ? [
                    {
                      id: 'crash-protected',
                      name: 'lookupAirport',
                      arguments: { code: 'PDX' },
                    },
                  ]
                : []),
            ],
          });
          const initial = await postRun(
            publisher,
            { ...runInput('Cold crash fixture'), tools: [browserTool] },
            alice,
          );
          expect(initial.events.at(-1)?.type).toBe('RUN_FINISHED');
          const pending = await recover(publisher);
          expect(pending).toMatchObject({
            schemaVersion: 2,
            disposition: 'Pending',
            snapshot: {
              pendingBrowserRecovery: {
                callIds: ['crash-browser'],
                serverRevision: pending.serverRevision,
              },
            },
          });
          const published = await state(publisher);
          expect(published.session.state).toBe('Ready');
          expect(published.effects).toEqual([]);
          await publisher.stop();
          expect(publisher.process.exited()?.signal).toBe('SIGKILL');
          const owner = await start({
            NativeGate: mixed ? 'before-decision-reservation' : 'cold-acquired',
          });
          const peer = await start();
          const stale = settlement(pending, known);
          const request = observe(owner, stale);
          const heldStages = await barrier(
            owner,
            mixed ? 'before-decision-reservation' : 'cold-acquired',
          );
          const held = await state(peer);
          expect(held.session).toMatchObject({
            state: 'Owned',
            revision: pending.serverRevision + 1,
            generation: published.session.generation + 1,
            payload: published.session.payload,
          });
          expect(heldStages.counts['cold-acquire-attempt']).toBe(1);
          expect(heldStages.counts['cold-acquire-success']).toBe(1);
          expect(heldStages.counts['reservation-success'] ?? 0).toBe(0);
          expect(heldStages.counts['Deserialize.Forward'] ?? 0).toBe(0);
          expect(heldStages.counts['Run.Forward'] ?? 0).toBe(0);
          expect(owner.requests).toHaveLength(0);
          expect(held.effects).toEqual([]);
          expect(held.members).toEqual(published.members);
          expect(held.batches).toEqual(published.batches);

          await owner.stop();
          await request.done;
          expect(owner.process.exited()?.signal).toBe('SIGKILL');
          await control(peer, 'expire-native-lease');
          const expired = await state(peer);
          expect((await recover(peer)).disposition).toBe('Busy');
          expect((await recover(peer)).disposition).toBe('Busy');
          expect(await state(peer)).toEqual(expired);
          const maintenance = await fetch(
            `${peer.url}/__test/maintain-native`,
            {
              method: 'POST',
            },
          );
          expect(maintenance.status).toBe(200);
          const maintained = await maintenance.json();
          const repaired = await state(peer);
          record({
            mixed,
            known,
            publisher: publisher.process,
            owner: { ...owner.process, exit: owner.process.exited() },
            heldStages,
            published,
            held,
            expired,
            maintained,
            repaired,
          });

          expect(maintained).toEqual({ count: 1 });
          expect(repaired.session).toMatchObject({
            state: 'Ready',
            generation: expired.session.generation + 1,
            revision: expired.session.revision + 1,
            claim_revision: expired.session.claim_revision,
            token: null,
            lease_until: null,
            admitted_request: null,
            payload: published.session.payload,
            expires_at: published.session.expires_at,
          });
          expect(repaired.members).toEqual(published.members);
          expect(repaired.batches).toEqual(published.batches);
          expect(repaired.invocations).toEqual(published.invocations);
          expect((await postRun(peer, stale, alice)).response.status).toBe(409);
          expect(await state(peer)).toEqual(repaired);
          const fresh = await recover(peer);
          expect(fresh.disposition).toBe('Pending');
          expect(fresh.serverRevision).toBe(repaired.session.revision);
          expect(await state(peer)).toEqual(repaired);
          peer.mock.onToolResult('crash-browser', {
            content: 'Cold completion',
          });
          if (mixed)
            peer.mock.onToolResult('crash-protected', {
              content: 'Cold completion',
            });
          const completed = await postRun(
            peer,
            settlement(fresh, known),
            alice,
          );
          expect(completed.events.at(-1)?.type).toBe('RUN_FINISHED');
          expect((await state(peer)).effects).toHaveLength(mixed ? 1 : 0);
          expect(peer.requests).toHaveLength(1);
          const next = await start();
          const restored = await recover(next);
          expect(restored.disposition).toBe('Completed');
          expect(JSON.stringify(restored.snapshot?.messages)).toContain(
            known ? 'Known exact result' : 'result-unavailable',
          );
          expect(next.requests).toHaveLength(0);
          expect((await stages(next)).counts['cold-acquire-attempt'] ?? 0).toBe(
            0,
          );
        },
        {
          FixtureNativeSessions: 'true',
          FixtureNativeApprovals: mixed ? 'true' : 'false',
          Workflow: '',
        },
      );
    }, 90_000);

/** Publishes genuine protected/browser state before an independently started crash worker. */
async function publish(fixture: DotnetFixture) {
  fixture.mock.on(
    {
      userMessage: 'Cold crash fixture',
      predicate: (request) => request.messages.at(-1)?.role === 'user',
    },
    {
      toolCalls: [
        {
          id: 'crash-browser',
          name: 'getWeather',
          arguments: { city: 'Paris' },
        },
        {
          id: 'crash-protected',
          name: 'lookupAirport',
          arguments: { code: 'PDX' },
        },
      ],
    },
  );
  const initial = await postRun(
    fixture,
    { ...runInput('Cold crash fixture'), tools: [browserTool] },
    alice,
  );
  expect(initial.events.at(-1)?.type).toBe('RUN_FINISHED');
  const pending = await recover(fixture);
  expect(pending.disposition).toBe('Pending');
  expect(pending.snapshot?.interrupts).toHaveLength(1);
  return pending;
}

/** Calls explicitly scheduled real maintenance and returns its distinct-row count. */
async function maintain(fixture: DotnetFixture) {
  const response = await fetch(`${fixture.url}/__test/maintain-native`, {
    method: 'POST',
  });
  expect(response.status).toBe(200);
  return (await response.json()).count as number;
}

const crashWindows = [
  {
    gate: 'decision-admitted',
    decision: 'approve',
    state: 'Blocked',
    effects: 0,
  },
  {
    gate: 'decision-admitted',
    decision: 'decline',
    state: 'Blocked',
    effects: 0,
  },
  {
    gate: 'decision-admitted',
    decision: 'cancel',
    state: 'Blocked',
    effects: 0,
  },
  {
    gate: 'dispatch-marker-committed',
    decision: 'approve',
    state: 'Blocked',
    effects: 0,
  },
  {
    gate: 'effect-persisted',
    decision: 'approve',
    state: 'Blocked',
    effects: 1,
  },
  {
    gate: 'after-save-before-publication',
    decision: 'approve',
    state: 'Blocked',
    effects: 1,
  },
  {
    gate: 'publication-authorized',
    decision: 'approve',
    state: 'PublicationUnknown',
    effects: 1,
  },
  {
    gate: 'before-publication-finalization',
    decision: 'approve',
    state: 'PublicationUnknown',
    effects: 1,
  },
] as const;

for (const subject of crashWindows)
  test(`cold mixed SIGKILL ${subject.gate} ${subject.decision} retains consumed authority and ${subject.state}`, async () => {
    await withDurableCluster(
      'openai',
      async ({ start }) => {
        const publisher = await start();
        const pending = await publish(publisher);
        await publisher.stop();
        const owner = await start({ NativeGate: subject.gate });
        owner.mock.onToolResult('crash-browser', {
          content: 'Cold completion',
        });
        owner.mock.onToolResult('crash-protected', {
          content: 'Cold completion',
        });
        const peer = await start();
        const stale = settlement(pending, false, subject.decision);
        const request = observe(owner, stale);
        const reached = await barrier(owner, subject.gate);
        const held = await state(peer);
        expect(held.effects).toHaveLength(subject.effects);
        expect(reached.counts['cold-acquire-attempt']).toBe(1);
        expect(reached.counts['cold-acquire-success']).toBe(1);
        expect(reached.counts['reservation-success']).toBe(1);
        if (subject.gate === 'decision-admitted') {
          expect(held.invocations).toEqual([
            expect.objectContaining({
              state: 'Captured',
              dispatch_generation: null,
            }),
          ]);
          expect(held.members).toContainEqual(
            expect.objectContaining({
              kind: 'Protected',
              state: 'DecisionAdmitted',
              decision:
                subject.decision === 'approve'
                  ? 'Approved'
                  : subject.decision === 'decline'
                    ? 'Declined'
                    : 'Cancelled',
            }),
          );
          expect(reached.counts['Deserialize.Forward'] ?? 0).toBe(0);
          expect(owner.requests).toHaveLength(0);
        }

        await owner.stop();
        await request.done;
        expect(owner.process.exited()?.signal).toBe('SIGKILL');
        await control(peer, 'expire-native-lease');
        const expired = await state(peer);
        expect((await recover(peer)).disposition).toBe('Busy');
        expect(await state(peer)).toEqual(expired);
        expect(await maintain(peer)).toBe(1);
        const fenced = await state(peer);

        expect(fenced.session).toMatchObject({
          state: subject.state,
          generation: held.session.generation + 1,
          revision: held.session.revision + 1,
          claim_revision: held.session.claim_revision,
          payload: held.session.payload,
          expires_at: held.session.expires_at,
          token: null,
          lease_until: null,
          admitted_request: null,
        });
        expect(fenced.members).toEqual(held.members);
        expect(fenced.batches).toEqual(held.batches);
        expect(fenced.invocations).toEqual(held.invocations);
        expect(fenced.effects).toEqual(held.effects);
        for (let attempt = 0; attempt < 2; attempt++) {
          const recovery = await recover(peer);
          expect(recovery).toMatchObject({ disposition: 'UnknownEffect' });
          expect(recovery.snapshot).toBeUndefined();
          expect((await postRun(peer, stale, alice)).response.status).toBe(409);
          expect(await maintain(peer)).toBe(0);
          expect(await state(peer)).toEqual(fenced);
        }
        const restarted = await start();
        expect((await recover(restarted)).disposition).toBe('UnknownEffect');
        expect((await postRun(restarted, stale, alice)).response.status).toBe(
          409,
        );
        expect(await state(restarted)).toEqual(fenced);
        expect(peer.requests).toHaveLength(0);
        expect(restarted.requests).toHaveLength(0);
        record({
          subject,
          reached,
          held,
          expired,
          fenced,
          exit: owner.process.exited(),
          requests: owner.requests,
        });
      },
      {
        FixtureNativeSessions: 'true',
        FixtureNativeApprovals: 'true',
        Workflow: '',
      },
    );
  }, 90_000);

test('cold active lease is unchanged; two maintenance replicas transition once and identical fresh transcripts have one acquisition winner', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const publisher = await start();
      const pending = await publish(publisher);
      await publisher.stop();
      const owner = await start({ NativeGate: 'before-decision-reservation' });
      const peer = await start();
      const replica = await start();
      const request = observe(owner, settlement(pending, true));
      await barrier(owner, 'before-decision-reservation');
      const active = await state(peer);

      expect(await maintain(peer)).toBe(0);
      expect(await state(peer)).toEqual(active);
      await owner.stop();
      await request.done;
      await control(peer, 'expire-native-lease');
      const counts = await Promise.all([maintain(peer), maintain(replica)]);
      expect(counts.sort()).toEqual([0, 1]);
      const ready = await state(peer);
      expect(ready.session.state).toBe('Ready');
      const fresh = await recover(peer);
      const same = settlement(fresh, true);
      const winner = await start({ NativeGate: 'cold-acquired' });
      winner.mock.onToolResult('crash-browser', { content: 'Cold completion' });
      winner.mock.onToolResult('crash-protected', {
        content: 'Cold completion',
      });
      const winning = observe(winner, same);
      await barrier(winner, 'cold-acquired');
      const acquired = await state(peer);
      expect((await postRun(replica, same, alice)).response.status).toBe(409);
      expect(await state(peer)).toEqual(acquired);
      expect((await stages(replica)).counts['cold-acquire-attempt']).toBe(1);
      expect((await stages(replica)).counts['cold-acquire-success'] ?? 0).toBe(
        0,
      );
      await control(winner, 'release-native');
      expect(await winning.done).toMatchObject({ status: 200 });
      const complete = await state(peer);
      expect(complete.effects).toHaveLength(1);
      expect(winner.requests).toHaveLength(1);
      expect(peer.requests).toHaveLength(0);
      expect(replica.requests).toHaveLength(0);
      expect((await postRun(replica, same, alice)).response.status).toBe(409);
      expect(await state(peer)).toEqual(complete);
      record({
        counts,
        active,
        ready,
        acquired,
        complete,
        winner: winner.process,
      });
    },
    {
      FixtureNativeSessions: 'true',
      FixtureNativeApprovals: 'true',
      Workflow: '',
    },
  );
}, 90_000);

test('bounded real PostgreSQL maintenance preserves compatibility, full keys, privacy, old-owner fences and rollback', async () => {
  const { createDotnetProbeDirectory } =
    await import('../harness/dotnet-probe-directory');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { readFile, writeFile, rm } = await import('node:fs/promises');
  const { join, resolve } = await import('node:path');
  const directory = await createDotnetProbeDirectory(
    'hashbrown-browser-maintenance-',
  );
  const project = resolve(
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
  );
  const source = await readFile(
    resolve(
      'tools/conformance/dotnet/tests/fixtures/native-browser-recovery-maintenance.cs.txt',
    ),
    'utf8',
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
      ],
      { timeout: 120_000, maxBuffer: 8 * 1024 * 1024, env: process.env },
    ).catch((error) => {
      const failure = error as { stdout?: string; stderr?: string };
      throw new Error(
        `${failure.stdout ?? ''}\n${failure.stderr ?? String(error)}`,
      );
    });

    expect(result.stdout).toContain(
      'Native browser maintenance contracts passed.',
    );
    record({ directMaintenance: result.stdout });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 150_000);

for (const corruption of [
  'bound-descriptor',
  'future-capture',
  'future-publication',
  'unsupported-native',
  'missing-browser-binding',
])
  test(`cold genuine published ${corruption} corruption cannot become Ready after lease maintenance`, async () => {
    await withDurableCluster(
      'openai',
      async ({ start }) => {
        const publisher = await start();
        const pending = await publish(publisher);
        await publisher.stop();
        const owner = await start({
          NativeGate: 'before-decision-reservation',
        });
        const peer = await start();
        const request = observe(owner, settlement(pending, true));
        const reached = await barrier(owner, 'before-decision-reservation');
        const held = await state(peer);
        expect(reached.counts['reservation-success'] ?? 0).toBe(0);
        await owner.stop();
        await request.done;
        expect(owner.process.exited()?.signal).toBe('SIGKILL');
        const mutation = await fetch(
          `${peer.url}/__test/native-recovery-corruption/${corruption}?threadId=fixture-thread`,
          { method: 'POST', headers: alice },
        );
        expect(mutation.status).toBe(200);
        await control(peer, 'expire-native-lease');
        const corrupt = await state(peer);

        expect(await maintain(peer)).toBe(1);
        const fenced = await state(peer);

        expect(fenced.session).toMatchObject({
          state: 'Blocked',
          payload: corrupt.session.payload,
          generation: corrupt.session.generation + 1,
          revision: corrupt.session.revision + 1,
          claim_revision: held.session.claim_revision,
        });
        expect(fenced.members).toEqual(corrupt.members);
        expect(fenced.batches).toEqual(corrupt.batches);
        expect(fenced.invocations).toEqual(corrupt.invocations);
        expect(fenced.effects).toEqual([]);
        expect((await recover(peer)).disposition).toBe('UnknownEffect');
        expect(
          (await postRun(peer, settlement(pending, true), alice)).response
            .status,
        ).toBe(409);
        expect(await maintain(peer)).toBe(0);
        expect(await state(peer)).toEqual(fenced);
        expect(peer.requests).toHaveLength(0);
        record({ corruption, reached, held, corrupt, fenced });
      },
      {
        FixtureNativeSessions: 'true',
        FixtureNativeApprovals: 'true',
        Workflow: '',
      },
    );
  }, 90_000);

test('cold safe recovery preserves legitimate settled historical browser digests and protected epochs', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const publisher = await start();
      const firstPending = await publish(publisher);
      publisher.mock.onToolResult('crash-browser', {
        content: 'First completed',
      });
      publisher.mock.onToolResult('crash-protected', {
        content: 'First completed',
      });
      expect(
        (
          await postRun(publisher, settlement(firstPending, true), alice)
        ).events.at(-1)?.type,
      ).toBe('RUN_FINISHED');
      const firstCompleted = await recover(publisher);
      expect(firstCompleted.disposition).toBe('Completed');
      const firstState = await state(publisher);
      expect(firstState.effects).toHaveLength(1);
      publisher.mock.on(
        {
          userMessage: 'Second cold pending',
          predicate: (request) => request.messages.at(-1)?.role === 'user',
        },
        {
          toolCalls: [
            {
              id: 'second-browser',
              name: 'getWeather',
              arguments: { city: 'Rome' },
            },
            {
              id: 'second-protected',
              name: 'lookupAirport',
              arguments: { code: 'LAX' },
            },
          ],
        },
      );
      const second = await postRun(
        publisher,
        {
          ...runInput('Second cold pending'),
          tools: [browserTool],
          messages: [
            ...(firstCompleted.snapshot?.messages ?? []),
            {
              id: crypto.randomUUID(),
              role: 'user',
              content: 'Second cold pending',
            },
          ],
        },
        alice,
      );
      expect(second.events.at(-1)?.type).toBe('RUN_FINISHED');
      const pending = await recover(publisher);
      expect(pending.snapshot?.pendingBrowserRecovery?.callIds).toEqual([
        'second-browser',
      ]);
      const published = await state(publisher);
      expect(published.effects).toEqual(firstState.effects);
      await publisher.stop();
      const owner = await start({ NativeGate: 'before-decision-reservation' });
      const peer = await start();
      const request = observe(owner, settlement(pending, false));
      await barrier(owner, 'before-decision-reservation');
      await owner.stop();
      await request.done;
      expect(owner.process.exited()?.signal).toBe('SIGKILL');
      await control(peer, 'expire-native-lease');

      expect(await maintain(peer)).toBe(1);
      const ready = await state(peer);

      expect(ready.session).toMatchObject({
        state: 'Ready',
        payload: published.session.payload,
      });
      expect(ready.members).toEqual(published.members);
      expect(ready.batches).toEqual(published.batches);
      expect(ready.invocations).toEqual(published.invocations);
      expect(ready.effects).toEqual(firstState.effects);
      const fresh = await recover(peer);
      peer.mock.onToolResult('second-browser', { content: 'Second completed' });
      peer.mock.onToolResult('second-protected', {
        content: 'Second completed',
      });
      expect(
        (await postRun(peer, settlement(fresh, false), alice)).events.at(-1)
          ?.type,
      ).toBe('RUN_FINISHED');
      const completed = await state(peer);
      expect(completed.effects).toHaveLength(2);
      const next = await start();
      const restored = await recover(next);
      expect(restored.disposition).toBe('Completed');
      expect(JSON.stringify(restored.snapshot?.messages)).toContain(
        'Known exact result',
      );
      expect(JSON.stringify(restored.snapshot?.messages)).toContain(
        'result-unavailable',
      );
      expect(await state(next)).toEqual(completed);
      expect(next.requests).toHaveLength(0);
      record({ firstState, published, ready, completed });
    },
    {
      FixtureNativeSessions: 'true',
      FixtureNativeApprovals: 'true',
      Workflow: '',
    },
  );
}, 90_000);
