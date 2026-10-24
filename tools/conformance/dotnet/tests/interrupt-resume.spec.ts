import { EventSchemas } from '@ag-ui/core/schemas';
import { postRun, runInput, withDotnetFixture } from '../harness/http-fixture';

function decisions(
  events: ReadonlyArray<Record<string, unknown>>,
  status = 'resolved',
  approved = true,
) {
  const terminal = events.at(-1) as {
    outcome?: { interrupts?: Array<{ id: string }> };
  };
  return (terminal.outcome?.interrupts ?? []).map(({ id }) => ({
    interruptId: id,
    status,
    ...(status === 'resolved' ? { payload: { approved } } : {}),
  }));
}

for (const provider of ['openai', 'azure'] as const) {
  test(`${provider} can interrupt after a browser tool without replaying it`, async () => {
    await withDotnetFixture(
      provider,
      async (fixture) => {
        fixture.mock.onToolResult('browser-before-confirm', {
          content: 'Confirmed completion',
        });
        const input = {
          ...runInput('Mixed confirmation'),
          tools: [
            {
              name: 'getWeather',
              description: 'Weather',
              parameters: {
                type: 'object',
                properties: {},
                additionalProperties: false,
              },
            },
          ],
          messages: [
            { id: 'u', role: 'user', content: 'Mixed confirmation' },
            {
              id: 'a',
              role: 'assistant',
              toolCalls: [
                {
                  id: 'browser-before-confirm',
                  type: 'function',
                  function: { name: 'getWeather', arguments: '{}' },
                },
              ],
            },
            {
              id: 't',
              role: 'tool',
              toolCallId: 'browser-before-confirm',
              content: '{"temperatureC":21}',
            },
          ],
        };

        const interrupted = await postRun(fixture, input);

        expect(interrupted.events.at(-1)).toMatchObject({
          outcome: { type: 'interrupt' },
        });
        expect(fixture.requests).toHaveLength(0);

        const resumed = await postRun(fixture, {
          ...input,
          runId: crypto.randomUUID(),
          resume: decisions(interrupted.events),
        });

        expect(resumed.events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
        expect(fixture.requests).toHaveLength(1);
        expect(
          (fixture.requests[0].body.messages as Array<{ role: string }>).filter(
            (message) => message.role === 'tool',
          ),
        ).toHaveLength(1);
      },
      'after-tool',
    );
  });

  test(`${provider} serializes native interrupts and resumes a complete batch once`, async () => {
    await withDotnetFixture(
      provider,
      async (fixture) => {
        const input = runInput();

        const first = await postRun(fixture, input);

        expect(first.events.at(-1)).toMatchObject({
          type: 'RUN_FINISHED',
          outcome: { type: 'interrupt' },
        });
        for (const event of first.events) EventSchemas.parse(event);
        expect(decisions(first.events)).toHaveLength(2);
        expect(fixture.requests).toHaveLength(0);

        const resumed = {
          ...input,
          runId: crypto.randomUUID(),
          resume: decisions(first.events),
        };
        const second = await postRun(fixture, resumed);
        if (second.events.some((event) => event.type === 'RUN_ERROR'))
          throw new Error(
            JSON.stringify({
              events: second.events,
              requests: fixture.requests,
              logs: fixture.diagnostics(),
            }),
          );
        const duplicate = await postRun(fixture, {
          ...resumed,
          runId: crypto.randomUUID(),
        });

        expect(second.events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
        expect(
          second.events.some((event) => event.type === 'TEXT_MESSAGE_CONTENT'),
        ).toBe(true);
        expect(duplicate.response.status).toBe(409);
        expect(fixture.requests).toHaveLength(1);
      },
      'confirm',
    );
  });

  for (const decision of ['decline', 'cancel'] as const) {
    test(`${provider} ${decision} abandons the pending action without model work`, async () => {
      await withDotnetFixture(
        provider,
        async (fixture) => {
          const input = runInput();
          const first = await postRun(fixture, input);

          const result = await postRun(fixture, {
            ...input,
            runId: crypto.randomUUID(),
            resume: decisions(
              first.events,
              decision === 'cancel' ? 'cancelled' : 'resolved',
              false,
            ),
          });

          expect(first.events.at(-1)).toMatchObject({
            outcome: { type: 'interrupt' },
          });
          expect(result.events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
          expect(fixture.requests).toHaveLength(0);
        },
        'confirm',
      );
    });
  }

  test(`${provider} validates the whole batch before consuming it`, async () => {
    await withDotnetFixture(
      provider,
      async (fixture) => {
        const input = runInput();
        const first = await postRun(fixture, input);
        const answers = decisions(first.events);

        const incomplete = await postRun(fixture, {
          ...input,
          resume: answers.slice(0, 1),
        });
        const valid = await postRun(fixture, {
          ...input,
          resume: answers,
          runId: crypto.randomUUID(),
        });

        expect(incomplete.response.status).toBe(400);
        expect(valid.response.status).toBe(200);
        expect(fixture.requests).toHaveLength(1);
      },
      'confirm',
    );
  });
}
