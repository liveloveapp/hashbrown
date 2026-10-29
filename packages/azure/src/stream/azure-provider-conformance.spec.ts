/* eslint-disable @nx/enforce-module-boundaries -- Exercises the real root store without adding public test APIs. */
import { EventType, type Message } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import type OpenAI from 'openai';
import {
  apiActions,
  devActions,
  internalActions,
} from '../../../core/src/actions';
import { s } from '../../../core/src/schema';
import { isProviderToolCall } from '../../../core/src/models/tool-step';
import {
  reducers,
  selectToolCallEntities,
  selectViewMessages,
  ɵprepareRootAction,
  ɵselectAttemptOwnedPendingToolCalls,
  ɵselectCommittedAgUiMessages,
} from '../../../core/src/reducers';
import { createCanonicalRunAgentInput } from '../../../core/src/transport/hashbrown-run-agent-input';
import { createStore } from '../../../core/src/utils/micro-ngrx';
import { mapAzureEvents } from './azure-events';
import { createAzureRequestOptions } from './azure-request';

type NativeEvent = OpenAI.Responses.ResponseStreamEvent;
const clientTool = {
  name: 'code_interpreter',
  description: 'An ordinary application tool with the same name',
  schema: s.object('App arguments', { app: s.boolean('Run the app tool') }),
  handler: jest.fn(async () => 'app result'),
};

/** Builds a native SDK event without requiring irrelevant fixture fields. */
function frame(value: object): NativeEvent {
  return { sequence_number: 0, ...value } as NativeEvent;
}

/** Supplies native events through the same asynchronous mapper seam as the SDK. */
async function* source(events: readonly NativeEvent[]) {
  yield* events;
}

/** Freezes fixture graphs to detect mutations of native input and restored history. */
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Creates an effects-free real root store with a colliding registered client tool. */
function rootStore() {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({ system: '', canonicalMessages: [], tools: [clientTool] }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: { code_interpreter: clientTool },
    }),
  );
  return store;
}

/** Projects committed and live messages through the public assistant projector. */
function views(store: ReturnType<typeof rootStore>) {
  return store.read(selectViewMessages);
}

/** Reads the assistant's provider calls while allowing separate assistant fragments. */
function calls(store: ReturnType<typeof rootStore>) {
  return views(store).flatMap((message) =>
    message.role === 'assistant' ? (message.serverToolCalls ?? []) : [],
  );
}

/** Commits the native AG-UI history, as a successful transport turn does. */
function commit(store: ReturnType<typeof rootStore>) {
  store.dispatch(
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: [] },
      toolCalls: [],
    }),
  );
  return store.read(ɵselectCommittedAgUiMessages);
}

/** Builds the next canonical request from restored native messages. */
function request(messages: readonly Message[]) {
  return createCanonicalRunAgentInput({
    threadId: 'thread',
    runId: 'next',
    messages,
    state: undefined,
    tools: [],
  });
}

/** Constructs one native execution with distinct container and output identities. */
function codeItem(id: string, code: string | null, status = 'completed') {
  return {
    id,
    type: 'code_interpreter_call',
    code,
    status,
    container_id: `container-${id}`,
    outputs: [
      { type: 'logs', logs: `logs-${id}` },
      { type: 'image', url: `https://files.test/${id}.png` },
    ],
  };
}

/** Restores a wire snapshot in a fresh root store. */
function restore(messages: readonly Message[]) {
  const store = rootStore();
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [...messages],
    }),
  );
  expect(
    store.read((value) => value.agUiMessages.protocolError),
  ).toBeUndefined();
  return store;
}

test.each(['failed', 'incomplete'])(
  'projects interleaved native code success and %s through live state, commit, restore and exact stateless replay',
  async (failureStatus) => {
    const success = codeItem('ci-success', 'print("ok")');
    const failure = codeItem('ci-failure', 'raise Exception()', failureStatus);
    const annotation = {
      type: 'container_file_citation',
      file_id: 'file-report',
      container_id: 'container-ci-success',
      filename: 'report.csv',
      start_index: 0,
      end_index: 4,
    };
    const image = {
      type: 'url_citation',
      url: 'https://files.test/ci-success.png',
      title: 'Chart',
      start_index: 5,
      end_index: 10,
    };
    const answer = {
      type: 'message',
      id: 'native-answer',
      role: 'assistant',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text: 'File chart',
          annotations: [annotation, image],
        },
      ],
    };
    const app = {
      type: 'function_call',
      id: 'native-app',
      call_id: 'app',
      name: 'code_interpreter',
      arguments: '{"app":true}',
      status: 'completed',
    };
    const native = freeze([
      frame({
        type: 'response.output_item.added',
        output_index: 0,
        item: codeItem('ci-success', null, 'in_progress'),
      }),
      frame({
        type: 'response.output_item.added',
        output_index: 1,
        item: codeItem('ci-failure', null, 'in_progress'),
      }),
      frame({
        type: 'response.code_interpreter_call_code.delta',
        item_id: 'ci-success',
        output_index: 0,
        delta: 'print(',
      }),
      frame({
        type: 'response.code_interpreter_call_code.delta',
        item_id: 'ci-failure',
        output_index: 1,
        delta: 'raise ',
      }),
      frame({
        type: 'response.code_interpreter_call_code.done',
        item_id: 'ci-success',
        output_index: 0,
        code: success.code,
      }),
      frame({
        type: 'response.output_item.done',
        output_index: 1,
        item: failure,
      }),
      frame({
        type: 'response.output_item.done',
        output_index: 0,
        item: success,
      }),
      frame({
        type: 'response.output_text.annotation.added',
        item_id: 'native-answer',
        content_index: 0,
        annotation_index: 0,
        annotation,
      }),
      frame({
        type: 'response.output_text.delta',
        item_id: 'native-answer',
        content_index: 0,
        delta: 'File ',
      }),
      frame({
        type: 'response.output_item.added',
        output_index: 3,
        item: { ...app, arguments: '' },
      }),
      frame({ type: 'response.output_item.done', output_index: 3, item: app }),
      frame({
        type: 'response.completed',
        response: { output: [success, failure, answer, app] },
      }),
    ]);
    const nativeBefore = JSON.stringify(native);
    const store = rootStore();
    const snapshots: ReturnType<typeof calls>[] = [];

    for await (const event of mapAzureEvents({
      events: source(native),
      messageId: 'answer',
    })) {
      store.dispatch(
        apiActions.generateMessageEvent(EventSchemas.parse(event)),
      );
      snapshots.push(calls(store));
      expect(
        store.read(ɵselectAttemptOwnedPendingToolCalls).map((call) => call.id),
      ).not.toEqual(expect.arrayContaining(['ci-success']));
      expect(
        store.read(ɵselectAttemptOwnedPendingToolCalls).map((call) => call.id),
      ).not.toEqual(expect.arrayContaining(['ci-failure']));
    }
    const live = views(store).find((message) => message.role === 'assistant');
    const committed = commit(store);
    const wire: Message[] = freeze(
      JSON.parse(
        JSON.stringify([
          ...committed,
          {
            id: 'app-result',
            role: 'tool',
            toolCallId: 'app',
            content: 'app result',
          },
        ]),
      ),
    );
    const wireBefore = JSON.stringify(wire);
    const restored = restore(wire);
    const restoredMessages = restored.read((value) => value.agUiMessages.draft);
    const next = createAzureRequestOptions(
      request(restoredMessages),
      'gpt-4.1',
      undefined,
    );
    const failedResult = committed.find(
      (message) =>
        message.role === 'tool' && message.toolCallId === 'ci-failure',
    );

    expect(
      store.read((value) => value.agUiMessages.protocolError),
    ).toBeUndefined();
    expect(
      snapshots.some((snapshot) =>
        snapshot.some(
          (call) =>
            call.toolCallId === 'ci-success' &&
            call.status === 'inProgress' &&
            call.result === undefined,
        ),
      ),
    ).toBe(true);
    expect(calls(store)).toEqual([
      expect.objectContaining({
        toolCallId: 'ci-success',
        kind: 'provider',
        builtin: 'code_execution',
        icon: 'run',
        label: expect.any(String),
        status: 'complete',
        outcome: 'success',
        args: { code: success.code },
        result: { status: 'fulfilled', value: JSON.stringify(success) },
        sources: [
          {
            id: 'ci-success:image:1',
            kind: 'url',
            title: 'https://files.test/ci-success.png',
            href: 'https://files.test/ci-success.png',
          },
        ],
      }),
      expect.objectContaining({
        toolCallId: 'ci-failure',
        kind: 'provider',
        status: 'complete',
        outcome: 'failure',
        args: { code: failure.code },
        error: {
          message:
            failureStatus === 'incomplete'
              ? 'Code execution incomplete'
              : 'Code execution failed',
        },
        result: {
          status: 'rejected',
          reason: {
            message:
              failureStatus === 'incomplete'
                ? 'Code execution incomplete'
                : 'Code execution failed',
          },
        },
      }),
    ]);
    expect(
      failedResult?.content && JSON.parse(failedResult.content as string),
    ).toMatchObject(failure);
    expect(live?.sources).toEqual([
      {
        id: 'answer:cite:0',
        kind: 'file',
        title: 'report.csv',
        fileId: 'file-report',
        containerId: 'container-ci-success',
      },
    ]);
    expect(live?.citations).toEqual([
      { sourceId: 'answer:cite:0', quote: 'File', block: 0, start: 0, end: 4 },
      {
        sourceId: 'ci-success:image:1',
        quote: 'chart',
        block: 0,
        start: 5,
        end: 10,
      },
    ]);
    expect(
      views(restored).find((message) => message.role === 'assistant'),
    ).toMatchObject({ sources: live?.sources, citations: live?.citations });
    expect(calls(restored)).toEqual(calls(store));
    expect(
      isProviderToolCall(store.read(selectToolCallEntities)['ci-success']),
    ).toBe(true);
    expect(isProviderToolCall(store.read(selectToolCallEntities)['app'])).toBe(
      false,
    );
    expect(
      store.read(ɵselectAttemptOwnedPendingToolCalls).map((call) => call.id),
    ).toEqual(['app']);
    expect(next.store).toBe(false);
    expect(next.input).toEqual([
      {
        type: 'message',
        id: 'native-answer',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'File chart', annotations: [] }],
      },
      {
        type: 'function_call',
        id: 'native-app',
        call_id: 'app',
        name: 'code_interpreter',
        arguments: '{"app":true}',
      },
      { type: 'function_call_output', call_id: 'app', output: 'app result' },
    ]);
    expect(JSON.stringify(native)).toBe(nativeBefore);
    expect(JSON.stringify(wire)).toBe(wireBefore);
    expect(
      snapshots.some((snapshot) =>
        snapshot.some(
          (call) =>
            call.toolCallId === 'ci-success' &&
            call.status === 'executing' &&
            call.result === undefined &&
            call.outcome === undefined,
        ),
      ),
    ).toBe(true);
  },
);

test('retains failure precedence when an authoritative completed correction reuses the native result identity', async () => {
  const failed = codeItem('ci-corrected', null, 'failed');
  const corrected = codeItem('ci-corrected', null);
  const store = rootStore();

  for await (const event of mapAzureEvents({
    events: source([
      frame({
        type: 'response.output_item.done',
        output_index: 0,
        item: failed,
      }),
      frame({ type: 'response.completed', response: { output: [corrected] } }),
    ]),
    messageId: 'answer',
  }))
    store.dispatch(apiActions.generateMessageEvent(EventSchemas.parse(event)));
  const committed = commit(store);
  const restored = restore(freeze(JSON.parse(JSON.stringify(committed))));
  const next = createAzureRequestOptions(
    request(restored.read((value) => value.agUiMessages.draft)),
    'gpt-4.1',
    undefined,
  );

  expect(
    store.read((value) => value.agUiMessages.protocolError),
  ).toBeUndefined();
  expect(calls(store)).toEqual([
    expect.objectContaining({
      toolCallId: 'ci-corrected',
      status: 'complete',
      outcome: 'failure',
      args: {},
      result: {
        status: 'rejected',
        reason: { message: 'Code execution failed' },
      },
    }),
  ]);
  expect(calls(restored)).toEqual(calls(store));
  expect(
    committed.filter(
      (message) =>
        message.role === 'tool' && message.toolCallId === 'ci-corrected',
    ),
  ).toHaveLength(1);
  expect(next.input).toEqual([]);
});

test.each([undefined, { v: 99, kind: 'provider' }, { v: 1, status: 5 }])(
  'omits native provider calls and synthetic results with unreadable display step %p after root snapshot restore',
  (step) => {
    const history: Message[] = freeze([
      {
        id: 'native',
        role: 'assistant',
        toolCalls: [
          {
            id: 'provider',
            type: 'function',
            function: { name: 'code_interpreter', arguments: '{}' },
            metadata: {
              azure: { itemId: 'provider', itemType: 'code_interpreter_call' },
              ...(step === undefined ? {} : { 'b4.step': step }),
            },
          },
          {
            id: 'app',
            type: 'function',
            function: { name: 'code_interpreter', arguments: '{"app":true}' },
          },
        ],
      },
      {
        id: 'provider:result',
        role: 'tool',
        toolCallId: 'provider',
        content: 'provider result',
      },
      {
        id: 'app:result',
        role: 'tool',
        toolCallId: 'app',
        content: 'app result',
      },
    ]);
    const before = JSON.stringify(history);
    const store = restore(history);

    const next = createAzureRequestOptions(
      request(store.read((value) => value.agUiMessages.draft)),
      'gpt-4.1',
      undefined,
    );

    expect(next.input).toEqual([
      {
        type: 'function_call',
        call_id: 'app',
        name: 'code_interpreter',
        arguments: '{"app":true}',
      },
      { type: 'function_call_output', call_id: 'app', output: 'app result' },
    ]);
    expect(JSON.stringify(history)).toBe(before);
  },
);

test.each(['raw-error', 'failed-step'])(
  'keeps ordinary server result failure in the next model request after a %s correction',
  (failure) => {
    const history: Message[] = freeze([
      {
        id: 'assistant',
        role: 'assistant',
        toolCalls: [
          {
            id: 'app',
            type: 'function',
            function: { name: 'code_interpreter', arguments: '{"app":true}' },
          },
        ],
      },
      {
        id: 'result',
        role: 'tool',
        toolCallId: 'app',
        content: 'old result',
        ...(failure === 'raw-error'
          ? { error: 'Original failure' }
          : {
              metadata: {
                'b4.step': {
                  v: 1,
                  kind: 'server',
                  status: 'failed',
                  error: { message: 'Original failure' },
                },
              },
            }),
      },
    ]);
    const store = restore(history);

    store.dispatch(
      apiActions.generateMessageEvent({
        type: EventType.TOOL_CALL_RESULT,
        messageId: 'result',
        toolCallId: 'app',
        content: 'corrected result',
        error: '',
        metadata: { 'b4.step': { v: 1, kind: 'server', status: 'completed' } },
      } as Parameters<typeof apiActions.generateMessageEvent>[0]),
    );
    const committed = commit(store);
    const restored = restore(freeze(JSON.parse(JSON.stringify(committed))));
    const next = createAzureRequestOptions(
      request(restored.read((state) => state.agUiMessages.draft)),
      'gpt-4.1',
      undefined,
    );

    expect(committed.find((message) => message.id === 'result')).toMatchObject({
      content: 'corrected result',
      error: 'Original failure',
    });
    expect(next.input).toEqual([
      {
        type: 'function_call',
        call_id: 'app',
        name: 'code_interpreter',
        arguments: '{"app":true}',
      },
      {
        type: 'function_call_output',
        call_id: 'app',
        output: '{"error":"Original failure"}',
      },
    ]);
    expect(
      store.read((state) => state.agUiMessages.protocolError),
    ).toBeUndefined();
  },
);
