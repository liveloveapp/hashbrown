import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  LIVE_PROJECTS,
  type LiveConfiguration,
  loadLiveConfiguration,
  publicChildEnvironment,
} from './live-configuration';
import {
  RELEASE_RECOVERY_MANIFEST,
  releaseRecoveryCases,
} from './live-recovery-manifest';
import {
  createReleaseRecoveryBudget,
  drainRecoveryCleanup,
  type ReleaseRecoveryBudget,
} from './live-recovery-budget';
import { createReleaseRecoveryLedger } from './live-recovery-evidence';
import {
  type ReleaseRecoveryPackageRequest,
  type ReleaseRecoveryPackages,
  selectReleaseRecoveryPackages,
} from './live-recovery-package';
import { startLiveRecoveryWorker } from './live-recovery-fixture';
import { startLiveStaticServer } from './live-static-server';
import { runLiveRecoveryCase } from './live-recovery-scenario';

/** Explicit execution options; list mode has no execution inputs. */
export interface ReleaseRecoveryRunnerArguments extends ReleaseRecoveryPackageRequest {
  readonly credentialFile: string;
  readonly output?: string;
}

/** Parses the entire reviewed command before package, credential, process, browser or database acquisition. */
export function parseReleaseRecoveryArguments(
  args: readonly string[],
): ReleaseRecoveryRunnerArguments | 'list' {
  if (args.length === 1 && args[0] === '--list') return 'list';
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (
      ![
        '--mode',
        '--npm-metadata',
        '--nuget-metadata',
        '--credentials',
        '--output',
      ].includes(name) ||
      values[name] !== undefined ||
      !value?.trim() ||
      value.startsWith('--')
    )
      throw new Error('RECOVERY_ARGUMENT_INVALID');
    values[name] = value;
  }
  const mode = values['--mode'];
  if (
    (mode !== 'candidate' && mode !== 'public') ||
    !['--npm-metadata', '--nuget-metadata', '--credentials'].every(
      (key) =>
        values[key] &&
        isAbsolute(values[key]) &&
        resolve(values[key]) === values[key],
    ) ||
    (values['--output'] !== undefined &&
      (!isAbsolute(values['--output']) ||
        resolve(values['--output']) !== values['--output']))
  )
    throw new Error('RECOVERY_ARGUMENT_INVALID');
  return Object.freeze({
    mode,
    npmMetadata: values['--npm-metadata'],
    nugetMetadata: values['--nuget-metadata'],
    credentialFile: values['--credentials'],
    ...(values['--output'] ? { output: values['--output'] } : {}),
  });
}

/** Writes only an owned receipt and removes it if its final absolute deadline check fails. */
export async function writeReleaseRecoveryReport(
  directory: string,
  result: Readonly<Record<string, unknown>>,
  budget: Pick<ReleaseRecoveryBudget, 'assertActive'>,
): Promise<void> {
  budget.assertActive();
  const report = join(directory, 'qualification.json');
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let owned = false;
  try {
    handle = await open(report, 'wx', 0o600);
    owned = true;
    await handle.writeFile(JSON.stringify(result, null, 2));
    await handle.close();
    handle = undefined;
    budget.assertActive();
  } catch (error) {
    const errors: unknown[] = [error];
    if (handle)
      try {
        await handle.close();
      } catch (closeError) {
        errors.push(closeError);
      }
    if (owned)
      try {
        await rm(report, { force: true });
      } catch (removeError) {
        errors.push(removeError);
      }
    if (errors.length > 1)
      throw new AggregateError(errors, 'RECOVERY_REPORT_FINALIZATION_FAILED');
    throw error;
  }
}

/** Runs all exact reservations serially; only the selected native child receives provider credentials. */
export async function runReleaseRecoveryQualification(
  configuration: LiveConfiguration,
  parsed: ReleaseRecoveryRunnerArguments,
  environment: Readonly<Record<string, string | undefined>>,
  packages: ReleaseRecoveryPackages,
  invocationBudget?: ReleaseRecoveryBudget,
) {
  const budget = invocationBudget ?? createReleaseRecoveryBudget();
  try {
    budget.assertActive();
    const postgres = environment['DOTNET_TEST_POSTGRES'];
    if (!postgres?.trim()) throw new Error('RECOVERY_POSTGRES_REQUIRED');
    const output =
      parsed.output ??
      (await mkdtemp(join(tmpdir(), 'hashbrown-release-recovery-')));
    if (parsed.output) await mkdir(output, { mode: 0o700 });
    const ledger = createReleaseRecoveryLedger();
    const reports: Readonly<Record<string, unknown>>[] = [];
    let browser:
      | Awaited<
          ReturnType<(typeof import('@playwright/test'))['chromium']['launch']>
        >
      | undefined;
    let react: Awaited<ReturnType<typeof startLiveStaticServer>> | undefined;
    let angular: Awaited<ReturnType<typeof startLiveStaticServer>> | undefined;
    let failed = false;
    let cleanup = true;
    const closeBrowser = () => {
      void browser?.close().catch(() => undefined);
    };
    budget.signal.addEventListener('abort', closeBrowser, { once: true });
    try {
      for (const name of RELEASE_RECOVERY_MANIFEST.preflights) {
        const allocation = budget.reservePreflight(name);
        const project =
          name === 'openai-responses'
            ? 'react-openai-key'
            : name === 'azure-responses'
              ? 'react-azure-key'
              : 'react-azure-cli';
        let worker:
          Awaited<ReturnType<typeof startLiveRecoveryWorker>> | undefined;
        try {
          const provider = configuration.providerEnvironment(
            project,
            environment,
          );
          worker = await startLiveRecoveryWorker({
            selection: packages.selection,
            provider:
              name === 'azure-cli-chat'
                ? { ...provider, ModelApi: 'chat-completions' }
                : provider,
            schema: `durable_live_${randomUUID().replaceAll('-', '')}`,
            origins: [],
            phase: 'preflight',
            remainingMs: allocation.remainingMs(),
            signal: allocation.signal,
          });
          const native = await allocation.dispatch(
            { signal: allocation.signal, maxOutputTokens: 384 },
            async (signal) => {
              const response = await fetch(
                `${worker!.url}/__test/live-recovery-preflight`,
                { method: 'POST', signal },
              );
              assert.equal(response.status, 200);
              return response.json();
            },
          );
          assert.equal(native.healthy, true);
          assert.equal(native.calls.length, 1);
          const call = native.calls[0];
          assert.equal(call.completed, true);
          assert.equal(call.disposed, true);
          assert.equal(call.validUsage, true);
          assert.equal(call.usageCount, 1);
          assert.equal(call.wire.method, 'POST');
          assert.equal(
            call.wire.path,
            name === 'openai-responses'
              ? '/v1/responses'
              : name === 'azure-responses'
                ? '/openai/v1/responses'
                : '/openai/deployments/gpt-4.1-mini/chat/completions',
          );
          assert.ok(call.wire.status >= 200 && call.wire.status < 300);
          assert.equal(call.wire.maxOutputTokens, 384);
          assert.ok(
            Number.isSafeInteger(call.inputTokens) && call.inputTokens >= 0,
          );
          assert.ok(
            Number.isSafeInteger(call.outputTokens) &&
              call.outputTokens >= 0 &&
              call.outputTokens <= 384,
          );
          if (name === 'azure-cli-chat')
            assert.equal(call.wire.authentication, 'bearer');
          await worker.stop();
          allocation.assertActive();
          ledger.preflight(name);
          reports.push(
            Object.freeze({
              preflight: name,
              attempts: 1,
              wireCalls: 1,
              validUsageCalls: 1,
              loadedSha256: worker.loaded.sha256,
              cleanup: 'passed',
            }),
          );
        } finally {
          try {
            if (worker) await worker.stop();
          } finally {
            allocation.dispose();
          }
        }
      }
      budget.assertActive();
      react = await startLiveStaticServer(packages.artifacts.react);
      budget.assertActive();
      angular = await startLiveStaticServer(packages.artifacts.angular);
      budget.assertActive();
      const { chromium } = await import('@playwright/test');
      browser = await chromium.launch({
        env: publicChildEnvironment(environment),
        timeout: Math.max(1, budget.remainingMs()),
      });
      budget.assertActive();
      for (const record of releaseRecoveryCases()) {
        budget.signal.throwIfAborted();
        const allocation = budget.reserveScenario(record.project, record.group);
        try {
          const result = await runLiveRecoveryCase({
            browser,
            record,
            packages,
            provider: configuration.providerEnvironment(
              record.project,
              environment,
            ),
            postgres,
            origins: { react: react.url, angular: angular.url },
            budget: allocation,
          });
          allocation.assertActive();
          reports.push(result);
          ledger.case(record.id);
        } finally {
          allocation.dispose();
        }
      }
      budget.assertActive();
      ledger.assertComplete();
      assert.equal(budget.snapshot().dispatchedCalls, 39);
    } catch {
      failed = true;
      ledger.fail();
    } finally {
      try {
        await drainRecoveryCleanup(async () => browser?.close());
      } catch {
        cleanup = false;
      }
      try {
        await drainRecoveryCleanup(async () => react?.stop());
      } catch {
        cleanup = false;
      }
      try {
        await drainRecoveryCleanup(async () => angular?.stop());
      } catch {
        cleanup = false;
      }
      budget.signal.removeEventListener('abort', closeBrowser);
    }
    let provenance = true;
    try {
      budget.assertActive();
      await packages.requalify(budget);
      budget.assertActive();
    } catch {
      provenance = false;
    }
    try {
      budget.assertActive();
    } catch {
      failed = true;
    }
    const result = Object.freeze({
      exitCode: failed || !cleanup || !provenance ? 1 : 0,
      kind: packages.provenance.kind,
      plannedCases: 12,
      actualPassedCases: ledger.snapshot().cases,
      successfulPreflights: ledger.snapshot().preflights,
      attemptedCalls: budget.snapshot().dispatchedCalls,
      cleanup: cleanup ? 'passed' : 'failed',
      provenance: provenance ? 'passed' : 'failed',
      packageIdentity: packages.provenance,
      cases: reports,
    });
    // Only fixed identities, hashes, counters and enums are persisted. No raw error, request, result or transcript is written.
    await writeReleaseRecoveryReport(output, result, budget);
    return { ...result, reportDirectory: output };
  } finally {
    if (!invocationBudget) budget.dispose();
  }
}

/** Provider-free list precedes all input I/O; execution qualifies packages before reading authorized credentials. */
export async function executeReleaseRecoveryRunner(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  dependencies: {
    readonly qualify?: typeof selectReleaseRecoveryPackages;
    readonly loadConfiguration?: typeof loadLiveConfiguration;
    readonly execute?: typeof runReleaseRecoveryQualification;
  } = {},
) {
  const parsed = parseReleaseRecoveryArguments(args);
  if (parsed === 'list') return { exitCode: 0, cases: releaseRecoveryCases() };
  if (environment['HASHBROWN_DOTNET_LIVE'] !== '1')
    throw new Error('RECOVERY_OPT_IN_REQUIRED');
  const budget = createReleaseRecoveryBudget();
  let reportDirectory: string | undefined;
  try {
    const packages = await (
      dependencies.qualify ?? selectReleaseRecoveryPackages
    )(parsed, budget);
    budget.assertActive();
    const configuration = await (
      dependencies.loadConfiguration ?? loadLiveConfiguration
    )({
      optIn: '1',
      credentialFile: parsed.credentialFile,
      projects: LIVE_PROJECTS.map((project) => project.name),
    });
    budget.assertActive();
    const result = await (
      dependencies.execute ?? runReleaseRecoveryQualification
    )(configuration, parsed, environment, packages, budget);
    reportDirectory = result.reportDirectory;
    budget.assertActive();
    return result;
  } catch (error) {
    if (reportDirectory)
      try {
        await rm(join(reportDirectory, 'qualification.json'), { force: true });
      } catch (removeError) {
        throw new AggregateError(
          [error, removeError],
          'RECOVERY_REPORT_FINALIZATION_FAILED',
        );
      }
    throw error;
  } finally {
    budget.dispose();
  }
}

if (require.main === module)
  executeReleaseRecoveryRunner(process.argv.slice(2), process.env).then(
    (result) => {
      process.stdout.write(JSON.stringify(result) + '\n');
      process.exitCode = result.exitCode;
    },
    () => {
      process.stderr.write('RECOVERY_QUALIFICATION_FAILED\n');
      process.exitCode = 1;
    },
  );
