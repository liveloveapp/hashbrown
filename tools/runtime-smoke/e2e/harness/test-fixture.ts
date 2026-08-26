import { test as base, expect as playwrightExpect } from '@playwright/test';
import { type AimockHandle, startAimock } from '@hashbrownai/testing/aimock';
import { resolve } from 'node:path';
import { runAimockWorker } from './aimock-worker';

const emptyFixturePath = resolve(__dirname, '../fixtures/empty.json');

async function startBrowserAimock(): Promise<AimockHandle> {
  const handle = await startAimock({ fixturePath: emptyFixturePath });
  const handleRequest = handle.aguiMock.handleRequest.bind(handle.aguiMock);
  handle.aguiMock.handleRequest = async (request, response, pathname) => {
    response.setHeader('Access-Control-Allow-Origin', '*');

    return handleRequest(request, response, pathname);
  };

  return handle;
}

/** Worker-scoped fixtures shared by runtime smoke browser tests. */
export interface RuntimeSmokeWorkerFixtures {
  /** Dynamically allocated aimock server owned by the current worker. */
  readonly aimock: AimockHandle;
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
