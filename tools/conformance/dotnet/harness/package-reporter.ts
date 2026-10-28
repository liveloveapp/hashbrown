import { nativeBrowserSmoke } from './browser-smoke-selection';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

/** Stable original scenario identity independent of source line numbers. */
export type PackageIdentity = readonly [
  project: string,
  file: string,
  title: string,
];

/** Rejects missing, added, or duplicate identities rather than accepting a matching count. */
export function assertPackageIdentities(
  actual: readonly PackageIdentity[],
  expected: readonly PackageIdentity[],
): void {
  const normalize = (rows: readonly PackageIdentity[]) =>
    rows.map((row) => JSON.stringify(row)).sort();
  const rows = normalize(actual);
  const baseline = normalize(expected);
  if (
    new Set(rows).size !== rows.length ||
    new Set(baseline).size !== baseline.length ||
    JSON.stringify(rows) !== JSON.stringify(baseline)
  )
    throw new Error('Package test identities differ or contain duplicates');
}

/** Reads pinned identities for the explicitly selected full, smoke, or approval regression suite. */
export function expectedPackageIdentities(
  kind: string | undefined,
): readonly PackageIdentity[] {
  if (kind === 'matrix' || kind === 'smoke') {
    const identities: readonly PackageIdentity[] = JSON.parse(
      readFileSync(
        resolve(__dirname, '../tests/fixtures/package-identities.json'),
        'utf8',
      ),
    ).identities;
    const expected =
      kind === 'smoke'
        ? identities.filter(([, , title]) => nativeBrowserSmoke.test(title))
        : identities;
    if (kind === 'smoke' && expected.length !== 64)
      throw new Error('Package smoke identities changed');
    return expected;
  } else if (kind === 'regressions')
    return ['react', 'angular'].flatMap((framework) =>
      ['browser-held', 'browser-held-slow', 'browser-held-hung'].map(
        (mode) =>
          [
            framework,
            'native-approval.spec.ts',
            `genuine native approval browser ${mode} ${mode === 'browser-held-hung' ? 'aborts at the authoritative deadline without a successful terminal' : 'accepts successful terminal before HTTP EOF and rejects damaged captures'}`,
          ] as const,
      ),
    );
  else throw new Error('Explicit package suite required');
}

/** Compares exact scenario identities and rejects every non-passing or repeated result. */
export default class PackageReporter implements Reporter {
  private expected: readonly PackageIdentity[] = [];
  private outcomes: Array<{
    identity: PackageIdentity;
    status: string;
    retry: number;
    expectedStatus: string;
    errors: unknown[];
  }> = [];
  private diagnostics: string[] = [];
  private report = '';

  onBegin(config: FullConfig, suite: Suite): void {
    const kind = process.env['HASHBROWN_PACKAGE_SUITE'];
    this.expected = expectedPackageIdentities(kind);
    this.report =
      process.env['HASHBROWN_PACKAGE_OUTCOME_REPORT'] ??
      resolve(config.rootDir, '../../../test-results/package-outcomes.json');
    assertPackageIdentities(
      suite.allTests().map((test) => this.identity(test)),
      this.expected,
    );
    if (
      config.workers !== 1 ||
      config.projects.some((project) => project.retries !== 0)
    )
      throw new Error('Package worker/retry policy changed');
  }

  private identity(test: TestCase): PackageIdentity {
    return [
      test.parent.project()?.name ?? '',
      relative(
        resolve(
          __dirname,
          process.env['HASHBROWN_PACKAGE_SUITE'] !== 'regressions'
            ? '../specs'
            : '../local-specs',
        ),
        test.location.file,
      ),
      test.title,
    ];
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.outcomes.push({
      identity: this.identity(test),
      status: result.status,
      retry: result.retry,
      expectedStatus: test.expectedStatus,
      errors: result.errors,
    });
  }

  onError(error: { message?: string }): void {
    this.diagnostics.push(error.message ?? 'Unexpected Playwright diagnostic');
  }

  async onEnd(result: FullResult): Promise<{ status: 'passed' | 'failed' }> {
    let failure: string | undefined;
    try {
      assertPackageIdentities(
        this.outcomes.map((outcome) => outcome.identity),
        this.expected,
      );
      if (
        result.status !== 'passed' ||
        this.diagnostics.length ||
        this.outcomes.some(
          (outcome) =>
            outcome.status !== 'passed' ||
            outcome.expectedStatus !== 'passed' ||
            outcome.retry !== 0 ||
            outcome.errors.length,
        )
      )
        throw new Error(
          'Package outcomes require all passed, zero skips/retries/flaky/unexpected diagnostics',
        );
    } catch (error) {
      failure = String(error);
    }
    mkdirSync(dirname(this.report), { recursive: true });
    writeFileSync(
      this.report,
      JSON.stringify(
        {
          status: failure ? 'failed' : 'passed',
          failure,
          descriptor: process.env['HASHBROWN_DOTNET_CONSUMER_SHA256'],
          npmMetadata: process.env['HASHBROWN_LOCAL_NATIVE_CONSUMER_METADATA'],
          expected: this.expected,
          outcomes: this.outcomes,
          diagnostics: this.diagnostics,
        },
        null,
        2,
      ) + '\n',
    );
    return { status: failure ? 'failed' : 'passed' };
  }
}
