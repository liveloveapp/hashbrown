import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Browser, type BrowserContext, expect } from '@playwright/test';
import { withDurableCluster } from './durable-fixture';
import {
  resolveDotnetHost,
  selectDotnetHost,
  verifyLoadedDotnetHost,
} from './dotnet-host';
import { type DotnetFixture } from './http-fixture';
import {
  type CandidateHandlerObserver,
  startCandidateHandlerObserver,
} from './candidate-handler-observer';
import {
  type CandidateRecoveryProxy,
  startCandidateRecoveryProxy,
} from './candidate-recovery-proxy';
import { expectNativeToolPairs } from './native-wire';
import {
  assertCandidateContinuation,
  assertCandidateObserverUnchanged,
  assertCandidatePersistedRecoveryAbsent,
  bindCandidateObserverBaseline,
} from './candidate-browser-evidence';
import type { CandidateBrowserRecord } from './candidate-browser-manifest';

const known = '  Known café 🛫\n';
const callId = 'candidate-cold-browser';
const city = 'Candidate Paris';
const principal = { 'X-Fixture-Principal': 'alice' };

interface NativeState {
  readonly session: {
    readonly state: string;
    readonly revision: number;
    readonly generation: number;
    readonly payload: string;
  } | null;
  readonly effects: readonly unknown[];
}
interface UiStatus {
  readonly pending: {
    readonly id: string;
    readonly serverRevision: number;
    readonly toolCalls: readonly { readonly id: string }[];
  } | null;
  readonly recovery: { readonly revision: number };
  readonly lastRead?: {
    readonly disposition: string;
    readonly serverRevision: number;
    readonly schemaVersion: number;
  };
  readonly messages?: readonly Record<string, unknown>[];
  readonly events?: readonly { readonly type: string }[];
}

/** Requalifies both explicit bindings in Playwright setup before any browser or durable fixture acquisition. */
export default async function candidateBrowserPreflight(): Promise<void> {
  const npm = process.env['HASHBROWN_CANDIDATE_NPM_METADATA'];
  const nuget = process.env['HASHBROWN_CANDIDATE_NUGET_METADATA'];
  assert.ok(
    npm && nuget && npm !== nuget,
    'Both distinct explicit candidate bindings required',
  );
  const qualifier = await import(
    pathToFileURL(resolve(__dirname, '../candidate-consumer/qualify.mjs')).href
  );
  await qualifier.qualifyNpmCandidate(npm);
  const qualified = await qualifier.qualifyNugetCandidate(nuget);
  assert.equal(
    qualified.packagePointer,
    process.env['HASHBROWN_DOTNET_CONSUMER_METADATA'],
    'Worker must select the qualified raw NuGet pointer',
  );
  assert.equal(
    selectDotnetHost().HASHBROWN_DOTNET_HOST_MODE,
    'package',
    'Candidate source host fallback forbidden',
  );
  const host = resolveDotnetHost(selectDotnetHost());
  assert.ok(host.loaded, 'Actual qualified package host identity required');
}

/** Reads real authenticated full session and append-only effect state independently of the page. */
async function nativeState(
  fixture: DotnetFixture,
  threadId: string,
): Promise<NativeState> {
  const response = await fetch(
    `${fixture.url}/__test/native-recovery-state?threadId=${encodeURIComponent(threadId)}`,
    { headers: principal },
  );
  assert.equal(response.status, 200, 'Actual native state observation failed');
  return response.json();
}

/** Reads the saved canonical public request without normalizing or rebuilding its messages. */
function canonical(state: NativeState): {
  messages: Record<string, unknown>[];
  forwardedProps?: Record<string, unknown>;
} {
  assert.ok(state.session?.payload, 'Actual saved payload required');
  const payload = JSON.parse(state.session.payload);
  assert.equal(
    typeof payload.publicRequest,
    'string',
    'Actual public request missing from saved payload',
  );
  return JSON.parse(payload.publicRequest);
}

/** Parses only actual captured browser run entity bytes; recovery reads are a separate domain. */
function runRequests(
  proxy: CandidateRecoveryProxy,
  threadId: string,
): { requestId: string; input: Record<string, unknown> }[] {
  return proxy
    .records(threadId)
    .filter(
      (record) => record.kind === 'request' && record.incomingBody.length > 0,
    )
    .flatMap((record) => {
      const input = JSON.parse(record.incomingBody.toString('utf8'));
      return input.threadId === threadId && Array.isArray(input.messages)
        ? [{ requestId: record.requestId, input }]
        : [];
    });
}

/** Executes the actual cold packed React/OpenAI/Chat journey; unsupported full rows fail closed outside this pilot. */
export async function runCandidateKnownStringPilot(
  browser: Browser,
  record: CandidateBrowserRecord,
): Promise<void> {
  assert.equal(
    record.id,
    'react.openai.chat.chat.browser.known-string',
    'Explicit known-string pilot required',
  );
  const root = process.env['HASHBROWN_CANDIDATE_EVIDENCE'];
  const reactOrigin = process.env['HASHBROWN_PACKAGE_REACT_URL'];
  const angularOrigin = process.env['HASHBROWN_PACKAGE_ANGULAR_URL'];
  assert.ok(
    root && reactOrigin && angularOrigin,
    'Explicit qualified static origins and private evidence required',
  );
  const origins = [reactOrigin, angularOrigin];
  const threadId = `candidate-${crypto.randomUUID()}`;
  const scope = { scenarioId: record.id, threadId };
  const pageErrors: string[] = [];
  const contexts: BrowserContext[] = [];
  let observer: CandidateHandlerObserver | undefined;
  let proxy: CandidateRecoveryProxy | undefined;
  let computations = 0;
  const snapshots: Record<string, unknown> = {};
  const evidenceFile = join(root, 'pilot-journey.json');
  await withDurableCluster(
    'openai',
    async (cluster) => {
      const fixture = await cluster.start();
      const host = resolveDotnetHost(selectDotnetHost());
      assert.ok(
        host.loaded,
        'Candidate worker must load qualified package bytes',
      );
      verifyLoadedDotnetHost(host, fixture.diagnostics());
      const workerProof = join(root, 'pilot-worker.json');
      await writeFile(
        workerProof,
        JSON.stringify(
          {
            process: fixture.process,
            loaded: host.loaded,
            diagnostics: fixture.diagnostics(),
            schema: cluster.schema,
          },
          null,
          2,
        ),
      );
      let failure: unknown;
      const cleanupErrors: unknown[] = [];
      try {
        observer = await startCandidateHandlerObserver({
          ownedOrigins: origins,
          evidencePath: join(root, 'pilot-observer.jsonl'),
          limits: {
            requestBytes: 16_384,
            resultBytes: 16_384,
            records: 4096,
            holdTimeoutMs: 90_000,
          },
        });
        proxy = await startCandidateRecoveryProxy({
          ownedOrigins: origins,
          evidencePath: join(root, 'pilot-proxy.jsonl'),
          limits: {
            requestBytes: 2 * 1024 * 1024,
            responseBytes: 4 * 1024 * 1024,
            frameBytes: 1024 * 1024,
            records: 16_384,
            holdTimeoutMs: 90_000,
          },
        });
        const activeObserver = observer;
        const activeProxy = proxy;
        proxy.registerWorker({
          id: `worker-${fixture.process.pid}`,
          origin: fixture.url,
          loadedIdentityEvidence: workerProof,
        });
        proxy.registerThread({
          ...scope,
          workerId: `worker-${fixture.process.pid}`,
          recoveryPath: `/threads/${encodeURIComponent(threadId)}/native-session`,
          principal: 'alice',
        });
        const registration = observer.register({
          scope,
          operations: [
            {
              correlation: city,
              toolName: 'getWeather',
              arguments: { city },
              compute: () => {
                computations++;
                return known;
              },
            },
          ],
        });
        const prompt = `Candidate cold ${threadId}`;
        const nextPrompt = `Candidate next ${threadId}`;
        // A continuation still contains its original last user prompt: register actual result matches first.
        fixture.mock.onToolResult(callId, { content: 'Candidate complete' });
        fixture.mock.onMessage(nextPrompt, {
          content: 'Candidate next complete',
        });
        fixture.mock.onMessage(prompt, {
          toolCalls: [{ id: callId, name: 'getWeather', arguments: { city } }],
        });
        const config = {
          facade: 'chat',
          scenarioId: record.id,
          threadId,
          principal: 'alice',
          endpoint: proxy.origin,
          observer: registration,
          prompt,
          nextPrompt,
          deadlineMs: 30_000,
        };
        const url = `${reactOrigin}/?config=${encodeURIComponent(JSON.stringify(config))}`;
        const open = async () => {
          const context = await browser.newContext();
          contexts.push(context);
          const page = await context.newPage();
          page.on('pageerror', (error) => pageErrors.push(String(error)));
          const response = await page.goto(url);
          assert.ok(
            response?.ok(),
            'Qualified candidate static page must actually load',
          );
          assert.equal(
            new URL(page.url()).origin,
            reactOrigin,
            'Unexpected candidate browser origin',
          );
          return { context, page };
        };
        const original = await open();
        snapshots.readiness = {
          caseId: record.id,
          worker: fixture.process,
          loaded: host.loaded,
          reactOrigin,
          proxyOrigin: proxy.origin,
          observer: registration,
          schema: cluster.schema,
          pageUrl: original.page.url(),
        };
        await writeFile(
          join(root, 'pilot-readiness.json'),
          JSON.stringify(snapshots.readiness, null, 2),
        );
        // This is the intentional first feature RED on the qualified minimal artifact, after real infrastructure readiness.
        await expect
          .poll(
            async () =>
              (await original.page.getByTestId('start').count()) > 0 ||
              (await original.page
                .getByTestId('candidate-isolation-ready')
                .count()) > 0,
          )
          .toBe(true);
        if ((await original.page.getByTestId('start').count()) === 0) {
          await expect(
            original.page.getByTestId('candidate-isolation-ready'),
          ).toBeVisible();
          assert.deepEqual(
            pageErrors,
            [],
            'Runtime/bootstrap failure is not a missing-control RED',
          );
          throw new Error(
            'CANDIDATE_PILOT_UI_START_MISSING: qualified packed page and independent package/DB/model/observer/proxy are ready',
          );
        }
        await original.page.getByTestId('start').click();
        await observer.waitForRecord(
          'hold-received',
          scope,
          AbortSignal.timeout(30_000),
        );
        await expect
          .poll(
            async () => (await nativeState(fixture, threadId)).session?.state,
            { timeout: 30_000 },
          )
          .toBe('Ready');
        const published = await nativeState(fixture, threadId);
        assert.ok(published.session, 'Actual published session required');
        const prefix = canonical(published);
        const originalCalls = prefix.messages.flatMap((message) =>
          Array.isArray(message.toolCalls)
            ? (message.toolCalls as {
                id: string;
                function: { name: string; arguments: string };
              }[])
            : [],
        );
        expect(originalCalls).toHaveLength(1);
        expect(originalCalls[0]).toMatchObject({
          id: callId,
          function: { name: 'getWeather' },
        });
        expect(JSON.parse(originalCalls[0].function.arguments)).toEqual({
          city,
        });
        expect(published.effects).toEqual([]);
        expect(fixture.requests).toHaveLength(1);
        const entries = observer.entries(scope);
        expect(entries).toHaveLength(1);
        expect(entries[0].result).toBe(known);
        expect(computations).toBe(1);
        const observerBaseline = await bindCandidateObserverBaseline(
          observer,
          scope,
          [
            {
              correlation: city,
              canonicalCallId: callId,
              toolName: 'getWeather',
              arguments: { city },
            },
          ],
        );
        snapshots.published = published;
        snapshots.originalEntries = entries;
        const originalAttempts = observer
          .records()
          .filter((entry) => entry.kind === 'request-received')
          .map((entry) => entry.seq);
        await original.context.close();
        await expect
          .poll(
            () =>
              activeObserver
                .records()
                .filter(
                  (entry) =>
                    entry.kind === 'downstream-closed' &&
                    entry.receiptId === entries[0].receiptId,
                ).length,
          )
          .toBe(1);
        observer.release(entries[0].receiptId);
        const fresh = await open();
        const status = async (): Promise<UiStatus> =>
          JSON.parse(await fresh.page.getByTestId('status').innerText());
        await fresh.page.getByTestId('read').click();
        await expect
          .poll(async () => (await status()).pending?.id)
          .toBeTruthy();
        const restored = await status();
        expect(restored.lastRead).toMatchObject({
          schemaVersion: 2,
          disposition: 'Pending',
          serverRevision: published.session.revision,
        });
        expect(restored.pending?.serverRevision).toBe(
          published.session.revision,
        );
        expect(restored.pending?.toolCalls.map((call) => call.id)).toEqual([
          callId,
        ]);
        expect(runRequests(proxy, threadId)).toHaveLength(1);
        assertCandidateObserverUnchanged(observer, scope, observerBaseline);
        await fresh.page
          .getByTestId(`outcome-status-${callId}`)
          .selectOption('result');
        await fresh.page
          .getByTestId(`outcome-value-${callId}`)
          .fill(JSON.stringify(known));
        await fresh.page.getByTestId('submit').click();
        await expect
          .poll(
            async () =>
              (await status()).messages?.some(
                (message) =>
                  message.role === 'assistant' &&
                  message.content === 'Candidate complete',
              ),
            { timeout: 30_000 },
          )
          .toBe(true);
        await expect
          .poll(
            async () => (await nativeState(fixture, threadId)).session?.state,
          )
          .toBe('Ready');
        const completed = await nativeState(fixture, threadId);
        assert.ok(completed.session, 'Actual completed session required');
        const saved = canonical(completed);
        expect(saved.messages.slice(0, prefix.messages.length)).toEqual(
          prefix.messages,
        );
        const results = saved.messages.filter(
          (message) => message.role === 'tool' && message.toolCallId === callId,
        );
        expect(results).toHaveLength(1);
        expect(results[0].content).toBe(known);
        expect(typeof results[0].id).toBe('string');
        expect(
          prefix.messages.some((message) => message.id === results[0].id),
        ).toBe(false);
        const runs = runRequests(proxy, threadId);
        expect(runs).toHaveLength(2);
        const continuation = runs[1].input;
        assertCandidateContinuation(
          prefix.messages,
          [{ toolCallId: callId, status: 'result', content: known }],
          published.session.revision,
          continuation,
          saved.messages,
        );
        expect(
          (await status()).events?.some(
            (event) => event.type === 'RUN_FINISHED',
          ),
        ).toBe(true);
        const recoveryConfigurations = () =>
          activeProxy
            .records(threadId)
            .filter(
              (record) =>
                record.kind === 'request' && record.incomingBody.length > 0,
            )
            .map((record) => JSON.parse(record.incomingBody.toString('utf8')))
            .filter(
              (input) =>
                Array.isArray(input.tools) && !Array.isArray(input.messages),
            );
        const readCount = recoveryConfigurations().length;
        await fresh.page.getByTestId('fresh-read').click();
        await expect
          .poll(async () => (await status()).lastRead?.disposition)
          .toBe('Completed');
        expect(recoveryConfigurations()).toHaveLength(readCount + 1);
        const configuration = recoveryConfigurations().at(-1);
        assert.ok(
          configuration,
          'Actual post-settlement captured recovery configuration required',
        );
        expect(configuration).toEqual(recoveryConfigurations()[0]);
        assertCandidatePersistedRecoveryAbsent({
          publicRequest: saved,
          nativeJson: JSON.parse(completed.session.payload).nativeJson,
          configuration,
        });
        expect(continuation.forwardedProps).toMatchObject({
          hashbrown: {
            recovery: {
              version: 1,
              serverRevision: published.session.revision,
              outcomes: [{ toolCallId: callId, status: 'result' }],
            },
          },
        });
        expect(
          JSON.stringify(
            (
              continuation.forwardedProps as {
                hashbrown: { recovery: unknown };
              }
            ).hashbrown.recovery,
          ),
        ).not.toContain('value');
        expect(
          continuation.resume === undefined ||
            (Array.isArray(continuation.resume) &&
              continuation.resume.length === 0),
        ).toBe(true);
        expect(completed.effects).toEqual([]);
        expect(fixture.requests).toHaveLength(2);
        expectNativeToolPairs(fixture.requests[1], 'chat-completions', [
          {
            id: callId,
            name: 'getWeather',
            arguments: JSON.stringify({ city }),
            output: known,
          },
        ]);
        assertCandidateObserverUnchanged(observer, scope, observerBaseline);
        await fresh.page.getByTestId('rerender').click();
        assertCandidateObserverUnchanged(observer, scope, observerBaseline);
        await fresh.context.close();
        const second = await open();
        await second.page.getByTestId('read').click();
        await expect
          .poll(
            async () =>
              (
                JSON.parse(
                  await second.page.getByTestId('status').innerText(),
                ) as UiStatus
              ).lastRead?.disposition,
          )
          .toBe('Completed');
        assertCandidateObserverUnchanged(observer, scope, observerBaseline);
        expect(runRequests(proxy, threadId)).toHaveLength(2);
        await second.page.getByTestId('next').click();
        await expect
          .poll(async () =>
            (
              JSON.parse(
                await second.page.getByTestId('status').innerText(),
              ) as UiStatus
            ).messages?.some(
              (message) =>
                message.role === 'assistant' &&
                message.content === 'Candidate next complete',
            ),
          )
          .toBe(true);
        expect(fixture.requests).toHaveLength(3);
        const ordinary = runRequests(proxy, threadId);
        expect(ordinary).toHaveLength(3);
        await expect
          .poll(
            async () => (await nativeState(fixture, threadId)).session?.state,
          )
          .toBe('Ready');
        const ordinaryState = await nativeState(fixture, threadId);
        assert.ok(
          ordinaryState.session,
          'Actual ordinary continuation session required',
        );
        const ordinaryNative = JSON.parse(
          ordinaryState.session.payload,
        ).nativeJson;
        assertCandidatePersistedRecoveryAbsent({
          publicRequest: ordinary[2].input,
          configuration,
          nativeJson: ordinaryNative,
        });
        assertCandidatePersistedRecoveryAbsent({
          publicRequest: canonical(ordinaryState),
          configuration,
          nativeJson: ordinaryNative,
        });
        assertCandidateObserverUnchanged(observer, scope, observerBaseline);
        expect(computations).toBe(1);
        expect(
          observer
            .records()
            .filter((entry) => entry.kind === 'request-received')
            .map((entry) => entry.seq),
        ).toEqual(originalAttempts);
        expect(
          observer
            .records()
            .filter(
              (entry) => entry.kind === 'rejected' || entry.kind === 'fault',
            ),
        ).toEqual([]);
        expect(pageErrors).toEqual([]);
        snapshots.completed = completed;
        snapshots.ordinary = ordinaryState;
      } catch (error) {
        failure = error;
      } finally {
        try {
          await writeFile(
            evidenceFile,
            JSON.stringify(
              {
                kind: 'actual-candidate-browser-pilot',
                caseId: record.id,
                threadId,
                snapshots,
                computations,
                pageErrors,
                observer: observer?.records(),
                proxy: proxy?.records(threadId),
                providerRequests: fixture.requests,
                failure: failure instanceof Error ? failure.stack : failure,
              },
              null,
              2,
            ),
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
        for (const context of contexts.reverse()) {
          try {
            await context.close();
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
        try {
          await proxy?.close();
        } catch (error) {
          cleanupErrors.push(error);
        }
        try {
          await observer?.close();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (failure || cleanupErrors.length)
        throw new AggregateError(
          [...(failure ? [failure] : []), ...cleanupErrors],
          `Candidate pilot journey or cleanup failed: ${failure instanceof Error ? failure.message : String(failure ?? '')}`,
        );
    },
    {
      Workflow: '',
      FixtureNativeSessions: 'true',
      FixtureNativeApprovals: 'true',
      FixtureCandidateRecoveryEvidence: 'true',
      ModelApi: 'chat-completions',
    },
  );
}
