import type { WebLlmEngine } from '@hashbrownai/core';
import { expect, test } from '@playwright/test';
import {
  installWebLlmWorker,
  readBrowserMemory,
  startWebLlmRuntime,
} from './webllm-runtime';

test('real WebLLM worker streams structured output and nested trusted UI', async ({
  page,
}, testInfo) => {
  const runtime = await startWebLlmRuntime();
  const model =
    process.env['WEBLLM_MODEL'] ?? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    const baselineMemory = await readBrowserMemory(page);
    await testInfo.attach('browser-memory-baseline.json', {
      body: JSON.stringify(baselineMemory),
      contentType: 'application/json',
    });
    await installWebLlmWorker(page, runtime.url, model);
    for (const scenario of ['structured', 'nested-ui']) {
      await page.goto(
        `/?runUrl=http://127.0.0.1/unused&localModel=webllm&scenario=${scenario === 'structured' ? 'structured' : 'ui'}&nested=${scenario === 'nested-ui'}`,
      );
      await page.waitForFunction(
        () => {
          const state = globalThis as unknown as {
            __localWebLlmReady?: boolean;
            __localWebLlmMetrics: { loadError?: string };
          };
          return (
            state.__localWebLlmReady || state.__localWebLlmMetrics.loadError
          );
        },
        undefined,
        { timeout: 180_000 },
      );
      const loadError = await page.evaluate(
        () =>
          (
            globalThis as unknown as {
              __localWebLlmMetrics: { loadError?: string };
            }
          ).__localWebLlmMetrics.loadError,
      );
      expect(loadError, 'WebLLM worker must load successfully').toBeUndefined();
      for (let run = 0; run < 2; run += 1) {
        const prompt =
          scenario === 'structured'
            ? 'Return JSON with answer "Local inference works" and count 2.'
            : 'Render exactly one panel with heading "Local panel", containing one status with title "Local inference works" and count 2. Return the UI JSON object.';
        await page.getByTestId('prompt').fill(prompt);

        await page.getByTestId('send').click();

        await page.waitForFunction(
          (completed) => {
            const metrics = (
              globalThis as unknown as {
                __localWebLlmMetrics: { requests: { totalMs?: number }[] };
              }
            ).__localWebLlmMetrics;
            return (
              metrics.requests.length === completed &&
              metrics.requests[completed - 1]?.totalMs !== undefined
            );
          },
          run + 1,
          { timeout: 90_000 },
        );
        await expect(page.getByTestId('status')).toHaveText('idle', {
          timeout: 90_000,
        });
        await expect(page.getByTestId('error')).toBeEmpty();
        if (scenario === 'structured') {
          await expect(page.getByTestId('structured-answer')).toContainText(
            'Local inference works',
          );
          await expect(page.getByTestId('structured-count')).toHaveText('2');
        } else {
          await expect(page.getByTestId('nested-panel')).toHaveCount(run + 1);
          await expect(page.getByTestId('nested-panel').last()).toContainText(
            'Local panel',
          );
          await expect(
            page.getByTestId('nested-panel').last().getByTestId('status-card'),
          ).toContainText('Local inference works: 2');
        }
      }
      const measurements = await page.evaluate(
        () =>
          (globalThis as unknown as { __localWebLlmMetrics: unknown })
            .__localWebLlmMetrics,
      );
      await testInfo.attach(`webllm-${scenario}.json`, {
        body: JSON.stringify(
          { model, measurements, memory: await readBrowserMemory(page) },
          null,
          2,
        ),
        contentType: 'application/json',
      });
      await page.evaluate(async () => {
        await (
          globalThis as unknown as { __localWebLlmDispose: () => Promise<void> }
        ).__localWebLlmDispose();
      });
    }
    expect(errors).toEqual([]);
  } finally {
    const finalMetrics = await page
      .evaluate(
        () =>
          (globalThis as unknown as { __localWebLlmMetrics: unknown })
            .__localWebLlmMetrics,
      )
      .catch(() => undefined);
    await testInfo.attach('webllm-final.json', {
      body: JSON.stringify({ model, measurements: finalMetrics }),
      contentType: 'application/json',
    });
    await page
      .evaluate(async () => {
        await (
          globalThis as unknown as {
            __localWebLlmDispose?: () => Promise<void>;
          }
        ).__localWebLlmDispose?.();
      })
      .catch(() => undefined);
    await runtime.stop();
  }
});

test('real WebLLM worker recovers after cancellation and truncation', async ({
  page,
}, testInfo) => {
  const runtime = await startWebLlmRuntime();
  const model =
    process.env['WEBLLM_MODEL'] ?? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
  try {
    await installWebLlmWorker(page, runtime.url, model);
    await page.goto(
      '/?runUrl=http://127.0.0.1/unused&localModel=webllm&scenario=structured',
    );
    await page.waitForFunction(
      () =>
        (globalThis as unknown as { __localWebLlmReady?: boolean })
          .__localWebLlmReady,
      undefined,
      { timeout: 180_000 },
    );
    await page
      .getByTestId('prompt')
      .fill(
        'Set count to 2 and write a very long answer repeating the phrase local inference works 100 times.',
      );

    await page.getByTestId('send').click();
    await page.waitForFunction(
      () =>
        (
          globalThis as unknown as {
            __localWebLlmMetrics: { requests: { firstTokenMs?: number }[] };
          }
        ).__localWebLlmMetrics.requests[0]?.firstTokenMs !== undefined,
    );
    await page.getByTestId('stop').click();

    await expect(page.getByTestId('status')).toHaveText('idle');
    await page.waitForFunction(
      () =>
        (
          globalThis as unknown as {
            __localWebLlmMetrics: { requests: { totalMs?: number }[] };
          }
        ).__localWebLlmMetrics.requests[0]?.totalMs !== undefined,
    );
    await page.evaluate(() => {
      (
        globalThis as unknown as { __localWebLlmMaxTokens: number }
      ).__localWebLlmMaxTokens = 1;
    });
    await page
      .getByTestId('prompt')
      .fill('Return JSON with answer "Local inference works" and count 2.');
    await page.getByTestId('send').click();
    await expect(page.getByTestId('error')).toContainText('truncated', {
      timeout: 90_000,
    });
    await page.waitForFunction(
      () =>
        (
          globalThis as unknown as {
            __localWebLlmMetrics: { requests: { totalMs?: number }[] };
          }
        ).__localWebLlmMetrics.requests[1]?.totalMs !== undefined,
    );
    await page.evaluate(() => {
      (
        globalThis as unknown as { __localWebLlmMaxTokens: number }
      ).__localWebLlmMaxTokens = 256;
    });
    await page.getByTestId('send').click();

    await expect(page.getByTestId('structured-answer')).toContainText(
      'Local inference works',
      { timeout: 90_000 },
    );
    await expect(page.getByTestId('structured-count')).toHaveText('2');
    await expect(page.getByTestId('status')).toHaveText('idle');
    await expect(page.getByTestId('error')).toBeEmpty();
  } finally {
    const measurements = await page
      .evaluate(
        () =>
          (globalThis as unknown as { __localWebLlmMetrics: unknown })
            .__localWebLlmMetrics,
      )
      .catch(() => undefined);
    await testInfo.attach('webllm-recovery.json', {
      body: JSON.stringify(measurements),
      contentType: 'application/json',
    });
    await page
      .evaluate(async () => {
        await (
          globalThis as unknown as {
            __localWebLlmDispose?: () => Promise<void>;
          }
        ).__localWebLlmDispose?.();
      })
      .catch(() => undefined);
    await runtime.stop();
  }
});

test('real WebLLM accepts a bounded schema-depth sweep', async ({
  page,
}, testInfo) => {
  const depths = (process.env['WEBLLM_SCHEMA_DEPTHS'] ?? '1,4,8')
    .split(',')
    .map(Number);
  if (
    !depths.length ||
    depths.some((value) => !Number.isInteger(value) || value < 1 || value > 64)
  )
    throw new Error('WEBLLM_SCHEMA_DEPTHS must contain integers from 1 to 64.');
  const runtime = await startWebLlmRuntime();
  const model =
    process.env['WEBLLM_MODEL'] ?? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
  try {
    await installWebLlmWorker(page, runtime.url, model);
    await page.goto('/?runUrl=http://127.0.0.1/unused&localModel=webllm');
    await page.waitForFunction(
      () =>
        (globalThis as unknown as { __localWebLlmReady?: boolean })
          .__localWebLlmReady,
      undefined,
      { timeout: 180_000 },
    );

    const results = await page.evaluate(async (depths) => {
      const engine = (
        globalThis as unknown as {
          __hashbrownWebLlm: WebLlmEngine;
        }
      ).__hashbrownWebLlm;
      const probes: {
        depth: number;
        schemaBytes: number;
        expected: unknown;
        rawText: string;
        finishReason?: string;
        output?: unknown;
        parseError?: string;
      }[] = [];
      for (const depth of depths) {
        let schema: object = { type: 'integer', const: 2 };
        let expected: unknown = 2;
        for (let level = 0; level < depth; level += 1) {
          schema = {
            type: 'object',
            properties: { child: schema },
            required: ['child'],
            additionalProperties: false,
          };
          expected = { child: expected };
        }
        const encoded = JSON.stringify(schema);
        let text = '';
        let finishReason: string | undefined;
        for await (const chunk of await engine.chat.completions.create({
          stream: true,
          messages: [
            {
              role: 'user',
              content:
                'Return the smallest JSON matching the schema. Use 999 instead of 2 if allowed.',
            },
          ],
          response_format: { type: 'json_object', schema: encoded },
        })) {
          text += chunk.choices[0]?.delta.content ?? '';
          if (chunk.choices[0]?.finish_reason)
            finishReason = chunk.choices[0].finish_reason;
        }
        let output: unknown;
        let parseError: string | undefined;
        try {
          output = JSON.parse(text);
        } catch (error) {
          parseError = String(error);
        }
        probes.push({
          depth,
          schemaBytes: encoded.length,
          expected,
          rawText: text,
          finishReason,
          output,
          parseError,
        });
      }
      return probes;
    }, depths);

    await testInfo.attach('webllm-schema-depth.json', {
      body: JSON.stringify(results),
      contentType: 'application/json',
    });
    for (const result of results) {
      expect(result.finishReason, `Schema depth ${result.depth}`).toBe('stop');
      expect(result.parseError, `Schema depth ${result.depth}`).toBeUndefined();
      expect(result.output, `Schema depth ${result.depth}`).toEqual(
        result.expected,
      );
    }
  } finally {
    const measurements = await page
      .evaluate(
        () =>
          (globalThis as unknown as { __localWebLlmMetrics: unknown })
            .__localWebLlmMetrics,
      )
      .catch(() => undefined);
    await testInfo.attach('webllm-schema-depth-metrics.json', {
      body: JSON.stringify(measurements),
      contentType: 'application/json',
    });
    await page
      .evaluate(async () => {
        await (
          globalThis as unknown as {
            __localWebLlmDispose?: () => Promise<void>;
          }
        ).__localWebLlmDispose?.();
      })
      .catch(() => undefined);
    await runtime.stop();
  }
});

test('real WebLLM selects a requested component from larger UI schemas', async ({
  page,
}, testInfo) => {
  const widths = (process.env['WEBLLM_SCHEMA_WIDTHS'] ?? '4,16,32')
    .split(',')
    .map(Number);
  if (
    !widths.length ||
    widths.some((value) => !Number.isInteger(value) || value < 1 || value > 64)
  )
    throw new Error('WEBLLM_SCHEMA_WIDTHS must contain integers from 1 to 64.');
  const runtime = await startWebLlmRuntime();
  const model =
    process.env['WEBLLM_MODEL'] ?? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
  try {
    await installWebLlmWorker(page, runtime.url, model);
    await page.goto('/?runUrl=http://127.0.0.1/unused&localModel=webllm');
    await page.waitForFunction(
      () =>
        (globalThis as unknown as { __localWebLlmReady?: boolean })
          .__localWebLlmReady,
      undefined,
      { timeout: 180_000 },
    );

    const results = await page.evaluate(async (widths) => {
      const engine = (
        globalThis as unknown as { __hashbrownWebLlm: WebLlmEngine }
      ).__hashbrownWebLlm;
      const probes: {
        components: number;
        schemaBytes: number;
        expected: unknown;
        output: unknown;
      }[] = [];
      for (const width of widths) {
        const alternatives = Array.from({ length: width }, (_, index) => {
          const name = `status${index}`;
          return {
            type: 'object',
            properties: {
              [name]: {
                type: 'object',
                properties: {
                  props: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', const: 'Local inference works' },
                      count: { type: 'integer', const: 2 },
                    },
                    required: ['title', 'count'],
                    additionalProperties: false,
                  },
                },
                required: ['props'],
                additionalProperties: false,
              },
            },
            required: [name],
            additionalProperties: false,
          };
        });
        const schema = {
          type: 'object',
          properties: {
            ui: {
              type: 'array',
              minItems: 1,
              maxItems: 1,
              items: { oneOf: alternatives },
            },
          },
          required: ['ui'],
          additionalProperties: false,
        };
        const encoded = JSON.stringify(schema);
        const name = `status${width - 1}`;
        let text = '';
        for await (const chunk of await engine.chat.completions.create({
          stream: true,
          messages: [
            {
              role: 'user',
              content: `Render exactly one ${name} component with props title "Local inference works" and count 2. Return the ui JSON object.`,
            },
          ],
          response_format: { type: 'json_object', schema: encoded },
        }))
          text += chunk.choices[0]?.delta.content ?? '';
        probes.push({
          components: width,
          schemaBytes: encoded.length,
          expected: {
            ui: [
              {
                [name]: { props: { title: 'Local inference works', count: 2 } },
              },
            ],
          },
          output: JSON.parse(text),
        });
      }
      return probes;
    }, widths);

    await testInfo.attach('webllm-schema-width.json', {
      body: JSON.stringify(results),
      contentType: 'application/json',
    });
    for (const result of results)
      expect(
        result.output,
        `${result.components} component alternatives`,
      ).toEqual(result.expected);
  } finally {
    const measurements = await page
      .evaluate(
        () =>
          (globalThis as unknown as { __localWebLlmMetrics: unknown })
            .__localWebLlmMetrics,
      )
      .catch(() => undefined);
    await testInfo.attach('webllm-schema-width-metrics.json', {
      body: JSON.stringify(measurements),
      contentType: 'application/json',
    });
    await page
      .evaluate(async () => {
        await (
          globalThis as unknown as {
            __localWebLlmDispose?: () => Promise<void>;
          }
        ).__localWebLlmDispose?.();
      })
      .catch(() => undefined);
    await runtime.stop();
  }
});
