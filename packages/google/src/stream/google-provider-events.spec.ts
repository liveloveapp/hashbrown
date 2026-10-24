import { type AGUIEvent, EventType } from '@ag-ui/core';
import type { GenerateContentResponse } from '@google/genai';
import { mapGoogleEvents } from './google-events';

function chunk(
  parts: unknown[],
  extra: Record<string, unknown> = {},
): GenerateContentResponse {
  return {
    responseId: 'response-google',
    candidates: [{ index: 0, content: { role: 'model', parts }, ...extra }],
  } as GenerateContentResponse;
}
async function collect(chunks: GenerateContentResponse[]) {
  async function* source() {
    yield* chunks;
  }
  const events: AGUIEvent[] = [];
  const iterator = mapGoogleEvents({ events: source(), messageId: 'answer' });
  let next = await iterator.next();
  while (!next.done) {
    events.push(next.value);
    next = await iterator.next();
  }
  return { events, finish: next.value };
}
const search = {
  toolCall: {
    id: 'search-1',
    toolType: 'GOOGLE_SEARCH_WEB',
    args: { queries: ['brown'] },
  },
};
const result = {
  toolResponse: {
    id: 'search-1',
    toolType: 'GOOGLE_SEARCH_WEB',
    response: { results: [] },
  },
};

test('streams a running provider invocation before reading a blocked next chunk', async () => {
  let reads = 0;
  const source = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          reads++;
          if (reads === 1)
            return { done: false as const, value: chunk([search]) };
          throw new Error('next chunk was requested');
        },
        async return() {
          return { done: true as const, value: undefined };
        },
      };
    },
  };
  const iterator = mapGoogleEvents({ events: source, messageId: 'answer' });

  const start = await iterator.next();
  const args = await iterator.next();
  const end = await iterator.next();
  await iterator.return(undefined);

  expect(reads).toBe(1);
  expect(start.value).toMatchObject({
    type: EventType.TOOL_CALL_START,
    toolCallId: 'search-1',
    metadata: {
      'b4.step': { kind: 'provider', status: 'running', builtin: 'web_search' },
      google: {
        responseId: 'response-google',
        chunkIndex: 0,
        partIndex: 0,
        nativePart: search,
      },
    },
  });
  expect(args.value).toMatchObject({
    type: EventType.TOOL_CALL_ARGS,
    delta: '{"queries":["brown"]}',
  });
  expect(end.value).toMatchObject({
    type: EventType.TOOL_CALL_END,
    metadata: {
      'b4.step': { status: 'running' },
      google: { nativePart: search },
    },
  });
});

test('settles native results under fresh IDs and preserves exact ordered native fragments', async () => {
  const chunks = [
    chunk([search]),
    chunk([result]),
    chunk([{ text: '', thoughtSignature: 'tail' }]),
  ];

  const { events, finish } = await collect(chunks);

  expect(events).toContainEqual(
    expect.objectContaining({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'answer:provider-result:1:0',
      toolCallId: 'search-1',
      metadata: expect.objectContaining({
        'b4.step': expect.objectContaining({ status: 'completed' }),
      }),
    }),
  );
  expect(finish?.finishReason).toBe('other');
  expect(events.at(-1)).toMatchObject({
    type: EventType.CUSTOM,
    value: {
      ownerMessageId: 'answer',
      responseId: 'response-google',
      payload: {
        contents: chunks.map((c) => c.candidates?.[0].content),
        representedMessageIds: ['answer', 'answer:provider-result:1:0'],
      },
    },
  });
});

test('keeps app function names distinct from native provider invocations', async () => {
  const { events, finish } = await collect([
    chunk(
      [
        search,
        { functionCall: { id: 'app', name: 'google_search', args: {} } },
      ],
      { finishReason: 'STOP' },
    ),
  ]);

  expect(
    events.filter((e) => e.type === EventType.TOOL_CALL_START),
  ).toHaveLength(2);
  expect(
    events.find(
      (e) => e.type === EventType.TOOL_CALL_START && e.toolCallId === 'app',
    )?.metadata?.['b4.step'],
  ).toBeUndefined();
  expect(finish?.finishReason).toBe('tool_calls');
});

test('preserves unknown results and unknown code outcomes without settling', async () => {
  const { events } = await collect([
    chunk([{ executableCode: { code: '1', language: 'PYTHON' } }]),
    chunk([
      { codeExecutionResult: { outcome: 'OUTCOME_UNSPECIFIED' } },
      {
        toolResponse: { id: 'unknown', toolType: 'URL_CONTEXT', response: {} },
      },
    ]),
  ]);

  expect(
    events.filter((e) => e.type === EventType.TOOL_CALL_RESULT),
  ).toHaveLength(0);
  expect(events.filter((e) => e.type === EventType.RAW)).toHaveLength(2);
  expect(events).toContainEqual(
    expect.objectContaining({
      type: EventType.TOOL_CALL_END,
      metadata: expect.objectContaining({
        'b4.step': expect.objectContaining({ status: 'running' }),
      }),
    }),
  );
});

test('rejects ambiguous and incompatible native result correlation', async () => {
  const code = { executableCode: { code: '1', language: 'PYTHON' } };

  await expect(
    collect([
      chunk([
        code,
        code,
        { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '1' } },
      ]),
    ]),
  ).rejects.toThrow(/ambiguous/);
  await expect(
    collect([
      chunk([
        search,
        {
          toolResponse: {
            id: 'search-1',
            toolType: 'URL_CONTEXT',
            response: {},
          },
        },
      ]),
    ]),
  ).rejects.toThrow(/incompatible/);
});

test('attaches cumulative late grounding and verbatim attribution to invocation-created assistants', async () => {
  const { events } = await collect([
    chunk([search, result]),
    chunk([], {
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: 'https://example.com', title: 'Example' } },
        ],
        groundingSupports: [
          {
            groundingChunkIndices: [0],
            segment: { text: 'quoted', startIndex: 3, endIndex: 9 },
          },
        ],
        searchEntryPoint: { renderedContent: '<div>exact</div>' },
      },
    }),
  ]);

  expect(events).toContainEqual({
    type: EventType.TEXT_MESSAGE_END,
    messageId: 'answer',
    metadata: {
      'b4.answer': {
        v: 1,
        sources: [
          {
            id: 'response-google:source:0',
            kind: 'url',
            href: 'https://example.com',
            title: 'Example',
          },
        ],
        citations: [{ sourceId: 'response-google:source:0', quote: 'quoted' }],
        attribution: [
          {
            provider: 'google',
            kind: 'search-suggestions',
            html: '<div>exact</div>',
            mustRender: true,
          },
        ],
      },
    },
  });
  expect(events.some((e) => e.type === EventType.TEXT_MESSAGE_START)).toBe(
    false,
  );
});

test('preserves ownerless grounding metadata as RAW without fabricating a footer', async () => {
  const { events } = await collect([
    chunk([], {
      groundingMetadata: { searchEntryPoint: { renderedContent: 'html' } },
    }),
  ]);

  expect(events.map((e) => e.type)).toEqual([EventType.RAW]);
});

test('requires a consistent native response identity', async () => {
  const second = {
    ...chunk([{ text: 'second' }]),
    responseId: 'different',
  } as GenerateContentResponse;

  await expect(collect([chunk([{ text: 'first' }]), second])).rejects.toThrow(
    /response.*identity/i,
  );
});

test('restores an earlier running native invocation and producer timing for a later result', async () => {
  const inputMessages = [
    {
      id: 'old',
      role: 'assistant' as const,
      content: '',
      toolCalls: [
        {
          id: 'search-1',
          type: 'function' as const,
          function: {
            name: 'google_search',
            arguments: '{"queries":["brown"]}',
          },
          metadata: {
            google: { nativePart: search, responseId: 'old-response' },
            'b4.step': {
              v: 1,
              kind: 'provider',
              provider: 'google',
              builtin: 'web_search',
              status: 'running',
              label: 'Searching',
              startedAt: 123,
            },
          },
        },
      ],
    },
  ];
  async function* source() {
    yield chunk([result]);
  }
  const events: AGUIEvent[] = [];

  for await (const event of mapGoogleEvents({
    events: source(),
    messageId: 'later',
    inputMessages,
  }))
    events.push(event);

  expect(
    events.find((e) => e.type === EventType.TOOL_CALL_RESULT),
  ).toMatchObject({
    messageId: 'later:provider-result:0:0',
    metadata: { 'b4.step': { startedAt: 123, status: 'completed' } },
  });
  expect(events.at(-1)).toMatchObject({
    value: {
      ownerMessageId: 'later:provider-result:0:0',
      payload: { representedMessageIds: ['later:provider-result:0:0'] },
    },
  });
});

test('maps code invocations bearing signatures after reasoning and settles recognized outcomes', async () => {
  const { events } = await collect([
    chunk([
      { thought: true, text: 'thinking' },
      {
        executableCode: { id: 'code', code: '1', language: 'PYTHON' },
        thoughtSignature: 'code-signature',
      },
      {
        codeExecutionResult: {
          id: 'code',
          outcome: 'OUTCOME_FAILED',
          output: 'failed',
        },
      },
    ]),
  ]);

  expect(
    events.find((e) => e.type === EventType.TOOL_CALL_START),
  ).toMatchObject({
    toolCallId: 'code',
    metadata: {
      google: { nativePart: { thoughtSignature: 'code-signature' } },
    },
  });
  expect(
    events.find((e) => e.type === EventType.TOOL_CALL_RESULT),
  ).toMatchObject({
    metadata: {
      'b4.step': { status: 'failed', error: { code: 'OUTCOME_FAILED' } },
    },
  });
});

test('settles a result before reading a later chunk and emits no footer for cancelled streams', async () => {
  let reads = 0;
  const controller = new AbortController();
  const source = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          reads++;
          return {
            done: false as const,
            value: chunk(reads === 1 ? [search] : [result]),
          };
        },
        async return() {
          return { done: true as const, value: undefined };
        },
      };
    },
  };
  const iterator = mapGoogleEvents({
    events: source,
    messageId: 'answer',
    signal: controller.signal,
  });
  const events: AGUIEvent[] = [];

  while (true) {
    const next = await iterator.next();
    if (next.done) break;
    events.push(next.value);
    if (next.value.type === EventType.TOOL_CALL_RESULT) {
      controller.abort();
      break;
    }
  }
  const final = await iterator.next();

  expect(reads).toBe(2);
  expect(final.done).toBe(true);
  expect(events.some((e) => e.type === EventType.CUSTOM)).toBe(false);
});

test('captures repeated native fragments and reasoning-only footer ownership at normal EOF', async () => {
  const native = chunk([{ text: 'repeat', thought: true }]);

  const { events } = await collect([native, native]);

  expect(events.at(-2)).toMatchObject({
    type: EventType.REASONING_MESSAGE_END,
  });
  expect(events.at(-1)).toMatchObject({
    type: EventType.CUSTOM,
    value: {
      ownerMessageId: 'answer:reasoning:0',
      payload: {
        contents: [
          native.candidates?.[0].content,
          native.candidates?.[0].content,
        ],
      },
    },
  });
});

test('folds native tool Search Suggestions and keeps explicitly linked URL sources on their step', async () => {
  const toolCall = {
    toolCall: {
      id: 'url',
      toolType: 'URL_CONTEXT',
      args: { urls: ['https://example.com'] },
    },
  };
  const toolResponse = {
    toolResponse: {
      id: 'url',
      toolType: 'URL_CONTEXT',
      response: {
        search_suggestions: '<div>native</div>',
        url_metadata: [
          {
            retrieved_url: 'https://example.com',
            url_retrieval_status: 'URL_RETRIEVAL_STATUS_SUCCESS',
          },
        ],
      },
    },
  };

  const { events } = await collect([
    chunk([toolCall, toolResponse, { text: 'answer' }], {
      groundingMetadata: {
        groundingChunks: [{ web: { uri: 'https://example.com' } }],
        groundingSupports: [
          { groundingChunkIndices: [0], segment: { text: 'answer' } },
        ],
      },
    }),
  ]);

  const end = events.find((e) => e.type === EventType.TEXT_MESSAGE_END);
  expect(end?.metadata?.['b4.answer']).toEqual({
    v: 1,
    citations: [{ sourceId: 'url:0', quote: 'answer' }],
    attribution: [
      {
        provider: 'google',
        kind: 'search-suggestions',
        html: '<div>native</div>',
        mustRender: true,
      },
    ],
  });
});

test('does not reopen a settled provider invocation repeated from canonical history', async () => {
  const inputMessages = [
    {
      id: 'old',
      role: 'assistant' as const,
      content: '',
      toolCalls: [
        {
          id: 'search-1',
          type: 'function' as const,
          function: { name: 'google_search', arguments: '{}' },
          metadata: {
            google: { nativePart: search },
            'b4.step': {
              v: 1,
              kind: 'provider',
              provider: 'google',
              builtin: 'web_search',
              status: 'completed',
              label: 'Searched',
            },
          },
        },
      ],
    },
  ];
  async function* source() {
    yield chunk([search]);
  }
  const events: AGUIEvent[] = [];

  for await (const event of mapGoogleEvents({
    events: source(),
    messageId: 'later',
    inputMessages,
  }))
    events.push(event);

  expect(events.map((e) => e.type)).toEqual([EventType.RAW]);
});

test('freezes fallback response identity when the SDK first supplies its ID in a later chunk', async () => {
  const first = {
    ...chunk([], {
      groundingMetadata: {
        groundingChunks: [{ web: { uri: 'https://example.com' } }],
      },
    }),
    responseId: undefined,
  } as GenerateContentResponse;

  const { events } = await collect([
    first,
    chunk([{ text: 'answer' }], {
      groundingMetadata: {
        groundingSupports: [
          { groundingChunkIndices: [0], segment: { text: 'answer' } },
        ],
      },
    }),
  ]);

  expect(
    events.find((e) => e.type === EventType.TEXT_MESSAGE_START)?.metadata,
  ).toMatchObject({ google: { responseId: 'answer:response' } });
  expect(
    events.find((e) => e.type === EventType.TEXT_MESSAGE_END)?.metadata?.[
      'b4.answer'
    ],
  ).toMatchObject({
    sources: [{ id: 'answer:response:source:0' }],
    citations: [{ sourceId: 'answer:response:source:0', quote: 'answer' }],
  });
  expect(events.at(-1)).toMatchObject({
    value: { responseId: 'answer:response' },
  });
});

test('owns RAW grounding and URL metadata independently of source chunk mutation', async () => {
  const groundingMetadata = {
    searchEntryPoint: { renderedContent: 'original' },
  };
  const urlContextMetadata = {
    urlMetadata: [
      {
        retrievedUrl: 'https://example.com',
        urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS',
      },
    ],
  };
  const response = chunk([], { groundingMetadata, urlContextMetadata });
  async function* source() {
    yield response;
  }
  const iterator = mapGoogleEvents({ events: source(), messageId: 'answer' });

  const raw = await iterator.next();
  groundingMetadata.searchEntryPoint.renderedContent = 'mutated';
  urlContextMetadata.urlMetadata[0].retrievedUrl = 'https://mutated.com';
  await iterator.return(undefined);

  expect(raw.value).toMatchObject({
    type: EventType.RAW,
    event: {
      groundingMetadata: { searchEntryPoint: { renderedContent: 'original' } },
      urlContextMetadata: {
        urlMetadata: [{ retrievedUrl: 'https://example.com' }],
      },
    },
  });
});

test('uses a previously observed SDK response ID when the first selected candidate omits it', async () => {
  const header = { responseId: 'header-response' } as GenerateContentResponse;
  const candidate = {
    ...chunk([{ text: 'answer' }]),
    responseId: undefined,
  } as GenerateContentResponse;

  const { events } = await collect([header, candidate]);

  expect(
    events.find((e) => e.type === EventType.TEXT_MESSAGE_START)?.metadata,
  ).toMatchObject({ google: { responseId: 'header-response' } });
  expect(events.at(-1)).toMatchObject({
    value: { responseId: 'header-response' },
  });
});
