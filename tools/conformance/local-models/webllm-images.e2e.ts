import type { WebLlmEngine, WebLlmImageContent } from '@hashbrownai/core';
import { expect, test } from '@playwright/test';
import {
  type ImageContractMetrics,
  installWebLlmImageShim,
} from './webllm-image-shim';

for (const mode of [
  'complete',
  'stream',
  'setup',
  'setup-slow-decode',
] as const) {
  test(`deterministic image worker ${mode} preserves framework streaming and ownership`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installWebLlmImageShim(page, mode);
    try {
      await page.goto(
        '/?runUrl=http://127.0.0.1/unused&localModel=webllm&localMedia=image',
      );
      await page.getByTestId('send').click();
      if (mode === 'complete') {
        await expect(page.getByTestId('assistant')).toHaveText('Red');
        await expect(page.getByTestId('status')).toHaveText('idle');
        await page.getByTestId('send').click();
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (
                  globalThis as unknown as {
                    __imageContractMetrics: ImageContractMetrics;
                  }
                ).__imageContractMetrics.requests.length,
            ),
          )
          .toBe(2);
      } else {
        if (mode === 'stream')
          await expect(page.getByTestId('assistant')).toHaveText('Red');
        else
          await expect
            .poll(() =>
              page.evaluate(
                () =>
                  (
                    globalThis as unknown as {
                      __imageContractMetrics: ImageContractMetrics;
                    }
                  ).__imageContractMetrics.started,
              ),
            )
            .toBe(1);
        if (mode === 'setup-slow-decode') {
          await expect
            .poll(() =>
              page.evaluate(
                () =>
                  (
                    globalThis as unknown as {
                      __imageContractMetrics: ImageContractMetrics;
                    }
                  ).__imageContractMetrics.decodeWaits,
              ),
            )
            .toBe(1);
        }
        await page.getByTestId('stop').click();
        await expect(page.getByTestId('status')).toHaveText('idle');
        if (mode.startsWith('setup')) {
          await expect
            .poll(() =>
              page.evaluate(
                () =>
                  (
                    globalThis as unknown as {
                      __imageContractMetrics: ImageContractMetrics;
                    }
                  ).__imageContractMetrics.interrupts,
              ),
            )
            .toBe(1);
          await page.getByTestId('send').click();
          await expect(page.getByTestId('error')).toContainText(
            'already generating',
          );
          expect(
            await page.evaluate(
              () =>
                (
                  globalThis as unknown as {
                    __imageContractMetrics: ImageContractMetrics;
                  }
                ).__imageContractMetrics.started,
            ),
          ).toBe(1);
          await page.evaluate(() =>
            (
              globalThis as unknown as { __releaseImageWorker(): void }
            ).__releaseImageWorker(),
          );
          if (mode === 'setup-slow-decode') {
            await page.evaluate(() =>
              (
                globalThis as unknown as { __releaseImageDecode(): void }
              ).__releaseImageDecode(),
            );
          }
        }
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (
                  globalThis as unknown as {
                    __imageContractMetrics: ImageContractMetrics;
                  }
                ).__imageContractMetrics.drained,
            ),
          )
          .toBe(1);
        await page.evaluate(() => {
          (
            globalThis as unknown as { __imageWorkerMode: string }
          ).__imageWorkerMode = 'complete';
        });
        await page.getByTestId('send').click();
        await expect(page.getByTestId('assistant')).toHaveText('Red');
      }
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect(page.getByTestId('error')).toBeEmpty();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const owned = (
              globalThis as unknown as {
                __hashbrownLocalMedia: { resolved: number; released: number };
              }
            ).__hashbrownLocalMedia;
            return owned.resolved === owned.released && owned.resolved > 0;
          }),
        )
        .toBe(true);
      const metrics = await page.evaluate(
        () =>
          (
            globalThis as unknown as {
              __imageContractMetrics: ImageContractMetrics;
            }
          ).__imageContractMetrics,
      );
      expect(metrics.requests).toHaveLength(2);
      expect(metrics.requests[0].images).toEqual([
        expect.objectContaining({ mime: 'image/png', width: 64, height: 64 }),
      ]);
      expect(metrics.requests[1].imageCount).toBe(
        mode.startsWith('setup') ? 3 : 2,
      );
      expect(metrics.drained).toBe(2);
      expect(metrics.interrupts).toBe(mode === 'complete' ? 0 : 1);
      expect(JSON.stringify(metrics)).not.toContain('data:');
      expect(errors).toEqual([]);
      await testInfo.attach('image-worker-metadata.json', {
        body: JSON.stringify({
          scope: 'Mock worker contract; no model or runtime qualification.',
          ...metrics,
        }),
        contentType: 'application/json',
      });
    } finally {
      await page.evaluate(() =>
        (
          globalThis as unknown as { __disposeImageWorker?: () => void }
        ).__disposeImageWorker?.(),
      );
    }
  });
}

test('structured vision fixture uses fresh threads and two generated squares without inference', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const runtime = globalThis as unknown as {
      __hashbrownWebLlm: WebLlmEngine<WebLlmImageContent>;
      __visionFixtureChecks: {
        imageCount: number;
        schema: string;
        prompt: string;
      }[];
    };
    runtime.__visionFixtureChecks = [];
    runtime.__hashbrownWebLlm = {
      chat: {
        completions: {
          async *create(request) {
            const parts = request.messages.flatMap((message) =>
              typeof message.content === 'string' ? [] : message.content,
            );
            const images = parts.filter((part) => part.type === 'image_url');
            const prompt = parts
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join('');
            const expected = new URL(location.href).searchParams.get(
              'visionColor',
            );
            if (!request.response_format || images.length !== 1)
              throw new Error('Expected fresh structured single-image input.');
            const url = images[0].image_url.url;
            const binary = atob(url.slice(url.indexOf(',') + 1));
            const bitmap = await createImageBitmap(
              new Blob(
                [
                  Uint8Array.from(binary, (character) =>
                    character.charCodeAt(0),
                  ),
                ],
                { type: 'image/png' },
              ),
            );
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d');
            if (!context || bitmap.width !== 96 || bitmap.height !== 64)
              throw new Error('Invalid generated fixture dimensions.');
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            const color = expected === 'red' ? [255, 0, 0] : [0, 0, 255];
            for (const x of [24, 72]) {
              if (
                context
                  .getImageData(x, 32, 1, 1)
                  .data.slice(0, 3)
                  .some((value, index) => value !== color[index])
              )
                throw new Error('Fixture square color mismatch.');
            }
            if (
              context
                .getImageData(48, 32, 1, 1)
                .data.slice(0, 3)
                .some((value) => value !== 255)
            )
              throw new Error('Squares must have a white gap.');
            runtime.__visionFixtureChecks.push({
              imageCount: images.length,
              schema: request.response_format.schema,
              prompt,
            });
            yield {
              choices: [
                {
                  delta: {
                    content: JSON.stringify({ answer: expected, count: 2 }),
                  },
                  finish_reason: 'stop',
                },
              ],
            };
          },
        },
      },
      interruptGenerate() {
        /* Deterministic fixture completes immediately. */
      },
    };
  });
  const colors =
    testInfo.project.name === 'angular' ? ['red', 'blue'] : ['blue', 'red'];
  await page.goto(
    `/?runUrl=http://127.0.0.1/unused&localModel=webllm&localMedia=image&localVision=1&visionColor=${colors[0]}`,
  );
  for (const color of colors) {
    await page.evaluate((color) => {
      const url = new URL(location.href);
      url.searchParams.set('visionColor', color);
      history.replaceState(null, '', url);
    }, color);
    await page.getByTestId('new-thread').click();
    await expect(page.getByTestId('structured-answer')).toBeEmpty();
    await page.getByTestId('send').click();
    await expect(page.getByTestId('structured-answer')).toHaveText(color);
    await expect(page.getByTestId('structured-count')).toHaveText('2');
    await expect(page.getByTestId('status')).toHaveText('idle');
    await expect(page.getByTestId('error')).toBeEmpty();
  }
  const checks = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __visionFixtureChecks: {
            imageCount: number;
            schema: string;
            prompt: string;
          }[];
        }
      ).__visionFixtureChecks,
  );
  expect(checks.map((check) => check.imageCount)).toEqual([1, 1]);
  expect(checks[0].prompt).toBe(checks[1].prompt);
  expect(checks[0].prompt).not.toMatch(/red|blue|\b2\b|\btwo\b/i);
  expect(
    checks.every((check) => JSON.parse(check.schema).type === 'object'),
  ).toBe(true);
});
