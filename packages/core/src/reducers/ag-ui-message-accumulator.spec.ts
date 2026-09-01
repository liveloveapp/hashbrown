import { type AGUIEvent, EventType, type ReasoningMessage } from '@ag-ui/core';
import { Chat } from '../models';
import { s } from '../schema';
import {
  accumulateAgUiMessageEvent,
  type AgUiMessageAccumulatorState,
  createAgUiMessageAccumulator,
} from './ag-ui-message-accumulator';

function createState(
  responseSchema?: s.SchemaOutput,
  toolsByName: Record<string, Chat.Internal.Tool> = {},
) {
  return createAgUiMessageAccumulator({ responseSchema, toolsByName });
}

function accumulateEvents(
  state: AgUiMessageAccumulatorState,
  events: readonly AGUIEvent[],
) {
  return events.reduce(accumulateAgUiMessageEvent, state);
}

function textStart(messageId = 'message-1'): AGUIEvent {
  return {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: 'assistant',
  };
}

function textContent(delta: string, messageId = 'message-1'): AGUIEvent {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta,
  };
}

function toolStart(toolCallId: string, toolCallName: string): AGUIEvent {
  return {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName,
    parentMessageId: 'message-1',
  };
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

function reasoningDetails(
  state: AgUiMessageAccumulatorState,
): readonly Readonly<ReasoningMessage>[] {
  return state.message?.reasoning?.kind === 'details'
    ? state.message.reasoning.details
    : [];
}

function reasoningStart(
  messageId: string,
  metadata?: Record<string, unknown>,
): AGUIEvent {
  return {
    type: EventType.REASONING_MESSAGE_START,
    messageId,
    role: 'reasoning',
    metadata,
  };
}

function reasoningContent(
  messageId: string,
  delta: string,
  subagentRunId?: string,
): AGUIEvent {
  return {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId,
    delta,
    subagentRunId,
  };
}

function reasoningEnd(
  messageId: string,
  metadata?: Record<string, unknown>,
): AGUIEvent {
  return {
    type: EventType.REASONING_MESSAGE_END,
    messageId,
    metadata,
  };
}

function encryptedValue(
  entityId: string,
  value: string,
  subtype: 'message' | 'tool-call' = 'message',
): AGUIEvent {
  return {
    type: EventType.REASONING_ENCRYPTED_VALUE,
    entityId,
    encryptedValue: value,
    subtype,
  };
}

function jsonChunks(value: string): string[] {
  return Array.from(value);
}

test('streams structured text across arbitrary JSON chunk boundaries', () => {
  const schema = s.object('output', {
    greeting: s.streaming.string('greeting'),
    count: s.number('count'),
  });
  const state = createState(schema);
  const events = [
    textStart(),
    ...jsonChunks('{"greeting":"こんにちは","count":2}').map((delta) =>
      textContent(delta),
    ),
  ];

  const next = accumulateEvents(state, events);

  expect(next.message?.content).toBe('{"greeting":"こんにちは","count":2}');
  expect(next.message?.contentResolved).toEqual({
    greeting: 'こんにちは',
    count: 2,
  });
  expect(next.error).toBeUndefined();
});

test('streams tool arguments across arbitrary JSON chunk boundaries', () => {
  const schema = s.object('arguments', {
    city: s.streaming.string('city'),
    unit: s.string('unit'),
  });
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    weather: {
      name: 'weather',
      description: '',
      schema,
      handler: async () => undefined,
    },
  };
  const state = createState(undefined, toolsByName);
  const events = [
    toolStart('call-weather', 'weather'),
    ...jsonChunks('{"city":"München","unit":"C"}').map((delta) =>
      toolArgs('call-weather', delta),
    ),
  ];

  const next = accumulateEvents(state, events);

  expect(next.toolCalls[0]).toEqual(
    expect.objectContaining({
      id: 'call-weather',
      name: 'weather',
      arguments: '{"city":"München","unit":"C"}',
      argumentsResolved: { city: 'München', unit: 'C' },
    }),
  );
  expect(next.error).toBeUndefined();
});

test('expands text and tool chunk shorthand while preserving order and identity', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    weather: {
      name: 'weather',
      description: '',
      schema: s.object('arguments', { city: s.streaming.string('city') }),
      handler: async () => undefined,
    },
    time: {
      name: 'time',
      description: '',
      schema: s.object('arguments', { zone: s.streaming.string('zone') }),
      handler: async () => undefined,
    },
  };
  const state = createState(undefined, toolsByName);
  const events: AGUIEvent[] = [
    {
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'message-1',
      role: 'assistant',
      delta: 'Answer',
    },
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
  ];

  const next = accumulateEvents(state, events);

  expect(next.message).toEqual(
    expect.objectContaining({
      content: 'Answer',
      toolCallIds: ['call-weather', 'call-time'],
    }),
  );
  expect(next.toolCalls).toEqual([
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

test('uses active message and tool identities for shorthand chunks with omitted ids', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    weather: {
      name: 'weather',
      description: '',
      schema: s.object('arguments', { city: s.streaming.string('city') }),
      handler: async () => undefined,
    },
  };
  const state = createState(undefined, toolsByName);
  const events: AGUIEvent[] = [
    {
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'message-1',
      role: 'assistant',
      delta: 'Hel',
    },
    { type: EventType.TEXT_MESSAGE_CHUNK, delta: 'lo' },
    {
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'call-weather',
      toolCallName: 'weather',
      delta: '{"city":"Par',
    },
    { type: EventType.TOOL_CALL_CHUNK, delta: 'is"}' },
  ];

  const next = accumulateEvents(state, events);

  expect(next.message?.content).toBe('Hello');
  expect(next.toolCalls[0]?.argumentsResolved).toEqual({ city: 'Paris' });
});

test('resolves non-Skillet tool JSON only after it is complete', () => {
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
  const started = accumulateEvents(createState(undefined, toolsByName), [
    toolStart('call-legacy', 'legacy'),
    toolArgs('call-legacy', '{"name":"al'),
  ]);

  const next = accumulateAgUiMessageEvent(
    started,
    toolArgs('call-legacy', 'ice"}'),
  );

  expect(started.toolCalls[0]?.argumentsResolved).toBeUndefined();
  expect(next.toolCalls[0]?.argumentsResolved).toEqual({ name: 'alice' });
});

test('projects Standard JSON Schema output without mutating the schema', () => {
  const schema = {
    '~standard': {
      version: 1,
      vendor: 'test',
      jsonSchema: {
        input: () => ({ type: 'string' }),
        output: () => ({
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
          additionalProperties: false,
        }),
      },
    },
  } as const satisfies s.StandardJSONSchemaV1<unknown, { message: string }>;
  const originalProps = schema['~standard'];
  const state = createState(schema);

  const next = accumulateEvents(state, [
    textStart(),
    textContent('{"message":"hello"}'),
  ]);

  expect(next.message?.contentResolved).toEqual({ message: 'hello' });
  expect(schema['~standard']).toBe(originalProps);
  expect(schema['~standard'].vendor).toBe('test');
});

test('records recoverable structured-output trailing content as immutable diagnostic data', () => {
  const schema = s.object('output', {
    ui: s.array('ui', s.object('component', {})),
  });
  const state = accumulateEvents(createState(schema), [
    textStart(),
    textContent('{"ui":[{}]}\n{"ui":[{}]}'),
  ]);

  const next = accumulateAgUiMessageEvent(state, runFinished());

  expect(state.diagnostics).toEqual([]);
  expect(next.error).toBeUndefined();
  expect(next.message?.contentResolved).toEqual({ ui: [{}] });
  expect(next.diagnostics).toEqual([
    {
      type: 'recovered-trailing-content',
      source: 'structured-output',
      entityId: 'message-1',
      parsedData: { ui: [{}] },
      extraData: '{"ui":[{}]}',
    },
  ]);
  expect(next.diagnostics[0]?.parsedData).not.toBe(
    next.message?.contentResolved,
  );
  expect(Object.isFrozen(next.diagnostics[0])).toBe(true);
  expect(Object.isFrozen(next.diagnostics[0]?.parsedData)).toBe(true);
  expect(
    Object.isFrozen((next.diagnostics[0]?.parsedData as { ui: unknown[] }).ui),
  ).toBe(true);
  expect(Object.isFrozen(next.message?.contentResolved)).toBe(false);
  expect(
    Object.isFrozen((next.message?.contentResolved as { ui: unknown[] }).ui),
  ).toBe(false);
});

test('records a tool trailing-content diagnostic once across repeated finalization', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    submit: {
      name: 'submit',
      description: '',
      schema: s.object('arguments', { value: s.number('value') }),
      handler: async () => undefined,
    },
  };
  const state = accumulateEvents(createState(undefined, toolsByName), [
    toolStart('call-submit', 'submit'),
    toolArgs('call-submit', '{"value":1}\n{"value":2}'),
  ]);
  const toolEnd: AGUIEvent = {
    type: EventType.TOOL_CALL_END,
    toolCallId: 'call-submit',
  };

  const ended = accumulateAgUiMessageEvent(state, toolEnd);
  const replayed = accumulateAgUiMessageEvent(ended, toolEnd);
  const finished = accumulateAgUiMessageEvent(replayed, runFinished());

  expect(ended.diagnostics).toHaveLength(1);
  expect(replayed.diagnostics).toBe(ended.diagnostics);
  expect(finished.diagnostics).toBe(ended.diagnostics);
  expect(ended.toolCalls[0]?.argumentsResolved).toEqual({ value: 1 });
});

test('owns immutable tool diagnostic data without freezing tool arguments', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    submit: {
      name: 'submit',
      description: '',
      schema: s.object('arguments', {
        payload: s.object('payload', {
          items: s.array('items', s.number('item')),
        }),
      }),
      handler: async () => undefined,
    },
  };
  const state = accumulateEvents(createState(undefined, toolsByName), [
    toolStart('call-submit', 'submit'),
    toolArgs(
      'call-submit',
      '{"payload":{"items":[1]}}\n{"payload":{"items":[2]}}',
    ),
  ]);

  const next = accumulateAgUiMessageEvent(state, {
    type: EventType.TOOL_CALL_END,
    toolCallId: 'call-submit',
  });
  const diagnosticData = next.diagnostics[0]?.parsedData as {
    payload: { items: number[] };
  };
  const argumentsResolved = next.toolCalls[0]?.argumentsResolved as {
    payload: { items: number[] };
  };

  expect(diagnosticData).not.toBe(argumentsResolved);
  expect(Object.isFrozen(diagnosticData)).toBe(true);
  expect(Object.isFrozen(diagnosticData.payload)).toBe(true);
  expect(Object.isFrozen(diagnosticData.payload.items)).toBe(true);
  expect(Object.isFrozen(argumentsResolved)).toBe(false);
  expect(Object.isFrozen(argumentsResolved.payload)).toBe(false);
  expect(Object.isFrozen(argumentsResolved.payload.items)).toBe(false);
});

test('does not duplicate a structured-output diagnostic when run completion is replayed', () => {
  const schema = s.object('output', { value: s.number('value') });
  const state = accumulateEvents(createState(schema), [
    textStart(),
    textContent('{"value":1}\n{"value":2}'),
  ]);

  const finished = accumulateAgUiMessageEvent(state, runFinished());
  const replayed = accumulateAgUiMessageEvent(finished, runFinished());

  expect(finished.diagnostics).toHaveLength(1);
  expect(replayed.diagnostics).toBe(finished.diagnostics);
});

test('reports malformed structured output and incomplete finalization', () => {
  const schema = s.object('output', { message: s.string('message') });
  const malformed = accumulateEvents(createState(schema), [
    textStart('malformed'),
    textContent('{"message":,}', 'malformed'),
  ]);
  const incomplete = accumulateEvents(createState(schema), [
    textStart('incomplete'),
    textContent('{"message":"oops', 'incomplete'),
  ]);

  const finalizedIncomplete = accumulateAgUiMessageEvent(
    incomplete,
    runFinished(),
  );

  expect(malformed.error).toEqual(new Error('Invalid structured output'));
  expect(malformed.message?.contentResolved).toBeUndefined();
  expect(incomplete.error).toBeUndefined();
  expect(finalizedIncomplete.error).toEqual(
    new Error('Invalid structured output'),
  );
});

test('reports malformed and incomplete tool arguments on their current boundaries', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    submit: {
      name: 'submit',
      description: '',
      schema: s.object('arguments', { value: s.number('value') }),
      handler: async () => undefined,
    },
  };
  const malformed = accumulateEvents(createState(undefined, toolsByName), [
    toolStart('malformed', 'submit'),
    toolArgs('malformed', '{"value":,}'),
  ]);
  const incomplete = accumulateEvents(createState(undefined, toolsByName), [
    toolStart('incomplete', 'submit'),
    toolArgs('incomplete', '{"value":'),
  ]);

  const finalizedIncomplete = accumulateAgUiMessageEvent(incomplete, {
    type: EventType.TOOL_CALL_END,
    toolCallId: 'incomplete',
  });

  expect(malformed.error).toEqual(
    new Error('Invalid tool arguments for submit'),
  );
  expect(incomplete.error).toBeUndefined();
  expect(finalizedIncomplete.error).toEqual(
    new Error('Invalid tool arguments for submit'),
  );
});

test('preserves the first parser or run error and all partial content', () => {
  const schema = s.object('output', { value: s.number('value') });
  const state = accumulateEvents(createState(schema), [
    textStart(),
    textContent('{"value":,}'),
  ]);

  const next = accumulateAgUiMessageEvent(state, {
    type: EventType.RUN_ERROR,
    message: 'provider failed',
    code: 'provider_error',
  });

  expect(next.message?.content).toBe('{"value":,}');
  expect(next.error).toBe(state.error);
  expect(next.error?.message).toBe('Invalid structured output');
});

test('stores a first run error without discarding the partial message', () => {
  const state = accumulateEvents(createState(), [
    textStart(),
    textContent('partial'),
  ]);

  const next = accumulateAgUiMessageEvent(state, {
    type: EventType.RUN_ERROR,
    message: 'provider failed',
    code: 'provider_error',
  });

  expect(next.message?.content).toBe('partial');
  expect(next.error).toEqual(new Error('provider failed'));
});

test('accumulates reasoning, encrypted values, metadata, and associations', () => {
  const startMetadata = { stable: 'start', replaced: { at: 'start' } };
  const endMetadata = { stable: 'end', endOnly: true };
  const state = accumulateEvents(createState(), [
    reasoningStart('reasoning-1', startMetadata),
    reasoningContent('reasoning-1', 'Readable ', 'subagent-content'),
    reasoningContent('reasoning-1', 'summary'),
    encryptedValue('reasoning-1', 'reasoning-opaque'),
    reasoningEnd('reasoning-1', endMetadata),
    textStart('message-1'),
    textContent('Answer', 'message-1'),
    encryptedValue('message-1', 'assistant-opaque'),
    toolStart('call-1', 'lookup'),
    encryptedValue('call-1', 'tool-opaque', 'tool-call'),
  ]);

  startMetadata.replaced.at = 'mutated';
  endMetadata.stable = 'mutated';

  expect(state.message).toEqual(
    expect.objectContaining({
      content: 'Answer',
      encryptedValue: 'assistant-opaque',
      toolCallIds: ['call-1'],
    }),
  );
  expect(reasoningDetails(state)).toEqual([
    {
      id: 'reasoning-1',
      role: 'reasoning',
      content: 'Readable summary',
      encryptedValue: 'reasoning-opaque',
      subagentRunId: 'subagent-content',
      metadata: {
        stable: 'end',
        replaced: { at: 'start' },
        endOnly: true,
      },
    },
  ]);
  expect(state.toolCalls[0]?.encryptedValue).toBe('tool-opaque');
});

test('merges cloned assistant and tool metadata across lifecycle events', () => {
  const textStartMetadata = {
    stable: 'text-start',
    replaced: { at: 'text-start' },
  };
  const textContentMetadata = {
    replaced: { at: 'text-content' },
    contentOnly: true,
  };
  const toolStartMetadata = {
    stable: 'tool-start',
    replaced: { at: 'tool-start' },
  };
  const toolArgsMetadata = {
    replaced: { at: 'tool-args' },
    argsOnly: true,
  };
  const state = createState();

  const next = accumulateEvents(state, [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'message-1',
      role: 'assistant',
      metadata: textStartMetadata,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-1',
      delta: 'Answer',
      metadata: textContentMetadata,
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'message-1',
      metadata: { stable: 'text-end', endOnly: true },
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-1',
      toolCallName: 'search',
      parentMessageId: 'message-1',
      metadata: toolStartMetadata,
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-1',
      delta: '{}',
      metadata: toolArgsMetadata,
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: 'call-1',
      metadata: { stable: 'tool-end', endOnly: true },
    },
  ]);
  textStartMetadata.replaced.at = 'mutated';
  textContentMetadata.replaced.at = 'mutated';
  toolStartMetadata.replaced.at = 'mutated';
  toolArgsMetadata.replaced.at = 'mutated';

  expect(next.message?.metadata).toEqual({
    stable: 'text-end',
    replaced: { at: 'text-content' },
    contentOnly: true,
    endOnly: true,
  });
  expect(next.toolCalls[0]?.metadata).toEqual({
    stable: 'tool-end',
    replaced: { at: 'tool-args' },
    argsOnly: true,
    endOnly: true,
  });
});

test('keeps reasoning separate from structured output parsing', () => {
  const schema = s.object('output', { message: s.string('message') });
  const state = accumulateEvents(createState(schema), [
    reasoningStart('reasoning-1'),
    reasoningContent('reasoning-1', '{"message":"reasoning"}'),
    encryptedValue('reasoning-1', '{"message":"encrypted"}'),
    reasoningEnd('reasoning-1'),
  ]);

  const next = accumulateEvents(state, [
    textStart(),
    textContent('{"message":"text"}'),
  ]);

  expect(state.outputParserState).toBeUndefined();
  expect(state.message?.contentResolved).toBeUndefined();
  expect(next.message?.contentResolved).toEqual({ message: 'text' });
});

test('preserves multiple reasoning messages and tool calls in lifecycle order', () => {
  const state = accumulateEvents(createState(), [
    reasoningStart('reasoning-1'),
    reasoningContent('reasoning-1', 'First'),
    reasoningEnd('reasoning-1'),
    toolStart('call-1', 'first'),
    toolArgs('call-1', '{}'),
    reasoningStart('reasoning-2'),
    reasoningContent('reasoning-2', 'Second'),
    reasoningEnd('reasoning-2'),
    toolStart('call-2', 'second'),
    toolArgs('call-2', '{}'),
  ]);

  expect(reasoningDetails(state).map(({ id }) => id)).toEqual([
    'reasoning-1',
    'reasoning-2',
  ]);
  expect(state.toolCalls.map(({ id }) => id)).toEqual(['call-1', 'call-2']);
  expect(state.message?.toolCallIds).toEqual(['call-1', 'call-2']);
});

test('preserves reasoning placeholder, redaction, completion, and latest event fields', () => {
  const started = accumulateAgUiMessageEvent(
    createState(),
    reasoningStart('reasoning-1', { phase: 'start' }),
  );
  const completed = accumulateEvents(started, [
    reasoningContent('reasoning-1', '', 'subagent-content'),
    reasoningEnd('reasoning-1', { phase: 'end' }),
    {
      ...encryptedValue('reasoning-1', 'opaque'),
      subagentRunId: 'subagent-encrypted',
    },
    runFinished(),
  ]);

  expect(started.message).toEqual({
    role: 'assistant',
    content: '',
    toolCallIds: [],
    reasoning: {
      kind: 'details',
      details: [
        {
          id: 'reasoning-1',
          role: 'reasoning',
          content: '',
          metadata: { phase: 'start' },
        },
      ],
    },
  });
  expect(completed.error).toBeUndefined();
  expect(reasoningDetails(completed)).toEqual([
    {
      id: 'reasoning-1',
      role: 'reasoning',
      content: '',
      encryptedValue: 'opaque',
      subagentRunId: 'subagent-encrypted',
      metadata: { phase: 'end' },
    },
  ]);
});

test('completes reasoning with a prototype-named message id', () => {
  const state = createState();

  const next = accumulateEvents(state, [
    reasoningStart('constructor'),
    reasoningContent('constructor', 'Analysis'),
    reasoningEnd('constructor'),
    runFinished(),
  ]);

  expect(next.error).toBeUndefined();
  expect(reasoningDetails(next)).toEqual([
    {
      id: 'constructor',
      role: 'reasoning',
      content: 'Analysis',
    },
  ]);
});

test('reports every malformed reasoning end and content ordering', () => {
  const completed = accumulateEvents(createState(), [
    reasoningStart('reasoning-1'),
    reasoningEnd('reasoning-1'),
  ]);

  const contentAfterEnd = accumulateAgUiMessageEvent(
    completed,
    reasoningContent('reasoning-1', 'late'),
  );
  const duplicateEnd = accumulateAgUiMessageEvent(
    completed,
    reasoningEnd('reasoning-1'),
  );
  const unknownEnd = accumulateAgUiMessageEvent(
    createState(),
    reasoningEnd('unknown'),
  );

  expect(contentAfterEnd.error?.message).toBe(
    'Reasoning message reasoning-1 is not active',
  );
  expect(duplicateEnd.error?.message).toBe(
    'Reasoning message reasoning-1 is not active',
  );
  expect(unknownEnd.error?.message).toBe(
    'Reasoning message unknown is not active',
  );
});

test('keeps latest encrypted values and ignores unknown encrypted entities', () => {
  const state = accumulateEvents(createState(), [
    textStart('message-1'),
    textContent('Answer', 'message-1'),
    toolStart('call-1', 'search'),
  ]);

  const unknownMessage = accumulateAgUiMessageEvent(
    state,
    encryptedValue('unknown-message', 'ignored'),
  );
  const unknownTool = accumulateAgUiMessageEvent(
    state,
    encryptedValue('unknown-tool', 'ignored', 'tool-call'),
  );
  const next = accumulateEvents(state, [
    encryptedValue('message-1', 'assistant-first'),
    encryptedValue('message-1', 'assistant-latest'),
    encryptedValue('call-1', 'tool-first', 'tool-call'),
    encryptedValue('call-1', 'tool-latest', 'tool-call'),
  ]);

  expect(unknownMessage).toBe(state);
  expect(unknownTool).toBe(state);
  expect(next.message?.encryptedValue).toBe('assistant-latest');
  expect(next.toolCalls[0]?.encryptedValue).toBe('tool-latest');
});

test('keeps encrypted-value event metadata local to the event', () => {
  const encryptedMetadata = { provider: { signature: 'event-only' } };
  const state = accumulateAgUiMessageEvent(
    createState(),
    reasoningStart('reasoning-1', { accumulated: 'detail' }),
  );

  const next = accumulateAgUiMessageEvent(state, {
    type: EventType.REASONING_ENCRYPTED_VALUE,
    subtype: 'message',
    entityId: 'reasoning-1',
    encryptedValue: 'opaque',
    metadata: encryptedMetadata,
  });
  encryptedMetadata.provider.signature = 'mutated';

  expect(reasoningDetails(next)[0]).toEqual({
    id: 'reasoning-1',
    role: 'reasoning',
    content: '',
    encryptedValue: 'opaque',
    metadata: { accumulated: 'detail' },
  });
});

test('clones metadata supplied through text and tool chunk shorthand', () => {
  const textMetadata = { provider: { step: 1 } };
  const toolMetadata = { provider: { step: 2 } };
  const state = createState();

  const next = accumulateEvents(state, [
    {
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'message-1',
      role: 'assistant',
      delta: 'Answer',
      metadata: textMetadata,
    },
    {
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'call-1',
      toolCallName: 'search',
      parentMessageId: 'message-1',
      delta: '{}',
      metadata: toolMetadata,
    },
  ]);
  textMetadata.provider.step = 99;
  toolMetadata.provider.step = 100;

  expect(next.message?.metadata).toEqual({ provider: { step: 1 } });
  expect(next.toolCalls[0]?.metadata).toEqual({ provider: { step: 2 } });
});

test('preserves current single-assistant accumulation when message ids change', () => {
  const state = accumulateEvents(createState(), [
    textStart('message-1'),
    textContent('First', 'message-1'),
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'message-1',
    },
    textStart('message-2'),
    textContent('Second', 'message-2'),
  ]);

  expect(state.messageId).toBe('message-2');
  expect(state.message?.content).toBe('FirstSecond');
});

test('reports malformed reasoning ordering without discarding prior details', () => {
  const active = accumulateEvents(createState(), [
    reasoningStart('constructor'),
    reasoningContent('constructor', 'Analysis'),
  ]);

  const duplicateStart = accumulateAgUiMessageEvent(
    active,
    reasoningStart('constructor'),
  );
  const unknownContent = accumulateAgUiMessageEvent(
    createState(),
    reasoningContent('unknown', 'Missing'),
  );
  const unfinished = accumulateAgUiMessageEvent(active, runFinished());

  expect(duplicateStart.error?.message).toBe(
    'Reasoning message constructor has already started',
  );
  expect(reasoningDetails(duplicateStart)[0]?.content).toBe('Analysis');
  expect(unknownContent.error?.message).toBe(
    'Reasoning message unknown is not active',
  );
  expect(unfinished.error?.message).toBe(
    'Reasoning message constructor is still active',
  );
});

test('treats incomplete text and tool sequences according to current behavior', () => {
  const state = createState();

  const textWithoutStart = accumulateAgUiMessageEvent(
    state,
    textContent('ignored', 'unknown'),
  );
  const toolArgsWithoutStart = accumulateAgUiMessageEvent(
    state,
    toolArgs('unknown', '{}'),
  );
  const nonAssistantStart = accumulateAgUiMessageEvent(state, {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'user-message',
    role: 'user',
  });

  expect(textWithoutStart).toBe(state);
  expect(toolArgsWithoutStart).toBe(state);
  expect(nonAssistantStart).toBe(state);
});

test('keeps unsupported, custom, and reasoning chunk events as immutable no-ops', () => {
  const state = createState();
  const events: AGUIEvent[] = [
    { type: EventType.STATE_SNAPSHOT, snapshot: { ignored: true } },
    { type: EventType.CUSTOM, name: 'ignored', value: { ignored: true } },
    {
      type: EventType.REASONING_MESSAGE_CHUNK,
      messageId: 'reasoning-1',
      delta: 'ignored',
    },
    { type: EventType.REASONING_START, messageId: 'group-1' },
    { type: EventType.REASONING_END, messageId: 'group-1' },
  ];

  const results = events.map((event) =>
    accumulateAgUiMessageEvent(state, event),
  );

  expect(results.every((result) => result === state)).toBe(true);
});

test('does not mutate event inputs, prior state, parser state, cache, or schemas', () => {
  const schema = s.object('output', {
    message: s.streaming.string('message'),
  });
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    submit: {
      name: 'submit',
      description: '',
      schema,
      handler: async () => undefined,
    },
  };
  const contentEvent = {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'message-1',
    delta: '{"message":"hello"}',
    metadata: { nested: { value: 1 } },
  } as const satisfies AGUIEvent;
  const started = accumulateAgUiMessageEvent(
    createState(schema, toolsByName),
    textStart(),
  );
  const eventSnapshot = structuredClone(contentEvent);
  const priorSnapshot = {
    message: started.message,
    toolCalls: started.toolCalls,
    diagnostics: started.diagnostics,
    schema: started.configSnapshot?.responseSchema,
    toolsByName: started.configSnapshot?.toolsByName,
  };

  const parsed = accumulateAgUiMessageEvent(started, contentEvent);
  const parserSnapshot = structuredClone(parsed.outputParserState);
  const cacheSnapshot = structuredClone(parsed.outputCache);
  const next = accumulateAgUiMessageEvent(parsed, textContent(' '));

  expect(contentEvent).toEqual(eventSnapshot);
  expect(started.message).toBe(priorSnapshot.message);
  expect(started.toolCalls).toBe(priorSnapshot.toolCalls);
  expect(started.diagnostics).toBe(priorSnapshot.diagnostics);
  expect(started.configSnapshot?.responseSchema).toBe(priorSnapshot.schema);
  expect(started.configSnapshot?.toolsByName).toBe(priorSnapshot.toolsByName);
  expect(parsed.outputParserState).toEqual(parserSnapshot);
  expect(parsed.outputCache).toEqual(cacheSnapshot);
  expect(next.outputParserState).not.toBe(parsed.outputParserState);
  expect(next.outputCache).toBe(parsed.outputCache);
  expect(next.configSnapshot?.responseSchema).toBe(
    parsed.configSnapshot?.responseSchema,
  );
  expect(next.configSnapshot?.toolsByName).toBe(
    parsed.configSnapshot?.toolsByName,
  );
});

test('structurally shares untouched message, tool, parser, cache, and diagnostic data', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    submit: {
      name: 'submit',
      description: '',
      schema: s.object('arguments', { value: s.number('value') }),
      handler: async () => undefined,
    },
  };
  const state = accumulateEvents(createState(undefined, toolsByName), [
    textStart(),
    textContent('Answer'),
    toolStart('call-submit', 'submit'),
    toolArgs('call-submit', '{"value":1}'),
  ]);

  const next = accumulateAgUiMessageEvent(
    state,
    encryptedValue('message-1', 'opaque'),
  );

  expect(next.message).not.toBe(state.message);
  expect(next.toolCalls).toBe(state.toolCalls);
  expect(next.toolParserStateById).toBe(state.toolParserStateById);
  expect(next.toolCacheById).toBe(state.toolCacheById);
  expect(next.diagnostics).toBe(state.diagnostics);
  expect(next.configSnapshot).toBe(state.configSnapshot);
});
