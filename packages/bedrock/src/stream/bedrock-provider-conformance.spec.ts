/* eslint-disable @nx/enforce-module-boundaries -- Exercises the real internal store without publishing test-only core APIs. */
import {
  type AGUIEvent,
  EventType,
  type Message,
  type RunAgentInput,
} from '@ag-ui/core';
import type {
  ContentBlock,
  ConverseStreamCommandInput,
  ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime';
import {
  apiActions,
  devActions,
  internalActions,
} from '../../../core/src/actions';
import {
  reducers,
  selectViewMessages,
  ɵprepareRootAction,
  ɵselectCommittedAgUiMessages,
} from '../../../core/src/reducers';
import { createCanonicalRunAgentInput } from '../../../core/src/transport/hashbrown-run-agent-input';
import { createStore } from '../../../core/src/utils/micro-ngrx';
import { mapBedrockEvents } from './bedrock-events';
import { createBedrockRequestOptions } from './bedrock-request';
import { decodeBedrockNative } from './bedrock-native';

const user: Message = {
  id: 'user',
  role: 'user',
  content: 'Use the native tools.',
};

function rootStore(messages: Message[] = [user]) {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: messages }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  return store;
}
function commit(store: ReturnType<typeof rootStore>) {
  store.dispatch(
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: [] },
      toolCalls: [],
    }),
  );
  return store.read(ɵselectCommittedAgUiMessages);
}
function request(messages: readonly Message[]): RunAgentInput {
  return createCanonicalRunAgentInput({
    threadId: 'thread',
    runId: 'next',
    messages: [...messages],
    state: undefined,
    tools: [],
  });
}
function views(store: ReturnType<typeof rootStore>) {
  return store.read(selectViewMessages);
}
async function* source(
  events: readonly unknown[],
): AsyncIterable<ConverseStreamOutput> {
  for (const event of events) yield event as ConverseStreamOutput;
}
async function drive(
  store: ReturnType<typeof rootStore>,
  events: readonly unknown[],
  messageId: string,
  context: {
    inputMessages?: readonly Message[];
    requestOptions?: ConverseStreamCommandInput;
  } = {},
) {
  const frames: AGUIEvent[] = [];
  const iterator = mapBedrockEvents({
    events: source(events),
    messageId,
    ...context,
  });
  for (;;) {
    const next = await iterator.next();
    if (next.done) return { frames, finish: next.value };
    frames.push(next.value);
    store.dispatch(apiActions.generateMessageEvent(next.value));
  }
}
function invocation(
  index: number,
  id: string,
  name: string,
  input: unknown,
  server = true,
): unknown[] {
  return [
    {
      contentBlockStart: {
        contentBlockIndex: index,
        start: {
          toolUse: {
            toolUseId: id,
            name,
            ...(server ? { type: 'server_tool_use' } : {}),
          },
        },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: index,
        delta: { toolUse: { input: JSON.stringify(input) } },
      },
    },
    { contentBlockStop: { contentBlockIndex: index } },
  ];
}
function result(
  index: number,
  id: string,
  type: string,
  content: unknown[],
  status = 'success',
): unknown[] {
  return [
    {
      contentBlockStart: {
        contentBlockIndex: index,
        start: { toolResult: { toolUseId: id, type, status } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: index,
        delta: { toolResult: content },
      },
    },
    { contentBlockStop: { contentBlockIndex: index } },
  ];
}
function text(
  index: number,
  content: string,
  citations: readonly unknown[] = [],
): unknown[] {
  return [
    {
      contentBlockDelta: { contentBlockIndex: index, delta: { text: content } },
    },
    ...citations.map((citation) => ({
      contentBlockDelta: { contentBlockIndex: index, delta: { citation } },
    })),
    { contentBlockStop: { contentBlockIndex: index } },
  ];
}
function assertNoProtocolError(store: ReturnType<typeof rootStore>) {
  expect(
    store.read((value) => value.agUiMessages.protocolError),
  ).toBeUndefined();
}
function footer(messages: readonly Message[], id: string) {
  return messages.find((message) => message.id === id)?.metadata?.[
    'hashbrown.provider-history'
  ] as
    | {
        ownerMessageId: string;
        complete: boolean;
        payload: { content: unknown };
      }
    | undefined;
}
function restore(messages: readonly Message[]) {
  const wire = JSON.parse(JSON.stringify(request(messages))) as RunAgentInput;
  const restored = rootStore([]);
  restored.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: wire.messages,
    }),
  );
  assertNoProtocolError(restored);
  return restored.read((value) => value.agUiMessages.draft);
}

test('persists Bedrock provider outcomes and citations through wire restore and exact interleaved native replay', async () => {
  const href = 'https://example.com/source';
  const citation = {
    title: 'Source',
    location: { web: { url: href, domain: 'example.com' } },
    sourceContent: [{ text: 'Quoted source' }],
  };
  const searchContent = [
    { json: { sources: [{ url: href, title: 'Source' }] } },
  ];
  const codeContent = [
    { text: '{"isError":true,"exitCode":2,' },
    { text: '"stdErr":"Readable native failure"}' },
  ];
  const native: ContentBlock[] = [
    {
      reasoningContent: {
        reasoningText: { text: 'Plan', signature: 'signed-plan' },
      },
    },
    { text: 'Before ' },
    {
      toolUse: {
        toolUseId: 'search',
        name: 'nova_grounding',
        type: 'server_tool_use',
        input: { query: 'weather' },
      },
    },
    {
      toolResult: {
        toolUseId: 'search',
        type: 'nova_grounding_result',
        status: 'success',
        content: searchContent,
      },
    },
    {
      citationsContent: {
        content: [{ text: 'Answer' }],
        citations: [citation],
      },
    },
    {
      toolUse: {
        toolUseId: 'code',
        name: 'nova_code_interpreter',
        type: 'server_tool_use',
        input: { snippet: 'raise Exception()' },
      },
    },
    {
      toolResult: {
        toolUseId: 'code',
        type: 'nova_code_interpreter_result',
        status: 'success',
        content: codeContent,
      },
    },
    {
      toolUse: {
        toolUseId: 'app',
        name: 'nova_grounding',
        input: { query: 'client' },
      },
    },
    { reasoningContent: { redactedContent: new Uint8Array([1, 2, 3]) } },
    { text: ' end.' },
  ];
  const events = [
    { messageStart: { role: 'assistant' } },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { text: 'Plan' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { signature: 'signed-' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { signature: 'plan' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    ...text(1, 'Before '),
    ...invocation(2, 'search', 'nova_grounding', { query: 'weather' }),
    ...result(3, 'search', 'nova_grounding_result', searchContent),
    ...text(4, 'Answer', [citation]),
    ...invocation(5, 'code', 'nova_code_interpreter', {
      snippet: 'raise Exception()',
    }),
    ...result(6, 'code', 'nova_code_interpreter_result', codeContent),
    ...invocation(7, 'app', 'nova_grounding', { query: 'client' }, false),
    {
      contentBlockDelta: {
        contentBlockIndex: 8,
        delta: {
          reasoningContent: { redactedContent: new Uint8Array([1, 2]) },
        },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 8,
        delta: { reasoningContent: { redactedContent: new Uint8Array([3]) } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 8 } },
    ...text(9, ' end.'),
    { messageStop: { stopReason: 'tool_use' } },
  ];
  const store = rootStore();

  const run = await drive(store, events, 'answer');
  const assistant = views(store).find(
    (message) => message.role === 'assistant',
  );

  assertNoProtocolError(store);
  expect(run.finish?.finishReason).toBe('tool_calls');
  expect(assistant?.serverToolCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        toolCallId: 'search',
        kind: 'provider',
        builtin: 'web_search',
        metadata: expect.objectContaining({
          'b4.step': expect.objectContaining({ provider: 'bedrock' }),
        }),
        status: 'complete',
        outcome: 'success',
        sources: [expect.objectContaining({ id: 'search:source:0', href })],
      }),
      expect.objectContaining({
        toolCallId: 'code',
        kind: 'provider',
        status: 'complete',
        outcome: 'failure',
        error: expect.objectContaining({
          message: 'Readable native failure',
          code: '2',
        }),
      }),
    ]),
  );
  expect(assistant?.citations).toEqual([
    { sourceId: 'search:source:0', quote: 'Quoted source' },
  ]);
  expect(assistant?.sources ?? []).toEqual([]);
  const committed = commit(store);
  expect(
    committed.find(
      (message) => message.role === 'tool' && message.toolCallId === 'code',
    ),
  ).toMatchObject({ error: 'Readable native failure' });
  const capture = footer(committed, 'answer');
  expect(capture).toMatchObject({ ownerMessageId: 'answer', complete: true });
  expect(decodeBedrockNative(capture?.payload.content)).toEqual(native);
  const appResult: Message = {
    id: 'app-result',
    role: 'tool',
    toolCallId: 'app',
    content: '{"client":true}',
  };
  const next = createBedrockRequestOptions(
    request([...restore(committed), appResult]),
    'model',
  );
  expect(next.messages).toEqual([
    { role: 'user', content: [{ text: user.content }] },
    { role: 'assistant', content: native },
    {
      role: 'user',
      content: [
        {
          toolResult: {
            toolUseId: 'app',
            content: [{ json: { client: true } }],
          },
        },
      ],
    },
  ]);
});

test('gives a later Bedrock provider result a fresh owner after intervening client results', async () => {
  const first = rootStore();
  const firstEvents = [
    ...invocation(0, 'pending', 'nova_grounding', { query: 'later' }),
    ...invocation(1, 'app', 'lookup', {}, false),
    { messageStop: { stopReason: 'tool_use' } },
  ];
  await drive(first, firstEvents, 'first');
  const history: Message[] = [
    ...restore(commit(first)),
    {
      id: 'app-result',
      role: 'tool',
      toolCallId: 'app',
      content: 'Client result',
    },
  ];
  const previous = createBedrockRequestOptions(request(history), 'model');
  const later = rootStore(history);
  const nativeResult = {
    toolResult: {
      toolUseId: 'pending',
      type: 'nova_grounding_result',
      status: 'success' as const,
      content: [{ text: 'Native result' }],
    },
  };

  await drive(
    later,
    [
      ...result(
        0,
        'pending',
        'nova_grounding_result',
        nativeResult.toolResult.content,
      ),
      { messageStop: { stopReason: 'end_turn' } },
    ],
    'later',
    { inputMessages: history, requestOptions: previous },
  );
  const committed = commit(later);
  const next = createBedrockRequestOptions(
    request(restore(committed)),
    'model',
  );

  assertNoProtocolError(later);
  expect(
    committed.some(
      (message) => message.id === 'later' && message.role === 'assistant',
    ),
  ).toBe(false);
  expect(footer(committed, 'later:provider-result:0')).toMatchObject({
    ownerMessageId: 'later:provider-result:0',
    complete: true,
  });
  expect(next.messages).toEqual([
    { role: 'user', content: [{ text: user.content }] },
    {
      role: 'assistant',
      content: [
        {
          toolUse: {
            toolUseId: 'pending',
            name: 'nova_grounding',
            type: 'server_tool_use',
            input: { query: 'later' },
          },
        },
        { toolUse: { toolUseId: 'app', name: 'lookup', input: {} } },
      ],
    },
    {
      role: 'user',
      content: [
        {
          toolResult: {
            toolUseId: 'app',
            content: [{ text: 'Client result' }],
          },
        },
      ],
    },
    { role: 'assistant', content: [nativeResult] },
  ]);
});

test('keeps call-less Bedrock citations on an answer without fabricating provider calls', async () => {
  const href = 'https://example.com/grounding';
  const citation = {
    source: href,
    title: 'Grounding',
    sourceContent: [{ text: 'Quote' }],
    location: { web: { url: href } },
  };
  const store = rootStore();

  const run = await drive(
    store,
    [
      ...text(0, 'Grounded answer', [citation, citation]),
      { messageStop: { stopReason: 'end_turn' } },
    ],
    'answer',
  );
  const assistant = views(store).find(
    (message) => message.role === 'assistant',
  );
  const next = createBedrockRequestOptions(
    request(restore(commit(store))),
    'model',
  );

  assertNoProtocolError(store);
  expect(
    run.frames.some((event) => event.type === EventType.TOOL_CALL_START),
  ).toBe(false);
  expect(assistant?.sources).toEqual([
    expect.objectContaining({ href, title: 'Grounding', kind: 'url' }),
  ]);
  expect(assistant?.citations).toEqual([
    { sourceId: assistant?.sources?.[0].id, quote: 'Quote' },
    { sourceId: assistant?.sources?.[0].id, quote: 'Quote' },
  ]);
  expect(next.messages?.[1]).toEqual({
    role: 'assistant',
    content: [
      {
        citationsContent: {
          content: [{ text: 'Grounded answer' }],
          citations: [citation, citation],
        },
      },
    ],
  });
});

test('preserves reasoning-only signed and redacted Bedrock responses through snapshots', async () => {
  const store = rootStore();
  const native: ContentBlock[] = [
    {
      reasoningContent: {
        reasoningText: { text: 'Think', signature: 'signature' },
      },
    },
    { reasoningContent: { redactedContent: new Uint8Array([0, 255]) } },
  ];
  const events = [
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { text: 'Think' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { signature: 'signature' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    {
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: {
          reasoningContent: { redactedContent: new Uint8Array([0, 255]) },
        },
      },
    },
    { contentBlockStop: { contentBlockIndex: 1 } },
    { messageStop: { stopReason: 'end_turn' } },
  ];

  const run = await drive(store, events, 'reasoning');
  const committed = commit(store);
  const next = createBedrockRequestOptions(
    request(restore(committed)),
    'model',
  );

  assertNoProtocolError(store);
  expect(
    run.frames.some((event) => event.type === EventType.TEXT_MESSAGE_START),
  ).toBe(false);
  expect(next.messages).toEqual([
    { role: 'user', content: [{ text: user.content }] },
    { role: 'assistant', content: native },
  ]);
  expect(
    committed.filter((message) => message.role === 'assistant'),
  ).toHaveLength(0);
  expect(
    committed.filter((message) => message.role === 'reasoning'),
  ).toHaveLength(2);
});

test('attaches grounding to a tool-only Bedrock assistant without a synthetic text start', async () => {
  const href = 'https://example.com/tool-only';
  const citation = {
    source: href,
    sourceContent: [{ text: 'Grounded quote' }],
  };
  const store = rootStore();
  const events = [
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: {
          toolUse: {
            toolUseId: 'search',
            name: 'nova_grounding',
            type: 'server_tool_use',
          },
        },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { contentBlockDelta: { contentBlockIndex: 1, delta: { citation } } },
    { contentBlockStop: { contentBlockIndex: 1 } },
    { messageStop: { stopReason: 'end_turn' } },
  ];

  const run = await drive(store, events, 'answer');
  const assistant = views(store).find(
    (message) => message.role === 'assistant',
  );
  const next = createBedrockRequestOptions(
    request(restore(commit(store))),
    'model',
  );

  assertNoProtocolError(store);
  expect(run.finish?.finishReason).toBe('stop');
  expect(
    run.frames.some((event) => event.type === EventType.TEXT_MESSAGE_START),
  ).toBe(false);
  expect(assistant?.serverToolCalls).toEqual([
    expect.objectContaining({
      toolCallId: 'search',
      kind: 'provider',
      status: 'executing',
    }),
  ]);
  expect(assistant?.sources).toEqual([expect.objectContaining({ href })]);
  expect(assistant?.citations).toEqual([
    { sourceId: assistant?.sources?.[0].id, quote: 'Grounded quote' },
  ]);
  expect(next.messages?.[1]).toEqual({
    role: 'assistant',
    content: [
      {
        toolUse: {
          toolUseId: 'search',
          name: 'nova_grounding',
          type: 'server_tool_use',
          input: {},
        },
      },
      { citationsContent: { content: [], citations: [citation] } },
    ],
  });
});
