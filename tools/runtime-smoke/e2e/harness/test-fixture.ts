import { test as base, expect as playwrightExpect } from '@playwright/test';
import { type AimockHandle, startAimock } from '@hashbrownai/testing/aimock';
import { resolve } from 'node:path';
import { runAimockWorker } from './aimock-worker';
import { endResponseAfterTerminalEvent } from './terminal-response';

const emptyFixturePath = resolve(__dirname, '../fixtures/empty.json');

/** Aimock handle that can identify a client abort after a server terminal. */
export interface RuntimeSmokeAimockHandle extends AimockHandle {
  /** Consumes one recorded terminal for the supplied AG-UI run identity. */
  consumeTerminalRun(runId: string): boolean;
}

function parseRunId(chunks: readonly Buffer[]): string | undefined {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      readonly runId?: unknown;
    };

    return typeof input.runId === 'string' ? input.runId : undefined;
  } catch {
    return undefined;
  }
}

async function startBrowserAimock(): Promise<RuntimeSmokeAimockHandle> {
  const handle = await startAimock({ fixturePath: emptyFixturePath });
  const terminalRunIds = new Set<string>();
  const handleRequest = handle.aguiMock.handleRequest.bind(handle.aguiMock);
  handle.aguiMock.handleRequest = async (request, response, pathname) => {
    const requestChunks: Buffer[] = [];
    let requestRunId: string | undefined;
    request.on('data', (chunk: Buffer) => {
      requestChunks.push(Buffer.from(chunk));
    });
    request.once('end', () => {
      requestRunId = parseRunId(requestChunks);
    });
    response.setHeader('Access-Control-Allow-Origin', '*');
    endResponseAfterTerminalEvent(response, () => {
      if (requestRunId) {
        terminalRunIds.add(requestRunId);
      }
    });

    return handleRequest(request, response, pathname);
  };

  return Object.assign(handle, {
    consumeTerminalRun(runId: string): boolean {
      return terminalRunIds.delete(runId);
    },
  });
}

/** Worker-scoped fixtures shared by runtime smoke browser tests. */
export interface RuntimeSmokeWorkerFixtures {
  /** Dynamically allocated aimock server owned by the current worker. */
  readonly aimock: RuntimeSmokeAimockHandle;
}

/** Playwright test extended with the worker-scoped runtime smoke fixtures. */
export const test = base.extend<object, RuntimeSmokeWorkerFixtures>({
  aimock: [
    async ({ playwright }, use) => {
      void playwright;
      await runAimockWorker(startBrowserAimock, use);
    },
    { scope: 'worker' },
  ],
});

/** Playwright assertions for runtime smoke browser tests. */
export const expect = playwrightExpect;
