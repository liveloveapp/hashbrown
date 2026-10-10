import {
  type ConsoleMessage,
  expect,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';
import type { RuntimeSmokeAimockHandle } from './test-fixture';

/** Scenario shells supported by both runtime smoke fixture applications. */
export type RuntimeSmokeScenario = 'plain' | 'tool' | 'structured' | 'ui';

/**
 * One narrowly matched browser hygiene exception expected exactly once.
 * An event matching multiple allowances is reported as ambiguous.
 */
export interface BrowserHygieneAllowance<T> {
  /** Human-readable reason the browser event is intentional. */
  readonly reason: string;
  /** Returns true only for the exact intentional browser event. */
  readonly matches: (event: T) => boolean;
}

/** Narrow exceptions accepted by the browser hygiene monitor. */
export interface BrowserHygieneOptions {
  /** Request failures that must each occur exactly once. */
  readonly requestFailureAllowances?: readonly BrowserHygieneAllowance<Request>[];
  /** HTTP error responses that must each occur exactly once. */
  readonly httpErrorAllowances?: readonly BrowserHygieneAllowance<Response>[];
  /** Console errors that must each occur exactly once. */
  readonly consoleErrorAllowances?: readonly BrowserHygieneAllowance<ConsoleMessage>[];
}

/** Browser error collector installed before scenario navigation. */
export interface BrowserHygiene {
  /** Asserts that no unexpected browser, console, request, or HTTP errors occurred. */
  assertClean(): Promise<void>;
}

/** Options used to reset, register, and open one fixture scenario. */
export interface OpenScenarioOptions {
  /** Fixture application scenario to render. */
  readonly scenario: RuntimeSmokeScenario;
  /** Number of retries exposed to the fixture scenario. */
  readonly retries?: 0 | 1;
  /** Optional browser hygiene exceptions scoped to this scenario. */
  readonly hygiene?: BrowserHygieneOptions;
  /** Registers aimock behavior after reset and before browser navigation. */
  readonly register?: (
    aimock: RuntimeSmokeAimockHandle,
  ) => void | Promise<void>;
}

function formatLocation(location: { url: string; lineNumber: number }): string {
  if (!location.url) {
    return '';
  }

  return ` (${location.url}:${location.lineNumber})`;
}

interface AllowanceTracker<T> {
  consume(event: T): boolean;
  violations(): string[];
}

function createAllowanceTracker<T>(
  label: string,
  allowances: readonly BrowserHygieneAllowance<T>[] = [],
): AllowanceTracker<T> {
  let observations = allowances.map(() => 0);
  let ambiguityViolations: string[] = [];

  return {
    consume(event) {
      const matchingIndexes = allowances.flatMap((allowance, index) =>
        allowance.matches(event) ? [index] : [],
      );
      if (matchingIndexes.length > 1) {
        const reasons = matchingIndexes
          .map((index) => allowances[index]?.reason)
          .filter((reason): reason is string => reason !== undefined)
          .sort();
        ambiguityViolations = [
          ...ambiguityViolations,
          `Ambiguous ${label} allowance match: ${reasons
            .map((reason) => `"${reason}"`)
            .join(', ')}`,
        ];
        return true;
      }

      const [index] = matchingIndexes;
      if (index === undefined) {
        return false;
      }

      observations = observations.map((count, observationIndex) =>
        observationIndex === index ? count + 1 : count,
      );
      return true;
    },
    violations() {
      return [
        ...ambiguityViolations,
        ...allowances.flatMap((allowance, index) => {
          const observed = observations[index] ?? 0;

          return observed === 1
            ? []
            : [
                `Expected ${label} allowance "${allowance.reason}" exactly once, observed ${observed}`,
              ];
        }),
      ];
    },
  };
}

/** Installs browser diagnostics and returns an assertion over unexpected entries. */
export function installBrowserHygiene(
  page: Page,
  options: BrowserHygieneOptions = {},
  ignoreRequestFailure: (request: Request) => boolean = () => false,
): BrowserHygiene {
  const unexpectedEntries: string[] = [];
  const pendingPostRequests = new Set<Request>();
  const pendingRequestWaiters = new Set<() => void>();
  const requestFailureAllowances = createAllowanceTracker(
    'request failure',
    options.requestFailureAllowances,
  );
  const httpErrorAllowances = createAllowanceTracker(
    'HTTP error',
    options.httpErrorAllowances,
  );
  const consoleErrorAllowances = createAllowanceTracker(
    'console error',
    options.consoleErrorAllowances,
  );
  const settleRequest = (request: Request) => {
    pendingPostRequests.delete(request);
    if (pendingPostRequests.size === 0) {
      for (const resolve of pendingRequestWaiters) {
        resolve();
      }
      pendingRequestWaiters.clear();
    }
  };
  const waitForPostRequests = async () => {
    if (pendingPostRequests.size === 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const resolvePending = () => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        pendingRequestWaiters.delete(resolvePending);
        reject(
          new Error(
            `Timed out waiting for ${pendingPostRequests.size} POST request(s) to settle`,
          ),
        );
      }, 5_000);
      pendingRequestWaiters.add(resolvePending);
    });
  };

  page.on('request', (request) => {
    if (request.method() === 'POST') {
      pendingPostRequests.add(request);
    }
  });
  page.on('pageerror', (error) => {
    unexpectedEntries.push(`Page error: ${error.stack ?? error.message}`);
  });
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !consoleErrorAllowances.consume(message)
    ) {
      unexpectedEntries.push(
        `Console error: ${message.text()}${formatLocation(message.location())}`,
      );
    }
  });
  page.on('requestfinished', settleRequest);
  page.on('requestfailed', (request) => {
    if (
      !ignoreRequestFailure(request) &&
      !requestFailureAllowances.consume(request)
    ) {
      const failure = request.failure()?.errorText ?? 'unknown failure';
      unexpectedEntries.push(
        `Request failed: ${request.method()} ${request.url()} (${failure})`,
      );
    }
    settleRequest(request);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !httpErrorAllowances.consume(response)) {
      unexpectedEntries.push(
        `HTTP ${response.status()}: ${response.request().method()} ${response.url()}`,
      );
    }
  });

  return {
    async assertClean() {
      await waitForPostRequests();
      const errors = [
        ...unexpectedEntries,
        ...requestFailureAllowances.violations(),
        ...httpErrorAllowances.violations(),
        ...consoleErrorAllowances.violations(),
      ];
      expect(
        errors,
        `Unexpected browser errors:\n${errors.join('\n')}`,
      ).toEqual([]);
    },
  };
}

/** Opens a reset and registered fixture scenario, then waits for readiness. */
export async function openScenario(
  page: Page,
  aimock: RuntimeSmokeAimockHandle,
  options: OpenScenarioOptions,
): Promise<BrowserHygiene> {
  aimock.resetTerminalRuns();
  aimock.aguiMock.reset();
  const hygiene = installBrowserHygiene(page, options.hygiene, (request) => {
    if (
      request.method() !== 'POST' ||
      request.url() !== aimock.aguiRunUrl ||
      request.failure()?.errorText !== 'net::ERR_ABORTED'
    ) {
      return false;
    }

    try {
      const input = request.postDataJSON() as { readonly runId?: unknown };

      return (
        typeof input.runId === 'string' &&
        aimock.consumeTerminalRun(input.runId)
      );
    } catch {
      return false;
    }
  });
  await options.register?.(aimock);

  const searchParams = new URLSearchParams({
    runUrl: aimock.aguiRunUrl,
    scenario: options.scenario,
    retries: String(options.retries ?? 0),
  });

  await page.goto(`/?${searchParams}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('fixture-ready')).toBeVisible();

  return hygiene;
}
