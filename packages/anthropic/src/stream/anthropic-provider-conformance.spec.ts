/* eslint-disable @nx/enforce-module-boundaries -- This integration test drives the real internal root store without publishing test-only APIs. */
import { EventType, type Message } from '@ag-ui/core';
import {
  apiActions,
  devActions,
  internalActions,
} from '../../../core/src/actions';
import { createStore } from '../../../core/src/utils/micro-ngrx';
import {
  reducers,
  selectMessages,
  selectStreamingMessage,
  selectStreamingToolCallEntities,
  selectToolCallEntities,
  ɵprepareRootAction,
  ɵselectCommittedAgUiMessages,
} from '../../../core/src/reducers';
import { toViewMessagesFromInternal } from '../../../core/src/models/internal_helpers';
import { createCanonicalRunAgentInput } from '../../../core/src/transport/hashbrown-run-agent-input';
import { mapAnthropicEvents } from './anthropic-events';
import { createAnthropicRequestOptions } from './anthropic-request';
import {
  contentStop,
  messageStart,
  messageStop,
  rawEvent,
  toAsyncIterable,
} from './anthropic-events.test-utils';

function block(index: number, content_block: unknown) {
  return rawEvent({ type: 'content_block_start', index, content_block });
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

function request(messages: readonly Message[]) {
  return createCanonicalRunAgentInput({
    threadId: 'thread',
    runId: 'next',
    messages: [...messages],
    state: undefined,
    tools: [],
  });
}

test('native provider steps survive root-store commit, wire snapshot restore, and exact request replay', async () => {
  const native = [
    { type: 'thinking', thinking: 'Plan', signature: 'opaque-signature' },
    {
      type: 'server_tool_use',
      id: 'search',
      name: 'web_search',
      input: { query: 'weather' },
      caller: { type: 'direct' },
    },
    {
      type: 'web_search_tool_result',
      tool_use_id: 'search',
      content: [
        {
          type: 'web_search_result',
          url: 'https://weather.test',
          title: 'Weather',
          encrypted_content: 'opaque-result',
          page_age: null,
        },
      ],
    },
    {
      type: 'server_tool_use',
      id: 'failed-fetch',
      name: 'web_fetch',
      input: { url: 'https://failed.test' },
      caller: { type: 'direct' },
    },
    {
      type: 'web_fetch_tool_result',
      tool_use_id: 'failed-fetch',
      content: {
        type: 'web_fetch_tool_result_error',
        error_code: 'url_not_allowed',
      },
    },
    {
      type: 'text',
      text: 'Sunny',
      citations: [
        {
          type: 'web_search_result_location',
          url: 'https://weather.test',
          title: null,
          encrypted_index: 'opaque-index',
          cited_text: 'sunny',
        },
      ],
    },
    {
      type: 'tool_use',
      id: 'app',
      name: 'web_search',
      input: { app: true },
      caller: { type: 'direct' },
    },
  ];
  const store = rootStore();
  const events = [
    messageStart(),
    ...native.flatMap((value, index) => [
      block(index, value),
      contentStop(index),
    ]),
    rawEvent({
      type: 'message_delta',
      delta: {
        stop_reason: 'tool_use',
        stop_sequence: null,
        container: {
          id: 'container',
          expires_at: '2026-10-23T00:00:00Z',
          skills: null,
        },
      },
      usage: { output_tokens: 10 },
    }),
    messageStop(),
  ];

  for await (const event of mapAnthropicEvents({
    events: toAsyncIterable(events),
    messageId: 'answer',
  }))
    store.dispatch(apiActions.generateMessageEvent(event));
  const state = store.read((value) => value);
  const streaming = selectStreamingMessage(state);
  const calls = {
    ...selectToolCallEntities(state),
    ...selectStreamingToolCallEntities(state),
  };
  const views = [
    ...selectMessages(state).filter((message) => message.id !== streaming?.id),
    ...(streaming ? [streaming] : []),
  ].flatMap((message) => toViewMessagesFromInternal(message, calls, []));
  const assistant = views.find((message) => message.role === 'assistant');
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
  const next = createAnthropicRequestOptions(
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

  expect(state.agUiMessages.protocolError).toBeUndefined();
  expect(assistant?.serverToolCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        toolCallId: 'search',
        kind: 'provider',
        status: 'complete',
        outcome: 'success',
        sources: [expect.objectContaining({ id: 'search:0' })],
      }),
      expect.objectContaining({
        toolCallId: 'failed-fetch',
        kind: 'provider',
        status: 'complete',
        outcome: 'failure',
        error: expect.objectContaining({ code: 'url_not_allowed' }),
      }),
    ]),
  );
  expect(assistant?.citations).toEqual([
    { sourceId: 'search:0', quote: 'sunny' },
  ]);

  expect(
    committed.find((message) => message.id === 'answer')?.metadata?.[
      'hashbrown.provider-history'
    ],
  ).toMatchObject({ complete: true, payload: { blocks: native } });
  expect(
    committed.find(
      (message) =>
        message.role === 'tool' && message.toolCallId === 'failed-fetch',
    )?.metadata?.['b4.step'],
  ).toMatchObject({ status: 'failed', error: { code: 'url_not_allowed' } });
  expect(
    committed.find((message) => message.id === 'answer')?.metadata?.[
      'b4.answer'
    ],
  ).toMatchObject({ citations: [{ sourceId: 'search:0', quote: 'sunny' }] });
  expect(next.container).toBe('container');
  expect(next.messages).toEqual([
    { role: 'assistant', content: native },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'app', content: 'App result' },
      ],
    },
  ]);
});

test('a later result replays after intervening app results and keeps its own response owner', async () => {
  const pending = {
    type: 'server_tool_use',
    id: 'pending',
    name: 'web_search',
    input: { query: 'later' },
    caller: { type: 'direct' },
  };
  const app = { type: 'tool_use', id: 'app', name: 'lookup', input: {} };
  const first = rootStore();
  const firstEvents = [
    messageStart(),
    block(0, pending),
    contentStop(0),
    block(1, app),
    contentStop(1),
    messageStop(),
  ];
  for await (const event of mapAnthropicEvents({
    events: toAsyncIterable(firstEvents),
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
  const previous = createAnthropicRequestOptions(request(history), 'model');
  const settled = {
    type: 'web_search_tool_result',
    tool_use_id: 'pending',
    content: [],
  };
  const laterStart = rawEvent({
    ...messageStart(),
    message: {
      ...(messageStart() as unknown as { message: object }).message,
      id: 'later-response',
    },
  });
  const later = rootStore(history);

  for await (const event of mapAnthropicEvents({
    events: toAsyncIterable([
      laterStart,
      block(0, settled),
      contentStop(0),
      messageStop(),
    ]),
    messageId: 'later',
    requestOptions: previous,
    inputMessages: history,
  }))
    later.dispatch(apiActions.generateMessageEvent(event));
  const messages = commit(later);
  const next = createAnthropicRequestOptions(request(messages), 'model');

  expect(
    later.read((value) => value.agUiMessages.protocolError),
  ).toBeUndefined();
  expect(
    messages.find((message) => message.id === 'later:provider-result:0')
      ?.metadata?.['hashbrown.provider-history'],
  ).toMatchObject({
    responseId: 'later-response',
    ownerMessageId: 'later:provider-result:0',
  });
  expect(next.messages).toEqual([
    { role: 'assistant', content: [pending, app] },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'app', content: 'App result' },
      ],
    },
    { role: 'assistant', content: [settled] },
  ]);
});
