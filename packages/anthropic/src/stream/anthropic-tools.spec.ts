import {
  anthropicRunningStep,
  readAnthropicServerToolCall,
  readAnthropicServerToolResult,
} from './anthropic-tools';

function invocation(
  name = 'web_search',
  input: unknown = { query: 'KSFO weather' },
) {
  const call = readAnthropicServerToolCall(
    { type: 'server_tool_use', id: 'server-1', name, input },
    100,
  );
  if (!call) throw new Error('Expected a supported native invocation');
  return call;
}

test('classifies native server identity independently of an app tool name', () => {
  const client = { type: 'tool_use', id: 'app', name: 'web_search', input: {} };
  const native = {
    type: 'server_tool_use',
    id: 'server',
    name: 'bash_code_execution',
    input: {},
    caller: { type: 'code_execution_20260120', tool_id: 'parent' },
  };

  const app = readAnthropicServerToolCall(client, 100);
  const call = readAnthropicServerToolCall(native, 100);
  if (!call) throw new Error('Expected a code invocation');

  expect(app).toBeUndefined();
  expect(call).toMatchObject({
    id: 'server',
    builtin: 'code_execution',
    parentToolCallId: 'parent',
  });
  expect(anthropicRunningStep(call)).toEqual({
    v: 1,
    kind: 'provider',
    provider: 'anthropic',
    builtin: 'code_execution',
    status: 'running',
    startedAt: 100,
    parentToolCallId: 'parent',
    label: 'Running code',
    icon: 'code',
  });
});

test('normalizes search results with stable sources and readable content', () => {
  const call = invocation();
  const native = {
    type: 'web_search_tool_result',
    tool_use_id: call.id,
    content: [
      {
        type: 'web_search_result',
        url: 'https://weather.test/ksfo',
        title: 'KSFO weather',
        encrypted_content: 'opaque-search',
        page_age: null,
      },
    ],
  };

  const result = readAnthropicServerToolResult(call, native, 200);

  expect(result?.step).toEqual({
    v: 1,
    kind: 'provider',
    provider: 'anthropic',
    builtin: 'web_search',
    status: 'completed',
    startedAt: 100,
    settledAt: 200,
    queries: ['KSFO weather'],
    icon: 'search',
    label: "Searched 'KSFO weather' · 1 source",
    sources: [
      {
        id: 'server-1:0',
        kind: 'url',
        title: 'KSFO weather',
        href: 'https://weather.test/ksfo',
      },
    ],
  });
  expect(result?.content).toContain('KSFO weather');
  expect(result?.content).not.toContain('opaque-search');
  expect(native.content[0].encrypted_content).toBe('opaque-search');
});

test('fetch sources use the nested document title and retain readable text', () => {
  const call = invocation('web_fetch', { url: 'https://weather.test/ksfo' });
  const native = {
    type: 'web_fetch_tool_result',
    tool_use_id: call.id,
    content: {
      type: 'web_fetch_result',
      url: 'https://weather.test/ksfo',
      retrieved_at: null,
      content: {
        type: 'document',
        title: 'Weather report',
        source: { type: 'text', media_type: 'text/plain', data: 'Clear skies' },
        citations: { enabled: true },
      },
    },
  };

  const result = readAnthropicServerToolResult(call, native, 200);

  expect(result?.step.sources).toEqual([
    {
      id: 'server-1:0',
      kind: 'url',
      title: 'Weather report',
      href: 'https://weather.test/ksfo',
    },
  ]);
  expect(result?.content).toContain('Clear skies');
});

test.each([
  'code_execution_result',
  'encrypted_code_execution_result',
  'bash_code_execution_result',
])(
  'normalizes %s without leaking encrypted output into display content',
  (type) => {
    const call = invocation('code_execution', {});
    const content = {
      type,
      stderr: 'warning only',
      return_code: 0,
      ...(type === 'encrypted_code_execution_result'
        ? { encrypted_stdout: 'opaque-code' }
        : { stdout: '42' }),
      content: [
        {
          type:
            type === 'bash_code_execution_result'
              ? 'bash_code_execution_output'
              : 'code_execution_output',
          file_id: 'file-1',
        },
      ],
    };
    const native = {
      type:
        type === 'bash_code_execution_result'
          ? 'bash_code_execution_tool_result'
          : 'code_execution_tool_result',
      tool_use_id: call.id,
      content,
    };

    const result = readAnthropicServerToolResult(call, native, 200);

    expect(result?.step.status).toBe('completed');
    expect(result?.step.error).toBeUndefined();
    expect(result?.step.sources).toEqual([
      {
        id: 'server-1:0',
        kind: 'file',
        title: 'Output file 1',
        fileId: 'file-1',
      },
    ]);
    expect(result?.content).not.toContain('opaque-code');
    expect(result?.content).toContain('warning only');
  },
);

test.each([
  ['web_search', 'web_search_tool_result', 'web_search_tool_result_error'],
  ['web_fetch', 'web_fetch_tool_result', 'web_fetch_tool_result_error'],
  [
    'code_execution',
    'code_execution_tool_result',
    'code_execution_tool_result_error',
  ],
  [
    'bash_code_execution',
    'bash_code_execution_tool_result',
    'bash_code_execution_tool_result_error',
  ],
  [
    'text_editor_code_execution',
    'text_editor_code_execution_tool_result',
    'text_editor_code_execution_tool_result_error',
  ],
])('fails %s typed errors visibly', (name, type, errorType) => {
  const call = invocation(name, {});
  const native = {
    type,
    tool_use_id: call.id,
    content: {
      type: errorType,
      error_code: 'execution_time_exceeded',
      error_message: 'Timed out',
    },
  };

  const result = readAnthropicServerToolResult(call, native, 200);

  expect(result?.step).toMatchObject({
    status: 'failed',
    error: { message: expect.any(String), code: 'execution_time_exceeded' },
    startedAt: 100,
    settledAt: 200,
  });
  expect(result?.content).toContain('execution_time_exceeded');
});

test('nonzero return code fails even when stdout exists', () => {
  const call = invocation('code_execution', {});
  const native = {
    type: 'code_execution_tool_result',
    tool_use_id: call.id,
    content: {
      type: 'code_execution_result',
      stdout: 'partial',
      stderr: 'bad input',
      return_code: 2,
      content: [],
    },
  };

  const result = readAnthropicServerToolResult(call, native, 50);

  expect(result?.step.status).toBe('failed');
  expect(result?.step.error?.message).toContain('2');
  expect(result?.step.settledAt).toBe(100);
  expect(result?.content).toContain('partial');
});

test.each([
  'text_editor_code_execution_create_result',
  'text_editor_code_execution_view_result',
  'text_editor_code_execution_str_replace_result',
])('settles %s', (type) => {
  const call = invocation('text_editor_code_execution', {});
  const native = {
    type: 'text_editor_code_execution_tool_result',
    tool_use_id: call.id,
    content: {
      type,
      content: 'file text',
      file_type: 'text',
      is_file_update: true,
      old_start: 1,
      old_lines: 1,
      new_start: 1,
      new_lines: 1,
      lines: ['file text'],
      total_lines: 1,
      start_line: 1,
    },
  };

  const result = readAnthropicServerToolResult(call, native, 200);

  expect(result?.step.status).toBe('completed');
});

test('does not invent a successful result for another id or unsupported family', () => {
  const call = invocation();

  const foreign = readAnthropicServerToolResult(
    call,
    { type: 'web_search_tool_result', tool_use_id: 'other', content: [] },
    200,
  );
  const malformed = readAnthropicServerToolResult(
    call,
    {
      type: 'web_search_tool_result',
      tool_use_id: call.id,
      content: { type: 'fixture-result' },
    },
    200,
  );
  const deferred = readAnthropicServerToolCall(
    {
      type: 'server_tool_use',
      id: 'other',
      name: 'tool_search_tool_regex',
      input: {},
    },
    100,
  );

  expect(foreign).toBeUndefined();
  expect(malformed).toBeUndefined();
  expect(deferred).toBeUndefined();
});

test('does not accept another family error as a recognized search result', () => {
  const call = invocation();
  const native = {
    type: 'web_search_tool_result',
    tool_use_id: call.id,
    content: {
      type: 'code_execution_tool_result_error',
      error_code: 'internal_error',
    },
  };

  const result = readAnthropicServerToolResult(call, native, 200);

  expect(result).toBeUndefined();
});

test.each([
  ['web_search', 'web_search_tool_result', 'code_execution_result'],
  ['web_fetch', 'web_fetch_tool_result', 'bash_code_execution_result'],
  [
    'code_execution',
    'code_execution_tool_result',
    'bash_code_execution_result',
  ],
  [
    'bash_code_execution',
    'bash_code_execution_tool_result',
    'code_execution_result',
  ],
])('rejects mismatched successful result families %#', (name, outer, inner) => {
  const call = invocation(name);
  const native = {
    type: outer,
    tool_use_id: call.id,
    content: {
      type: inner,
      stdout: 'output',
      stderr: '',
      return_code: 0,
      content: [],
    },
  };

  const result = readAnthropicServerToolResult(call, native, 200);

  expect(result).toBeUndefined();
});

test('does not classify an empty native call id', () => {
  const native = {
    type: 'server_tool_use',
    id: '',
    name: 'web_search',
    input: {},
  };

  const result = readAnthropicServerToolCall(native);

  expect(result).toBeUndefined();
});
