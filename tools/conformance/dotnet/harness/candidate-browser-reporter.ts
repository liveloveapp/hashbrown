import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { writeFileSync } from 'node:fs';

/** Actual terminal browser result supplied by an independent execution reporter. */
export interface CandidateBrowserResult {
  readonly id: string;
  readonly status: 'passed' | 'failed' | 'skipped';
}

/** Exact result accounting vocabulary; no aggregate substitutes for missing IDs. */
export interface CandidateBrowserResultValidation {
  readonly passed: boolean;
  readonly missingIds: readonly string[];
  readonly unexpectedIds: readonly string[];
  readonly duplicateIds: readonly string[];
  readonly failedIds: readonly string[];
  readonly skippedIds: readonly string[];
}

/** Compares exact identities and every terminal outcome, refusing invented statuses or duplicate expected rows. */
export function validateCandidateBrowserResults(
  manifest: readonly Readonly<{ id: string }>[],
  results: readonly CandidateBrowserResult[],
): CandidateBrowserResultValidation {
  const expected = new Set(manifest.map((row) => row.id));
  if (expected.size !== manifest.length)
    throw new Error('Duplicate candidate manifest identity');
  const counts = new Map<string, number>();
  for (const row of results) {
    if (!['passed', 'failed', 'skipped'].includes(row.status))
      throw new Error('Unknown candidate result status');
    counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  }
  const unique = (ids: readonly string[]) => [...new Set(ids)].sort();
  const missingIds = [...expected].filter((id) => !counts.has(id)).sort();
  const unexpectedIds = [...counts.keys()]
    .filter((id) => !expected.has(id))
    .sort();
  const duplicateIds = [...counts]
    .filter(([, count]) => count !== 1)
    .map(([id]) => id)
    .sort();
  const failedIds = unique(
    results.filter((row) => row.status === 'failed').map((row) => row.id),
  );
  const skippedIds = unique(
    results.filter((row) => row.status === 'skipped').map((row) => row.id),
  );
  return {
    passed: ![
      missingIds,
      unexpectedIds,
      duplicateIds,
      failedIds,
      skippedIds,
    ].some((values) => values.length),
    missingIds,
    unexpectedIds,
    duplicateIds,
    failedIds,
    skippedIds,
  };
}

/** Persists actual Playwright outcomes and rejects missing, added, repeated or nonpassing journeys. */
export default class CandidateBrowserReporter implements Reporter {
  private expected: readonly Readonly<{ id: string }>[] = [];
  private outcomes: (CandidateBrowserResult &
    Readonly<{ errors: readonly string[] }>)[] = [];
  private faults: string[] = [];
  private output = '';

  onBegin(config: FullConfig, suite: Suite): void {
    const manifest = process.env['HASHBROWN_CANDIDATE_MANIFEST'];
    const output = process.env['HASHBROWN_CANDIDATE_OUTCOMES'];
    if (!manifest || !output)
      throw new Error(
        'Explicit candidate manifest and outcome report required',
      );
    this.expected = JSON.parse(manifest);
    this.output = output;
    const scheduled = suite
      .allTests()
      .map((test) => ({ id: test.title, status: 'passed' as const }));
    const planned = validateCandidateBrowserResults(this.expected, scheduled);
    if (!planned.passed)
      throw new Error(
        `Candidate scheduled identities differ: ${JSON.stringify(planned)}`,
      );
    if (
      config.workers !== 1 ||
      config.projects.some((project) => project.retries !== 0)
    )
      throw new Error('Candidate workers/retries policy changed');
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.retry !== 0 || test.expectedStatus !== 'passed')
      this.faults.push(`Unsupported retry/expected status: ${test.title}`);
    const status =
      result.status === 'passed'
        ? 'passed'
        : result.status === 'skipped'
          ? 'skipped'
          : 'failed';
    this.outcomes.push({
      id: test.title,
      status,
      errors: result.errors.map((error) => error.message ?? String(error)),
    });
  }

  onError(error: { message?: string }): void {
    this.faults.push(
      error.message ?? 'Candidate Playwright infrastructure error',
    );
  }

  async onEnd(result: FullResult): Promise<{ status: 'passed' | 'failed' }> {
    const validation = validateCandidateBrowserResults(
      this.expected,
      this.outcomes,
    );
    const passed =
      validation.passed &&
      result.status === 'passed' &&
      this.faults.length === 0;
    if (this.output)
      writeFileSync(
        this.output,
        JSON.stringify(
          {
            kind: 'source-candidate-browser',
            mode: process.env['HASHBROWN_CANDIDATE_BROWSER_MODE'],
            manifest: this.expected,
            outcomes: this.outcomes,
            validation,
            faults: this.faults,
            overallStatus: result.status,
          },
          null,
          2,
        ),
      );
    return { status: passed ? 'passed' : 'failed' };
  }
}
