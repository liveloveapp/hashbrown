import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Browser, type BrowserContext, expect } from '@playwright/test';
import { withDurableCluster } from './durable-fixture';
import {
  resolveDotnetHost,
  selectDotnetHost,
  verifyLoadedDotnetHost,
} from './dotnet-host';
import { type DotnetFixture } from './http-fixture';
import { startCandidateHandlerObserver } from './candidate-handler-observer';
import { startCandidateRecoveryProxy } from './candidate-recovery-proxy';

/** Proves duplicate HTTP operations through the same actual packed SDK handler survive page/worker replacement, separately from settlement counts. */
export async function runCandidateObserverPositiveControl(
  browser: Browser,
): Promise<void> {
  const root = process.env['HASHBROWN_CANDIDATE_EVIDENCE'];
  const react = process.env['HASHBROWN_PACKAGE_REACT_URL'];
  const angular = process.env['HASHBROWN_PACKAGE_ANGULAR_URL'];
  assert.ok(root && react && angular);
  const scope = {
    scenarioId: 'candidate-browser-observer-positive',
    threadId: `observer-control-${crypto.randomUUID()}`,
  };
  const city = 'Same owned duplicate-control city';
  const callId = 'duplicate-control-browser';
  const prompt = 'Owned observer duplicate control';
  const observerPath = join(root, 'observer-positive.jsonl');
  const pageErrors: string[] = [];
  const contexts: BrowserContext[] = [];
  const records: Record<string, unknown>[] = [];
  let computations = 0;
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const observer = await startCandidateHandlerObserver({
        ownedOrigins: [react, angular],
        evidencePath: observerPath,
        limits: {
          requestBytes: 16_384,
          resultBytes: 16_384,
          records: 4096,
          holdTimeoutMs: 120_000,
        },
      });
      const proxy = await startCandidateRecoveryProxy({
        ownedOrigins: [react, angular],
        evidencePath: join(root, 'observer-positive-proxy.jsonl'),
        limits: {
          requestBytes: 1024 * 1024,
          responseBytes: 4 * 1024 * 1024,
          frameBytes: 1024 * 1024,
          records: 4096,
          holdTimeoutMs: 120_000,
        },
      }).catch(async (error: unknown) => {
        try {
          await observer.close();
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            'Observer control acquisition cleanup failed',
          );
        }
        throw error;
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
              return { actualOperationSequence: computations };
            },
          },
        ],
      });
      let failure: unknown;
      const cleanup: unknown[] = [];
      const fixtures: DotnetFixture[] = [];
      try {
        for (const phase of [1, 2]) {
          const threadId = `observer-real-run-${crypto.randomUUID()}`;
          expect(threadId).not.toBe(scope.threadId);
          const fixture = await start();
          fixtures.push(fixture);
          const host = resolveDotnetHost(selectDotnetHost());
          assert.ok(host.loaded);
          verifyLoadedDotnetHost(host, fixture.diagnostics());
          const workerId = `observer-worker-${fixture.process.pid}`;
          const proof = join(root, workerId + '.json');
          await writeFile(
            proof,
            JSON.stringify(
              {
                process: fixture.process,
                loaded: host.loaded,
                diagnostics: fixture.diagnostics(),
              },
              null,
              2,
            ),
          );
          proxy.registerWorker({
            id: workerId,
            origin: fixture.url,
            loadedIdentityEvidence: proof,
          });
          proxy.registerThread({
            scenarioId: scope.scenarioId,
            threadId,
            workerId,
            recoveryPath: `/threads/${encodeURIComponent(threadId)}/native-session`,
            principal: 'alice',
          });
          fixture.mock.onMessage(prompt, {
            toolCalls: [
              { id: callId, name: 'getWeather', arguments: { city } },
            ],
          });
          const before = observer.entries(scope);
          expect(before).toHaveLength(phase - 1);
          if (phase === 2) {
            const saved = (await readFile(observerPath, 'utf8'))
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line) as Record<string, unknown>);
            expect(
              saved.filter((record) => record.kind === 'entry-committed'),
            ).toHaveLength(1);
            expect(fixtures[0].process.exited()?.signal).toBe('SIGKILL');
          }
          const context = await browser.newContext();
          contexts.push(context);
          const page = await context.newPage();
          page.on('pageerror', (error) => pageErrors.push(String(error)));
          const config = {
            facade: 'chat',
            scenarioId: scope.scenarioId,
            threadId,
            principal: 'alice',
            endpoint: proxy.origin,
            observer: registration,
            prompt,
            nextPrompt: 'Unused observer control next',
            deadlineMs: 60_000,
          };
          const response = await page.goto(
            `${react}/?config=${encodeURIComponent(JSON.stringify(config))}`,
          );
          assert.ok(response?.ok());
          await expect(page.getByTestId('start')).toBeVisible();
          expect(fixture.requests).toHaveLength(0);
          await page.getByTestId('start').click();
          await expect
            .poll(() => observer.entries(scope).length, { timeout: 30_000 })
            .toBe(phase);
          const current = observer.entries(scope).at(-1);
          assert.ok(current);
          await expect
            .poll(() =>
              observer
                .records()
                .some(
                  (record) =>
                    record.kind === 'hold-received' &&
                    record.receiptId === current.receiptId,
                ),
            )
            .toBe(true);
          await expect
            .poll(async () => {
              const state = await fetch(
                `${fixture.url}/__test/native-recovery-state?threadId=${encodeURIComponent(threadId)}`,
                {
                  headers: { 'X-Fixture-Principal': 'alice' },
                  signal: AbortSignal.timeout(5000),
                },
              );
              assert.equal(state.status, 200);
              return ((await state.json()) as { session: { state: string } })
                .session.state;
            })
            .toBe('Ready');
          const stateResponse = await fetch(
            `${fixture.url}/__test/native-recovery-state?threadId=${encodeURIComponent(threadId)}`,
            {
              headers: { 'X-Fixture-Principal': 'alice' },
              signal: AbortSignal.timeout(5000),
            },
          );
          const state = (await stateResponse.json()) as {
            session: { payload: string };
            effects: unknown[];
          };
          const canonical = JSON.parse(
            JSON.parse(state.session.payload).publicRequest,
          ) as {
            messages: {
              toolCalls?: {
                id: string;
                function: { name: string; arguments: string };
              }[];
            }[];
          };
          const canonicalCalls = canonical.messages.flatMap(
            (message) => message.toolCalls ?? [],
          );
          expect(canonicalCalls).toEqual([
            expect.objectContaining({
              id: callId,
              function: expect.objectContaining({ name: 'getWeather' }),
            }),
          ]);
          expect(JSON.parse(canonicalCalls[0].function.arguments)).toEqual({
            city,
          });
          expect(state.effects).toEqual([]);
          expect(fixture.requests).toHaveLength(1);
          expect(computations).toBe(phase);
          expect(current).toMatchObject({
            correlation: city,
            toolName: 'getWeather',
            arguments: { city },
            result: { actualOperationSequence: phase },
          });
          expect(observer.entries(scope).slice(0, phase - 1)).toEqual(before);
          if (phase === 2) {
            expect(current.receiptId).not.toBe(before[0].receiptId);
            expect(current.seq).toBeGreaterThan(before[0].seq);
          }
          // One control observer scope intentionally joins two DISTINCT real run threads; it grants no canonical settlement binding.
          records.push({
            phase,
            observerControlScope: scope,
            actualRunThreadId: threadId,
            actualCanonicalCallId: callId,
            loadedWorker: { process: fixture.process, loaded: host.loaded },
            actualProviderRequest: fixture.requests[0],
            observerEntry: current,
            nativeState: state,
            actualProxyRecords: proxy.records(threadId),
          });
          await context.close();
          await expect
            .poll(() =>
              observer
                .records()
                .some(
                  (record) =>
                    record.kind === 'downstream-closed' &&
                    record.receiptId === current.receiptId,
                ),
            )
            .toBe(true);
          observer.release(current.receiptId);
          await fixture.stop();
          expect(fixture.process.exited()?.signal).toBe('SIGKILL');
          expect(observer.entries(scope)).toHaveLength(phase);
        }
        const persisted = (await readFile(observerPath, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as Record<string, unknown>);
        expect(
          persisted.filter((record) => record.kind === 'entry-committed'),
        ).toHaveLength(2);
        expect(observer.entries(scope)).toHaveLength(2);
        expect(computations).toBe(2);
        expect(pageErrors).toEqual([]);
        expect(
          observer
            .records()
            .filter((record) => record.kind === 'canonical-binding'),
        ).toEqual([]);
        expect(
          observer
            .records()
            .filter(
              (record) => record.kind === 'fault' || record.kind === 'rejected',
            ),
        ).toEqual([]);
      } catch (error) {
        failure = error;
      } finally {
        for (const context of contexts.reverse())
          try {
            await context.close();
          } catch (error) {
            cleanup.push(error);
          }
        try {
          await proxy.close();
        } catch (error) {
          cleanup.push(error);
        }
        try {
          await observer.close();
        } catch (error) {
          cleanup.push(error);
        }
        await writeFile(
          join(root, 'observer-positive-control.json'),
          JSON.stringify(
            {
              kind: 'actual-browser-handler-observer-positive-control',
              scope,
              computations,
              records,
              pageErrors,
              failure: failure instanceof Error ? failure.stack : failure,
              cleanupErrors: cleanup.map(String),
            },
            null,
            2,
          ),
        );
      }
      if (failure || cleanup.length)
        throw new AggregateError(
          [...(failure ? [failure] : []), ...cleanup],
          'Actual browser observer positive control failed',
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
