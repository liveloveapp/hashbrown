import { EventSchemas } from '@ag-ui/core/schemas';
import { postRun, runInput, withDotnetFixture } from '../harness/http-fixture';

for (const provider of ['openai', 'azure'] as const) {
  test(`streams real ${provider} SDK output through the .NET AG-UI host`, async () => {
    await withDotnetFixture(provider, async (fixture) => {
      const input = runInput();

      const { response, events } = await postRun(fixture, input);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(
        'text/event-stream',
      );
      for (const event of events) EventSchemas.parse(event);
      expect(events[0]).toMatchObject({
        type: 'RUN_STARTED',
        runId: input.runId,
        threadId: input.threadId,
        protocolVersion: '1.0',
      });
      expect(
        events
          .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
          .map((event) => event.delta)
          .join(''),
      ).toBe('Hello from .NET');
      expect(events.at(-1)).toMatchObject({
        type: 'RUN_FINISHED',
        runId: input.runId,
      });
      expect(fixture.requests).toHaveLength(1);
      expect(fixture.requests[0]).toMatchObject({
        authentication: provider === 'azure' ? 'api-key' : 'bearer',
      });
      expect(fixture.requests[0].path).toMatch(
        provider === 'azure'
          ? /^\/openai\/deployments\/fixture-azure-deployment\/chat\/completions\?api-version=/
          : /^\/v1\/chat\/completions$/,
      );
    });
  });
}
