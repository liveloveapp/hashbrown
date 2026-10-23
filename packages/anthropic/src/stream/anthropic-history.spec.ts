import type { Message } from '@ag-ui/core';
import {
  cloneAnthropicHistoryBlocks,
  readAnthropicHistory,
} from './anthropic-history';

function capture(
  id: string,
  responseId: string,
  blocks: unknown[],
  representedMessageIds = [id],
): Message {
  return {
    id,
    role: 'assistant',
    content: id,
    metadata: {
      anthropic: { responseId },
      'hashbrown.provider-history': {
        v: 1,
        provider: 'anthropic',
        ownerMessageId: id,
        responseId,
        complete: true,
        payload: { blocks, representedMessageIds },
      },
    },
  };
}

function providerCall(): Message {
  return {
    id: 'first',
    role: 'assistant',
    metadata: { anthropic: { responseId: 'r1' } },
    toolCalls: [
      {
        id: 'server',
        type: 'function',
        function: { name: 'code_execution', arguments: '{}' },
        metadata: {
          anthropic: { responseId: 'r1', blockType: 'server_tool_use' },
          'b4.step': { kind: 'provider' },
        },
      },
    ],
  };
}

test('anchors interleaved reasoning at its earliest canonical position and skips it once', () => {
  const blocks = [
    { type: 'thinking', thinking: 'private', signature: 'signature' },
    { type: 'text', text: 'answer' },
  ];
  const reasoning: Message = {
    id: 'reason',
    role: 'reasoning',
    content: 'private',
    encryptedValue: 'signature',
    metadata: { anthropic: { responseId: 'r', blockType: 'thinking' } },
  };
  const messages = [reasoning, capture('a', 'r', blocks, ['reason', 'a'])];

  const result = readAnthropicHistory(messages);

  expect(result.responses.get('reason')).toEqual(blocks);
  expect([...result.representedMessageIds]).toEqual(['reason', 'a']);
});

test('replays a pending server invocation and a later result after intervening app results', () => {
  const first = providerCall();
  const firstBlocks = [
    {
      type: 'server_tool_use',
      id: 'server',
      name: 'code_execution',
      input: {},
    },
    {
      type: 'tool_use',
      id: 'app',
      name: 'lookup',
      input: null,
      caller: { type: 'code_execution_20250825', tool_id: 'server' },
    },
  ];
  first.metadata = capture('first', 'r1', firstBlocks).metadata;
  const appResult: Message = {
    id: 'app-result',
    role: 'tool',
    toolCallId: 'app',
    content: 'found',
  };
  const later: Message = {
    id: 'later',
    role: 'tool',
    toolCallId: 'server',
    content: 'done',
    metadata: {
      anthropic: { responseId: 'r2', blockType: 'code_execution_tool_result' },
      'hashbrown.provider-history': {
        v: 1,
        provider: 'anthropic',
        ownerMessageId: 'later',
        responseId: 'r2',
        complete: true,
        payload: {
          blocks: [
            {
              type: 'code_execution_tool_result',
              tool_use_id: 'server',
              content: {
                type: 'code_execution_result',
                stdout: 'done',
                stderr: '',
                return_code: 0,
                content: [],
              },
            },
          ],
          representedMessageIds: ['later'],
        },
      },
    },
  };

  const result = readAnthropicHistory([first, appResult, later]);

  expect([...result.responses.keys()]).toEqual(['first', 'later']);
  expect(result.representedMessageIds.has('app-result')).toBe(false);
});

test('rejects conflicting response identity on a contained call', () => {
  const message = capture('a', 'r', [{ type: 'text', text: 'hello' }]);
  if (message.role !== 'assistant') throw new Error('Expected assistant');
  message.toolCalls = [
    {
      id: 'call',
      type: 'function',
      function: { name: 'lookup', arguments: '{}' },
      metadata: { anthropic: { responseId: 'other', blockType: 'tool_use' } },
    },
  ];

  const act = () => readAnthropicHistory([message]);

  expect(act).toThrow(/identity/);
});

test('rejects duplicate canonical ids rather than resolving ownership ambiguously', () => {
  const first = capture('a', 'r', [{ type: 'text', text: 'hello' }]);
  const duplicate: Message = {
    id: 'a',
    role: 'assistant',
    metadata: { anthropic: { responseId: 'r' } },
  };

  const act = () => readAnthropicHistory([first, duplicate]);

  expect(act).toThrow(/duplicat/i);
});

test('rejects user, activity, app result, and nested call ids in represented identities', () => {
  const otherMessages: Message[] = [
    { id: 'x', role: 'user', content: 'user' },
    { id: 'x', role: 'activity', activityType: 'progress', content: {} },
    {
      id: 'x',
      role: 'tool',
      toolCallId: 'app',
      content: 'app',
      metadata: { anthropic: { responseId: 'r' } },
    },
  ];
  const actions = otherMessages.map(
    (other) => () =>
      readAnthropicHistory([
        capture('a', 'r', [{ type: 'text', text: 'a' }], ['a', 'x']),
        other,
      ]),
  );

  for (const act of actions) expect(act).toThrow(/history/i);
  expect(() =>
    readAnthropicHistory([capture('a', 'r', [], ['a', 'nested-call'])]),
  ).toThrow(/history/i);
});

test('rejects overlapping captures and duplicate response ownership', () => {
  const actions = [
    () => readAnthropicHistory([capture('a', 'r', []), capture('b', 'r', [])]),
    () =>
      readAnthropicHistory([
        capture('a', 'r', []),
        capture('b', 'r', [], ['a', 'b']),
      ]),
  ];

  for (const act of actions) expect(act).toThrow(/history/i);
});

test('never validates foreign payloads as Anthropic native blocks', () => {
  const message: Message = {
    id: 'foreign',
    role: 'assistant',
    content: 'visible',
    metadata: {
      'hashbrown.provider-history': { provider: 'google', invalid: true },
    },
  };

  const result = readAnthropicHistory([message]);

  expect(result.responses.size).toBe(0);
});

test('requires complete capture for native provider continuation but keeps foreign calls filterable', () => {
  const first = providerCall();
  const incomplete = capture('first', 'r1', [
    {
      type: 'server_tool_use',
      id: 'server',
      name: 'code_execution',
      input: {},
    },
  ]);
  (
    incomplete.metadata?.['hashbrown.provider-history'] as Record<
      string,
      unknown
    >
  )['complete'] = false;
  const acts = [
    () => readAnthropicHistory([first]),
    () => readAnthropicHistory([incomplete]),
  ];

  for (const act of acts) expect(act).toThrow(/complete|incomplete/i);
});

test('retains the latest usable container when later responses omit or clear it', () => {
  const first = capture('a', 'r1', []);
  (
    (first.metadata?.['hashbrown.provider-history'] as Record<string, unknown>)[
      'payload'
    ] as Record<string, unknown>
  )['container'] = {
    id: 'container',
    expires_at: '2099',
    skills: [{ type: 'custom', skill_id: 'skill', version: 'v1' }],
  };
  const second = capture('b', 'r2', []);
  (
    (
      second.metadata?.['hashbrown.provider-history'] as Record<string, unknown>
    )['payload'] as Record<string, unknown>
  )['container'] = null;

  const result = readAnthropicHistory([first, second, capture('c', 'r3', [])]);

  expect(result.container).toBe('container');
});

test('clones every supported native output family without dropping opaque fields', () => {
  const blocks = [
    {
      type: 'text',
      text: 'answer',
      citations: [
        {
          type: 'web_search_result_location',
          cited_text: 'quote',
          url: 'https://example.com',
          title: 'source',
          encrypted_index: 'opaque',
        },
      ],
      cache_control: { type: 'ephemeral' },
    },
    { type: 'redacted_thinking', data: 'encrypted' },
    {
      type: 'server_tool_use',
      id: 'server',
      name: 'web_search',
      input: [1, 'string', null],
      caller: { type: 'direct' },
    },
    {
      type: 'web_search_tool_result',
      tool_use_id: 'server',
      content: [
        {
          type: 'web_search_result',
          url: 'url',
          title: 'title',
          encrypted_content: 'opaque',
          page_age: null,
        },
      ],
    },
    {
      type: 'web_fetch_tool_result',
      tool_use_id: 'fetch',
      content: {
        type: 'web_fetch_result',
        url: 'url',
        retrieved_at: null,
        content: {
          type: 'document',
          title: 'doc',
          source: {
            type: 'text',
            media_type: 'text/plain',
            data: 'full document',
          },
          citations: { enabled: true },
        },
      },
    },
    {
      type: 'code_execution_tool_result',
      tool_use_id: 'code',
      content: {
        type: 'encrypted_code_execution_result',
        encrypted_stdout: 'encrypted',
        stderr: '',
        return_code: 0,
        content: [{ type: 'code_execution_output', file_id: 'file' }],
      },
    },
    {
      type: 'bash_code_execution_tool_result',
      tool_use_id: 'bash',
      content: {
        type: 'bash_code_execution_result',
        stdout: '',
        stderr: '',
        return_code: 0,
        content: [],
      },
    },
    {
      type: 'text_editor_code_execution_tool_result',
      tool_use_id: 'edit',
      content: {
        type: 'text_editor_code_execution_view_result',
        content: 'file',
        file_type: 'text',
        start_line: null,
      },
    },
    {
      type: 'tool_search_tool_result',
      tool_use_id: 'search',
      content: {
        type: 'tool_search_tool_search_result',
        tool_references: [{ type: 'tool_reference', tool_name: 'lookup' }],
      },
    },
    { type: 'container_upload', file_id: 'file' },
  ];

  const result = cloneAnthropicHistoryBlocks(blocks);

  expect(result).toEqual(blocks);
  expect(result).not.toBe(blocks);
  expect(result[0]).not.toBe(blocks[0]);
});

test('rejects result content from a different native family and malformed caller fields', () => {
  const blocks = [
    {
      type: 'web_fetch_tool_result',
      tool_use_id: 'call',
      content: {
        type: 'code_execution_result',
        stdout: '',
        stderr: '',
        return_code: 0,
        content: [],
      },
    },
    {
      type: 'tool_use',
      id: 'app',
      name: 'lookup',
      input: {},
      caller: { type: 'code_execution_20250825' },
    },
  ];

  const acts = blocks.map(
    (block) => () => cloneAnthropicHistoryBlocks([block]),
  );

  for (const act of acts) expect(act).toThrow(/history/i);
});

test('rejects overlap with an incomplete capture without suppressing canonical text', () => {
  const first = capture('a', 'r', [{ type: 'text', text: 'partial' }]);
  (first.metadata?.['hashbrown.provider-history'] as Record<string, unknown>)[
    'complete'
  ] = false;
  const second = capture(
    'b',
    'r2',
    [{ type: 'text', text: 'answer' }],
    ['a', 'b'],
  );
  if (second.metadata?.['anthropic'])
    (second.metadata['anthropic'] as Record<string, unknown>)['responseId'] =
      'r';
  const envelope = second.metadata?.['hashbrown.provider-history'] as Record<
    string,
    unknown
  >;
  envelope['responseId'] = 'r';

  const act = () => readAnthropicHistory([first, second]);

  expect(act).toThrow(/overlap/);
});

test('rejects native server names and fetched documents missing required data', () => {
  const blocks = [
    {
      type: 'server_tool_use',
      id: 'server',
      name: 'invented_server',
      input: {},
    },
    {
      type: 'web_fetch_tool_result',
      tool_use_id: 'fetch',
      content: {
        type: 'web_fetch_result',
        url: 'url',
        content: { type: 'document', source: { type: 'text' } },
      },
    },
  ];

  const acts = blocks.map(
    (block) => () => cloneAnthropicHistoryBlocks([block]),
  );

  for (const act of acts) expect(act).toThrow(/history/i);
});

test('preserves nullable titles for every native citation family', () => {
  const citations = [
    {
      type: 'web_search_result_location',
      cited_text: 'quote',
      url: 'https://example.com',
      title: null,
      encrypted_index: 'opaque',
    },
    {
      type: 'char_location',
      cited_text: 'quote',
      document_index: 0,
      document_title: null,
      start_char_index: 0,
      end_char_index: 5,
    },
    {
      type: 'page_location',
      cited_text: 'quote',
      document_index: 0,
      document_title: null,
      start_page_number: 1,
      end_page_number: 2,
    },
    {
      type: 'content_block_location',
      cited_text: 'quote',
      document_index: 0,
      document_title: null,
      start_block_index: 0,
      end_block_index: 1,
    },
    {
      type: 'search_result_location',
      cited_text: 'quote',
      search_result_index: 0,
      source: 'https://example.com',
      title: null,
      start_block_index: 0,
      end_block_index: 1,
    },
  ];
  const blocks = [{ type: 'text', text: 'answer', citations }];

  const result = cloneAnthropicHistoryBlocks(blocks);

  expect(result).toEqual(blocks);
  expect(result[0]).not.toBe(blocks[0]);
});

test('rejects missing or malformed required citation titles and search sources', () => {
  const citations = [
    {
      type: 'web_search_result_location',
      cited_text: 'quote',
      url: 'url',
      encrypted_index: 'opaque',
    },
    {
      type: 'web_search_result_location',
      cited_text: 'quote',
      url: 'url',
      encrypted_index: 'opaque',
      title: 42,
    },
    {
      type: 'char_location',
      cited_text: 'quote',
      document_index: 0,
      start_char_index: 0,
      end_char_index: 5,
    },
    {
      type: 'page_location',
      cited_text: 'quote',
      document_index: 0,
      document_title: 42,
      start_page_number: 1,
      end_page_number: 2,
    },
    {
      type: 'content_block_location',
      cited_text: 'quote',
      document_index: 0,
      start_block_index: 0,
      end_block_index: 1,
    },
    {
      type: 'search_result_location',
      cited_text: 'quote',
      search_result_index: 0,
      title: null,
      start_block_index: 0,
      end_block_index: 1,
    },
    {
      type: 'search_result_location',
      cited_text: 'quote',
      search_result_index: 0,
      source: 'url',
      start_block_index: 0,
      end_block_index: 1,
    },
    {
      type: 'search_result_location',
      cited_text: 'quote',
      search_result_index: 0,
      source: null,
      title: null,
      start_block_index: 0,
      end_block_index: 1,
    },
  ];

  const acts = citations.map(
    (item) => () =>
      cloneAnthropicHistoryBlocks([
        { type: 'text', text: 'answer', citations: [item] },
      ]),
  );

  for (const act of acts) expect(act).toThrow(/history/i);
});
