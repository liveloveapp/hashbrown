import { expect, test } from '@playwright/test';
import { createAppDriver } from '../../harness/app-driver';
import {
  durableEffects,
  projectModelApi,
  withDotnetFixture,
  withDurableCluster,
} from '../harness/browser-fixture';
import { expectNativeToolPairs } from '../harness/native-wire';
import { withRoutedEndpoint } from '../harness/routed-endpoint';

test('selects the project API and preserves browser tool schemas and exact native history', async ({
  page,
}, info) => {
  const provider = info.project.metadata['provider'] as 'openai' | 'azure';
  const api = projectModelApi();
  expect(['chat-completions', 'responses']).toContain(api);
  await withDotnetFixture(provider, async (fixture) => {
    const inputs: Array<{
      tools: Array<{ name: string; description: string; parameters: object }>;
    }> = [];
    page.on('request', (request) => {
      if (request.url() === `${fixture.url}/run` && request.method() === 'POST')
        inputs.push(request.postDataJSON());
    });
    fixture.mock.onToolResult('wire-weather', { content: 'Sunny' });
    fixture.mock.onMessage('Wire weather', {
      toolCalls: [
        {
          id: 'wire-weather',
          name: 'getWeather',
          arguments: { city: 'Paris' },
        },
      ],
    });
    const driver = createAppDriver(page);
    await page.goto(
      `/?${new URLSearchParams({ scenario: 'tool', runUrl: `${fixture.url}/run`, retries: '0' })}`,
    );

    await driver.send('Wire weather');
    await driver.expectIdle();
    await info.attach('native-requests', {
      body: JSON.stringify(fixture.requests, null, 2),
      contentType: 'application/json',
    });

    await expect(driver.assistant()).toHaveText('Sunny');
    await expect(driver.toolCount()).toHaveText('1');
    await driver.expectIdle();
    expect(fixture.requests).toHaveLength(2);
    for (const request of fixture.requests)
      expect(request.body.tools).toEqual(fixture.requests[0].body.tools);
    const tool = inputs[0].tools.find((item) => item.name === 'getWeather');
    expect(tool).toBeDefined();
    if (!tool) throw new Error('Browser request did not declare getWeather');
    if (api === 'responses') {
      expect(fixture.requests[0].body.tools).toContainEqual(
        expect.objectContaining({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        }),
      );
      const input = fixture.requests[1].body.input as Record<string, unknown>[];
      expect(input.filter((item) => item.type === 'function_call')).toEqual([
        expect.objectContaining({
          call_id: 'wire-weather',
          name: 'getWeather',
          arguments: expect.any(String),
        }),
      ]);
      expect(
        JSON.parse(
          input.find((item) => item.type === 'function_call')
            ?.arguments as string,
        ),
      ).toEqual({ city: 'Paris' });
      expect(
        input.filter((item) => item.type === 'function_call_output'),
      ).toEqual([
        expect.objectContaining({
          call_id: 'wire-weather',
          output: '{"city":"Paris","temperatureC":21,"condition":"sunny"}',
        }),
      ]);
      for (const request of fixture.requests) {
        expect(request.path).toBe(
          provider === 'openai' ? '/v1/responses' : '/openai/v1/responses',
        );
        expect(request.body.store).toBe(false);
        expect(request.body).not.toHaveProperty('previous_response_id');
        expect(request.body).not.toHaveProperty('conversation');
      }
    } else {
      expect(fixture.requests[0].body.tools).toContainEqual(
        expect.objectContaining({
          type: 'function',
          function: expect.objectContaining(tool),
        }),
      );
      const messages = fixture.requests[1].body.messages as Record<
        string,
        unknown
      >[];
      expect(messages.flatMap((message) => message.tool_calls ?? [])).toEqual([
        {
          id: 'wire-weather',
          type: 'function',
          function: { name: 'getWeather', arguments: expect.any(String) },
        },
      ]);
      const call = messages.flatMap(
        (message) => message.tool_calls ?? [],
      )[0] as { function: { arguments: string } };
      expect(JSON.parse(call.function.arguments)).toEqual({ city: 'Paris' });
      expect(messages.filter((message) => message.role === 'tool')).toEqual([
        expect.objectContaining({
          tool_call_id: 'wire-weather',
          content: '{"city":"Paris","temperatureC":21,"condition":"sunny"}',
        }),
      ]);
    }
  });
});

test('retains exact native browser and server history after recovered approval and a subsequent turn', async ({
  page,
}, info) => {
  const provider = info.project.metadata['provider'] as 'openai' | 'azure';
  const api = projectModelApi();
  expect(['chat-completions', 'responses']).toContain(api);
  await withDurableCluster(provider, async (cluster) => {
    const fixture = await cluster.start({ Workflow: 'after-tool' });
    fixture.mock.onToolResult('retained-weather', {
      content: 'Original answer retained',
    });
    fixture.mock.onToolResult('retained-airport', {
      toolCalls: [
        {
          id: 'retained-weather',
          name: 'getWeather',
          arguments: { city: 'Portland' },
        },
      ],
    });
    fixture.mock.onMessage('Retain native history', {
      toolCalls: [
        {
          id: 'retained-airport',
          name: 'lookupAirport',
          arguments: { code: 'PDX' },
        },
      ],
    });
    await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'tool', runUrl: endpoint.url, recoveryUrl: new URL(endpoint.url).origin, fixturePrincipal: 'alice', retries: '0' })}`,
      );
      const driver = createAppDriver(page);
      await driver.send('Retain native history');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      await expect(driver.toolCount()).toHaveText('1');
      expect(fixture.requests).toHaveLength(2);

      await page.reload();
      await page.getByTestId('refresh-recovery').click();

      await expect(page.getByTestId('recovery-status')).toHaveText('Pending');
      await expect(driver.toolCount()).toHaveText('0');
      expect(fixture.requests).toHaveLength(2);
      expect(await durableEffects(fixture)).toBe(0);
      await page.getByTestId('resume').click();
      await expect(driver.assistant()).toHaveText('Original answer retained');
      await driver.expectIdle();
      expect(fixture.requests).toHaveLength(3);
      expect(await durableEffects(fixture)).toBe(1);
      await driver.send('Hello fixture');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      expect(fixture.requests).toHaveLength(3);
      await page.getByTestId('resume').click();
      await expect(driver.assistant()).toHaveText('Hello from .NET');
      await driver.expectIdle();
      await expect(driver.toolCount()).toHaveText('0');
      expect(fixture.requests).toHaveLength(4);
      expect(await durableEffects(fixture)).toBe(2);
      await info.attach('native-history-requests', {
        body: JSON.stringify(fixture.requests, null, 2),
        contentType: 'application/json',
      });
      for (const request of fixture.requests)
        expect(request.body.tools).toEqual(fixture.requests[0].body.tools);
      const calls = [
        {
          id: 'retained-airport',
          name: 'lookupAirport',
          arguments: '{"code":"PDX"}',
          output: JSON.stringify(
            { code: 'PDX', name: 'Portland International Airport' },
            null,
            2,
          ),
        },
        {
          id: 'retained-weather',
          name: 'getWeather',
          arguments: '{"city":"Portland"}',
          output: '{"city":"Portland","temperatureC":21,"condition":"sunny"}',
        },
      ];
      for (const request of fixture.requests.slice(2)) {
        expectNativeToolPairs(request, api, calls);
        if (api === 'responses') {
          const input = request.body.input as Record<string, unknown>[];
          expect(input.filter((item) => item.role === 'system')).toHaveLength(
            1,
          );
          expect(input.filter((item) => item.role === 'user')).toHaveLength(
            request === fixture.requests[2] ? 1 : 2,
          );
          expect(input).toContainEqual(
            expect.objectContaining({
              role: 'system',
              content: expect.arrayContaining([
                expect.objectContaining({
                  text: 'Runtime smoke system prompt.',
                }),
              ]),
            }),
          );
          expect(input).toContainEqual(
            expect.objectContaining({
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({ text: 'Retain native history' }),
              ]),
            }),
          );
          if (request === fixture.requests[3]) {
            expect(input).toContainEqual(
              expect.objectContaining({
                role: 'user',
                content: expect.arrayContaining([
                  expect.objectContaining({ text: 'Hello fixture' }),
                ]),
              }),
            );
            expect(input).toContainEqual(
              expect.objectContaining({
                role: 'assistant',
                content: expect.arrayContaining([
                  expect.objectContaining({ text: 'Original answer retained' }),
                ]),
              }),
            );
          }
          expect(request.body.store).toBe(false);
          expect(request.body).not.toHaveProperty('previous_response_id');
          expect(request.body).not.toHaveProperty('conversation');
        } else {
          const messages = request.body.messages as Record<string, unknown>[];
          expect(
            messages.filter((message) => message.role === 'system'),
          ).toHaveLength(1);
          expect(
            messages.filter((message) => message.role === 'user'),
          ).toHaveLength(request === fixture.requests[2] ? 1 : 2);
          expect(messages).toContainEqual(
            expect.objectContaining({
              role: 'system',
              content: 'Runtime smoke system prompt.',
            }),
          );
          expect(messages).toContainEqual(
            expect.objectContaining({
              role: 'user',
              content: 'Retain native history',
            }),
          );
          if (request === fixture.requests[3]) {
            expect(messages).toContainEqual(
              expect.objectContaining({
                role: 'user',
                content: 'Hello fixture',
              }),
            );
            expect(messages).toContainEqual(
              expect.objectContaining({
                role: 'assistant',
                content: 'Original answer retained',
              }),
            );
          }
        }
      }
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ server: 1 });
    });
  });
});
