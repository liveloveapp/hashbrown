/* eslint-disable @nx/enforce-module-boundaries -- Drives the real internal root store without publishing test-only APIs. */
import { EventType, type Message, type RunAgentInput } from '@ag-ui/core';
import type { GenerateContentResponse, Part } from '@google/genai';
import {
  apiActions,
  devActions,
  internalActions,
} from '../../../core/src/actions';
import { toViewMessagesFromInternal } from '../../../core/src/models/internal_helpers';
import {
  reducers,
  selectMessages,
  selectStreamingMessage,
  selectStreamingToolCallEntities,
  selectToolCallEntities,
  ɵprepareRootAction,
  ɵselectCommittedAgUiMessages,
} from '../../../core/src/reducers';
import { createCanonicalRunAgentInput } from '../../../core/src/transport/hashbrown-run-agent-input';
import { createStore } from '../../../core/src/utils/micro-ngrx';
import { mapGoogleEvents } from './google-events';
import { createGoogleRequestOptions } from './google-request';

function chunk(
  parts: unknown[],
  metadata: Record<string, unknown> = {},
  responseId = 'response-1',
): GenerateContentResponse {
  return {
    responseId,
    candidates: [{ index: 0, content: { role: 'model', parts }, ...metadata }],
  } as unknown as GenerateContentResponse;
}
async function* source(chunks: GenerateContentResponse[]) {
  yield* chunks;
}
function rootStore(messages: Message[] = []) {
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
  const state = store.read((value) => value);
  const streaming = selectStreamingMessage(state);
  const calls = {
    ...selectToolCallEntities(state),
    ...selectStreamingToolCallEntities(state),
  };
  return [
    ...selectMessages(state).filter((message) => message.id !== streaming?.id),
    ...(streaming ? [streaming] : []),
  ].flatMap((message) => toViewMessagesFromInternal(message, calls, []));
}

test('persists ordered Google fragments, provider outcomes and search attribution through restore and exact replay', async () => {
  const html =
    '<style>.search{color:blue}</style><div class="search">Search suggestions</div>';
  const laterHtml = '<div>More suggestions</div>';
  const chunks = [
    chunk([
      { thought: true, text: 'Plan', thoughtSignature: 'thinking-signature' },
    ]),
    chunk([{ text: 'Before ' }]),
    chunk([{ text: 'Before ' }]),
    chunk([
      {
        toolCall: {
          id: 'search',
          toolType: 'GOOGLE_SEARCH_WEB',
          args: { queries: ['weather'] },
        },
        thoughtSignature: 'search-signature',
      },
    ]),
    chunk([
      {
        toolResponse: {
          id: 'search',
          toolType: 'GOOGLE_SEARCH_WEB',
          response: { search_suggestions: html },
        },
        thoughtSignature: 'result-signature',
      },
    ]),
    chunk([
      {
        executableCode: {
          id: 'code',
          language: 'PYTHON',
          code: 'raise Exception()',
        },
        thoughtSignature: 'code-signature',
      },
    ]),
    chunk([
      {
        codeExecutionResult: {
          id: 'code',
          outcome: 'OUTCOME_FAILED',
          output: 'Readable native failure',
        },
      },
    ]),
    chunk([{ text: 'Sunny' }], {
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: 'https://weather.test', title: 'Weather' } },
        ],
        groundingSupports: [
          {
            groundingChunkIndices: [0],
            segment: {
              text: 'Sunny',
              startIndex: 0,
              endIndex: 99,
              partIndex: 0,
            },
          },
        ],
        searchEntryPoint: { renderedContent: html },
      },
    }),
    chunk([
      {
        functionCall: { id: 'app', name: 'google_search', args: { app: true } },
        thoughtSignature: 'app-signature',
      },
    ]),
    chunk([{ text: '', thoughtSignature: 'trailing-signature' }], {
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: 'https://later.test', title: 'Later' } },
        ],
        groundingSupports: [
          { groundingChunkIndices: [1], segment: { text: 'Warm' } },
        ],
        searchEntryPoint: { renderedContent: laterHtml },
      },
      finishReason: 'STOP',
    }),
  ];
  const expectedContents = chunks.map((value) => value.candidates?.[0].content);
  const store = rootStore();

  for await (const event of mapGoogleEvents({
    events: source(chunks),
    messageId: 'answer',
  }))
    store.dispatch(apiActions.generateMessageEvent(event));
  const assistant = views(store).find(
    (message) => message.role === 'assistant',
  );
  const committed = commit(store);
  const wire = JSON.parse(JSON.stringify(request(committed)));
  const restored = rootStore();
  restored.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: wire.messages,
    }),
  );
  const restoredMessages = restored.read((value) => value.agUiMessages.draft);
  const next = createGoogleRequestOptions(
    request([
      ...restoredMessages,
      {
        id: 'app-result',
        role: 'tool',
        toolCallId: 'app',
        content: 'App result',
      },
    ]),
    'model',
  );

  expect(
    store.read((value) => value.agUiMessages.protocolError),
  ).toBeUndefined();
  expect(
    restored.read((value) => value.agUiMessages.protocolError),
  ).toBeUndefined();
  expect(assistant?.serverToolCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        toolCallId: 'search',
        kind: 'provider',
        outcome: 'success',
        status: 'complete',
      }),
      expect.objectContaining({
        toolCallId: 'code',
        kind: 'provider',
        outcome: 'failure',
        status: 'complete',
        error: expect.objectContaining({ code: 'OUTCOME_FAILED' }),
      }),
    ]),
  );
  expect(assistant?.citations).toEqual([
    { sourceId: 'response-1:source:0', quote: 'Sunny' },
    { sourceId: 'response-1:source:1', quote: 'Warm' },
  ]);
  expect(assistant?.attribution).toEqual([
    { provider: 'google', kind: 'search-suggestions', html, mustRender: true },
    {
      provider: 'google',
      kind: 'search-suggestions',
      html: laterHtml,
      mustRender: true,
    },
  ]);
  expect(next.contents).toEqual([
    ...expectedContents,
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'app',
            name: 'google_search',
            response: { result: 'App result' },
          },
        },
      ],
    },
  ]);
  expect(
    committed.find((message) => message.id === 'answer')?.metadata?.[
      'hashbrown.provider-history'
    ],
  ).toMatchObject({
    complete: true,
    provider: 'google',
    payload: { contents: expectedContents },
  });
});

test('keeps a later provider result after app results and gives it a fresh native response owner', async () => {
  const pending: Part = {
    toolCall: {
      id: 'pending',
      toolType: 'GOOGLE_SEARCH_WEB' as never,
      args: { queries: ['later'] },
    },
    thoughtSignature: 'pending-signature',
  };
  const app: Part = { functionCall: { id: 'app', name: 'lookup', args: {} } };
  const first = rootStore();
  for await (const event of mapGoogleEvents({
    events: source([chunk([pending, app])]),
    messageId: 'first',
  }))
    first.dispatch(apiActions.generateMessageEvent(event));
  const history: Message[] = [
    ...commit(first),
    {
      id: 'app-result',
      role: 'tool',
      toolCallId: 'app',
      content: 'App result',
    },
  ];
  const previous = createGoogleRequestOptions(request(history), 'model');
  const resultPart = {
    toolResponse: {
      id: 'pending',
      toolType: 'GOOGLE_SEARCH_WEB',
      response: {},
    },
    thoughtSignature: 'later-result-signature',
  };
  const later = rootStore(history);

  for await (const event of mapGoogleEvents({
    events: source([chunk([resultPart], {}, 'later-response')]),
    messageId: 'later',
    inputMessages: history,
    requestOptions: previous,
  }))
    later.dispatch(apiActions.generateMessageEvent(event));
  const committed = commit(later);
  const next = createGoogleRequestOptions(request(committed), 'model');

  expect(
    later.read((value) => value.agUiMessages.protocolError),
  ).toBeUndefined();
  expect(
    committed.find((message) => message.id === 'later:provider-result:0:0')
      ?.metadata?.['hashbrown.provider-history'],
  ).toMatchObject({
    ownerMessageId: 'later:provider-result:0:0',
    responseId: 'later-response',
  });
  expect(next.contents).toEqual([
    { role: 'model', parts: [pending, app] },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'app',
            name: 'lookup',
            response: { result: 'App result' },
          },
        },
      ],
    },
    { role: 'model', parts: [resultPart] },
  ]);
});

test('attaches search annotations to the existing tool-only assistant without creating a text start', async () => {
  const html = '<div>Required suggestions</div>';
  const store = rootStore();
  const events = [];
  const chunks = [
    chunk([
      { toolCall: { id: 'search', toolType: 'GOOGLE_SEARCH_WEB', args: {} } },
    ]),
    chunk([
      {
        toolResponse: {
          id: 'search',
          toolType: 'GOOGLE_SEARCH_WEB',
          response: { search_suggestions: html },
        },
      },
    ]),
  ];

  for await (const event of mapGoogleEvents({
    events: source(chunks),
    messageId: 'answer',
  })) {
    events.push(event);
    store.dispatch(apiActions.generateMessageEvent(event));
  }
  const assistant = views(store).find(
    (message) => message.role === 'assistant',
  );
  const committed = commit(store);
  const next = createGoogleRequestOptions(
    request(JSON.parse(JSON.stringify(committed))),
    'model',
  );

  expect(
    events.some((event) => event.type === EventType.TEXT_MESSAGE_START),
  ).toBe(false);
  expect(
    store.read((value) => value.agUiMessages.protocolError),
  ).toBeUndefined();
  expect(assistant?.attribution).toEqual([
    { provider: 'google', kind: 'search-suggestions', html, mustRender: true },
  ]);
  expect(next.contents).toEqual(
    chunks.map((value) => value.candidates?.[0].content),
  );
});

test('restores native replay when the first SDK response ID arrives after text started', async () => {
  const early = {
    candidates: [
      { index: 0, content: { role: 'model', parts: [{ text: 'Early ' }] } },
    ],
  } as GenerateContentResponse;
  const late = chunk(
    [{ text: 'late', thoughtSignature: 'tail' }],
    {},
    'late-native-id',
  );
  const store = rootStore();

  for await (const event of mapGoogleEvents({
    events: source([early, late]),
    messageId: 'answer',
  }))
    store.dispatch(apiActions.generateMessageEvent(event));
  const committed = JSON.parse(JSON.stringify(commit(store))) as Message[];
  const next = createGoogleRequestOptions(request(committed), 'model');

  expect(
    store.read((value) => value.agUiMessages.protocolError),
  ).toBeUndefined();
  expect(
    committed.find((message) => message.id === 'answer')?.metadata?.[
      'hashbrown.provider-history'
    ],
  ).toMatchObject({ responseId: 'answer:response' });
  expect(next.contents).toEqual([
    early.candidates?.[0].content,
    late.candidates?.[0].content,
  ]);
});
