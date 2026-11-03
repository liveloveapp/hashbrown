import { type AGUIEvent, EventType } from '@ag-ui/core';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  type ConversationSnapshot,
  s,
  type TransportRequest,
} from '@hashbrownai/core';
import { HashbrownProvider } from '../hashbrown-provider';
import { useStructuredCompletion } from './use-structured-completion';
import { useStructuredCompletionWithMessage } from './use-structured-completion-with-message';
import { useStructuredChat } from './use-structured-chat';
import { useUiCompletion } from './use-ui-completion';
import { exposeComponent } from '../expose-component.fn';

test('useStructuredCompletion exposes runtime-owned shared agent state', () => {
  // Arrange
  const initialState = { accountId: 'account-1' };

  const { result, rerender } = renderHook(
    ({ state }: { state: { accountId: string } }) =>
      useStructuredCompletion({
        input: null,
        system: 'Summarize the account.',
        schema: s.object('summary', { value: s.string('value') }),
        state,
      }),
    {
      initialProps: { state: initialState },
      wrapper: ProviderWrapper,
    },
  );

  // Act
  rerender({ state: { accountId: 'account-2' } });

  // Assert
  expect(result.current.state).toEqual(initialState);

  // Act
  act(() => result.current.setState({ accountId: 'account-3' }));

  // Assert
  expect(result.current.state).toEqual({ accountId: 'account-3' });
});

test('useStructuredCompletion retains the configured system message in runtime requests', async () => {
  // Arrange
  const send = vi.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));

  // Act
  renderHook(
    () =>
      useStructuredCompletion({
        input: 'Summarize this account.',
        system: 'Return a concise account summary.',
        schema: s.object('summary', { value: s.string('value') }),
        debounceTime: 0,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <HashbrownProvider transport={{ name: 'test', send }}>
          {children}
        </HashbrownProvider>
      ),
    },
  );

  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

  // Assert
  expect(send.mock.calls[0]?.[0].input.messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: 'system',
        content: 'Return a concise account summary.',
      }),
      expect.objectContaining({
        role: 'user',
        content: 'Summarize this account.',
      }),
    ]),
  );
});

test('the completion exposes the assistant message its output comes from', async () => {
  // Arrange
  const send = vi.fn(async (request: TransportRequest) => ({
    events: (async function* () {
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      yield { type: EventType.RUN_STARTED, ...identity };
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'answer',
        role: 'assistant',
      };
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'answer',
        delta: '{"value":"done"}',
      };
      yield { type: EventType.TEXT_MESSAGE_END, messageId: 'answer' };
      yield { type: EventType.RUN_FINISHED, ...identity };
    })(),
  }));

  // Act
  const { result } = renderHook(
    () =>
      useStructuredCompletionWithMessage({
        input: 'Summarize this account.',
        system: 'Return a concise account summary.',
        schema: s.object('summary', { value: s.string('value') }),
        debounceTime: 0,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <HashbrownProvider transport={{ name: 'test', send }}>
          {children}
        </HashbrownProvider>
      ),
    },
  );
  await waitFor(() =>
    expect(result.current.result.output).toEqual({ value: 'done' }),
  );

  // Assert
  expect(result.current.message?.id).toBe('answer');
  expect(result.current.message?.content).toBe(result.current.result.output);
});

function ProviderWrapper({ children }: { children: ReactNode }) {
  return <HashbrownProvider url="/chat">{children}</HashbrownProvider>;
}

function successfulEvents(request: TransportRequest) {
  return (async function* () {
    yield {
      type: EventType.RUN_STARTED,
      threadId: request.input.threadId,
      runId: request.input.runId,
    };
    yield {
      type: EventType.RUN_FINISHED,
      threadId: request.input.threadId,
      runId: request.input.runId,
    };
  })();
}

/** Reproduces the native canonical tool announcement without changing its raw empty content. */
function nativeCompletionSnapshot(
  answer?: string,
  mixed = false,
  announcement = '',
): ConversationSnapshot {
  return {
    threadId: 'native-thread',
    configuredSystemMessageId: 'native-system',
    messages: [
      { id: 'native-system', role: 'system', content: 'trusted' },
      { id: 'native-user', role: 'user', content: 'original input' },
      {
        id: 'native-announcement',
        role: 'assistant',
        content: announcement,
        toolCalls: [
          {
            id: 'native-browser',
            type: 'function',
            function: { name: 'getWeather', arguments: '{"city":"PDX"}' },
          },
          ...(mixed
            ? [
                {
                  id: 'native-protected',
                  type: 'function' as const,
                  function: {
                    name: 'lookupAirport',
                    arguments: '{"code":"PDX"}',
                  },
                },
              ]
            : []),
        ],
      },
      ...(answer !== undefined
        ? [
            {
              id: 'stored-browser-result',
              role: 'tool' as const,
              toolCallId: 'native-browser',
              content: 'known browser result',
            },
            {
              id: 'native-answer',
              role: 'assistant' as const,
              content: answer,
            },
          ]
        : []),
    ],
    ...(answer === undefined
      ? {
          pendingBrowserRecovery: {
            protocolVersion: 1 as const,
            serverRevision: 8,
            callIds: ['native-browser'],
          },
          ...(mixed
            ? {
                interrupts: [
                  {
                    id: 'ficc_native-protected',
                    reason: 'tool_call',
                    toolCallId: 'native-protected',
                    message: 'Approval required for tool call: lookupAirport',
                    responseSchema: {
                      type: 'object',
                      properties: { approved: { type: 'boolean' } },
                      required: ['approved'],
                    },
                  },
                ],
              }
            : {}),
        }
      : {}),
  };
}

/** Registers the real browser tool so canonical restoration validates its exact arguments. */
function nativeCompletionTools(
  handler: (args: { city: string }) => Promise<string>,
) {
  return [
    {
      name: 'getWeather',
      description: 'Weather',
      schema: s.object('args', { city: s.string('city') }),
      handler,
    },
  ];
}

test('structured completion ignores native empty and schema-valid tool announcements when restoring the first actual answer inertly', async () => {
  const handler = vi.fn(async () => 'must not replay');
  const send = vi.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));
  const tools = nativeCompletionTools(handler);
  const schema = s.object('answer', { value: s.string('value') });

  const transport = { name: 'inert-native-restore', send };
  for (const announcement of ['', '{"value":"tool explanation"}']) {
    const base = nativeCompletionSnapshot(
      '{"value":"first answer"}',
      false,
      announcement,
    );
    const snapshot: ConversationSnapshot = {
      ...base,
      messages: [
        ...base.messages,
        {
          id: 'later-answer',
          role: 'assistant',
          content: '{"value":"later answer"}',
        },
      ],
    };
    const original = JSON.stringify(snapshot);
    const { result, unmount } = renderHook(
      () =>
        useStructuredCompletionWithMessage({
          input: null,
          system: 'trusted',
          schema,
          tools,
          transport,
          threadId: 'native-thread',
          debounceTime: 0,
        }),
      { wrapper: ProviderWrapper },
    );

    try {
      act(() =>
        result.current.result.restoreConversation(snapshot, {
          expectedRevision: result.current.result.recovery.revision,
        }),
      );
      await act(async () => undefined);

      expect(result.current.result.output).toEqual({ value: 'first answer' });
      expect(result.current.message?.id).toBe('native-answer');
      expect(result.current.message?.content).toBe(
        result.current.result.output,
      );
      expect(result.current.result.error).toBeUndefined();
      expect(result.current.result.pendingConversationRecovery).toBeUndefined();
      expect(send).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      expect(JSON.stringify(snapshot)).toBe(original);
    } finally {
      unmount();
    }
  }
});

test('structured completion keeps native tool history exact through explicit mixed cold settlement and exposes the current answer identity', async () => {
  const requests: TransportRequest[] = [];
  const handler = vi.fn(async () => 'must not replay');
  const tools = nativeCompletionTools(handler);
  const retained = nativeCompletionSnapshot(undefined, true);
  const original = JSON.stringify(retained);
  const entries = [
    {
      interruptId: 'ficc_native-protected',
      status: 'resolved' as const,
      payload: { approved: false },
    },
  ];
  const send = vi.fn(async (request: TransportRequest) => {
    requests.push(request);
    const identity = {
      threadId: request.input.threadId,
      runId: request.input.runId,
    };
    return {
      events: (async function* (): AsyncGenerator<AGUIEvent> {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield {
          type: EventType.TOOL_CALL_RESULT,
          messageId: 'native-protected',
          toolCallId: 'native-protected',
          role: 'tool',
          content: 'Tool call invocation rejected.',
        };
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'cold-answer',
          role: 'assistant',
        };
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'cold-answer',
          delta: '{"value":"cold answer"}',
        };
        yield { type: EventType.TEXT_MESSAGE_END, messageId: 'cold-answer' };
        yield {
          type: EventType.RUN_FINISHED,
          ...identity,
          outcome: { type: 'success' },
        };
      })(),
    };
  });
  const transport = { name: 'native-cold-continuation', send };
  const schema = s.object('answer', { value: s.string('value') });
  const { result, unmount } = renderHook(
    () =>
      useStructuredCompletionWithMessage({
        input: null,
        system: 'trusted',
        schema,
        tools,
        transport,
        threadId: 'native-thread',
        debounceTime: 0,
      }),
    { wrapper: ProviderWrapper },
  );

  try {
    act(() =>
      result.current.result.restoreConversation(retained, {
        expectedRevision: result.current.result.recovery.revision,
      }),
    );
    await act(async () => undefined);
    const pending = result.current.result.pendingConversationRecovery;
    expect(pending).toBeDefined();
    expect(pending?.interrupts).toEqual(retained.interrupts);
    expect(requests).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
    if (!pending) throw new Error('Expected real pending browser recovery');
    act(() =>
      result.current.result.resumeConversationRecovery({
        batchId: pending.id,
        outcomes: [
          { toolCallId: 'native-browser', status: 'result', value: null },
        ],
        entries,
      }),
    );
    await waitFor(() => expect(result.current.result.isLoading).toBe(false));
    await waitFor(() => expect(requests).toHaveLength(1));
    await waitFor(() => expect(result.current.result.isResuming).toBe(false));

    expect(result.current.result.output).toEqual({ value: 'cold answer' });
    expect(result.current.message?.id).toBe('cold-answer');
    expect(
      requests[0].input.messages.slice(0, retained.messages.length),
    ).toEqual(retained.messages);
    expect(requests[0].input.messages.at(-1)).toEqual({
      id: expect.any(String),
      role: 'tool',
      toolCallId: 'native-browser',
      content: 'null',
    });
    expect(requests[0].input.resume).toEqual(entries);
    expect(requests[0].input.threadId).toBe(retained.threadId);
    expect(result.current.result.pendingConversationRecovery).toBeUndefined();
    expect(result.current.result.error).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
    expect(JSON.stringify(retained)).toBe(original);
  } finally {
    unmount();
  }
});

test('real UI completion renders the trusted native answer with its canonical id after inert tool-history restore', async () => {
  const handler = vi.fn(async () => 'must not replay');
  const send = vi.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));
  const tools = nativeCompletionTools(handler);
  const RecoveredButton = ({ label }: { label: string }) => (
    <button>{label}</button>
  );
  const components = [
    exposeComponent(RecoveredButton, {
      name: 'RecoveredButton',
      description: 'Trusted recovered button',
      props: { label: s.string('label') },
      children: false,
    }),
  ];
  const retained = nativeCompletionSnapshot(
    '{"ui":[{"RecoveredButton":{"props":{"label":"Recovered"}}}]}',
  );
  const original = JSON.stringify(retained);
  const transport = { name: 'native-ui-restore', send };
  const { result, unmount } = renderHook(
    () =>
      useUiCompletion({
        input: null,
        system: 'trusted',
        tools,
        components,
        threadId: 'native-thread',
        transport,
        debounceTime: 0,
      }),
    { wrapper: ProviderWrapper },
  );

  try {
    act(() =>
      result.current.restoreConversation(retained, {
        expectedRevision: result.current.recovery.revision,
      }),
    );
    await act(async () => undefined);

    expect(result.current.output?.id).toBe('native-answer');
    expect(result.current.output?.role).toBe('assistant');
    expect(result.current.output?.content).toBe(result.current.rawOutput);
    expect(result.current.rawOutput).toEqual({
      ui: [
        {
          RecoveredButton: {
            props: {
              complete: true,
              partialValue: { label: 'Recovered' },
              value: { label: 'Recovered' },
            },
          },
        },
      ],
    });
    expect(result.current.ui).toHaveLength(1);
    const view = render(result.current.ui);
    try {
      expect(view.getByRole('button', { name: 'Recovered' }).textContent).toBe(
        'Recovered',
      );
    } finally {
      view.unmount();
    }
    expect(send).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(JSON.stringify(retained)).toBe(original);
  } finally {
    unmount();
  }
});

test('structured completion preserves nested falsy answers and first eligible non-tool selection', async () => {
  const handler = vi.fn(async () => 'must not replay');
  const send = vi.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));
  const tools = nativeCompletionTools(handler);
  const base = nativeCompletionSnapshot(
    '{"flag":false,"count":0,"text":""}',
    false,
    '{"flag":true,"count":2,"text":"tool explanation"}',
  );
  const retained: ConversationSnapshot = {
    ...base,
    messages: [
      ...base.messages,
      {
        id: 'later-answer',
        role: 'assistant',
        content: '{"flag":true,"count":3,"text":"later"}',
      },
    ],
  };
  const transport = { name: 'falsy-answer-restore', send };
  const schema = s.object('answer', {
    flag: s.boolean('flag'),
    count: s.number('count'),
    text: s.string('text'),
  });
  const { result, unmount } = renderHook(
    () =>
      useStructuredCompletionWithMessage({
        input: null,
        system: 'trusted',
        schema,
        tools,
        threadId: 'native-thread',
        transport,
      }),
    { wrapper: ProviderWrapper },
  );

  try {
    act(() =>
      result.current.result.restoreConversation(retained, {
        expectedRevision: result.current.result.recovery.revision,
      }),
    );
    await act(async () => undefined);

    expect(result.current.result.output).toEqual({
      flag: false,
      count: 0,
      text: '',
    });
    expect(result.current.message?.id).toBe('native-answer');
    expect(send).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  } finally {
    unmount();
  }
});

test('structured completion keeps a legitimate non-tool empty-string answer and its own canonical id', async () => {
  const handler = vi.fn(async () => 'must not replay');
  const send = vi.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));
  const tools = nativeCompletionTools(handler);
  const retained = nativeCompletionSnapshot('""');
  const transport = { name: 'empty-answer-restore', send };
  const schema = s.string('answer');
  const { result, unmount } = renderHook(
    () =>
      useStructuredCompletionWithMessage({
        input: null,
        system: 'trusted',
        schema,
        tools,
        threadId: 'native-thread',
        transport,
      }),
    { wrapper: ProviderWrapper },
  );

  try {
    act(() =>
      result.current.result.restoreConversation(retained, {
        expectedRevision: result.current.result.recovery.revision,
      }),
    );
    await act(async () => undefined);

    expect(result.current.result.output).toBe('');
    expect(result.current.message?.id).toBe('native-answer');
    expect(send).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  } finally {
    unmount();
  }
});

/** Keeps native Responses browser/protected announcements in distinct canonical parents. */
function splitNativeCompletionSnapshot(
  answer?: string,
  serverContent = '',
): ConversationSnapshot {
  const pending = nativeCompletionSnapshot(undefined, true);
  const announcement = pending.messages[2];
  if (announcement.role !== 'assistant' || announcement.toolCalls?.length !== 2)
    throw new Error('Expected canonical native browser and protected calls');
  return {
    threadId: pending.threadId,
    configuredSystemMessageId: pending.configuredSystemMessageId,
    messages: [
      ...pending.messages.slice(0, 2),
      {
        ...announcement,
        id: 'native-browser-parent',
        toolCalls: [announcement.toolCalls[0]],
      },
      {
        ...announcement,
        id: 'native-protected-parent',
        content: serverContent,
        toolCalls: [announcement.toolCalls[1]],
      },
      ...(answer === undefined
        ? []
        : [
            {
              id: 'stored-browser-result',
              role: 'tool' as const,
              toolCallId: 'native-browser',
              content: 'known browser result',
            },
            {
              id: 'stored-protected-result',
              role: 'tool' as const,
              toolCallId: 'native-protected',
              content: 'Tool call invocation rejected.',
            },
            { id: 'split-answer', role: 'assistant' as const, content: answer },
          ]),
    ],
    ...(answer === undefined
      ? {
          pendingBrowserRecovery: pending.pendingBrowserRecovery,
          interrupts: pending.interrupts,
        }
      : {}),
  };
}

test('structured completion skips empty server-only split announcements while preserving valid associated first answers on Completed restore', async () => {
  const handler = vi.fn(async () => 'must not replay');
  const send = vi.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));
  const tools = nativeCompletionTools(handler);
  const schema = s.object('answer', { value: s.string('value') });
  const transport = { name: 'split-completed-native', send };
  const options = {
    system: 'trusted',
    schema,
    tools,
    transport,
    threadId: 'native-thread',
    debounceTime: 0,
  };

  for (const serverContent of ['', '{"value":"server explanation"}']) {
    const base = splitNativeCompletionSnapshot(
      '{"value":"first split answer"}',
      serverContent,
    );
    const retained: ConversationSnapshot = {
      ...base,
      messages: [
        ...base.messages,
        {
          id: 'later-split-answer',
          role: 'assistant',
          content: '{"value":"later answer"}',
        },
      ],
    };
    const original = JSON.stringify(retained);
    const { result, unmount } = renderHook(
      () => ({
        completion: useStructuredCompletionWithMessage({
          ...options,
          input: null,
        }),
        view: useStructuredChat(options),
      }),
      { wrapper: ProviderWrapper },
    );

    try {
      act(() => {
        result.current.completion.result.restoreConversation(retained, {
          expectedRevision: result.current.completion.result.recovery.revision,
        });
        result.current.view.restoreConversation(retained, {
          expectedRevision: result.current.view.recovery.revision,
        });
      });
      await act(async () => undefined);

      expect(
        result.current.view.messages.find(
          (message) =>
            'id' in message && message.id === 'native-protected-parent',
        ),
      ).toMatchObject({
        role: 'assistant',
        toolCalls: [],
        serverToolCalls: [
          {
            toolCallId: 'native-protected',
            name: 'lookupAirport',
            args: { code: 'PDX' },
          },
        ],
      });
      expect(result.current.completion.result.output).toEqual({
        value:
          serverContent === '' ? 'first split answer' : 'server explanation',
      });
      expect(result.current.completion.message?.id).toBe(
        serverContent === '' ? 'split-answer' : 'native-protected-parent',
      );
      expect(result.current.completion.result.error).toBeUndefined();
      expect(handler).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(JSON.stringify(retained)).toBe(original);
    } finally {
      unmount();
    }
  }
});

test('structured completion preserves separate native parents through explicit browser-null and protected-decline recovery without handler replay', async () => {
  const requests: TransportRequest[] = [];
  const handler = vi.fn(async () => 'must not replay');
  const tools = nativeCompletionTools(handler);
  const retained = splitNativeCompletionSnapshot();
  const original = JSON.stringify(retained);
  const entries = [
    {
      interruptId: 'ficc_native-protected',
      status: 'resolved' as const,
      payload: { approved: false },
    },
  ];
  const schema = s.object('answer', { value: s.string('value') });
  const send = vi.fn(async (request: TransportRequest) => {
    requests.push(request);
    const identity = {
      threadId: request.input.threadId,
      runId: request.input.runId,
    };
    return {
      events: (async function* (): AsyncGenerator<AGUIEvent> {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield {
          type: EventType.TOOL_CALL_RESULT,
          messageId: 'native-protected',
          toolCallId: 'native-protected',
          role: 'tool',
          content: 'Tool call invocation rejected.',
        };
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'split-cold-answer',
          role: 'assistant',
        };
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'split-cold-answer',
          delta: '{"value":"split cold answer"}',
        };
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'split-cold-answer',
        };
        yield {
          type: EventType.RUN_FINISHED,
          ...identity,
          outcome: { type: 'success' },
        };
      })(),
    };
  });
  const transport = { name: 'split-cold-native', send };
  const { result, unmount } = renderHook(
    () =>
      useStructuredCompletionWithMessage({
        input: null,
        system: 'trusted',
        schema,
        tools,
        transport,
        threadId: 'native-thread',
        debounceTime: 0,
      }),
    { wrapper: ProviderWrapper },
  );

  try {
    act(() =>
      result.current.result.restoreConversation(retained, {
        expectedRevision: result.current.result.recovery.revision,
      }),
    );
    await act(async () => undefined);
    const beforeClaimOutput = result.current.result.output;
    const pending = result.current.result.pendingConversationRecovery;
    expect(pending).toBeDefined();
    expect(pending?.interrupts).toEqual(retained.interrupts);
    expect(requests).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
    if (!pending) throw new Error('Expected native split pending recovery');
    act(() =>
      result.current.result.resumeConversationRecovery({
        batchId: pending.id,
        outcomes: [
          { toolCallId: 'native-browser', status: 'result', value: null },
        ],
        entries,
      }),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    await waitFor(() => expect(result.current.result.isResuming).toBe(false));
    await waitFor(() => expect(result.current.result.isLoading).toBe(false));

    expect(
      requests[0].input.messages.slice(0, retained.messages.length),
    ).toEqual(retained.messages);
    expect(requests[0].input.messages[2].id).toBe('native-browser-parent');
    expect(requests[0].input.messages[3].id).toBe('native-protected-parent');
    expect(requests[0].input.messages.at(-1)).toEqual({
      id: expect.any(String),
      role: 'tool',
      toolCallId: 'native-browser',
      content: 'null',
    });
    expect(requests[0].input.resume).toEqual(entries);
    expect(result.current.result.pendingConversationRecovery).toBeUndefined();
    expect(result.current.result.error).toBeUndefined();
    expect(result.current.result.output).toEqual({
      value: 'split cold answer',
    });
    expect(result.current.message?.id).toBe('split-cold-answer');
    expect(beforeClaimOutput).toBeNull();
    expect(handler).not.toHaveBeenCalled();
    expect(JSON.stringify(retained)).toBe(original);
  } finally {
    unmount();
  }
});

test('real UI completion ignores separate native server-only parents and renders the current trusted answer id inertly', async () => {
  const handler = vi.fn(async () => 'must not replay');
  const send = vi.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));
  const tools = nativeCompletionTools(handler);
  const transport = { name: 'split-ui-native', send };
  const SplitButton = ({ label }: { label: string }) => (
    <button>{label}</button>
  );
  const components = [
    exposeComponent(SplitButton, {
      name: 'SplitButton',
      description: 'Trusted split answer',
      props: { label: s.string('label') },
      children: false,
    }),
  ];
  const retained = splitNativeCompletionSnapshot(
    '{"ui":[{"SplitButton":{"props":{"label":"Split recovered"}}}]}',
  );
  const original = JSON.stringify(retained);
  const { result, unmount } = renderHook(
    () =>
      useUiCompletion({
        input: null,
        system: 'trusted',
        tools,
        transport,
        components,
        threadId: 'native-thread',
        debounceTime: 0,
      }),
    { wrapper: ProviderWrapper },
  );

  try {
    act(() =>
      result.current.restoreConversation(retained, {
        expectedRevision: result.current.recovery.revision,
      }),
    );
    await act(async () => undefined);

    expect(result.current.output?.id).toBe('split-answer');
    expect(result.current.output?.content).toBe(result.current.rawOutput);
    expect(result.current.rawOutput).toEqual({
      ui: [
        {
          SplitButton: {
            props: {
              complete: true,
              partialValue: { label: 'Split recovered' },
              value: { label: 'Split recovered' },
            },
          },
        },
      ],
    });
    expect(result.current.ui).toHaveLength(1);
    const view = render(result.current.ui);
    try {
      expect(
        view.getByRole('button', { name: 'Split recovered' }).textContent,
      ).toBe('Split recovered');
    } finally {
      view.unmount();
    }
    expect(handler).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(JSON.stringify(retained)).toBe(original);
  } finally {
    unmount();
  }
});

/** Emits real typed provider-origin events with and without the optional normalized step metadata. */
function providerStepCompletionTransport(
  answer: string,
  options: {
    mixed?: boolean;
    emptyAnnouncement?: boolean;
    annotated?: boolean;
    statusless?: boolean;
    laterAnswer?: string;
  } = {},
) {
  const requests: TransportRequest[] = [];
  const annotated = options.annotated !== false;
  const send = vi.fn(async (request: TransportRequest) => {
    requests.push(request);
    const identity = {
      threadId: request.input.threadId,
      runId: request.input.runId,
    };
    const step = {
      v: 1,
      kind: 'provider',
      builtin: 'web_search',
      provider: 'openai',
    };
    const action = { type: 'search', query: 'hashbrown' };
    const startStep = options.statusless
      ? { v: 1, kind: 'provider', builtin: 'web_search' }
      : { ...step, status: 'running', startedAt: 1000 };
    const endStep = options.statusless
      ? { v: 1, kind: 'provider', builtin: 'web_search' }
      : { ...step, status: 'completed', startedAt: 1000, settledAt: 2000 };
    return {
      events: (async function* (): AsyncGenerator<AGUIEvent> {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'provider-answer',
          role: 'assistant',
        };
        yield {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'search-step',
          toolCallName: 'web_search',
          parentMessageId: 'provider-answer',
          metadata: {
            openai: { itemId: 'search-step', itemType: 'web_search_call' },
            ...(annotated ? { 'b4.step': startStep } : {}),
          },
        };
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'search-step',
          delta: JSON.stringify(action),
        };
        yield { type: EventType.TOOL_CALL_END, toolCallId: 'search-step' };
        yield {
          type: EventType.TOOL_CALL_RESULT,
          messageId: 'search-step:result',
          toolCallId: 'search-step',
          content: JSON.stringify({ action, status: 'completed' }),
          metadata: annotated ? { 'b4.step': endStep } : {},
        };
        if (options.mixed) {
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'native-server-call',
            toolCallName: 'lookupAirport',
            parentMessageId: 'provider-answer',
          };
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'native-server-call',
            delta: '{"code":"PDX"}',
          };
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'native-server-call',
          };
          yield {
            type: EventType.TOOL_CALL_RESULT,
            messageId: 'native-server-call:result',
            toolCallId: 'native-server-call',
            role: 'tool',
            content: 'Tool call invocation rejected.',
          };
        }
        if (!options.emptyAnnouncement)
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'provider-answer',
            delta: answer,
          };
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'provider-answer',
        };
        if (options.mixed) {
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'non-tool-answer',
            role: 'assistant',
          };
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'non-tool-answer',
            delta: options.laterAnswer ?? answer,
          };
          yield {
            type: EventType.TEXT_MESSAGE_END,
            messageId: 'non-tool-answer',
          };
        }
        yield {
          type: EventType.RUN_FINISHED,
          ...identity,
          outcome: { type: 'success' },
        };
      })(),
    };
  });
  return { requests, transport: { name: 'same-id-provider-completion', send } };
}

test('structured completion preserves nonempty provider and unclassified server-associated answers but skips only empty native-bearing announcements', async () => {
  const schema = s.object('answer', { value: s.string('value') });
  const tools: ReturnType<typeof nativeCompletionTools> = [];

  for (const mode of ['provider-only', 'mixed-answer', 'mixed-empty'])
    for (const metadataMode of ['annotated', 'statusless', 'unclassified']) {
      const annotated = metadataMode !== 'unclassified';
      const mixed = mode !== 'provider-only';
      const emptyAnnouncement = mode === 'mixed-empty';
      const answer = '{"value":"provider-backed answer"}';
      const control = providerStepCompletionTransport(answer, {
        mixed,
        emptyAnnouncement,
        annotated,
        statusless: metadataMode === 'statusless',
        laterAnswer: emptyAnnouncement ? answer : '{"value":"later answer"}',
      });
      const { result, unmount } = renderHook(
        () =>
          useStructuredCompletionWithMessage({
            input: 'query',
            system: 'trusted',
            schema,
            tools,
            transport: control.transport,
            debounceTime: 0,
          }),
        { wrapper: ProviderWrapper },
      );

      try {
        await waitFor(() => expect(control.requests).toHaveLength(1));
        await waitFor(() =>
          expect(result.current.result.isLoading).toBe(false),
        );

        expect(result.current.result.output).toEqual({
          value: 'provider-backed answer',
        });
        expect(result.current.message?.id).toBe(
          emptyAnnouncement ? 'non-tool-answer' : 'provider-answer',
        );
        if (!emptyAnnouncement) {
          const search = result.current.message?.serverToolCalls?.find(
            (call) => call.toolCallId === 'search-step',
          );
          expect(search).toMatchObject({
            toolCallId: 'search-step',
            name: 'web_search',
            status: 'complete',
          });
          if (metadataMode === 'annotated')
            expect(search).toMatchObject({
              kind: 'provider',
              builtin: 'web_search',
            });
          else expect(search).not.toHaveProperty('kind');
          if (metadataMode === 'statusless')
            expect(search?.metadata?.['b4.step']).toEqual({
              v: 1,
              kind: 'provider',
              builtin: 'web_search',
            });
          if (metadataMode === 'unclassified')
            expect(search?.metadata).not.toHaveProperty('b4.step');
          if (mixed)
            expect(
              result.current.message?.serverToolCalls?.find(
                (call) => call.toolCallId === 'native-server-call',
              ),
            ).not.toHaveProperty('kind');
        }
        expect(result.current.result.error).toBeUndefined();
        expect(control.requests).toHaveLength(1);
      } finally {
        unmount();
      }
    }
});

test('real UI completion preserves nonempty answers sharing an id with provider or unclassified server steps', async () => {
  const tools: ReturnType<typeof nativeCompletionTools> = [];
  const ProviderButton = ({ label }: { label: string }) => (
    <button>{label}</button>
  );
  const components = [
    exposeComponent(ProviderButton, {
      name: 'ProviderButton',
      description: 'Trusted provider answer',
      props: { label: s.string('label') },
      children: false,
    }),
  ];
  const answer =
    '{"ui":[{"ProviderButton":{"props":{"label":"Provider answer"}}}]}';

  for (const mixed of [false, true])
    for (const metadataMode of ['annotated', 'statusless', 'unclassified']) {
      const annotated = metadataMode !== 'unclassified';
      const control = providerStepCompletionTransport(answer, {
        mixed,
        annotated,
        statusless: metadataMode === 'statusless',
        laterAnswer:
          '{"ui":[{"ProviderButton":{"props":{"label":"Later answer"}}}]}',
      });
      const { result, unmount } = renderHook(
        () =>
          useUiCompletion({
            input: 'query',
            system: 'trusted',
            components,
            tools,
            transport: control.transport,
            debounceTime: 0,
          }),
        { wrapper: ProviderWrapper },
      );

      try {
        await waitFor(() => expect(control.requests).toHaveLength(1));
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.output?.id).toBe('provider-answer');
        expect(result.current.output?.content).toBe(result.current.rawOutput);
        expect(result.current.rawOutput).toEqual({
          ui: [
            {
              ProviderButton: {
                props: {
                  complete: true,
                  partialValue: { label: 'Provider answer' },
                  value: { label: 'Provider answer' },
                },
              },
            },
          ],
        });
        expect(result.current.ui).toHaveLength(1);
        const view = render(result.current.ui);
        try {
          expect(
            view.getByRole('button', { name: 'Provider answer' }).textContent,
          ).toBe('Provider answer');
        } finally {
          view.unmount();
        }
        expect(result.current.error).toBeUndefined();
        expect(control.requests).toHaveLength(1);
      } finally {
        unmount();
      }
    }
});
