import { type AGUIEvent, EventType } from '@ag-ui/core';
import { apiActions, internalActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
import {
  initialState,
  reducer,
  type StreamingMessageState,
} from './streaming-message.reducer';

function startState(
  responseSchema?: s.SchemaOutput,
  emulateStructuredOutput = false,
  toolsByName: Record<string, Chat.Internal.Tool> = {},
) {
  return reducer(
    initialState,
    apiActions.generateMessageStart({
      responseSchema,
      emulateStructuredOutput,
      toolsByName,
    }),
  );
}

function reduceEvents(
  state: StreamingMessageState,
  events: AGUIEvent[],
): StreamingMessageState {
  return events.reduce(
    (current, event) =>
      reducer(current, apiActions.generateMessageEvent(event)),
    state,
  );
}

function textEvents(delta: string, messageId = 'message-1'): AGUIEvent[] {
  return [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta,
    },
  ];
}

function textContent(delta: string, messageId = 'message-1'): AGUIEvent {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta,
  };
}

function toolEvents(
  toolCallId: string,
  toolCallName: string,
  delta: string,
): AGUIEvent[] {
  return [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName,
      parentMessageId: 'message-1',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId,
      delta,
    },
  ];
}

function toolArgs(toolCallId: string, delta: string): AGUIEvent {
  return {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta,
  };
}

function runFinished(): AGUIEvent {
  return {
    type: EventType.RUN_FINISHED,
    threadId: 'thread-1',
    runId: 'run-1',
  };
}

const generationSilentlyRetiredAction =
  internalActions.generationSilentlyRetired();

test('parses structured output from AG-UI text events', () => {
  const responseSchema = s.object('output', {
    message: s.streaming.string('message'),
  });
  let state = startState(responseSchema, false);

  state = reduceEvents(state, textEvents('{"message":"he'));

  expect(state.message?.contentResolved).toEqual({ message: 'he' });
  const firstResolved = state.message?.contentResolved as {
    message: string;
  };

  state = reduceEvents(state, toolEvents('call-1', 'noop', '{}'));

  expect(state.message?.contentResolved).toBe(firstResolved);
});

test('streams Japanese and Chinese structured output from AG-UI text events', () => {
  const responseSchema = s.object('output', {
    message: s.streaming.string('message'),
  });
  let state = startState(responseSchema, false);

  state = reduceEvents(state, textEvents('{"message":"こん'));

  expect(state.message?.contentResolved).toEqual({ message: 'こん' });

  state = reduceEvents(state, [textContent('にちは、你')]);

  expect(state.message?.contentResolved).toEqual({
    message: 'こんにちは、你',
  });

  state = reduceEvents(state, [textContent('好"}')]);

  expect(state.message?.contentResolved).toEqual({
    message: 'こんにちは、你好',
  });
});

test('streams structured output from AG-UI text chunk shorthand', () => {
  const responseSchema = s.object('output', {
    message: s.streaming.string('message'),
  });
  let state = startState(responseSchema, false);

  state = reduceEvents(state, [
    {
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'message-1',
      role: 'assistant',
      delta: '{"message":"he',
    },
    {
      type: EventType.TEXT_MESSAGE_CHUNK,
      delta: 'llo"}',
    },
    runFinished(),
  ]);

  expect(state.message?.content).toBe('{"message":"hello"}');
  expect(state.message?.contentResolved).toEqual({ message: 'hello' });
});

test('recovers structured output from AG-UI text before trailing JSON', () => {
  const consoleWarn = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  const responseSchema = s.object('output', {
    ui: s.array('ui', s.object('component', {})),
  });

  try {
    let state = startState(responseSchema, false);

    state = reduceEvents(state, textEvents('{"ui":[{}]}\n{"ui":[{}]}'));

    expect(state.error).toBeUndefined();
    expect(state.message?.contentResolved).toEqual({ ui: [{}] });
    expect(consoleWarn).not.toHaveBeenCalled();

    state = reduceEvents(state, [runFinished()]);

    expect(state.error).toBeUndefined();
    expect(state.message?.contentResolved).toEqual({ ui: [{}] });
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  } finally {
    consoleWarn.mockRestore();
  }
});

test('parses Standard JSON Schema structured output when complete', () => {
  const responseSchema = {
    '~standard': {
      version: 1,
      vendor: 'test',
      jsonSchema: {
        input: () => ({ type: 'string' }),
        output: () => ({
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
          additionalProperties: false,
        }),
      },
    },
  } as const satisfies s.StandardJSONSchemaV1<unknown, { message: string }>;
  let state = startState(responseSchema, false);

  state = reduceEvents(state, textEvents('{"message":"hello"}'));

  expect(state.message?.contentResolved).toEqual({ message: 'hello' });
});

test('streams output tool arguments from AG-UI events in emulated mode', () => {
  const responseSchema = s.object('output', {
    answer: s.streaming.string('answer'),
  });
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    output: {
      name: 'output',
      description: '',
      schema: responseSchema,
      handler: async () => undefined,
    },
  };
  let state = startState(responseSchema, true, toolsByName);

  state = reduceEvents(
    state,
    toolEvents('call-output', 'output', '{"answer":"o'),
  );

  expect(state.toolCalls).toHaveLength(1);
  expect(state.toolCalls[0]?.name).toBe('output');
  expect(state.toolCalls[0]?.argumentsResolved).toEqual({ answer: 'o' });
  expect(state.message?.contentResolved).toBeUndefined();

  state = reduceEvents(state, [toolArgs('call-output', 'k"}')]);

  expect(state.toolCalls[0]?.argumentsResolved).toEqual({ answer: 'ok' });
  expect(state.message?.contentResolved).toBeUndefined();
});

test('recovers AG-UI tool arguments before trailing JSON', () => {
  const consoleWarn = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  const responseSchema = s.object('output', {
    ui: s.array('ui', s.object('component', {})),
  });
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    output: {
      name: 'output',
      description: '',
      schema: responseSchema,
      handler: async () => undefined,
    },
  };

  try {
    let state = startState(responseSchema, true, toolsByName);

    state = reduceEvents(
      state,
      toolEvents('call-output', 'output', '{"ui":[{}]}\n{"ui":[{}]}'),
    );

    expect(state.error).toBeUndefined();
    expect(state.toolCalls[0]?.argumentsResolved).toEqual({ ui: [{}] });
    expect(consoleWarn).not.toHaveBeenCalled();

    state = reduceEvents(state, [runFinished()]);

    expect(state.error).toBeUndefined();
    expect(state.toolCalls[0]?.argumentsResolved).toEqual({ ui: [{}] });
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  } finally {
    consoleWarn.mockRestore();
  }
});

test('finalizes AG-UI tool arguments only once across tool and run completion', () => {
  const consoleWarn = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    submit: {
      name: 'submit',
      description: '',
      schema: s.object('args', { value: s.number('value') }),
      handler: async () => undefined,
    },
  };

  try {
    let state = startState(undefined, false, toolsByName);
    state = reduceEvents(
      state,
      toolEvents('call-submit', 'submit', '{"value":1}\n{"value":2}'),
    );

    state = reduceEvents(state, [
      { type: EventType.TOOL_CALL_END, toolCallId: 'call-submit' },
      runFinished(),
    ]);

    expect(state.error).toBeUndefined();
    expect(state.toolCalls[0]?.argumentsResolved).toEqual({ value: 1 });
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  } finally {
    consoleWarn.mockRestore();
  }
});

test('preserves Hashbrown tool metadata from later AG-UI tool events', () => {
  let state = startState();

  state = reduceEvents(state, [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-1',
      toolCallName: 'search',
      parentMessageId: 'message-1',
      rawEvent: {
        hashbrown: {
          metadata: { initial: 'preserved' },
        },
      },
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-1',
      delta: '',
      rawEvent: {
        hashbrown: {
          metadata: { signature: 'opaque' },
        },
      },
    },
  ]);

  expect(state.toolCalls[0]?.metadata).toEqual({
    initial: 'preserved',
    signature: 'opaque',
  });
});

test('streams multiple AG-UI tool calls keyed by toolCallId', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    weather: {
      name: 'weather',
      description: '',
      schema: s.object('args', { city: s.streaming.string('city') }),
      handler: async () => undefined,
    },
    noop: {
      name: 'noop',
      description: '',
      schema: s.object('noop', {}),
      handler: async () => undefined,
    },
  };
  let state = startState(undefined, false, toolsByName);

  state = reduceEvents(
    state,
    toolEvents('call-weather', 'weather', '{"city":"p'),
  );
  const firstArgs = state.toolCalls[0]?.argumentsResolved as {
    city: string;
  };

  expect(firstArgs).toEqual({ city: 'p' });

  state = reduceEvents(state, toolEvents('call-noop', 'noop', '{}'));

  expect(state.toolCalls[0]?.argumentsResolved).toBe(firstArgs);
  expect(state.toolCalls.map((toolCall) => toolCall.id)).toEqual([
    'call-weather',
    'call-noop',
  ]);
});

test('streams interleaved AG-UI tool call chunk shorthand', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    weather: {
      name: 'weather',
      description: '',
      schema: s.object('args', { city: s.streaming.string('city') }),
      handler: async () => undefined,
    },
    time: {
      name: 'time',
      description: '',
      schema: s.object('args', { zone: s.streaming.string('zone') }),
      handler: async () => undefined,
    },
  };
  let state = startState(undefined, false, toolsByName);

  state = reduceEvents(state, [
    {
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'call-weather',
      toolCallName: 'weather',
      parentMessageId: 'message-1',
      delta: '{"city":"',
    },
    {
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'call-time',
      toolCallName: 'time',
      parentMessageId: 'message-1',
      delta: '{"zone":"',
    },
    {
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'call-weather',
      delta: 'Paris"}',
    },
    {
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'call-time',
      delta: 'UTC"}',
    },
    runFinished(),
  ]);

  expect(state.toolCalls).toEqual([
    expect.objectContaining({
      id: 'call-weather',
      argumentsResolved: { city: 'Paris' },
    }),
    expect.objectContaining({
      id: 'call-time',
      argumentsResolved: { zone: 'UTC' },
    }),
  ]);
});

test('uses the active tool call for AG-UI tool chunks with omitted ids', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    weather: {
      name: 'weather',
      description: '',
      schema: s.object('args', { city: s.streaming.string('city') }),
      handler: async () => undefined,
    },
  };
  let state = startState(undefined, false, toolsByName);

  state = reduceEvents(state, [
    {
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'call-weather',
      toolCallName: 'weather',
      delta: '{"city":"Par',
    },
    {
      type: EventType.TOOL_CALL_CHUNK,
      delta: 'is"}',
    },
    runFinished(),
  ]);

  expect(state.toolCalls[0]).toEqual(
    expect.objectContaining({
      id: 'call-weather',
      arguments: '{"city":"Paris"}',
      argumentsResolved: { city: 'Paris' },
    }),
  );
});

test('non-hashbrown AG-UI tool arguments resolve only when complete', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    legacy: {
      name: 'legacy',
      description: '',
      schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
      handler: async () => undefined,
    },
  };
  let state = startState(undefined, false, toolsByName);

  state = reduceEvents(
    state,
    toolEvents('call-legacy', 'legacy', '{"name":"al'),
  );

  expect(state.toolCalls[0]?.argumentsResolved).toBeUndefined();

  state = reduceEvents(state, [toolArgs('call-legacy', 'ice"}')]);

  expect(state.toolCalls[0]?.argumentsResolved).toEqual({ name: 'alice' });
});

test('does not recover malformed structured output before the root closes', () => {
  const responseSchema = s.object('output', {
    ui: s.array('ui', s.object('component', {})),
  });
  let state = startState(responseSchema, false);

  state = reduceEvents(state, textEvents('{"ui":[{}],}'));

  expect(state.error).toBeInstanceOf(Error);
  expect(state.message?.contentResolved).toBeUndefined();
});

test('defers AG-UI parser errors until the run finishes', () => {
  const responseSchema = s.object('output', { message: s.string('message') });
  let state = startState(responseSchema, false);

  state = reduceEvents(state, textEvents('{"message":"oops'));

  expect(state.error).toBeUndefined();

  state = reduceEvents(state, [runFinished()]);

  expect(state.error).toBeInstanceOf(Error);
});

test('stores AG-UI run errors without discarding the partial message', () => {
  let state = startState();
  state = reduceEvents(state, textEvents('partial'));

  state = reduceEvents(state, [
    {
      type: EventType.RUN_ERROR,
      message: 'provider failed',
      code: 'provider_error',
    },
  ]);

  expect(state.message?.content).toBe('partial');
  expect(state.error).toEqual(new Error('provider failed'));
});

test('silent retirement resets all partial generation state', () => {
  const responseSchema = s.object('output', {
    answer: s.streaming.string('answer'),
  });
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    lookup: {
      name: 'lookup',
      description: '',
      schema: s.object('args', { query: s.streaming.string('query') }),
      handler: async () => undefined,
    },
  };
  let state = startState(responseSchema, false, toolsByName);
  state = reduceEvents(state, textEvents('{"answer":"par'));
  state = reduceEvents(state, toolEvents('call-1', 'lookup', '{"query":"par'));

  const next = reducer(state, generationSilentlyRetiredAction);

  expect(state.message).not.toBeNull();
  expect(state.toolCalls).toHaveLength(1);
  expect(state.configSnapshot).toBeDefined();
  expect(next).toBe(initialState);
});

test('ignores unsupported AG-UI events without mutating state', () => {
  const state = startState();

  const next = reduceEvents(state, [
    {
      type: EventType.STATE_SNAPSHOT,
      snapshot: { ignored: true },
    },
  ]);

  expect(next).toBe(state);
});
