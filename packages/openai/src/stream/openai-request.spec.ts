import type { OpenAIHashbrownRunAgentInput } from './types';
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

test('webSearch adds the web_search tool and requests its sources', () => {
  const input = createInput({
    tools: [{ name: 'ping', description: 'Pings', parameters: {} }],
  });

  const options = createOpenAIRequestOptions(input, 'gpt-4.1', undefined, {
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

  const options = createOpenAIRequestOptions(input, 'gpt-5-mini', undefined, {
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

  const options = createOpenAIRequestOptions(input, 'gpt-4.1', undefined, {
    webSearch: config,
  });

  expect(options.tools).toEqual([{ type: 'web_search', ...config }]);
});

test('no builtInTools leaves the request unchanged', () => {
  const input = createInput();

  const options = createOpenAIRequestOptions(input, 'gpt-4.1', undefined, {});

  expect('tools' in options).toBe(false);
  expect('include' in options).toBe(false);
});

test('codeExecution enables an automatic container and requests outputs', () => {
  const input = createInput();
  const builtInTools = { codeExecution: true as const };

  const options = createOpenAIRequestOptions(
    input,
    'gpt-4.1',
    undefined,
    builtInTools,
  );

  expect(options.tools).toEqual([
    { type: 'code_interpreter', container: { type: 'auto' } },
  ]);
  expect(options.include).toEqual(['code_interpreter_call.outputs']);
  expect(options.stream).toBe(true);
  expect(options.store).toBe(false);
});

test('codeExecution deeply clones frozen automatic container configuration', () => {
  const fileIds = ['file-1'];
  const container = {
    type: 'auto' as const,
    file_ids: fileIds,
    memory_limit: '4g' as const,
  };
  const allowedCallers: 'direct'[] = ['direct'];
  const config = { container, allowed_callers: allowedCallers };
  const builtInTools = { codeExecution: config };
  const input = createInput();
  Object.freeze(fileIds);
  Object.freeze(container);
  Object.freeze(allowedCallers);
  Object.freeze(config);
  Object.freeze(builtInTools);
  Object.freeze(input);

  const options = createOpenAIRequestOptions(
    input,
    'gpt-4.1',
    undefined,
    builtInTools,
  );

  expect(options.tools).toEqual([{ type: 'code_interpreter', ...config }]);
  const tool = options.tools?.[0];
  expect(tool).not.toBe(config);
  if (tool?.type !== 'code_interpreter' || typeof tool.container === 'string') {
    throw new Error('Expected an automatic code interpreter container');
  }
  expect(tool.container).not.toBe(container);
  expect(tool.container.file_ids).not.toBe(fileIds);
  expect(tool.allowed_callers).not.toBe(allowedCallers);
  tool.container.file_ids?.push('file-2');
  tool.allowed_callers?.push('direct');
  expect(fileIds).toEqual(['file-1']);
  expect(allowedCallers).toEqual(['direct']);
});

test('codeExecution preserves an explicit native container ID', () => {
  const config = Object.freeze({ container: 'cntr-retained' });
  const builtInTools = Object.freeze({
    codeExecution: config,
  });

  const options = createOpenAIRequestOptions(
    createInput(),
    'gpt-4.1',
    undefined,
    builtInTools,
  );

  expect(options.tools).toEqual([
    { type: 'code_interpreter', container: 'cntr-retained' },
  ]);
  expect(options.tools?.[0]).not.toBe(config);
  expect(options.include).toEqual(['code_interpreter_call.outputs']);
});

test('codeExecution coexists with app tools, web search, reasoning and structured output', () => {
  const schema = { type: 'object', properties: { answer: { type: 'string' } } };
  const parameters = { type: 'object', properties: {} };
  const input = createInput({
    tools: [{ name: 'code_interpreter', description: 'App tool', parameters }],
    forwardedProps: { hashbrown: { responseSchema: schema } },
  });

  const options = createOpenAIRequestOptions(input, 'gpt-5-mini', undefined, {
    webSearch: true,
    codeExecution: true,
  });

  expect(options.tools).toEqual([
    {
      type: 'function',
      name: 'code_interpreter',
      description: 'App tool',
      parameters,
      strict: true,
    },
    { type: 'web_search' },
    { type: 'code_interpreter', container: { type: 'auto' } },
  ]);
  expect(options.include).toEqual([
    'reasoning.encrypted_content',
    'web_search_call.action.sources',
    'code_interpreter_call.outputs',
  ]);
  expect(options.reasoning).toEqual({ summary: 'auto' });
  expect(options.text).toEqual({
    format: { type: 'json_schema', name: 'schema', schema, strict: true },
  });
  expect(
    options.text?.format?.type === 'json_schema' && options.text.format.schema,
  ).not.toBe(schema);
  expect(options.stream).toBe(true);
  expect(options.store).toBe(false);
});

test('omitting codeExecution adds no tools or includes', () => {
  const input = createInput();

  const options = createOpenAIRequestOptions(input, 'gpt-4.1', undefined, {});

  expect('tools' in options).toBe(false);
  expect('include' in options).toBe(false);
});
