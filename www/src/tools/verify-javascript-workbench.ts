import { saveWorkbenchCapture } from './workbench-capture-file';
import { type Browser, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { readApplicationState } from './verify-inspector-modes';
import {
  expectNoHorizontalOverflow,
  expectWorkbenchDefaultLayout,
} from './verify-workbench-layout';

/** Holds the genuine lazy WASM module so explicit cancellation can precede initialization. */
async function verifyPendingRuntime(options: {
  readonly browser: Browser;
  readonly framework: string;
  readonly origin: string;
}) {
  for (const action of ['stop', 'navigate']) {
    const page = await options.browser.newPage();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached!: () => void;
    const requested = new Promise<void>((resolve) => {
      reached = resolve;
    });
    await page.route('**/assets/*emscripten-module*', async (route) => {
      reached();
      await held;
      await route.continue();
    });
    try {
      await page.goto(
        `${options.origin}/${options.framework}.html?lesson=javascript-runtime`,
      );
      const root = page.locator('.wb:visible');
      await root.locator('[data-runtime-run]').click();
      await Promise.race([
        requested,
        page.waitForTimeout(3000).then(() => {
          throw new Error('Native WASM initialization was not intercepted');
        }),
      ]);
      if (action === 'stop') {
        await root.getByRole('button', { name: 'Stop', exact: true }).click();
      } else {
        await root
          .getByRole('button', { name: 'New conversation', exact: true })
          .click();
        await expect(root.locator('[data-runtime-output]')).toHaveText(
          'Run visible JavaScript in QuickJS.',
        );
      }
      release();
      await page.waitForTimeout(1200);
      if (action === 'navigate')
        await root
          .getByRole('button', { name: 'Two-step plan', exact: true })
          .click();
      await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
        'cancelled',
      );
      await expect(root.locator('[data-runtime-output]')).toContainText(
        'cancelled',
      );
      await expect(root.locator('[data-runtime-call]')).toHaveCount(0);
      await root.locator('[data-runtime-run]').click();
      await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
        'complete',
      );
      await expect(root.locator('[data-runtime-output]')).toContainText(
        /"totalMinutes":\s*30/,
      );
    } finally {
      release();
      await page.close();
    }
  }
}

/** Verifies genuine native framework QuickJS execution without provider fixtures or model keys. */
export async function verifyJavaScriptWorkbench(options: {
  readonly browser: Browser;
  readonly framework: string;
  readonly origin: string;
  readonly work: string;
  readonly live: boolean;
  readonly recording: boolean;
}) {
  const { framework, recording, work } = options;
  const page = await options.browser.newPage({
    viewport: { width: 1600, height: 1000 },
    ...(recording
      ? { recordVideo: { dir: work, size: { width: 1600, height: 1000 } } }
      : {}),
  });
  await page.addInitScript(() => {
    const state = window as unknown as { __workbenchWasmStarts: number };
    state.__workbenchWasmStarts = 0;
    WebAssembly.instantiate = new Proxy(WebAssembly.instantiate, {
      apply(target, receiver, args) {
        state.__workbenchWasmStarts++;
        return Reflect.apply(target, receiver, args);
      },
    });
  });
  const started = Date.now();
  const phases: Record<string, number> = {};
  const mark = (name: string) => {
    phases[name] = (Date.now() - started) / 1000;
  };
  const hold = async () => {
    if (recording) await page.waitForTimeout(2000);
  };
  const errors: string[] = [];
  let requests = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests++;
  });
  const base = `${framework}-javascript-runtime-${options.live ? 'live' : 'fixture'}`;
  try {
    await page.goto(
      `${options.origin}/${framework}.html?lesson=javascript-runtime`,
    );
    const root = page.locator('.wb:visible');
    await expect(root.locator('[data-source]')).toHaveText(
      'Real QuickJS · no model',
    );
    await expectWorkbenchDefaultLayout(page);
    const run = root.locator('[data-runtime-run]');
    const output = root.locator('[data-runtime-output]');
    const editor = root.locator('[data-runtime-code]');
    const tab = async (name: string) => {
      await root
        .getByRole('tablist', { name: 'Inspector views', exact: true })
        .getByRole('tab', { name, exact: true })
        .click();
    };
    const status = root.locator('.wb-chat .wb-panel-head');
    await tab('State');
    const originalState = await readApplicationState(root);
    const execute = async (
      preset: string,
      expected: RegExp,
      state = 'complete',
    ) => {
      await root.locator(`[data-runtime-preset="${preset}"]`).click();
      await run.click();
      await expect(status).toContainText(state, { timeout: 15000 });
      await expect(output.last()).toContainText(expected);
      await expect(run).toBeEnabled();
    };
    await tab('Code');
    await hold();
    await execute('estimate', /"totalMinutes":\s*30/);
    await tab('Runtime');
    await expect(root.locator('.wb-inspection')).toContainText('readPlan');
    await expect(root.locator('.wb-inspection')).toContainText(
      '"stepCount": 2',
    );
    await hold();
    mark('firstComplete');
    await execute('shorter', /"totalMinutes":\s*20/);
    await tab('Code');
    await expect(root.locator('.wb-inspection')).toContainText('* 10');
    await tab('Runtime');
    await hold();
    mark('secondComplete');
    await execute('browser', /document|ReferenceError/, 'error');
    await hold();
    await execute('invalid', /revision/, 'error');
    await expect(root.locator('.wb-inspection')).toContainText('readPlan');
    await hold();
    mark('rejected');
    await execute('estimate', /"totalMinutes":\s*30/);
    await hold();
    mark('recovered');
    await tab('State');
    const initialState = await readApplicationState(root);
    expect(JSON.parse(initialState).revision).toBe(0);
    expect(initialState).toBe(originalState);
    await tab('Runtime');
    const seek = root.getByRole('slider', { name: 'Seek captured event' });
    const eventCount = await seek.getAttribute('max');
    const wasmStarts = await page.evaluate(
      () =>
        (window as unknown as { __workbenchWasmStarts: number })
          .__workbenchWasmStarts,
    );
    expect(wasmStarts).toBeGreaterThan(0);
    await seek.fill('2');
    await expect(editor).toBeDisabled();
    await expect(run).toBeDisabled();
    await hold();
    mark('replay');
    await root.getByRole('button', { name: 'Play', exact: true }).click();
    await hold();
    await root
      .getByRole('button', { name: 'Return to live', exact: true })
      .click();
    await tab('State');
    expect(await readApplicationState(root)).toBe(initialState);
    expect(await seek.getAttribute('max')).toBe(eventCount);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __workbenchWasmStarts: number })
            .__workbenchWasmStarts,
      ),
    ).toBe(wasmStarts);
    await hold();
    mark('returnedLive');
    await tab('Runtime');
    await page.screenshot({ path: resolve(work, `${base}.png`) });
    if (!recording) {
      await verifyPendingRuntime(options);
      await execute('loop', /interrupt|timeout|abort/i, 'error');
      await execute('estimate', /"totalMinutes":\s*30/);
      await execute('fresh', /"fresh":\s*true/);
      await editor.fill('globalThis.previousRun = 42; "context created";');
      await run.click();
      await expect(status).toContainText('complete');
      await expect(output.last()).toContainText('context created');
      await execute('fresh', /"fresh":\s*true/);
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await root
        .getByRole('button', { name: 'New conversation', exact: true })
        .click();
      await expect(root.locator('[data-runtime-output]')).toHaveText(
        'Run visible JavaScript in QuickJS.',
      );
      await expect(root.locator('[data-runtime-run]')).toBeEnabled();
    } else await page.waitForTimeout(800);
    expect(requests).toBe(0);
    expect(errors).toEqual([]);
    if (process.env['WORKBENCH_RECORD'] === '1')
      await saveWorkbenchCapture(page, resolve(work, `${base}.capture.json`));
    return {
      framework,
      lesson: 'javascript-runtime',
      source: 'runtime',
      provider: 'none',
      phases,
      requests,
      replayStarts: 0,
      ...(!recording
        ? {
            pendingStopVerified: true,
            pendingNavigationVerified: true,
            freshContextVerified: true,
            loopRecoveryVerified: true,
          }
        : {}),
      passed: true,
    };
  } finally {
    const video = page.video();
    await page.close();
    if (video) await video.saveAs(resolve(work, `${base}.webm`));
  }
}
