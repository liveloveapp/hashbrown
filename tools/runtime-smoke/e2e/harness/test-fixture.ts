import { test as base, expect as playwrightExpect } from '@playwright/test';
import { type AimockHandle, startAimock } from '@hashbrownai/testing/aimock';
import { resolve } from 'node:path';
import { runAimockWorker } from './aimock-worker';

const emptyFixturePath = resolve(__dirname, '../fixtures/empty.json');

/** Worker-scoped fixtures shared by runtime smoke browser tests. */
export interface RuntimeSmokeWorkerFixtures {
  /** Dynamically allocated aimock server owned by the current worker. */
  readonly aimock: AimockHandle;
}

/** Playwright test extended with the worker-scoped runtime smoke fixtures. */
export const test = base.extend<object, RuntimeSmokeWorkerFixtures>({
  aimock: [
    async (_fixtures, use) => {
      await runAimockWorker(
        () => startAimock({ fixturePath: emptyFixturePath }),
        use,
      );
    },
    { scope: 'worker' },
  ],
});

/** Playwright assertions for runtime smoke browser tests. */
export const expect = playwrightExpect;
