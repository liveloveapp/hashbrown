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
