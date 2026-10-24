import { postRun, runInput, withDotnetFixture } from '../harness/http-fixture';

const browserTool = {
  name: 'getWeather',
  description: 'Get weather',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
    additionalProperties: false,
  },
};

for (const provider of ['openai', 'azure'] as const) {
  test(`${provider} rejects simultaneous browser and server calls without server effects`, async () => {
    await withDotnetFixture(provider, async (fixture) => {
      fixture.mock.onMessage('Parallel fixture', {
        toolCalls: [
          {
            id: 'parallel-server',
            name: 'lookupAirport',
            arguments: { code: 'PDX' },
          },
          {
            id: 'parallel-browser',
            name: 'getWeather',
            arguments: { city: 'Paris' },
          },
        ],
      });

      const result = await postRun(fixture, {
        ...runInput('Parallel fixture'),
        tools: [browserTool],
      });

      expect(result.events.at(-1)).toMatchObject({ type: 'RUN_ERROR' });
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ server: 0 });
      expect(fixture.requests).toHaveLength(1);
    });
  });

  test(`${provider} executes a registered server function and returns its result to the model`, async () => {
    await withDotnetFixture(provider, async (fixture) => {
      fixture.mock.onToolResult('airport-1', { content: 'Airport found' });
      fixture.mock.onMessage('Lookup fixture', {
        toolCalls: [
          {
            id: 'airport-1',
            name: 'lookupAirport',
            arguments: { code: 'PDX' },
          },
        ],
      });

      const { events } = await postRun(fixture, runInput('Lookup fixture'));
      const counters = await fetch(`${fixture.url}/__test/counters`);

      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'TOOL_CALL_RESULT',
          toolCallId: 'airport-1',
        }),
      );
      expect(counters.status).toBe(200);
      expect(await counters.json()).toMatchObject({ server: 1 });
      expect(fixture.requests).toHaveLength(2);
      expect(fixture.requests[1].body.messages).toContainEqual(
        expect.objectContaining({ role: 'tool', tool_call_id: 'airport-1' }),
      );
    });
  });

  test(`${provider} leaves browser tools to the client and continues without duplicating history`, async () => {
    await withDotnetFixture(provider, async (fixture) => {
      fixture.mock.onToolResult('weather-1', { content: 'Sunny' });
      fixture.mock.onMessage('Weather fixture', {
        toolCalls: [
          { id: 'weather-1', name: 'getWeather', arguments: { city: 'Paris' } },
        ],
      });
      const input = { ...runInput('Weather fixture'), tools: [browserTool] };

      const first = await postRun(fixture, input);
      const second = await postRun(fixture, {
        ...input,
        runId: crypto.randomUUID(),
        messages: [
          ...input.messages,
          {
            id: 'assistant',
            role: 'assistant',
            toolCalls: [
              {
                id: 'weather-1',
                type: 'function',
                function: { name: 'getWeather', arguments: '{"city":"Paris"}' },
              },
            ],
          },
          {
            id: 'result',
            role: 'tool',
            toolCallId: 'weather-1',
            content: '{"temperatureC":21}',
          },
        ],
      });

      expect(first.events).toContainEqual(
        expect.objectContaining({
          type: 'TOOL_CALL_START',
          toolCallId: 'weather-1',
        }),
      );
      expect(first.events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
      if (second.events.some((event) => event.type === 'RUN_ERROR'))
        throw new Error(
          JSON.stringify({
            events: second.events,
            requests: fixture.requests,
            logs: fixture.diagnostics(),
          }),
        );
      expect(
        second.events
          .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
          .map((event) => event.delta)
          .join(''),
      ).toBe('Sunny');
      expect(fixture.requests).toHaveLength(2);
      const history = fixture.requests[1].body.messages as Array<{
        role: string;
      }>;
      expect(history.filter((message) => message.role === 'user')).toHaveLength(
        1,
      );
      expect(history.filter((message) => message.role === 'tool')).toHaveLength(
        1,
      );
    });
  });
}
