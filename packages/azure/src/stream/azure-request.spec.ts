import type { AzureHashbrownRunAgentInput } from './types';
import { mapInput } from './azure-input';
import { createAzureRequestOptions } from './azure-request';

function createInput(
  overrides: Partial<AzureHashbrownRunAgentInput> = {},
): AzureHashbrownRunAgentInput {
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

  const options = createAzureRequestOptions(input, 'gpt-4.1', undefined);

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

  const options = createAzureRequestOptions(input, 'gpt-4.1', undefined);

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

  const options = createAzureRequestOptions(withSchema, 'gpt-4.1', undefined);
  const without = createAzureRequestOptions(
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

  const reasoning = createAzureRequestOptions(input, 'gpt-5-mini', undefined);
  const plain = createAzureRequestOptions(input, 'gpt-4.1', undefined);

  expect(reasoning.reasoning).toEqual({ summary: 'auto' });
  expect(reasoning.include).toEqual(['reasoning.encrypted_content']);
  expect('reasoning' in plain).toBe(false);
  expect('include' in plain).toBe(false);
});

test('honours reasoning: false and an explicit object', () => {
  const input = createInput();

  const off = createAzureRequestOptions(input, 'gpt-5-mini', false);
  const explicit = createAzureRequestOptions(input, 'gpt-5-mini', {
    effort: 'low',
  });

  expect('reasoning' in off).toBe(false);
  expect('include' in off).toBe(false);
  expect(explicit.reasoning).toEqual({ effort: 'low', summary: 'auto' });
  expect(explicit.include).toEqual(['reasoning.encrypted_content']);
});

test('requests summaries and encrypted reasoning for any deployment name when reasoning is true', () => {
  const input = createInput();

  const result = createAzureRequestOptions(input, 'support-assistant', true);

  expect(result.reasoning).toEqual({ summary: 'auto' });
  expect(result.include).toEqual(['reasoning.encrypted_content']);
});

test('webSearch adds the web_search tool and requests its sources', () => {
  const input = createInput({
    tools: [{ name: 'ping', description: 'Pings', parameters: {} }],
  });

  const options = createAzureRequestOptions(input, 'gpt-4.1', undefined, {
    webSearch: true,
  });

  expect(options.tools).toEqual([
    {
      type: 'function',
      name: 'ping',
      description: 'Pings',
      parameters: {},
      strict: true,
    },
    { type: 'web_search' },
  ]);
  expect(options.include).toEqual(['web_search_call.action.sources']);
});

test('webSearch keeps the reasoning include', () => {
  const input = createInput();

  const options = createAzureRequestOptions(input, 'gpt-5-mini', undefined, {
    webSearch: true,
  });

  expect(options.reasoning).toEqual({ summary: 'auto' });
  expect(options.include).toEqual([
    'reasoning.encrypted_content',
    'web_search_call.action.sources',
  ]);
});

test('webSearch passes the provider config through', () => {
  const input = createInput();
  const config = {
    search_context_size: 'low' as const,
    user_location: { type: 'approximate' as const, country: 'US' },
  };

  const options = createAzureRequestOptions(input, 'gpt-4.1', undefined, {
    webSearch: config,
  });

  expect(options.tools).toEqual([{ type: 'web_search', ...config }]);
});

test('no builtInTools leaves the request unchanged', () => {
  const input = createInput();

  const options = createAzureRequestOptions(input, 'gpt-4.1', undefined, {});

  expect('tools' in options).toBe(false);
  expect('include' in options).toBe(false);
});
