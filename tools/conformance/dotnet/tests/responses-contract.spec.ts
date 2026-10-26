import { postRun, runInput, withDotnetFixture } from '../harness/http-fixture';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer'],
  properties: { answer: { type: 'string' } },
};

for (const provider of ['openai', 'azure'] as const) {
  test(`${provider} selects native stateless Responses and keeps schemas request-local`, async () => {
    await withDotnetFixture(
      provider,
      async (fixture) => {
        const first = await postRun(fixture, {
          ...runInput(),
          forwardedProps: { hashbrown: { responseSchema: schema } },
        });
        const second = await postRun(fixture, {
          ...runInput(),
          forwardedProps: {
            hashbrown: { modelApi: 'chat-completions' },
            ModelApi: 'chat-completions',
          },
        });

        for (const result of [first, second]) {
          expect(result.events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
          expect(
            result.events
              .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
              .map((event) => event.delta)
              .join(''),
          ).toBe('Hello from .NET');
        }
        expect(fixture.requests).toHaveLength(2);
        for (const request of fixture.requests) {
          expect(request.path).toBe(
            provider === 'openai' ? '/v1/responses' : '/openai/v1/responses',
          );
          expect(request.authentication).toBe('bearer');
          expect(request.body).toMatchObject({
            store: false,
            stream: true,
            model:
              provider === 'openai'
                ? 'fixture-openai-model'
                : 'fixture-azure-deployment',
          });
          expect(request.body).not.toHaveProperty('previous_response_id');
          expect(request.body).not.toHaveProperty('conversation');
          expect(request.body).not.toHaveProperty('messages');
        }
        expect(fixture.requests[0].body.text).toEqual({
          format: {
            type: 'json_schema',
            name: 'hashbrown',
            schema,
            strict: true,
          },
        });
        expect(fixture.requests[1].body).not.toHaveProperty('text.format');
      },
      '',
      undefined,
      { ModelApi: 'responses' },
    );
  });

  for (const api of [undefined, 'chat-completions']) {
    test(`${provider} keeps ${api ?? 'omitted'} selector on Chat Completions despite browser overrides`, async () => {
      await withDotnetFixture(
        provider,
        async (fixture) => {
          const result = await postRun(fixture, {
            ...runInput(),
            forwardedProps: {
              ModelApi: 'responses',
              hashbrown: { modelApi: 'responses' },
            },
          });

          expect(result.events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
          expect(fixture.requests).toHaveLength(1);
          expect(fixture.requests[0].path).toMatch(
            provider === 'openai'
              ? /^\/v1\/chat\/completions$/
              : /^\/openai\/deployments\/fixture-azure-deployment\/chat\/completions\?api-version=/,
          );
        },
        '',
        undefined,
        api ? { ModelApi: api } : {},
      );
    });
  }

  test(`${provider} pairs browser function outputs by native call ID on continuation`, async () => {
    await withDotnetFixture(
      provider,
      async (fixture) => {
        fixture.mock.onToolResult('weather-native', { content: 'Sunny' });
        fixture.mock.onMessage('Native weather', {
          toolCalls: [
            {
              id: 'weather-native',
              name: 'getWeather',
              arguments: { city: 'Paris' },
            },
          ],
        });
        const input = {
          ...runInput('Native weather'),
          tools: [
            {
              name: 'getWeather',
              description: 'Read weather',
              parameters: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
                additionalProperties: false,
              },
            },
          ],
        };

        const first = await postRun(fixture, input);
        const second = await postRun(fixture, {
          ...input,
          runId: crypto.randomUUID(),
          messages: [
            ...input.messages,
            {
              id: 'native-assistant',
              role: 'assistant',
              toolCalls: [
                {
                  id: 'weather-native',
                  type: 'function',
                  function: {
                    name: 'getWeather',
                    arguments: '{"city":"Paris"}',
                  },
                },
              ],
            },
            {
              id: 'native-result',
              role: 'tool',
              toolCallId: 'weather-native',
              content: '{"temperatureC":21}',
            },
          ],
        });

        if (
          !second.events.some((event) => event.type === 'TEXT_MESSAGE_CONTENT')
        )
          throw new Error(
            JSON.stringify({
              events: second.events,
              requests: fixture.requests,
              logs: fixture.diagnostics(),
            }),
          );
        expect(first.events).toContainEqual(
          expect.objectContaining({
            type: 'TOOL_CALL_START',
            toolCallId: 'weather-native',
            toolCallName: 'getWeather',
          }),
        );
        expect(
          second.events
            .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
            .map((event) => event.delta)
            .join(''),
        ).toBe('Sunny');
        expect(fixture.requests).toHaveLength(2);
        const history = fixture.requests[1].body.input as Record<
          string,
          unknown
        >[];
        expect(history.filter((item) => item.type === 'function_call')).toEqual(
          [
            expect.objectContaining({
              call_id: 'weather-native',
              name: 'getWeather',
            }),
          ],
        );
        expect(
          JSON.parse(
            history.find((item) => item.type === 'function_call')!
              .arguments as string,
          ),
        ).toEqual({ city: 'Paris' });
        expect(
          history.filter((item) => item.type === 'function_call_output'),
        ).toEqual([
          expect.objectContaining({
            call_id: 'weather-native',
            output: '{"temperatureC":21}',
          }),
        ]);
        expect(history.filter((item) => item.role === 'user')).toHaveLength(1);
        for (const request of fixture.requests) {
          expect(request.body.store).toBe(false);
          expect(request.body).not.toHaveProperty('previous_response_id');
          expect(request.body).not.toHaveProperty('conversation');
        }
        expect(
          await (await fetch(`${fixture.url}/__test/counters`)).json(),
        ).toMatchObject({ server: 0 });
      },
      '',
      undefined,
      { ModelApi: 'responses' },
    );
  });

  test(`${provider} rejects an invalid trusted API selector before model work`, async () => {
    await expect(
      withDotnetFixture(
        provider,
        async (fixture) => {
          await postRun(fixture, runInput());
          expect(fixture.requests).toHaveLength(0);
        },
        '',
        undefined,
        { ModelApi: 'typo' },
      ),
    ).rejects.toThrow('ModelApi must be responses or chat-completions');
  });

  test(`${provider} retains native function call and output IDs with full stateless input`, async () => {
    await withDotnetFixture(
      provider,
      async (fixture) => {
        fixture.mock.onToolResult('airport-native', {
          content: 'Airport found',
        });
        fixture.mock.onMessage('Native lookup', {
          toolCalls: [
            {
              id: 'airport-native',
              name: 'lookupAirport',
              arguments: { code: 'PDX' },
            },
          ],
        });

        const result = await postRun(fixture, runInput('Native lookup'));

        expect(result.events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
        expect(fixture.requests).toHaveLength(2);
        for (const request of fixture.requests) {
          expect(request.body.store).toBe(false);
          expect(request.body).not.toHaveProperty('previous_response_id');
          expect(request.body).not.toHaveProperty('conversation');
        }
        const history = fixture.requests[1].body.input as Record<
          string,
          unknown
        >[];
        expect(history.filter((item) => item.type === 'function_call')).toEqual(
          [
            expect.objectContaining({
              call_id: 'airport-native',
              name: 'lookupAirport',
            }),
          ],
        );
        expect(
          JSON.parse(
            history.find((item) => item.type === 'function_call')!
              .arguments as string,
          ),
        ).toEqual({ code: 'PDX' });
        expect(
          history.filter((item) => item.type === 'function_call_output'),
        ).toEqual([
          expect.objectContaining({
            call_id: 'airport-native',
            output: expect.stringContaining('PDX'),
          }),
        ]);
        expect(history.filter((item) => item.role === 'user')).toHaveLength(1);
        expect(fixture.requests[0].body.tools).toContainEqual(
          expect.objectContaining({ type: 'function', name: 'lookupAirport' }),
        );
      },
      '',
      undefined,
      { ModelApi: 'responses' },
    );
  });
}
