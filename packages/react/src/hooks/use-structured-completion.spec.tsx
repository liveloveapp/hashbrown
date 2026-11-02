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
