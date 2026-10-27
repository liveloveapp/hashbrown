import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { selectLiveFailurePhase } from './live-failure-phase';
import { LIVE_PROJECTS } from './live-configuration';
import { LIVE_BUDGET_MANIFEST } from './live-budget';

/** Emits only fixed project/group/outcome metadata; all raw errors, steps and logs are discarded. */
export default class LiveReporter implements Reporter {
  private readonly pending: Promise<unknown>[] = [];
  private failed = false;
  private readonly postOutcome: (
    record: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
  /** Uses bounded HTTP delivery by default; injected delivery supports network-free integrity tests. */
  constructor(
    options: {
      readonly postOutcome?: (
        record: Readonly<Record<string, unknown>>,
      ) => Promise<void>;
    } = {},
  ) {
    this.postOutcome =
      options.postOutcome ??
      (async (record) => {
        const origin = process.env['HASHBROWN_LIVE_COORDINATOR'];
        const capability = process.env['HASHBROWN_LIVE_CAPABILITY'];
        if (
          !origin ||
          !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
          !capability ||
          !/^[a-f0-9]{64}$/.test(capability)
        )
          throw new Error('LIVE_REPORT_FAILED');
        const response = await fetch(`${origin}/diagnostic`, {
          method: 'POST',
          headers: { 'X-Live-Capability': capability },
          body: JSON.stringify(record),
          signal: AbortSignal.timeout(2000),
        });
        if (response.status !== 204) throw new Error('LIVE_REPORT_FAILED');
      });
  }
  /** Keeps default framework reporters from printing raw failures. */
  printsToStdio() {
    return true;
  }
  /** Projects fixed test identifiers and terminal status before sending to the shared sink. */
  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent.project()?.name;
    const group = test.title;
    if (
      !LIVE_PROJECTS.some((entry) => entry.name === project) ||
      !LIVE_BUDGET_MANIFEST.groups.some((entry) => entry.name === group)
    ) {
      this.failed = true;
      return;
    }
    const phase = selectLiveFailurePhase(
      group,
      result.annotations ?? test.annotations ?? [],
    );
    if (!phase.valid) {
      this.failed = true;
      return;
    }
    const record = {
      project,
      group,
      outcome: result.status === 'passed' ? 'passed' : 'failed',
      ...(result.status === 'passed'
        ? {}
        : {
            failureCode: 'LIVE_ASSERTION_FAILED',
            ...(phase.phase ? { failurePhase: phase.phase } : {}),
          }),
      stage: result.status === 'passed' ? 'completed' : 'failed',
      durationMs: Math.max(0, Math.round(result.duration)),
    };
    this.pending.push(
      this.postOutcome(record).catch(() => {
        this.failed = true;
      }),
    );
  }
  /** Drains bounded diagnostic writes and emits a fixed final status. */
  async onEnd(result: FullResult) {
    await Promise.allSettled(this.pending);
    const status =
      result.status === 'passed' && !this.failed
        ? ('passed' as const)
        : ('failed' as const);
    process.stdout.write(
      JSON.stringify({ stage: status === 'passed' ? 'completed' : 'failed' }) +
        '\n',
    );
    return { status };
  }
  /** Discards arbitrary child and model stdout. */
  onStdOut() {
    /* Raw model/child logs never reach a persistence sink. */
  }
  /** Discards arbitrary child and native stderr. */
  onStdErr() {
    /* Raw native diagnostics never reach a persistence sink. */
  }
  /** Discards raw framework error objects. */
  onError() {
    this.failed = true;
  }
}
