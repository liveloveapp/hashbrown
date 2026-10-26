import { postRun, runInput, withDotnetFixture } from '../harness/http-fixture';

for (const provider of ['openai', 'azure'] as const) {
  for (const api of ['chat-completions', 'responses'] as const) {
    test(`${provider} ${api} retains fresh browser tool declarations on every native model turn`, async () => {
      await withDotnetFixture(
        provider,
        async (fixture) => {
          fixture.mock.onToolResult('weather-schema', { content: 'Sunny' });
          fixture.mock.onMessage('Weather schema', {
            toolCalls: [
              {
                id: 'weather-schema',
                name: 'getWeather',
                arguments: { city: 'Paris', unit: 'celsius' },
              },
            ],
          });
          fixture.mock.onMessage('Fresh weather schema', { content: 'Ready' });
          const weather = {
            name: 'getWeather',
            description: 'Read current weather for the supplied city and unit.',
            parameters: {
              type: 'object',
              properties: {
                city: { type: 'string', description: 'City to inspect' },
                unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
              },
              required: ['city', 'unit'],
              additionalProperties: false,
            },
          };
          const input = { ...runInput('Weather schema'), tools: [weather] };
          const original = structuredClone(input);
          const freshWeather = {
            ...weather,
            description:
              'Read the latest weather using the updated city schema.',
            parameters: {
              ...weather.parameters,
              properties: {
                ...weather.parameters.properties,
                city: {
                  type: 'string',
                  description: 'Updated city description',
                },
              },
            },
          };

          const first = await postRun(fixture, input);
          const continuation = await postRun(fixture, {
            ...input,
            runId: crypto.randomUUID(),
            messages: [
              ...input.messages,
              {
                id: 'weather-assistant',
                role: 'assistant',
                toolCalls: [
                  {
                    id: 'weather-schema',
                    type: 'function',
                    function: {
                      name: 'getWeather',
                      arguments: '{"city":"Paris","unit":"celsius"}',
                    },
                  },
                ],
              },
              {
                id: 'weather-result',
                role: 'tool',
                toolCallId: 'weather-schema',
                content: '{"temperature":21,"unit":"celsius"}',
              },
            ],
          });
          const later = await postRun(fixture, {
            ...runInput('Fresh weather schema'),
            tools: [freshWeather],
          });

          expect(first.events).toContainEqual(
            expect.objectContaining({
              type: 'TOOL_CALL_START',
              toolCallName: 'getWeather',
              toolCallId: 'weather-schema',
            }),
          );
          for (const result of [first, continuation, later]) {
            expect(result.events.at(-1)).toMatchObject({
              type: 'RUN_FINISHED',
            });
          }
          expect(
            continuation.events
              .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
              .map((event) => event.delta)
              .join(''),
          ).toBe('Sunny');
          expect(fixture.requests).toHaveLength(3);
          for (const [index, request] of fixture.requests.entries()) {
            const tools = request.body.tools as Record<string, unknown>[];
            const functions = tools.map((tool) =>
              api === 'responses'
                ? tool
                : (tool.function as Record<string, unknown>),
            );
            const expected = index === 2 ? freshWeather : weather;

            expect(
              functions.filter((tool) => tool.name === 'getWeather'),
            ).toEqual([expect.objectContaining(expected)]);
            expect(
              functions.filter((tool) => tool.name === 'lookupAirport'),
            ).toHaveLength(1);
          }
          expect(input).toEqual(original);
          expect(
            await (await fetch(`${fixture.url}/__test/counters`)).json(),
          ).toMatchObject({ server: 0 });
        },
        '',
        undefined,
        { ModelApi: api },
      );
    });
  }
}
