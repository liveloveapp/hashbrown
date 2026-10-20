import type { OpenAIHashbrownRunAgentInput } from './text.fn';
import { mapInput } from './openai-input';
import { createOpenAIRequestOptions } from './openai-request';

function createInput(
  overrides: Partial<OpenAIHashbrownRunAgentInput> = {},
): OpenAIHashbrownRunAgentInput {
  return {
    threadId: 't-1',
    runId: 'r-1',
    state: {},
    messages: [{ id: 'm-1', role: 'user', content: 'Hi' }],
    tools: [],
    context: [],
    forwardedProps: {},
    ...overrides,
  };
}

test('builds a stateless streaming Responses request', () => {
  const input = createInput();

  const options = createOpenAIRequestOptions(input, 'gpt-4.1', undefined);

  expect(options).toEqual({
    stream: true,
    model: 'gpt-4.1',
    store: false,
    input: mapInput(input.messages),
  });
  expect('tools' in options).toBe(false);
});

test('maps tools to strict function tools', () => {
  const parameters = {
    type: 'object',
    properties: { city: { type: 'string' } },
  };
  const input = createInput({
    tools: [
      { name: 'getWeather', description: 'Gets weather', parameters },
      { name: 'ping', description: 'Pings' } as never,
    ],
  });

  const options = createOpenAIRequestOptions(input, 'gpt-4.1', undefined);

  expect(options.tools).toEqual([
    {
      type: 'function',
      name: 'getWeather',
      description: 'Gets weather',
      parameters,
      strict: true,
    },
    {
      type: 'function',
      name: 'ping',
      description: 'Pings',
      parameters: null,
      strict: true,
    },
  ]);
  expect((options.tools?.[0] as { parameters: unknown }).parameters).not.toBe(
    parameters,
  );
});

test('maps the response schema to text.format', () => {
  const schema = { type: 'object', properties: {} };
  const withSchema = createInput({
    forwardedProps: { hashbrown: { responseSchema: schema } },
  });

  const options = createOpenAIRequestOptions(withSchema, 'gpt-4.1', undefined);
  const without = createOpenAIRequestOptions(
    createInput(),
    'gpt-4.1',
    undefined,
  );

  expect(options.text).toEqual({
    format: { type: 'json_schema', name: 'schema', schema, strict: true },
  });
  expect('text' in without).toBe(false);
});

test('requests summaries and encrypted reasoning for reasoning models', () => {
  const input = createInput();

  const reasoning = createOpenAIRequestOptions(input, 'gpt-5-mini', undefined);
  const plain = createOpenAIRequestOptions(input, 'gpt-4.1', undefined);

  expect(reasoning.reasoning).toEqual({ summary: 'auto' });
  expect(reasoning.include).toEqual(['reasoning.encrypted_content']);
  expect('reasoning' in plain).toBe(false);
  expect('include' in plain).toBe(false);
});

test('honours reasoning: false and an explicit object', () => {
  const input = createInput();

  const off = createOpenAIRequestOptions(input, 'gpt-5-mini', false);
  const explicit = createOpenAIRequestOptions(input, 'gpt-5-mini', {
    effort: 'low',
  });

  expect('reasoning' in off).toBe(false);
  expect('include' in off).toBe(false);
  expect(explicit.reasoning).toEqual({ effort: 'low', summary: 'auto' });
  expect(explicit.include).toEqual(['reasoning.encrypted_content']);
});
