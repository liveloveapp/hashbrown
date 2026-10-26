import { test as base, expect } from '@playwright/test';
import { captureWebLlmVisionTeardown } from '../harness/webllm-vision-teardown';
import { requireWebLlmVisionSmoke } from '../harness/webllm-vision-mode';
import {
  installWebLlmWorker,
  readBrowserMemory,
  startWebLlmRuntime,
} from './webllm-runtime';

const selection = requireWebLlmVisionSmoke(process.env);
const test = base.extend({
  context: async ({ playwright, baseURL, launchOptions }, use) => {
    const context = await playwright.chromium.launchPersistentContext(
      selection.profile,
      { ...launchOptions, channel: 'chrome', headless: false, baseURL },
    );
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
});

interface VisionMeasurement {
  imageCount: number;
  totalBytes: number;
  schemaBytes: number;
  drained?: boolean;
  finishReason?: string;
  firstTokenMs?: number;
  totalMs?: number;
}
interface VisionState {
  __localWebLlmReady?: boolean;
  __localWebLlmMetrics: {
    loadError?: string;
    loadedEngines: number;
    activeRequests: number;
    unloaded?: boolean;
    workerTerminated?: boolean;
    requests: VisionMeasurement[];
  };
  __localWebLlmVisionEvidence: { schema?: string; responseText: string }[];
  __localWebLlmDispose(): Promise<void>;
  __hashbrownLocalMedia: { resolved: number; released: number };
}

test('real application-selected VLM distinguishes counterbalanced generated square colors and counts', async ({
  page,
}, testInfo) => {
  const runtime = await startWebLlmRuntime(selection.modulePath);
  const colors =
    testInfo.project.name === 'angular' ? ['red', 'blue'] : ['blue', 'red'];
  const errors: string[] = [];
  const results: {
    expected: string;
    answer: string | null;
    count: string | null;
  }[] = [];
  let fallbackRequests = 0;
  let succeeded = false;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/forbidden-vision-fallback**', async (route) => {
    fallbackRequests++;
    await route.abort();
  });
  try {
    await installWebLlmWorker(page, runtime.url, selection.model, {
      images: true,
    });
    await page.goto(
      `/?runUrl=${encodeURIComponent('http://127.0.0.1:1/forbidden-vision-fallback')}&localModel=webllm&localMedia=image&localVision=1&visionColor=${colors[0]}`,
    );
    await page.waitForFunction(
      () => {
        const state = globalThis as unknown as VisionState;
        return state.__localWebLlmReady || state.__localWebLlmMetrics.loadError;
      },
      undefined,
      { timeout: 1_200_000 },
    );
    expect(
      await page.evaluate(
        () =>
          (globalThis as unknown as VisionState).__localWebLlmMetrics.loadError,
      ),
    ).toBeUndefined();
    for (const [index, color] of colors.entries()) {
      await page.evaluate((color) => {
        const url = new URL(location.href);
        url.searchParams.set('visionColor', color);
        history.replaceState(null, '', url);
      }, color);
      await page.getByTestId('new-thread').click();
      await expect(page.getByTestId('structured-answer')).toBeEmpty();
      await page.getByTestId('send').click();
      await expect(page.getByTestId('structured-answer')).toHaveText(color, {
        timeout: 180_000,
      });
      await expect(page.getByTestId('structured-count')).toHaveText('2');
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect(page.getByTestId('error')).toBeEmpty();
      await page.waitForFunction(
        (index) =>
          (globalThis as unknown as VisionState).__localWebLlmMetrics.requests[
            index
          ]?.drained === true,
        index,
        { timeout: 30_000 },
      );
      results.push({
        expected: color,
        answer: await page.getByTestId('structured-answer').textContent(),
        count: await page.getByTestId('structured-count').textContent(),
      });
    }
    const state = await page.evaluate(() => {
      const runtime = globalThis as unknown as VisionState;
      return {
        metrics: runtime.__localWebLlmMetrics,
        evidence: runtime.__localWebLlmVisionEvidence,
        media: runtime.__hashbrownLocalMedia,
      };
    });
    expect(state.metrics.loadedEngines).toBe(1);
    expect(state.metrics.activeRequests).toBe(0);
    expect(state.metrics.requests).toHaveLength(2);
    for (const [index, measurement] of state.metrics.requests.entries()) {
      expect(measurement.imageCount).toBe(1);
      expect(measurement.totalBytes).toBeGreaterThan(0);
      expect(measurement.schemaBytes).toBeGreaterThan(0);
      expect(measurement.drained).toBe(true);
      expect(measurement.finishReason).toBe('stop');
      expect(JSON.parse(state.evidence[index].responseText)).toEqual({
        answer: colors[index],
        count: 2,
      });
      expect(JSON.parse(state.evidence[index].schema ?? '').type).toBe(
        'object',
      );
    }
    expect(state.media).toMatchObject({ resolved: 2, released: 2 });
    expect(fallbackRequests).toBe(0);
    expect(errors).toEqual([]);
    expect(JSON.stringify(state)).not.toContain('data:image/');
    await testInfo.attach('vision-results.json', {
      body: JSON.stringify({
        model: selection.model,
        bundleSha256: runtime.bundleSha256,
        profile: selection.profile,
        results,
        generatedImage: { width: 96, height: 64, squareCount: 2 },
        ...state,
        fallbackRequests,
        memory: await readBrowserMemory(page),
        qualification:
          'Same-device generated-image canary only; catalog URLs do not prove immutable model artifact revisions or cross-hardware reliability.',
      }),
      contentType: 'application/json',
    });
    succeeded = true;
  } finally {
    try {
      const terminal = await captureWebLlmVisionTeardown({
        dispose: async () => {
          await page
            .getByTestId('stop')
            .click({ timeout: 1000 })
            .catch(() => undefined);
          await page.evaluate(() =>
            (globalThis as unknown as VisionState).__localWebLlmDispose?.(),
          );
        },
        read: () =>
          page.evaluate(() => {
            const state = globalThis as unknown as VisionState;
            return {
              metrics: state.__localWebLlmMetrics,
              evidence: state.__localWebLlmVisionEvidence,
              media: state.__hashbrownLocalMedia,
              rendered: {
                answer:
                  document.querySelector('[data-testid="structured-answer"]')
                    ?.textContent ?? null,
                count:
                  document.querySelector('[data-testid="structured-count"]')
                    ?.textContent ?? null,
              },
            };
          }),
        attach: async (result) => {
          await testInfo.attach('vision-response-evidence.json', {
            body: JSON.stringify({
              model: selection.model,
              bundleSha256: runtime.bundleSha256,
              expectedColors: colors,
              evidence: result.snapshot?.evidence,
              rendered: result.snapshot?.rendered,
              evidenceError: result.evidenceError,
            }),
            contentType: 'application/json',
          });
        },
      });
      await testInfo.attach('vision-cleanup.json', {
        body: JSON.stringify({
          model: selection.model,
          bundleSha256: runtime.bundleSha256,
          cleanup: terminal.snapshot?.metrics,
          media: terminal.snapshot?.media,
          cleanupError: terminal.cleanupError,
          evidenceError: terminal.evidenceError,
          fallbackRequests,
          errors,
        }),
        contentType: 'application/json',
      });
      if (succeeded) {
        expect(errors).toEqual([]);
        expect(terminal.cleanupError).toBeUndefined();
        expect(terminal.evidenceError).toBeUndefined();
        expect(terminal.snapshot?.metrics).toMatchObject({
          activeRequests: 0,
          unloaded: true,
          workerTerminated: true,
        });
      }
    } finally {
      await runtime.stop();
    }
  }
});
