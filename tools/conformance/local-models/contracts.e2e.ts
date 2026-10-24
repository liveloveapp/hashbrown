import { LLMock } from '@copilotkit/aimock';
import { expect, test } from '@playwright/test';
import { installLocalModelShim } from './shim';

for (const localModel of ['chrome', 'webllm']) {
  for (const scenario of ['plain', 'structured', 'ui', 'nested-ui']) {
    test(`${localModel} streams ${scenario} through the real local transport`, async ({
      page,
    }) => {
      const mock = new LLMock({ port: 0, chunkSize: 3, latency: 10 });
      const content =
        scenario === 'plain'
          ? 'Local fixture answer.'
          : scenario === 'structured'
            ? JSON.stringify({ answer: 'Local fixture answer.', count: 2 })
            : scenario === 'nested-ui'
              ? JSON.stringify({
                  ui: [
                    {
                      panel: {
                        props: { heading: 'Local panel' },
                        children: [
                          {
                            status: {
                              props: {
                                title: 'Local fixture answer.',
                                count: 2,
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                })
              : JSON.stringify({
                  ui: [
                    {
                      status: {
                        props: { title: 'Local fixture answer.', count: 2 },
                      },
                    },
                  ],
                });
      mock.onMessage('Local model contract', { content });
      await mock.start();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      try {
        await installLocalModelShim(page, mock.url);
        await page.goto(
          `/?runUrl=${encodeURIComponent(mock.url + '/unused')}&scenario=${scenario === 'nested-ui' ? 'ui' : scenario}&nested=${scenario === 'nested-ui'}&localModel=${localModel}`,
        );
        await page.getByTestId('prompt').fill('Local model contract');
        await page.getByTestId('send').click();

        if (scenario === 'nested-ui') {
          await expect(page.getByTestId('nested-panel')).toContainText(
            'Local fixture answer.',
          );
        } else if (scenario === 'ui')
          await expect(page.getByTestId('status-card')).toContainText(
            'Local fixture answer.',
          );
        else if (scenario === 'structured') {
          await expect(page.getByTestId('structured-answer')).toHaveText(
            'Local fixture answer.',
          );
          await expect(page.getByTestId('structured-count')).toHaveText('2');
        } else
          await expect(page.getByTestId('assistant')).toHaveText(
            'Local fixture answer.',
          );
        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect(page.getByTestId('error')).toBeEmpty();
        const calls = await page.evaluate(
          () =>
            (
              globalThis as unknown as {
                __localModelCalls: {
                  messages: { role: string; content: string }[];
                  response_format?: { type: string; schema: string };
                }[];
              }
            ).__localModelCalls,
        );
        expect(calls).toHaveLength(1);
        expect(calls[0].messages[0]).toEqual({
          role: 'system',
          content: 'Runtime smoke system prompt.',
        });
        if (scenario !== 'plain') {
          expect(calls[0].response_format?.type).toBe('json_object');
          expect(
            JSON.parse(calls[0].response_format?.schema ?? ''),
          ).toHaveProperty('type', 'object');
        }
        expect(errors).toEqual([]);
      } finally {
        await mock.stop();
      }
    });
  }

  test(`${localModel} stops streaming and releases its generation`, async ({
    page,
  }) => {
    const mock = new LLMock({ port: 0, chunkSize: 3, latency: 30 });
    mock.onMessage('Stop local generation', {
      content: 'Partial answer '.repeat(100),
    });
    await mock.start();

    try {
      await installLocalModelShim(page, mock.url);
      await page.goto(
        `/?runUrl=${encodeURIComponent(mock.url + '/unused')}&localModel=${localModel}`,
      );
      await page.getByTestId('prompt').fill('Stop local generation');
      await page.getByTestId('send').click();
      await expect(page.getByTestId('assistant')).not.toBeEmpty();

      await page.getByTestId('stop').click();

      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (globalThis as unknown as { __localModelLifecycle: string[] })
                .__localModelLifecycle,
          ),
        )
        .toContain(localModel === 'chrome' ? 'destroyed' : 'interrupted');
      expect(
        (await page.getByTestId('assistant').textContent())?.length,
      ).toBeLessThan('Partial answer '.repeat(100).length);
    } finally {
      await mock.stop();
    }
  });

  test(`${localModel} rejects tools before invoking a model`, async ({
    page,
  }) => {
    const mock = new LLMock({ port: 0 });
    await mock.start();

    try {
      await installLocalModelShim(page, mock.url);
      await page.goto(
        `/?runUrl=${encodeURIComponent(mock.url + '/unused')}&scenario=tool&localModel=${localModel}`,
      );
      await page.getByTestId('prompt').fill('Use a tool');
      await page.getByTestId('send').click();

      await expect(page.getByTestId('error')).toContainText(
        localModel === 'chrome'
          ? 'does not support tool calls'
          : 'requires text messages without tool calls',
      );
      expect(
        await page.evaluate(
          () =>
            (globalThis as unknown as { __localModelCalls: unknown[] })
              .__localModelCalls,
        ),
      ).toEqual([]);
    } finally {
      await mock.stop();
    }
  });
}
