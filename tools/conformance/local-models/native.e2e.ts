import { test as base, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBrowserMemory } from './webllm-runtime';
import { installNativeToolObserver } from './native-tool-shim';

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

/** Checks availability before a fixture can create a session or request a download. */
async function requireNativeAvailability(page: Page): Promise<string> {
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
  return availability;
}

test('native Chrome produces structured output on the local device', async ({
  page,
}, testInfo) => {
  await page.goto(
    '/?runUrl=http://127.0.0.1/unused&scenario=structured&localModel=chrome',
  );
  const availability = await requireNativeAvailability(page);
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

for (const nested of [false, true]) {
  test(`native Chrome generates exact ${nested ? 'nested' : 'leaf'} component UI without tools`, async ({
    page,
  }, testInfo) => {
    const title = `Local UI ${crypto.randomUUID()}`;
    const status = (count: number) => ({
      status: { props: { title, count } },
    });
    const expected = {
      ui: nested
        ? [
            {
              panel: {
                props: { heading: 'Workflow' },
                children: [status(1), status(2)],
              },
            },
          ]
        : [status(2)],
    };
    const errors: string[] = [];
    const fallback: string[] = [];
    let availability: string | undefined;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/unused')
        fallback.push(request.url());
    });
    await installNativeToolObserver(page);

    try {
      await page.goto(
        `/?runUrl=${encodeURIComponent('http://127.0.0.1:1/unused')}&scenario=ui&nested=${nested}&localModel=chrome`,
      );
      availability = await requireNativeAvailability(page);
      await page
        .getByTestId('prompt')
        .fill(
          nested
            ? `Render exactly one panel with heading Workflow, containing exactly two status components. Both titles must be exactly ${title}. Their counts must be 1 and 2, in that order. Render no additional components.`
            : `Render exactly one status component with title exactly ${title} and count 2. Render no additional components.`,
        );

      await page.getByTestId('send').click();

      await expect(page.getByTestId('status-card')).toHaveText(
        nested ? [`${title}: 1`, `${title}: 2`] : [`${title}: 2`],
        { timeout: generationTimeout },
      );
      await expect(page.getByTestId('status')).toHaveText('idle', {
        timeout: generationTimeout,
      });
      await expect(page.getByTestId('error')).toBeEmpty();
      await expect(page.getByTestId('tool-count')).toHaveText('0');
      await expect(page.getByTestId('nested-panel')).toHaveCount(
        nested ? 1 : 0,
      );
      if (nested)
        await expect(
          page.getByTestId('nested-panel').getByRole('heading'),
        ).toHaveText('Workflow');
      const observed = await page.evaluate(() => {
        const runtime = globalThis as unknown as {
          __nativeToolNativeEvents: {
            phase: string;
            value?: unknown;
            options?: { tools?: unknown };
          }[];
          __nativeToolActive(): number;
        };
        return {
          events: runtime.__nativeToolNativeEvents,
          active: runtime.__nativeToolActive(),
        };
      });
      const raw = observed.events
        .filter((event) => event.phase === 'chunk')
        .map((event) => {
          expect(typeof event.value).toBe('string');
          return event.value;
        })
        .join('');
      expect(JSON.parse(raw)).toEqual(expected);
      expect(observed.active).toBe(0);
      expect(
        observed.events.filter((event) => event.phase === 'created'),
      ).toHaveLength(1);
      expect(
        observed.events.filter((event) => event.phase === 'destroyed'),
      ).toHaveLength(1);
      expect(
        observed.events.find((event) => event.phase === 'create-start')?.options
          ?.tools,
      ).toBeUndefined();
      expect(errors).toEqual([]);
      expect(fallback).toEqual([]);
    } finally {
      await testInfo.attach('native-no-tools-ui.json', {
        contentType: 'application/json',
        body: JSON.stringify({
          requestedExperiment:
            testInfo.config.metadata['localChromeExperiment'],
          availability,
          browserVersion: page.context().browser()?.version(),
          flags: testInfo.project.use.launchOptions?.args,
          profile: process.env['LOCAL_LLM_PROFILE'],
          expected,
          errors,
          fallback,
          events: await page
            .evaluate(
              () =>
                (
                  globalThis as unknown as {
                    __nativeToolNativeEvents?: unknown;
                  }
                ).__nativeToolNativeEvents,
            )
            .catch(() => null),
          body: await page
            .locator('body')
            .innerText()
            .catch(() => null),
        }),
      });
    }
  });
}

if (process.env['LOCAL_LLM_CAPABILITIES'] === '1') {
  test('native runtime capabilities and generated image', async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(390_000);
    const report: Record<string, unknown> = {
      scope: 'Raw native browser runtime; NOT a Hashbrown media adapter test.',
      project: testInfo.project.name,
      browserName,
      browserVersion: page.context().browser()?.version(),
      downloadAllowed: process.env['LOCAL_LLM_DOWNLOAD'] === '1',
      fixture: { width: 64, height: 64, fillStyle: '#ff0000' },
      limitations: [
        'Audio availability only: no microphone access or audio inference.',
        'Tool availability and dictionary recognition only: no tool execution.',
        'Accepted tool enums do not establish functional tool support.',
      ],
    };

    try {
      await page.goto(
        '/?runUrl=http://127.0.0.1/unused&scenario=structured&localModel=chrome',
      );
      const probes = await page.evaluate(async () => {
        const runtime = globalThis as unknown as Record<string, unknown> & {
          LanguageModel?: { availability(options: object): Promise<string> };
        };
        const globals = Object.fromEntries(
          [
            'LanguageModel',
            'LanguageModelToolCall',
            'LanguageModelToolSuccess',
            'LanguageModelToolError',
          ].map((name) => [name, typeof runtime[name]]),
        );
        const text = { type: 'text', languages: ['en'] };
        const tool = {
          name: 'syntheticColor',
          description: 'Returns a synthetic color.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        };
        const cases = [
          { name: 'text', expectedInputs: [text], expectedOutputs: [text] },
          {
            name: 'image',
            expectedInputs: [{ type: 'image' }],
            expectedOutputs: [text],
          },
          {
            name: 'text-image',
            expectedInputs: [text, { type: 'image' }],
            expectedOutputs: [text],
          },
          {
            name: 'text-audio',
            expectedInputs: [text, { type: 'audio' }],
            expectedOutputs: [text],
          },
          {
            name: 'tool-call-output',
            expectedInputs: [text],
            expectedOutputs: [text, { type: 'tool-call' }],
          },
          {
            name: 'tool-response-input',
            expectedInputs: [text, { type: 'tool-response' }],
            expectedOutputs: [text],
          },
          {
            name: 'tool-history',
            expectedInputs: [
              text,
              { type: 'tool-call' },
              { type: 'tool-response' },
            ],
            expectedOutputs: [text, { type: 'tool-call' }],
            tools: [tool],
          },
          {
            name: 'invalid-type-control',
            expectedInputs: [{ type: 'definitely-not-a-model-input' }],
            expectedOutputs: [text],
          },
        ];
        const results = [];
        for (const { name, ...options } of cases) {
          const started = performance.now();
          let availability: string | null = null;
          let error: { name: string; message: string } | null = null;
          try {
            availability = runtime.LanguageModel
              ? await runtime.LanguageModel.availability(options)
              : 'missing';
          } catch (cause) {
            const failure = cause as Error;
            error = { name: failure.name, message: failure.message };
          }
          results.push({
            name,
            options,
            availability,
            error,
            elapsedMs: performance.now() - started,
          });
        }
        let toolsGetterRead = false;
        const options = { expectedInputs: [text], expectedOutputs: [text] };
        Object.defineProperty(options, 'tools', {
          get() {
            toolsGetterRead = true;
            return [tool];
          },
        });
        let toolsAvailability: string | null = null;
        let toolsError: { name: string; message: string } | null = null;
        try {
          toolsAvailability = runtime.LanguageModel
            ? await runtime.LanguageModel.availability(options)
            : 'missing';
        } catch (cause) {
          const failure = cause as Error;
          toolsError = { name: failure.name, message: failure.message };
        }
        return {
          userAgent: navigator.userAgent,
          globals,
          results,
          toolsDictionaryRecognition: {
            options: { ...options, tools: [tool] },
            availability: toolsAvailability,
            toolsGetterRead,
            error: toolsError,
          },
        };
      });
      report['probes'] = probes;
      const image = probes.results.find(
        (result) => result.name === 'text-image',
      );
      if (!image) throw new Error('The image capability probe is missing.');
      const allowedAvailability =
        process.env['LOCAL_LLM_DOWNLOAD'] === '1'
          ? ['available', 'downloadable', 'downloading']
          : ['available'];
      expect(
        allowedAvailability,
        `Native image availability: ${JSON.stringify(image)}`,
      ).toContain(image?.availability);

      await page.evaluate((options) => {
        const button = document.createElement('button');
        button.textContent = 'Test generated red image';
        button.dataset['testid'] = 'native-capability-image';
        const output = document.createElement('pre');
        output.dataset['testid'] = 'native-capability-result';
        output.textContent = 'pending';
        document.body.append(button, output);
        button.onclick = async () => {
          const runtime = globalThis as unknown as {
            LanguageModel: {
              create(options: object): Promise<{
                prompt(input: object[], options: object): Promise<string>;
                destroy(): void;
              }>;
            };
          };
          let session:
            | Awaited<ReturnType<typeof runtime.LanguageModel.create>>
            | undefined;
          const result: Record<string, unknown> = {
            scope: 'Native runtime image probe; NOT a Hashbrown media adapter.',
            options,
            userActivationAtClick: navigator.userActivation.isActive,
            promptText:
              'What is the dominant color in this image? Reply with one color word only.',
          };
          const started = performance.now();
          try {
            const setupStarted = performance.now();
            session = await runtime.LanguageModel.create({
              ...options,
              signal: AbortSignal.timeout(180_000),
            });
            result['setupMs'] = performance.now() - setupStarted;
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const drawing = canvas.getContext('2d');
            if (!drawing) throw new Error('Canvas 2D context unavailable');
            drawing.fillStyle = '#ff0000';
            drawing.fillRect(0, 0, 64, 64);
            const generationStarted = performance.now();
            result['answer'] = await session.prompt(
              [
                {
                  role: 'user',
                  content: [
                    { type: 'text', value: result['promptText'] },
                    { type: 'image', value: canvas },
                  ],
                },
              ],
              { signal: AbortSignal.timeout(180_000) },
            );
            result['generationMs'] = performance.now() - generationStarted;
          } catch (cause) {
            const failure = cause as Error;
            result['error'] = { name: failure.name, message: failure.message };
          } finally {
            try {
              session?.destroy();
              result['sessionDestroyed'] = session !== undefined;
            } catch (cause) {
              const failure = cause as Error;
              result['cleanupError'] = {
                name: failure.name,
                message: failure.message,
              };
            }
            result['totalMs'] = performance.now() - started;
            // Publish only after prompt() resolves and the session is destroyed.
            output.textContent = JSON.stringify(result);
          }
        };
      }, image.options);
      await page.getByTestId('native-capability-image').click();
      await expect
        .poll(
          () => page.getByTestId('native-capability-result').textContent(),
          {
            timeout: 370_000,
          },
        )
        .not.toBe('pending');
      const content = await page
        .getByTestId('native-capability-result')
        .textContent();
      if (!content) throw new Error('The image probe returned no result.');
      const result = JSON.parse(content) as Record<string, unknown>;
      report['image'] = result;
      expect(result['error']).toBeUndefined();
      expect(result['cleanupError']).toBeUndefined();
      expect(result['userActivationAtClick']).toBe(true);
      expect(result['sessionDestroyed']).toBe(true);
      expect(result['answer']).toEqual(expect.any(String));
      expect(
        String(result['answer']).trim().toLowerCase().replace(/[.!]$/, ''),
      ).toBe('red');
    } finally {
      await testInfo.attach('native-runtime-capabilities.json', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });
    }
  });
}

if (process.env['LOCAL_LLM_AUDIO'] === '1') {
  test('native runtime transcribes generated speech', async ({
    page,
  }, testInfo) => {
    test.setTimeout(390_000);
    const fixture = readFileSync(join(__dirname, 'fixtures/speech.wav'));
    const metadata = JSON.parse(
      readFileSync(join(__dirname, 'fixtures/speech.json'), 'utf8'),
    ) as { sha256: string; phrase: string };
    const report: Record<string, unknown> = {
      scope:
        'Raw native browser audio inference; NOT a Hashbrown media adapter test.',
      project: testInfo.project.name,
      browserVersion: page.context().browser()?.version(),
      fixture: metadata,
      downloadAllowed: false,
      limitations: [
        'One generated speech fixture is a canary, not a transcription quality evaluation.',
        'No microphone, personal files or browser content are accessed.',
      ],
    };

    try {
      expect(createHash('sha256').update(fixture).digest('hex')).toBe(
        metadata.sha256,
      );
      await page.goto(
        '/?runUrl=http://127.0.0.1/unused&scenario=structured&localModel=chrome',
      );
      const probes = await page.evaluate(async () => {
        const runtime = globalThis as unknown as Record<string, unknown> & {
          LanguageModel?: { availability(options: object): Promise<string> };
        };
        const text = { type: 'text', languages: ['en'] };
        const options = {
          expectedInputs: [text, { type: 'audio' }],
          expectedOutputs: [text],
        };
        let toolsGetterRead = false;
        const toolOptions = { expectedInputs: [text], expectedOutputs: [text] };
        Object.defineProperty(toolOptions, 'tools', {
          get() {
            toolsGetterRead = true;
            return [
              {
                name: 'syntheticColor',
                description: 'Returns a synthetic color.',
                inputSchema: {
                  type: 'object',
                  properties: {},
                  additionalProperties: false,
                },
              },
            ];
          },
        });
        const toolsAvailability =
          await runtime.LanguageModel?.availability(toolOptions);
        return {
          options,
          availability:
            (await runtime.LanguageModel?.availability(options)) ?? 'missing',
          globals: Object.fromEntries(
            [
              'LanguageModel',
              'LanguageModelToolCall',
              'LanguageModelToolSuccess',
              'LanguageModelToolError',
            ].map((name) => [name, typeof runtime[name]]),
          ),
          toolsDictionaryRecognition: { toolsAvailability, toolsGetterRead },
          userAgent: navigator.userAgent,
        };
      });
      report['probes'] = probes;
      expect(
        probes.availability,
        'Audio inference requires an already available model; downloads are disabled.',
      ).toBe('available');

      await page.evaluate(
        ({ options, bytes }) => {
          const button = document.createElement('button');
          button.textContent = 'Transcribe generated speech';
          button.dataset['testid'] = 'native-audio';
          const output = document.createElement('pre');
          output.dataset['testid'] = 'native-audio-result';
          output.textContent = 'pending';
          document.body.append(button, output);
          button.onclick = async () => {
            const runtime = globalThis as unknown as {
              LanguageModel: {
                create(options: object): Promise<{
                  prompt(input: object[], options: object): Promise<string>;
                  destroy(): void;
                }>;
              };
            };
            let session:
              | Awaited<ReturnType<typeof runtime.LanguageModel.create>>
              | undefined;
            const result: Record<string, unknown> = {
              userActivationAtClick: navigator.userActivation.isActive,
              options,
            };
            const started = performance.now();
            try {
              const setup = performance.now();
              session = await runtime.LanguageModel.create({
                ...options,
                signal: AbortSignal.timeout(180_000),
              });
              result['setupMs'] = performance.now() - setup;
              const blob = new Blob([new Uint8Array(bytes)], {
                type: 'audio/wav',
              });
              const generation = performance.now();
              result['answer'] = await session.prompt(
                [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        value:
                          'Transcribe the speech exactly. Return only the words spoken, with no explanation.',
                      },
                      { type: 'audio', value: blob },
                    ],
                  },
                ],
                { signal: AbortSignal.timeout(180_000) },
              );
              result['generationMs'] = performance.now() - generation;
            } catch (cause) {
              const failure = cause as Error;
              result['error'] = {
                name: failure.name,
                message: failure.message,
              };
            } finally {
              try {
                session?.destroy();
                result['sessionDestroyed'] = session !== undefined;
              } catch (cause) {
                const failure = cause as Error;
                result['cleanupError'] = {
                  name: failure.name,
                  message: failure.message,
                };
              }
              result['totalMs'] = performance.now() - started;
              output.textContent = JSON.stringify(result);
            }
          };
        },
        { options: probes.options, bytes: Array.from(fixture) },
      );

      await page.getByTestId('native-audio').click();
      await expect
        .poll(() => page.getByTestId('native-audio-result').textContent(), {
          timeout: 370_000,
        })
        .not.toBe('pending');
      const content = await page
        .getByTestId('native-audio-result')
        .textContent();
      if (!content) throw new Error('The audio probe returned no result.');
      const result = JSON.parse(content) as Record<string, unknown>;
      report['audio'] = result;
      expect(result['error']).toBeUndefined();
      expect(result['cleanupError']).toBeUndefined();
      expect(result['userActivationAtClick']).toBe(true);
      expect(result['sessionDestroyed']).toBe(true);
      expect(result['answer']).toEqual(expect.any(String));
      const normalized = String(result['answer'])
        .toLowerCase()
        .replace(/seven/g, '7')
        .replace(/four/g, '4')
        .replace(/two/g, '2')
        .replace(/nine/g, '9')
        .replace(/[^a-z0-9]/g, '');
      expect(normalized).toBe('thesecretcodeis7429');
    } finally {
      await testInfo.attach('native-runtime-audio.json', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });
    }
  });
}
