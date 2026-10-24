import { test as base, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBrowserMemory } from './webllm-runtime';

// Reuse only a dedicated test profile so downloaded models survive local runs.
const generationTimeout =
  process.env['LOCAL_LLM_DOWNLOAD'] === '1' ? 1_200_000 : 90_000;

const test = base.extend({
  context: async ({ playwright, baseURL, launchOptions }, use) => {
    const context = await playwright.chromium.launchPersistentContext(
      process.env['LOCAL_LLM_PROFILE'] ??
        join(tmpdir(), 'hashbrown-local-chrome-profile'),
      { ...launchOptions, channel: 'chrome', headless: false, baseURL },
    );
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
});

test('native Chrome produces structured output on the local device', async ({
  page,
}, testInfo) => {
  await page.goto(
    '/?runUrl=http://127.0.0.1/unused&scenario=structured&localModel=chrome',
  );
  const availability = await page.evaluate(async () => {
    const languageModel = (
      globalThis as unknown as {
        LanguageModel?: { availability(options: object): Promise<string> };
      }
    ).LanguageModel;
    return languageModel
      ? languageModel.availability({
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        })
      : 'missing';
  });
  expect(
    process.env['LOCAL_LLM_DOWNLOAD'] === '1'
      ? ['available', 'downloadable', 'downloading']
      : ['available'],
    `Native LanguageModel availability: ${availability}. Check chrome://on-device-internals and device eligibility.`,
  ).toContain(availability);
  const measurements: { requestedAnswerMs: number; totalMs: number }[] = [];
  for (const answer of [
    'Local inference works',
    'Local inference works again',
  ]) {
    await page
      .getByTestId('prompt')
      .fill(`Return answer "${answer}" and count 2.`);
    const started = performance.now();

    // Downloads require the separate LOCAL_LLM_DOWNLOAD=1 opt-in.
    await page.getByTestId('send').click();

    await expect(page.getByTestId('structured-answer')).toContainText(answer, {
      timeout: generationTimeout,
    });
    const requestedAnswerMs = performance.now() - started;
    await expect(page.getByTestId('structured-count')).toHaveText('2', {
      timeout: generationTimeout,
    });
    await expect(page.getByTestId('status')).toHaveText('idle', {
      timeout: generationTimeout,
    });
    await expect(page.getByTestId('error')).toBeEmpty();
    measurements.push({
      requestedAnswerMs,
      totalMs: performance.now() - started,
    });
  }
  await testInfo.attach('native-rendered-answer.json', {
    body: JSON.stringify({
      availability,
      measurements,
      memory: await readBrowserMemory(page),
      note: 'Wall time from Send to the requested rendered answer and idle, including transport and UI. This is not raw first-token latency.',
    }),
    contentType: 'application/json',
  });
});
