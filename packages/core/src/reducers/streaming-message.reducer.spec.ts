import { apiActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
import { initialState, reducer } from './streaming-message.reducer';

function startState(
  responseSchema?: s.HashbrownType,
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

test('uses output tool call for emulated structured output', () => {
  const responseSchema = s.object('output', { answer: s.string('answer') });

  let state = startState(responseSchema, true);

  state = reducer(
    state,
    chunkAction({
      role: 'assistant',
      toolCalls: [
        {
          index: 0,
          id: 'call-output',
          type: 'function',
          function: { name: 'output', arguments: '{"answer":"ok"}' },
        },
      ],
    }),
  );

  expect(state.toolCalls).toHaveLength(0);
  expect(state.message?.content).toBe('{"answer":"ok"}');
  expect(state.message?.contentResolved).toEqual({ answer: 'ok' });
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
