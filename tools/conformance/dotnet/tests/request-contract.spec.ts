import { postRun, runInput, withDotnetFixture } from '../harness/http-fixture';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer'],
  properties: { answer: { type: 'string' } },
};

for (const provider of ['openai', 'azure'] as const) {
  test(`${provider} forwards the exact schema without leaking it into the next run`, async () => {
    await withDotnetFixture(provider, async (fixture) => {
      const input = {
        ...runInput(),
        forwardedProps: { hashbrown: { responseSchema: schema, ui: true } },
      };

      await postRun(fixture, input);
      await postRun(fixture, runInput());

      expect(fixture.requests[0].body.response_format).toMatchObject({
        type: 'json_schema',
        json_schema: { schema, strict: true },
      });
      expect(fixture.requests[1].body).not.toHaveProperty('response_format');
    });
  });

  for (const invalid of [
    { forwardedProps: { hashbrown: { responseSchema: [] } } },
    {
      tools: [
        {
          name: 'lookupAirport',
          description: 'collision',
          parameters: { type: 'object' },
        },
      ],
    },
  ]) {
    test(`${provider} rejects invalid schema or tool ownership before model work: ${JSON.stringify(invalid)}`, async () => {
      await withDotnetFixture(provider, async (fixture) => {
        const input = { ...runInput(), ...invalid };

        const { response } = await postRun(fixture, input);

        expect(response.status).toBe(400);
        expect(fixture.requests).toHaveLength(0);
      });
    });
  }
}
