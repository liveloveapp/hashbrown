import { expect, test } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  localNativeApprovalStats,
  waitForLocalNativeApprovalServer,
  withLocalNativeApprovalResources,
} from '../harness/local-native-approval-browser';
import { withSafeLiveCase } from '../harness/live-browser-fixture';
import { publicChildEnvironment } from '../harness/live-configuration';
import { runLiveNativeApprovalScenario } from '../harness/live-native-approval-scenario';
import { startLiveStaticServer } from '../harness/live-static-server';
import { expectNativeRunCapture } from '../harness/native-wire';
import { withRoutedEndpoint } from '../harness/routed-endpoint';

for (const mode of ['browser-held', 'browser-held-slow', 'browser-held-hung'])
  test(`genuine native approval browser ${mode} ${mode === 'browser-held-hung' ? 'aborts at the authoritative deadline without a successful terminal' : 'accepts successful terminal before HTTP EOF and rejects damaged captures'}`, async ({
    browser,
  }, info) => {
    const metadataPath =
      process.env['HASHBROWN_LOCAL_NATIVE_CONSUMER_METADATA'];
    if (!metadataPath)
      throw new Error(
        'Explicit already qualified consumer metadata required for local-only browser probe.',
      );
    const qualify = async () => {
      const result = await promisify(execFile)(
        process.execPath,
        [
          resolve('tools/conformance/dotnet/live-consumer/qualify.mjs'),
          metadataPath,
        ],
        { env: publicChildEnvironment(process.env), timeout: 15_000 },
      );
      return JSON.parse(result.stdout) as {
        artifacts: Record<string, string>;
        metadataPath: string;
      };
    };
    const metadata = await qualify();
    const framework = info.project.name;
    await withLocalNativeApprovalResources(async (own) => {
      const directory = await mkdtemp(
        join(tmpdir(), 'hashbrown-local-native-browser-'),
      );
      own(() => rm(directory, { recursive: true, force: true }));
      const project = resolve(
        'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
      );
      const source = await readFile(
        resolve(
          'tools/conformance/dotnet/tests/fixtures/live-approval-journal.cs.txt',
        ),
        'utf8',
      );
      const environment = {
        ...publicChildEnvironment(process.env),
        DOTNET_TEST_POSTGRES: process.env['DOTNET_TEST_POSTGRES'],
      };
      await writeFile(
        join(directory, 'Probe.csproj'),
        `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><ProjectReference Include="${project}" /></ItemGroup></Project>`,
      );
      await writeFile(join(directory, 'Program.cs'), source);
      const staticServer = await startLiveStaticServer(
        metadata.artifacts[framework],
      );
      own(() => staticServer.stop());
      let worker: ReturnType<typeof spawn> | undefined = undefined;
      own(async () => {
        const current = worker;
        if (
          current?.pid &&
          current.exitCode === null &&
          current.signalCode === null
        ) {
          const closed = new Promise<void>((accept) =>
            current.once('close', () => accept()),
          );
          current.kill('SIGINT');
          const kill = setTimeout(() => current.kill('SIGKILL'), 5_000);
          try {
            await closed;
          } finally {
            clearTimeout(kill);
          }
        }
      });
      const context = await browser.newContext({ baseURL: staticServer.url });
      own(() => context.close());
      const page = await context.newPage();

      await promisify(execFile)(
        process.env['DOTNET_HOST_PATH'] ?? 'dotnet',
        ['build', join(directory, 'Probe.csproj'), '--verbosity', 'quiet'],
        { env: environment, timeout: 45_000 },
      );
      worker = spawn(
        process.env['DOTNET_HOST_PATH'] ?? 'dotnet',
        [join(directory, 'bin/Debug/net10.0/Probe.dll'), mode],
        { env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const url = await waitForLocalNativeApprovalServer(worker);
      const fixture = {
        url,
        stats: (signal?: AbortSignal) => localNativeApprovalStats(url, signal),
        release: async () => {
          throw new Error('Local native approval has no release gate.');
        },
      };

      const phases: string[] = [];
      const annotations: Array<{ type: string; description: string }> = [];
      let requests: readonly string[] = [];
      let captures: readonly {
        body: string;
        truncated: boolean;
        complete: boolean;
      }[] = [];
      const started = performance.now();
      const run = withSafeLiveCase(
        async (signal) => {
          const close = () => void page.close().catch(() => undefined);
          signal.addEventListener('abort', close, { once: true });
          try {
            await withRoutedEndpoint(url, async (endpoint) => {
              captures = endpoint.responses;
              requests = endpoint.requests;
              await runLiveNativeApprovalScenario(
                page,
                {
                  ...fixture,
                  stats: (requestSignal?: AbortSignal) =>
                    fixture.stats(
                      AbortSignal.any([
                        signal,
                        ...(requestSignal ? [requestSignal] : []),
                      ]),
                    ),
                },
                endpoint,
                (phase) => phases.push(phase),
              );

              expect(endpoint.responses).toHaveLength(3);
              for (const capture of endpoint.responses) {
                expect(capture.complete).toBe(false);
                expectNativeRunCapture(capture);
                expect(() =>
                  expectNativeRunCapture({
                    ...capture,
                    body: capture.body.slice(0, -1),
                  }),
                ).toThrow();
                expect(() =>
                  expectNativeRunCapture({ ...capture, truncated: true }),
                ).toThrow();
                expect(() =>
                  expectNativeRunCapture({
                    ...capture,
                    body: capture.body.replace('"RUN_FINISHED"', '"RUN_ERROR"'),
                  }),
                ).toThrow();
              }
              expect(await fixture.stats()).toMatchObject({
                calls: 3,
                httpCalls: 3,
                nativeApprovalCaptures: 1,
                nativeApprovalDispatches: 1,
                nativeApprovalCompletions: 1,
                nativeApprovalPublications: 3,
                usageCompleteCalls: 3,
                usageIncompleteCalls: 0,
              });
            });
          } finally {
            signal.removeEventListener('abort', close);
          }
        },
        (annotation) => annotations.push(annotation),
      );
      if (mode === 'browser-held-hung') {
        await expect(run).rejects.toMatchObject({
          name: '',
          message: '',
          stack: '',
        });
        expect(performance.now() - started).toBeGreaterThanOrEqual(55_000);
        expect(page.isClosed()).toBe(true);
        await expect
          .poll(async () => (await fixture.stats()).cancelledCalls, {
            timeout: 5_000,
          })
          .toBe(1);
        expect(await fixture.stats()).toMatchObject({
          calls: 1,
          httpCalls: 1,
          stage: 'cancelled',
          usageCompleteCalls: 0,
          usageIncompleteCalls: 1,
          nativeApprovalCaptures: 0,
          nativeApprovalAdmissions: 0,
          nativeApprovalDispatches: 0,
          nativeApprovalCompletions: 0,
          nativeApprovalPublications: 0,
        });
        const counters = await fetch(`${url}/__test/counters`, {
          signal: AbortSignal.timeout(5_000),
        });
        expect(await counters.json()).toMatchObject({
          server: 0,
          protected: 0,
          durableNative: 0,
          durableProtected: 0,
          durableNativeProtected: 0,
        });
        const transport = await fetch(`${url}/__test/local-transport-calls`, {
          signal: AbortSignal.timeout(5_000),
        });
        expect(await transport.json()).toEqual({ calls: 1 });
        expect(requests).toHaveLength(1);
        expect(captures).toHaveLength(0);
        expect(annotations).toEqual([
          { type: 'live-failure', description: 'LIVE_ASSERTION_FAILED' },
        ]);
        expect(phases).toEqual(['native-pending']);
      } else {
        await run;
        expect(annotations).toEqual([]);
        expect(phases).toEqual([
          'native-pending',
          'native-continuation',
          'native-followup',
          'native-final-proof',
        ]);
      }
      expect(await qualify()).toEqual(metadata);
    });
  });
