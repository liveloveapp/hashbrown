import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

test('upgrade orchestration pins the actual immutable pre-extraction source', () => {
  const root = resolve(__dirname, '..');
  const project = JSON.parse(
    readFileSync(resolve(root, 'project.json'), 'utf8'),
  );

  expect(project.targets['package-upgrade']).toBeDefined();
  expect(existsSync(resolve(root, 'nuget-consumer/prepare-baseline.mjs'))).toBe(
    true,
  );
  const baseline = JSON.parse(
    readFileSync(
      resolve(__dirname, 'fixtures/pre-extraction-host.json'),
      'utf8',
    ),
  );
  expect(baseline.revision).toBe('8f0a710a75cb907c1a07e34eb5527b1834da90ed');
  expect(baseline.namespace).toBe('Hashbrown.Conformance.Integration');
  expect(Object.keys(baseline.archivedFiles)).toHaveLength(43);
  expect(baseline.archivedFiles['Hashbrown.Conformance.dll']).toBe(
    'aeee671cb9e00000b09439c709425dd45a7ed4734e540c0a3759eff942730a48',
  );
});

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { withDurableCluster } from '../harness/durable-fixture';
import {
  type HistoricalDotnetHostSelection,
  resolveDotnetHost,
} from '../harness/dotnet-host';
import { type DotnetFixture, postRun, runInput } from '../harness/http-fixture';

const alice = { 'X-Fixture-Principal': 'alice' };
const native = {
  FixtureNativeSessions: 'true',
  FixtureNativeApprovals: 'true',
  Workflow: '',
  ModelApi: 'chat-completions',
  NativeTenant: 'alpha',
  NativeRegion: 'east',
};
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
const sha = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

/** Recovers only through the public authenticated HTTP contract. */
async function recover(
  fixture: DotnetFixture,
  input: Omit<ReturnType<typeof runInput>, 'tools'> & { tools: object[] },
  path = 'native-session',
  principal = 'alice',
  extra: Record<string, unknown> = {},
) {
  return fetch(`${fixture.url}/threads/${input.threadId}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Fixture-Principal': principal,
    },
    body: JSON.stringify({
      tools: input.tools,
      forwardedProps: input.forwardedProps,
      ...extra,
    }),
  });
}

/** Uses a current public snapshot to construct an explicit user approval command. */
function approve(
  input: ReturnType<typeof runInput>,
  snapshot: { messages: object[]; interrupts: Array<{ id: string }> },
) {
  return {
    ...input,
    runId: crypto.randomUUID(),
    messages: snapshot.messages,
    resume: snapshot.interrupts.map((interrupt) => ({
      interruptId: interrupt.id,
      status: 'resolved',
      payload: { approved: true },
    })),
  };
}

/** Scripts a real model tool invocation; journal state is produced solely by the host process. */
function script(
  fixture: DotnetFixture,
  prompt: string,
  callId: string,
  mixed = false,
) {
  fixture.mock.onToolResult(callId, {
    content: 'Original native history completed',
  });
  fixture.mock.onMessage(prompt, {
    toolCalls: [
      { id: callId, name: 'lookupAirport', arguments: { code: 'PDX' } },
      ...(mixed
        ? [
            {
              id: 'browser-call',
              name: 'getWeather',
              arguments: { city: 'Paris' },
            },
          ]
        : []),
    ],
  });
}

/** Reads real PostgreSQL approval state through the existing test application control. */
async function state(fixture: DotnetFixture, threadId: string) {
  const response = await fetch(
    `${fixture.url}/__test/native-approval-state?threadId=${threadId}`,
    { headers: alice },
  );
  expect(response.status).toBe(200);
  return response.json();
}

test('historical archive rejects byte tampering before execution', () => {
  const helper = resolve(__dirname, '../nuget-consumer/prepare-baseline.mjs');
  const body = `import assert from 'node:assert/strict'; import fs from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path'; import {verifyBaselineArchive} from ${JSON.stringify('file://' + helper)};
const manifest=JSON.parse(await fs.readFile(${JSON.stringify(resolve(__dirname, 'fixtures/pre-extraction-host.json'))},'utf8')); const root=await fs.mkdtemp(path.join(os.tmpdir(),'hashbrown-tamper-')); try { for(const file of Object.keys(manifest.archivedFiles)) {const target=path.join(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'tampered');} await assert.rejects(verifyBaselineArchive(root),/hash changed/); } finally { await fs.rm(root,{recursive:true}); }`;

  execFileSync(process.execPath, ['--input-type=module', '-e', body]);
});

test('actual immutable old processes create PostgreSQL histories recovered by the qualified package without replay', async () => {
  const selectionText = process.env['HASHBROWN_UPGRADE_HISTORICAL'];
  // Ordinary package tests exercise orchestration/preflight; the explicit upgrade target owns the expensive real process proof.
  if (!selectionText) {
    expect(
      JSON.parse(readFileSync(resolve(__dirname, '../project.json'), 'utf8'))
        .targets['package-upgrade'].cache,
    ).toBe(false);
    return;
  }
  const selection: HistoricalDotnetHostSelection = JSON.parse(selectionText);
  const historical = resolveDotnetHost(selection);
  const baseline = JSON.parse(readFileSync(selection.descriptor, 'utf8'));
  const candidate = resolveDotnetHost();
  expect(candidate.loaded).toBeDefined();
  if (!candidate.loaded) throw new Error('Qualified package identity required');
  expect(baseline.revision).toBe('8f0a710a75cb907c1a07e34eb5527b1834da90ed');
  expect(sha(historical.executable)).not.toBe(candidate.loaded.sha256);
  expect(
    readFileSync(historical.executable).includes(
      Buffer.from('Hashbrown.Conformance.Integration'),
    ),
  ).toBe(true);
  const directory = process.env['HASHBROWN_UPGRADE_EVIDENCE_DIRECTORY'];
  if (!directory) throw new Error('Owned upgrade evidence directory required');
  const evidence: Record<string, unknown> = {
    baseline,
    candidate,
    selection,
    transport: 'HTTP-only: no browser process is launched',
    ownershipSemantics:
      'Public workflow and native lookups preserve database ownership and durable IDs. SDK restore creates fresh local UI batch ownership (separate browser guard coverage). Explicit current-snapshot commands acquire backend ownership; native admitted generation and dispatch fences are asserted here.',
  };
  const record = () => {
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      resolve(directory, 'upgrade-evidence.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
  };

  // A new-to-new substitution or altered immutable identity must fail before any process/model resource.
  for (const [name, mutation] of Object.entries({
    revision: { revision: 'HEAD' },
    namespace: { namespace: 'Hashbrown.AspNetCore' },
    executable: { executable: candidate.executable },
  })) {
    const file = resolve(directory, `rejected-${name}.json`);
    mkdirSync(directory, { recursive: true });
    writeFileSync(file, JSON.stringify({ ...baseline, ...mutation }));
    expect(() =>
      resolveDotnetHost({ ...selection, descriptor: file, sha256: sha(file) }),
    ).toThrow(/Historical/);
  }
  expect(() =>
    resolveDotnetHost({ ...selection, sha256: '0'.repeat(64) }),
  ).toThrow(/hash changed/);

  await withDurableCluster(
    'openai',
    async (cluster) => {
      evidence.schema = cluster.schema;
      const sql = () => {
        for (const [file, hash] of Object.entries(baseline.observerFiles))
          expect(sha(resolve(dirname(baseline.observer), file))).toBe(hash);
        expect(sha(resolve(baseline.root, 'observer/Program.cs'))).toBe(
          baseline.observerSourceSha256,
        );
        return JSON.parse(
          execFileSync(
            baseline.launcher,
            [baseline.observer, cluster.connectionString, cluster.schema],
            {
              env: baseline.environment,
              encoding: 'utf8',
              maxBuffer: 8 * 1024 * 1024,
            },
          ),
        );
      };
      const workflowPending = {
        ...runInput(),
        threadId: 'old-workflow-pending',
      };
      const workflowCompleted = {
        ...runInput(),
        threadId: 'old-workflow-completed',
      };
      const pendingInput = {
        ...runInput('Old native pending'),
        threadId: 'old-native-pending',
      };
      const completedInput = {
        ...runInput('Old native completed'),
        threadId: 'old-native-completed',
      };
      const mixedInput = {
        ...runInput('Old native mixed'),
        threadId: 'old-native-mixed',
        tools: [browserTool],
      };
      const oldWorkflow = await cluster.startHistorical({
        Workflow: 'confirm',
        ModelApi: 'chat-completions',
      });
      const oldNative = await cluster.startHistorical(native);
      script(oldNative, 'Old native pending', 'upgrade-pending');
      script(oldNative, 'Old native completed', 'upgrade-completed');
      script(oldNative, 'Old native mixed', 'upgrade-mixed', true);
      const wp = await postRun(oldWorkflow, workflowPending, alice);
      const wc = await postRun(oldWorkflow, workflowCompleted, alice);
      const wcSnapshot = (
        await (await recover(oldWorkflow, workflowCompleted, 'recovery')).json()
      ).snapshot;
      expect(
        (
          await postRun(
            oldWorkflow,
            approve(workflowCompleted, wcSnapshot),
            alice,
          )
        ).response.status,
      ).toBe(200);
      expect(wp.events.at(-1)).toHaveProperty('outcome.interrupts');
      expect(wc.events.at(-1)).toHaveProperty('outcome.interrupts');
      await postRun(oldNative, pendingInput, alice);
      await postRun(oldNative, completedInput, alice);
      const originalPending = await (
        await recover(oldNative, pendingInput)
      ).json();
      const completedSnapshot = (
        await (await recover(oldNative, completedInput)).json()
      ).snapshot;
      const consumedOldDecision = approve(completedInput, completedSnapshot);
      expect(
        (await postRun(oldNative, consumedOldDecision, alice)).response.status,
      ).toBe(200);
      const mixed = await postRun(oldNative, mixedInput, alice);
      expect(mixed.response.status).toBe(200);
      expect(
        mixed.events.filter((event) => event.type === 'TOOL_CALL_RESULT'),
      ).toEqual([]);
      const pendingBefore = await state(oldNative, pendingInput.threadId);
      const completedBefore = await state(oldNative, completedInput.threadId);
      expect(pendingBefore).toMatchObject({
        schemaVersion: 2,
        batches: [{ state: 'Pending' }],
        invocations: [{ state: 'Captured', dispatch_generation: null }],
        effects: [],
      });
      expect(completedBefore).toMatchObject({
        schemaVersion: 2,
        batches: [{ state: 'Settled' }],
        members: [{ decision: 'Approved' }],
        invocations: [
          { state: 'Completed', dispatch_generation: expect.any(Number) },
        ],
        effects: [{ code: 'PDX' }],
      });
      const before = sql();
      expect(before.interrupt_metadata).toEqual([{ id: 1, version: 3 }]);
      expect(before.native_metadata).toEqual([{ id: 1, version: 2 }]);
      expect(before.interrupt_batches).toHaveLength(2);
      expect(before.native_sessions).toHaveLength(3);
      for (const row of before.native_sessions) {
        expect(JSON.parse(row.compatibility)).toEqual([
          'hashbrown-native-v1',
          expect.stringMatching(/^[A-F0-9]{64}$/),
          expect.stringMatching(/^[A-F0-9]{64}$/),
        ]);
        expect(JSON.parse(row.payload).formatVersion).toBe(2);
      }
      expect(before.fixture_native_approval_effects).toHaveLength(1);
      expect(before.fixture_effects).toHaveLength(1);
      expect(before.fixture_native_effects).toHaveLength(0);
      expect(oldWorkflow.requests).toHaveLength(1);
      expect(oldNative.requests).toHaveLength(4);
      evidence.before = {
        rows: before,
        pendingBefore,
        completedBefore,
        originalPending,
        workflowRequests: oldWorkflow.requests,
        nativeRequests: oldNative.requests,
      };
      record();
      await oldWorkflow.stop();
      await oldNative.stop();
      expect(oldWorkflow.process.exited()).toBeDefined();
      expect(oldNative.process.exited()).toBeDefined();
      expect(resolveDotnetHost(selection).executable).toBe(
        historical.executable,
      );
      evidence.oldProcesses = [oldWorkflow, oldNative].map((worker) => ({
        ...worker.process,
        exit: worker.process.exited(),
        sha256: sha(worker.process.executable),
      }));
      record();

      const newWorkflow = await cluster.start({
        Workflow: 'confirm',
        ModelApi: 'chat-completions',
      });
      const newNative = await cluster.start(native);
      expect(newWorkflow.process.pid).not.toBe(oldWorkflow.process.pid);
      expect(newNative.process.pid).not.toBe(oldNative.process.pid);
      const afterStartup = sql();
      expect(afterStartup).toEqual(before);
      const restoredWorkflow = await (
        await recover(newWorkflow, workflowPending, 'recovery')
      ).json();
      const completedWorkflow = await (
        await recover(newWorkflow, workflowCompleted, 'recovery')
      ).json();
      const restoredNative = await (
        await recover(newNative, pendingInput)
      ).json();
      const completedNative = await (
        await recover(newNative, completedInput)
      ).json();
      const restoredMixed = await (await recover(newNative, mixedInput)).json();
      expect(restoredWorkflow).toMatchObject({
        schemaVersion: 1,
        effectState: 'Pending',
        snapshot: { messages: workflowPending.messages },
      });
      expect(completedWorkflow).toMatchObject({
        schemaVersion: 1,
        effectState: 'Completed',
        snapshot: {
          messages: expect.arrayContaining([
            expect.objectContaining({ content: 'Hello from .NET' }),
          ]),
        },
      });
      expect(restoredNative).toMatchObject({
        schemaVersion: 1,
        disposition: 'Pending',
        snapshot: { messages: originalPending.snapshot.messages },
      });
      expect(completedNative).toMatchObject({
        schemaVersion: 1,
        disposition: 'Completed',
        snapshot: {
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: 'Original native history completed',
            }),
          ]),
        },
      });
      expect(completedNative.snapshot.messages.length).toBeGreaterThan(
        completedInput.messages.length,
      );
      expect(restoredMixed).not.toHaveProperty('snapshot');
      expect(restoredMixed).toMatchObject({
        schemaVersion: 1,
        disposition: 'Pending',
        reason: 'PendingMixedBrowserResult',
      });
      expect(['NativePendingBrowserResults', 'Pending']).toContain(
        restoredMixed.disposition,
      );
      expect(newWorkflow.requests).toHaveLength(0);
      expect(newNative.requests).toHaveLength(0);
      expect(
        (await recover(newNative, pendingInput, 'native-session', 'bob'))
          .status,
      ).toBe(410);
      expect(
        (
          await recover(newNative, pendingInput, 'native-session', 'alice', {
            forwardedProps: { changed: true },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await recover(newNative, pendingInput, 'native-session', 'alice', {
            tools: [browserTool],
          })
        ).status,
      ).toBe(409);
      expect(
        (await recover(newWorkflow, workflowPending, 'recovery', 'bob')).status,
      ).toBe(404);
      expect(
        (
          await recover(newWorkflow, workflowPending, 'recovery', 'alice', {
            forwardedProps: { changed: true },
          })
        ).status,
      ).toBe(409);
      expect(
        (await postRun(newNative, consumedOldDecision, alice)).response.status,
      ).toBe(400);
      expect(newNative.requests).toHaveLength(0);
      const afterRecovery = sql();
      expect(afterRecovery).toEqual(before);
      expect(restoredNative.snapshot.interrupts).toEqual(
        originalPending.snapshot.interrupts,
      );
      expect(afterRecovery.fixture_native_approval_effects).toEqual(
        before.fixture_native_approval_effects,
      );
      expect(afterRecovery.fixture_effects).toEqual(before.fixture_effects);
      evidence.recovery = {
        restoredWorkflow,
        completedWorkflow,
        restoredNative,
        completedNative,
        restoredMixed,
        rows: afterRecovery,
        modelCalls: 0,
      };
      record();

      for (const change of [
        { RegistryVersion: '2' },
        { Model: 'other-model' },
        { NativeAgentName: 'OtherNative' },
        { NativeTenant: 'beta' },
        { NativeRegion: 'west' },
      ] as ReadonlyArray<Readonly<Record<string, string>>>) {
        const incompatible = await cluster.start({ ...native, ...change });
        const decision = approve(pendingInput, restoredNative.snapshot);
        expect([400, 409]).toContain(
          (await postRun(incompatible, decision, alice)).response.status,
        );
        expect(incompatible.requests).toHaveLength(0);
        await incompatible.stop();
      }
      const callback = approve(pendingInput, restoredNative.snapshot);
      expect([400, 409]).toContain(
        (await postRun(newNative, callback, { 'X-Fixture-Principal': 'bob' }))
          .response.status,
      );
      expect(newNative.requests).toHaveLength(0);
      script(newNative, 'Old native pending', 'upgrade-pending');
      expect((await postRun(newNative, callback, alice)).response.status).toBe(
        200,
      );
      const finished = await state(newNative, pendingInput.threadId);
      expect(finished.session.generation).toBeGreaterThan(
        pendingBefore.session.generation,
      );
      expect(finished).toMatchObject({
        members: [{ decision: 'Approved', state: 'Settled' }],
        invocations: [
          { state: 'Completed', dispatch_generation: expect.any(Number) },
        ],
        effects: [{ code: 'PDX' }],
      });
      expect(finished.invocations[0].dispatch_generation).toBe(
        finished.members[0].admitted_generation,
      );
      expect((await postRun(newNative, callback, alice)).response.status).toBe(
        400,
      );
      expect((await state(newNative, completedInput.threadId)).effects).toEqual(
        completedBefore.effects,
      );
      expect(newNative.requests).toHaveLength(1);
      expect(
        (
          await postRun(
            newWorkflow,
            approve(workflowPending, restoredWorkflow.snapshot),
            alice,
          )
        ).response.status,
      ).toBe(200);
      expect(newWorkflow.requests).toHaveLength(1);
      const after = sql();
      expect(after.interrupt_metadata).toEqual(before.interrupt_metadata);
      expect(after.native_metadata).toEqual(before.native_metadata);
      expect(after.native_sessions).toHaveLength(3);
      expect(after.interrupt_batches).toHaveLength(2);
      expect(after.fixture_native_approval_effects).toHaveLength(2);
      expect(after.fixture_effects).toHaveLength(2);
      expect(after.fixture_native_effects).toHaveLength(0);
      for (const old of before.native_sessions)
        expect(
          after.native_sessions.find(
            (row: { id: string }) => row.id === old.id,
          ),
        ).toMatchObject({
          id: old.id,
          agent: old.agent,
          scope: old.scope,
          key_data: old.key_data,
          compatibility: old.compatibility,
        });
      for (const old of before.interrupt_batches)
        expect(
          after.interrupt_batches.find(
            (row: { id: string }) => row.id === old.id,
          ),
        ).toMatchObject({
          id: old.id,
          scope: old.scope,
          fingerprint: old.fingerprint,
          compatibility_identity: old.compatibility_identity,
          operation_name: old.operation_name,
          operation_version: old.operation_version,
        });
      evidence.after = {
        rows: after,
        finished,
        nativeRequests: newNative.requests,
        workflowRequests: newWorkflow.requests,
      };
      evidence.newProcesses = [newWorkflow, newNative].map((worker) => ({
        ...worker.process,
        sha256: sha(worker.process.executable),
      }));
      record();
      await newWorkflow.stop();
      await newNative.stop();
      evidence.newExits = [
        newWorkflow.process.exited(),
        newNative.process.exited(),
      ];
      record();
    },
    {},
    selection,
  );
}, 180_000);
