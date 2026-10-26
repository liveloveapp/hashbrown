import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const native = process.env['LOCAL_LLM_MEDIA_NATIVE'] === '1';
// Share the native smoke default so installed models can be reused.
const profile =
  process.env['LOCAL_LLM_PROFILE'] ??
  join(tmpdir(), 'hashbrown-local-chrome-profile');
const test = native
  ? base.extend({
      context: async ({ playwright, baseURL, launchOptions }, use) => {
        const context = await playwright.chromium.launchPersistentContext(
          profile,
          { ...launchOptions, channel: 'chrome', headless: false, baseURL },
        );
        try {
          await use(context);
        } finally {
          await context.close();
        }
      },
    })
  : base;

for (const modality of ['image', 'audio'] as const) {
  if (modality === 'audio' && process.env['LOCAL_LLM_AUDIO'] !== '1') continue;

  test(`${native ? 'native inference' : 'deterministic shim'} renders ${modality} through the framework Chrome transport`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(native ? 390_000 : 30_000);
    const started = performance.now();
    let requestedAt: number | undefined;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const report: Record<string, unknown> = {
      scope: native
        ? 'Real Hashbrown transport and framework media inference.'
        : 'Deterministic native API shim contract; NOT actual model inference.',
      modality,
      project: testInfo.project.name,
      browserVersion: page.context().browser()?.version(),
      downloadAllowed: false,
      profile: native ? profile : null,
      lifecycleEvidenceScope:
        'resolved/released count application resolver acquisitions/disposer calls; created/destroyed count transport sessionState events. These counters do not independently observe ImageBitmap.close or native session.destroy calls.',
    };
    try {
      if (modality === 'audio') {
        const fixture = readFileSync(join(__dirname, 'fixtures/speech.wav'));
        await page.addInitScript((base64) => {
          (
            globalThis as unknown as { __hashbrownSpeechBase64: string }
          ).__hashbrownSpeechBase64 = base64;
        }, fixture.toString('base64'));
      }
      if (!native) {
        await page.addInitScript((modality) => {
          const runtime = globalThis as unknown as Record<string, unknown>;
          runtime['__localMediaNativeCalls'] = [];
          runtime['LanguageModel'] = {
            availability: async () => 'available',
            create: async (options: object) => ({
              prompt: async () => '',
              promptStreaming(
                messages: {
                  role: string;
                  content: string | { type: string; value: unknown }[];
                }[],
              ) {
                const content = messages.flatMap((message) =>
                  typeof message.content === 'string' ? [] : message.content,
                );
                const media = content.find((part) => part.type === modality);
                if (
                  modality === 'image'
                    ? !(media?.value instanceof ImageBitmap)
                    : !(media?.value instanceof Blob)
                ) {
                  throw new Error(
                    'The real transport did not pass validated native media.',
                  );
                }
                (runtime['__localMediaNativeCalls'] as unknown[]).push({
                  options,
                  types: content.map((part) => part.type),
                });
                return new ReadableStream<string>({
                  start(controller) {
                    controller.enqueue(
                      modality === 'image' ? 'Red' : 'The secret code is 7429.',
                    );
                    controller.close();
                  },
                });
              },
              destroy() {
                /* Lifecycle is observed through the transport event. */
              },
            }),
          };
        }, modality);
      }

      await page.goto(
        `/?runUrl=http://127.0.0.1/unused&localModel=chrome&localMedia=${modality}`,
      );
      if (native) {
        const availability = await page.evaluate(async (modality) => {
          const runtime = globalThis as unknown as {
            LanguageModel?: { availability(options: object): Promise<string> };
          };
          return (
            runtime.LanguageModel?.availability({
              expectedInputs: [
                { type: 'text', languages: ['en'] },
                modality === 'audio'
                  ? { type: modality, languages: ['en'] }
                  : { type: modality },
              ],
              expectedOutputs: [{ type: 'text', languages: ['en'] }],
            }) ?? 'missing'
          );
        }, modality);
        report['availability'] = availability;
        expect(
          availability,
          'A preinstalled media model is required; downloads are disabled.',
        ).toBe('available');
      }

      requestedAt = performance.now();
      await page.getByTestId('send').click();
      await expect(page.getByTestId('assistant')).not.toBeEmpty({
        timeout: native ? 370_000 : 20_000,
      });
      await expect(page.getByTestId('status')).toHaveText('idle', {
        timeout: native ? 370_000 : 20_000,
      });
      await expect(page.getByTestId('error')).toBeEmpty();
      const answer = await page.getByTestId('assistant').textContent();
      if (modality === 'image') {
        expect(answer?.trim().toLowerCase().replace(/[.!]$/, '')).toBe('red');
      } else {
        expect(
          answer
            ?.toLowerCase()
            .replace(/seven/g, '7')
            .replace(/four/g, '4')
            .replace(/two/g, '2')
            .replace(/nine/g, '9')
            .replace(/[^a-z0-9]/g, ''),
        ).toBe('thesecretcodeis7429');
      }
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                globalThis as unknown as {
                  __hashbrownLocalMedia: { released: number };
                }
              ).__hashbrownLocalMedia.released,
          ),
        )
        .toBe(1);
      const lifecycle = await page.evaluate(
        () =>
          (globalThis as unknown as { __hashbrownLocalMedia: unknown })
            .__hashbrownLocalMedia,
      );
      expect(lifecycle).toMatchObject({
        resolved: 1,
        released: 1,
        created: 1,
        destroyed: 1,
      });
      expect(errors).toEqual([]);
      if (!native) {
        const calls = await page.evaluate(
          () =>
            (globalThis as unknown as { __localMediaNativeCalls: unknown[] })
              .__localMediaNativeCalls,
        );
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
          types: ['text', modality],
          options: {
            expectedInputs: [
              { type: 'text', languages: ['en'] },
              modality === 'audio'
                ? { type: modality, languages: ['en'] }
                : { type: modality },
            ],
          },
        });
      }
    } finally {
      const telemetry = await page
        .evaluate(() => {
          const runtime = globalThis as unknown as {
            __hashbrownLocalMedia?: unknown;
            __localMediaNativeCalls?: unknown[];
          };
          return {
            answer:
              document.querySelector('[data-testid="assistant"]')
                ?.textContent ?? null,
            status:
              document.querySelector('[data-testid="status"]')?.textContent ??
              null,
            renderedError:
              document.querySelector('[data-testid="error"]')?.textContent ??
              null,
            lifecycle: runtime.__hashbrownLocalMedia ?? null,
            shimCalls: runtime.__localMediaNativeCalls ?? null,
          };
        })
        .catch((cause) => ({ telemetryCaptureError: String(cause) }));
      Object.assign(report, telemetry, {
        elapsedMs:
          requestedAt === undefined ? null : performance.now() - requestedAt,
        totalMs: performance.now() - started,
        errors,
      });
      await testInfo.attach('framework-media.json', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });
    }
  });
}
