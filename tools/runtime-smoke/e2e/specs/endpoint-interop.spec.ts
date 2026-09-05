import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { expect, test } from '@playwright/test';
import { createAppDriver } from '../harness/app-driver';
import { installBrowserHygiene } from '../harness/browser';
import { startIndependentEndpoint } from '../harness/independent-endpoint';

function textEvents(input: RunAgentInput, text: string): AGUIEvent[] {
  return [
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'answer',
      role: 'assistant',
    },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'answer', delta: text },
    { type: EventType.TEXT_MESSAGE_END, messageId: 'answer' },
    {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
    },
  ];
}

for (const scenario of ['plain', 'tool', 'structured', 'ui'] as const) {
  test(`independent HTTP endpoint supports ${scenario}`, async ({ page }) => {
    const endpoint = await startIndependentEndpoint({
      extended: scenario === 'structured' || scenario === 'ui',
      events: (input) => {
        if (
          scenario === 'tool' &&
          !input.messages.some((message) => message.role === 'tool')
        ) {
          return [
            {
              type: EventType.RUN_STARTED,
              threadId: input.threadId,
              runId: input.runId,
            },
            {
              type: EventType.TOOL_CALL_START,
              toolCallId: 'weather',
              toolCallName: 'getWeather',
              parentMessageId: 'lookup',
            },
            {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: 'weather',
              delta: '{"city":"Paris"}',
            },
            { type: EventType.TOOL_CALL_END, toolCallId: 'weather' },
            {
              type: EventType.RUN_FINISHED,
              threadId: input.threadId,
              runId: input.runId,
            },
          ];
        }
        return textEvents(
          input,
          scenario === 'structured'
            ? '{"answer":"Ready","count":2}'
            : scenario === 'ui'
              ? '{"ui":[{"status":{"props":{"title":"Ready","count":2}}}]}'
              : 'Ready',
        );
      },
    });
    const hygiene = installBrowserHygiene(page);
    const driver = createAppDriver(page);

    try {
      await page.goto(
        `/?${new URLSearchParams({ runUrl: endpoint.url, scenario, retries: '0' })}`,
      );
      await expect(page.getByTestId('fixture-ready')).toBeVisible();

      await driver.send('Show status');

      if (scenario === 'structured') {
        await expect(driver.structuredAnswer()).toHaveText('Ready');
        await expect(driver.structuredCount()).toHaveText('2');
      } else if (scenario === 'ui') {
        await expect(driver.statusCard()).toHaveText('Ready: 2');
      } else {
        await expect(driver.assistant()).toHaveText('Ready');
      }
      await driver.expectIdle();
      await expect(driver.error()).toBeEmpty();
      await expect(driver.sendingError()).toBeEmpty();
      await expect(driver.generatingError()).toBeEmpty();
      expect(endpoint.inputs).toHaveLength(scenario === 'tool' ? 2 : 1);
      const first = endpoint.inputs[0];
      expect(first.messages).toContainEqual(
        expect.objectContaining({ role: 'user', content: 'Show status' }),
      );
      if (scenario === 'structured' || scenario === 'ui') {
        expect(first.hashbrown?.responseSchema).toMatchObject({
          type: 'object',
          additionalProperties: false,
          required: scenario === 'ui' ? ['ui'] : ['count', 'answer'],
          properties:
            scenario === 'ui'
              ? {
                  ui: {
                    type: 'array',
                    items: {
                      anyOf: [
                        {
                          type: 'object',
                          required: ['status'],
                          additionalProperties: false,
                          properties: {
                            status: {
                              type: 'object',
                              required: ['props'],
                              additionalProperties: false,
                              properties: {
                                props: {
                                  type: 'object',
                                  required: ['count', 'title'],
                                  additionalProperties: false,
                                  properties: {
                                    title: { type: 'string' },
                                    count: { type: 'number' },
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                }
              : {
                  answer: { type: 'string', description: 'Answer text' },
                  count: { type: 'number', description: 'Result count' },
                },
        });
        expect(first.hashbrown?.ui).toBe(scenario === 'ui' ? true : undefined);
      } else {
        expect(first).not.toHaveProperty('hashbrown');
      }
      if (scenario === 'tool') {
        await expect(driver.toolCount()).toHaveText('1');
        const second = endpoint.inputs[1];
        for (const input of endpoint.inputs) {
          expect(input.tools).toEqual([
            {
              name: 'getWeather',
              description: 'Get the current weather for a city.',
              parameters: {
                $schema: 'http://json-schema.org/draft-07/schema#',
                type: 'object',
                description: 'Weather lookup',
                properties: {
                  city: {
                    type: 'string',
                    description: 'The city to get weather for',
                  },
                },
                required: ['city'],
                additionalProperties: false,
              },
            },
          ]);
        }
        expect(second.threadId).toBe(first.threadId);
        expect(second.runId).not.toBe(first.runId);
        expect(second.messages).toContainEqual(
          expect.objectContaining({
            role: 'assistant',
            toolCalls: [
              {
                id: 'weather',
                type: 'function',
                function: { name: 'getWeather', arguments: '{"city":"Paris"}' },
              },
            ],
          }),
        );
        expect(second.messages).toContainEqual(
          expect.objectContaining({
            role: 'tool',
            toolCallId: 'weather',
            content: JSON.stringify({
              city: 'Paris',
              temperatureC: 21,
              condition: 'sunny',
            }),
          }),
        );
      }
      await hygiene.assertClean();
    } finally {
      await endpoint.stop();
    }
  });
}
