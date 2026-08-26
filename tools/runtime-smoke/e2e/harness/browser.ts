import {
  expect,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';
import type { AimockHandle } from '@hashbrownai/testing/aimock';

/** Scenario shells supported by both runtime smoke fixture applications. */
export type RuntimeSmokeScenario = 'plain' | 'tool' | 'structured' | 'ui';

/** Narrow exceptions accepted by the browser hygiene monitor. */
export interface BrowserHygieneOptions {
  /** Returns true only for request failures expected by the current test. */
  readonly isExpectedRequestFailure?: (request: Request) => boolean;
  /** Returns true only for HTTP error responses expected by the current test. */
  readonly isExpectedHttpError?: (response: Response) => boolean;
}

/** Browser error collector installed before scenario navigation. */
export interface BrowserHygiene {
  /** Asserts that no unexpected browser, console, request, or HTTP errors occurred. */
  assertClean(): void;
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
  readonly register?: (aimock: AimockHandle) => void | Promise<void>;
}

function formatLocation(location: { url: string; lineNumber: number }): string {
  if (!location.url) {
    return '';
  }

  return ` (${location.url}:${location.lineNumber})`;
}

/** Installs browser diagnostics and returns an assertion over unexpected entries. */
export function installBrowserHygiene(
  page: Page,
  options: BrowserHygieneOptions = {},
): BrowserHygiene {
  const unexpectedEntries: string[] = [];

  page.on('pageerror', (error) => {
    unexpectedEntries.push(`Page error: ${error.stack ?? error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      unexpectedEntries.push(
        `Console error: ${message.text()}${formatLocation(message.location())}`,
      );
    }
  });
  page.on('requestfailed', (request) => {
    if (!options.isExpectedRequestFailure?.(request)) {
      const failure = request.failure()?.errorText ?? 'unknown failure';
      unexpectedEntries.push(
        `Request failed: ${request.method()} ${request.url()} (${failure})`,
      );
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !options.isExpectedHttpError?.(response)) {
      unexpectedEntries.push(
        `HTTP ${response.status()}: ${response.request().method()} ${response.url()}`,
      );
    }
  });

  return {
    assertClean() {
      expect(
        unexpectedEntries,
        `Unexpected browser errors:\n${unexpectedEntries.join('\n')}`,
      ).toEqual([]);
    },
  };
}

/** Opens a reset and registered fixture scenario, then waits for readiness. */
export async function openScenario(
  page: Page,
  aimock: AimockHandle,
  options: OpenScenarioOptions,
): Promise<BrowserHygiene> {
  aimock.aguiMock.reset();
  const hygiene = installBrowserHygiene(page, options.hygiene);
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
