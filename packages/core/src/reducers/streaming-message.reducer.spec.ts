import { apiActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
import { initialState, reducer } from './streaming-message.reducer';

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

function chunkAction(delta: Chat.Api.CompletionChunk['choices'][0]['delta']) {
  const chunk: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        delta,
        finishReason: null,
      },
    ],
  };

  return apiActions.generateMessageChunk(chunk);
}

test('parses structured output from content stream', () => {
  const responseSchema = s.object('output', {
    message: s.streaming.string('message'),
  });

  let state = startState(responseSchema, false);

  state = reducer(
    state,
    chunkAction({ role: 'assistant', content: '{"message":"he' }),
  );

  expect(state.message?.contentResolved).toEqual({ message: 'he' });
  const firstResolved = state.message?.contentResolved as {
    message: string;
  };

  state = reducer(
    state,
    chunkAction({
      toolCalls: [
        {
          index: 0,
          id: 'call-1',
          type: 'function',
          function: { name: 'noop', arguments: '{}' },
        },
      ],
    }),
  );

  expect(state.message?.contentResolved).toBe(firstResolved);
});

test('streams Japanese and Chinese structured output from content chunks', () => {
  const responseSchema = s.object('output', {
    message: s.streaming.string('message'),
  });

  let state = startState(responseSchema, false);

  state = reducer(
    state,
    chunkAction({ role: 'assistant', content: '{"message":"こん' }),
  );

  expect(state.message?.contentResolved).toEqual({ message: 'こん' });

  state = reducer(state, chunkAction({ content: 'にちは、你' }));

  expect(state.message?.contentResolved).toEqual({
    message: 'こんにちは、你',
  });

  state = reducer(state, chunkAction({ content: '好"}' }));

  expect(state.message?.contentResolved).toEqual({
    message: 'こんにちは、你好',
  });
});

test('recovers structured output from content before trailing JSON', () => {
  const consoleWarn = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  const responseSchema = s.object('output', {
    ui: s.array('ui', s.object('component', {})),
  });

  try {
    let state = startState(responseSchema, false);

    state = reducer(
      state,
      chunkAction({
        role: 'assistant',
        content: '{"ui":[{}]}\n{"ui":[{}]}',
      }),
    );

    expect(state.error).toBeUndefined();
    expect(state.message?.contentResolved).toEqual({ ui: [{}] });
    expect(consoleWarn).not.toHaveBeenCalled();

    state = reducer(state, apiActions.generateMessageFinish());

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

  state = reducer(
    state,
    chunkAction({ role: 'assistant', content: '{"message":"hello"}' }),
  );

  expect(state.message?.contentResolved).toEqual({ message: 'hello' });
});

test('streams output tool arguments like a normal tool in emulated mode', () => {
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

  state = reducer(
    state,
    chunkAction({
      role: 'assistant',
      toolCalls: [
        {
          index: 0,
          id: 'call-output',
          type: 'function',
          function: { name: 'output', arguments: '{"answer":"o' },
        },
      ],
    }),
  );

  expect(state.toolCalls).toHaveLength(1);
  expect(state.toolCalls[0]?.name).toBe('output');
  expect(state.toolCalls[0]?.argumentsResolved).toEqual({ answer: 'o' });
  expect(state.message?.contentResolved).toBeUndefined();

  state = reducer(
    state,
    chunkAction({
      toolCalls: [
        {
          index: 0,
          function: { arguments: 'k"}' },
        },
      ],
    }),
  );

  expect(state.toolCalls[0]?.argumentsResolved).toEqual({ answer: 'ok' });
  expect(state.message?.contentResolved).toBeUndefined();
});

test('recovers emulated structured output arguments before trailing JSON', () => {
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

    state = reducer(
      state,
      chunkAction({
        role: 'assistant',
        toolCalls: [
          {
            index: 0,
            id: 'call-output',
            type: 'function',
            function: {
              name: 'output',
              arguments: '{"ui":[{}]}\n{"ui":[{}]}',
            },
          },
        ],
      }),
    );

    expect(state.error).toBeUndefined();
    expect(state.toolCalls[0]?.argumentsResolved).toEqual({ ui: [{}] });
    expect(consoleWarn).not.toHaveBeenCalled();

    state = reducer(state, apiActions.generateMessageFinish());

    expect(state.error).toBeUndefined();
    expect(state.toolCalls[0]?.argumentsResolved).toEqual({ ui: [{}] });
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  } finally {
    consoleWarn.mockRestore();
  }
});

test('streams hashbrown tool arguments and preserves identity when unchanged', () => {
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

  state = reducer(
    state,
    chunkAction({
      role: 'assistant',
      toolCalls: [
        {
          index: 0,
          id: 'call-weather',
          type: 'function',
          function: { name: 'weather', arguments: '{"city":"p' },
        },
      ],
    }),
  );

  const firstArgs = state.toolCalls[0]?.argumentsResolved as {
    city: string;
  };

  expect(firstArgs).toEqual({ city: 'p' });

  state = reducer(
    state,
    chunkAction({
      toolCalls: [
        {
          index: 1,
          id: 'call-noop',
          type: 'function',
          function: { name: 'noop', arguments: '{}' },
        },
      ],
    }),
  );

  expect(state.toolCalls[0]?.argumentsResolved).toBe(firstArgs);
});

test('non-hashbrown tool arguments resolve only when complete', () => {
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

  state = reducer(
    state,
    chunkAction({
      role: 'assistant',
      toolCalls: [
        {
          index: 0,
          id: 'call-legacy',
          type: 'function',
          function: { name: 'legacy', arguments: '{"name":"al' },
        },
      ],
    }),
  );

  expect(state.toolCalls[0]?.argumentsResolved).toBeUndefined();

  state = reducer(
    state,
    chunkAction({
      toolCalls: [
        {
          index: 0,
          function: { arguments: 'ice"}' },
        },
      ],
    }),
  );

  expect(state.toolCalls[0]?.argumentsResolved).toEqual({ name: 'alice' });
});

test('does not recover malformed structured output before the root closes', () => {
  const responseSchema = s.object('output', {
    ui: s.array('ui', s.object('component', {})),
  });

  let state = startState(responseSchema, false);

  state = reducer(
    state,
    chunkAction({ role: 'assistant', content: '{"ui":[{}],}' }),
  );

  expect(state.error).toBeInstanceOf(Error);
  expect(state.message?.contentResolved).toBeUndefined();
});

test('defers parser errors until finish', () => {
  const responseSchema = s.object('output', { message: s.string('message') });

  let state = startState(responseSchema, false);

  state = reducer(
    state,
    chunkAction({ role: 'assistant', content: '{"message":"oops' }),
  );

  expect(state.error).toBeUndefined();

  state = reducer(state, apiActions.generateMessageFinish());

  expect(state.error).toBeInstanceOf(Error);
});
