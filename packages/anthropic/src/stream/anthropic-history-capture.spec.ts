import type Anthropic from '@anthropic-ai/sdk';
import {
  captureAnthropicNativeEvent,
  createAnthropicHistoryFooter,
  createAnthropicNativeCapture,
} from './anthropic-history-capture';

function event(type: string, data: Record<string, unknown> = {}) {
  return { type, ...data } as Anthropic.Messages.RawMessageStreamEvent;
}

test('captures native block order and streamed opaque values without mutating events', () => {
  const start = event('content_block_start', {
    index: 2,
    content_block: {
      type: 'server_tool_use',
      id: 'server',
      name: 'web_search',
      input: {},
    },
  });
  const input = structuredClone(start);
  const events = [
    start,
    event('content_block_delta', {
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '{"query":"weather"}' },
    }),
    event('content_block_stop', { index: 2 }),
    event('content_block_start', {
      index: 0,
      content_block: { type: 'thinking', thinking: 'first', signature: '' },
    }),
    event('content_block_delta', {
      index: 0,
      delta: { type: 'signature_delta', signature: 'opaque-signature' },
    }),
    event('content_block_stop', { index: 0 }),
    event('content_block_start', {
      index: 1,
      content_block: { type: 'text', text: 'Answer', citations: [] },
    }),
    event('content_block_delta', {
      index: 1,
      delta: { type: 'text_delta', text: ' text' },
    }),
    event('content_block_delta', {
      index: 1,
      delta: {
        type: 'citations_delta',
        citation: {
          type: 'web_search_result_location',
          url: 'https://example.test',
          title: 'Page',
          cited_text: 'quote',
          encrypted_index: 'opaque-index',
        },
      },
    }),
    event('content_block_stop', { index: 1 }),
  ];

  const capture = events.reduce(
    captureAnthropicNativeEvent,
    createAnthropicNativeCapture(),
  );
  const footer = createAnthropicHistoryFooter(capture, {
    ownerMessageId: 'assistant',
    responseId: 'response',
    representedMessageIds: ['reasoning', 'assistant'],
  });

  expect(start).toEqual(input);
  expect(footer?.value.payload.blocks).toEqual([
    { type: 'thinking', thinking: 'first', signature: 'opaque-signature' },
    {
      type: 'text',
      text: 'Answer text',
      citations: [
        {
          type: 'web_search_result_location',
          url: 'https://example.test',
          title: 'Page',
          cited_text: 'quote',
          encrypted_index: 'opaque-index',
        },
      ],
    },
    {
      type: 'server_tool_use',
      id: 'server',
      name: 'web_search',
      input: { query: 'weather' },
    },
  ]);
});

test('retains the final container object and a result-only canonical owner', () => {
  const initial = createAnthropicNativeCapture();
  const first = captureAnthropicNativeEvent(
    initial,
    event('message_start', { message: { container: null } }),
  );
  const container = {
    id: 'container',
    expires_at: '2026-10-23T03:00:00Z',
    skills: null,
  };

  const final = captureAnthropicNativeEvent(
    first,
    event('message_delta', { delta: { container } }),
  );
  const footer = createAnthropicHistoryFooter(final, {
    ownerMessageId: 'fresh-result-message',
    responseId: 'later-response',
    representedMessageIds: ['fresh-result-message'],
  });

  expect(initial.container).toBeUndefined();
  expect(first.container).toBeNull();
  expect(footer?.value).toMatchObject({
    ownerMessageId: 'fresh-result-message',
    responseId: 'later-response',
    complete: true,
    payload: { container },
  });
});

test('preserves initial input when no JSON deltas arrive and emits no empty owner', () => {
  const native = {
    type: 'tool_use',
    id: 'app',
    name: 'lookup',
    input: ['valid', 'JSON'],
  };
  const capture = captureAnthropicNativeEvent(
    createAnthropicNativeCapture(),
    event('content_block_start', { index: 0, content_block: native }),
  );

  const footer = createAnthropicHistoryFooter(capture, {
    ownerMessageId: 'assistant',
    responseId: 'response',
    representedMessageIds: ['assistant'],
  });
  const empty = createAnthropicHistoryFooter(createAnthropicNativeCapture(), {
    responseId: 'empty',
    representedMessageIds: [],
  });

  expect(footer?.value.payload.blocks).toEqual([native]);
  expect(empty).toBeUndefined();
});

test('reports malformed streamed input instead of recording invented native arguments', () => {
  const initial = captureAnthropicNativeEvent(
    createAnthropicNativeCapture(),
    event('content_block_start', {
      index: 0,
      content_block: {
        type: 'server_tool_use',
        id: 'server',
        name: 'web_search',
        input: {},
      },
    }),
  );
  const partial = captureAnthropicNativeEvent(
    initial,
    event('content_block_delta', {
      index: 0,
      delta: { type: 'input_json_delta', partial_json: 'not JSON' },
    }),
  );

  const close = () =>
    captureAnthropicNativeEvent(
      partial,
      event('content_block_stop', { index: 0 }),
    );

  expect(close).toThrow('Anthropic native input');
});
