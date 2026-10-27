import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import {
  canMutateWorkbenchHistory,
  canSaveWorkbenchHistory,
  createWorkbenchHistoryApp,
  decodeWorkbenchHistory,
  encodeWorkbenchHistory,
  readWorkbenchHistory,
  removeWorkbenchHistory,
  workbenchHistoryKey,
  writeWorkbenchHistory,
} from '../examples/quickstart/runtime/workbench-history';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';
import { pinWorkbenchInput } from '../examples/quickstart/server/workbench-app';

const messages = [
  { role: 'user' as const, content: 'Explain Lighthouse.' },
  { role: 'assistant' as const, content: 'Outline, then record.' },
];
const document = { version: 1 as const, messages };
const observation = (extra = {}) => ({
  messages: messages.map((message, index) => ({
    ...message,
    id: `sdk-${index}`,
  })),
  isLoading: false,
  finishReason: 'stop',
  ...extra,
});

test('round trips only bounded complete text without mutating or retaining IDs', () => {
  const input = observation().messages;

  const encoded = encodeWorkbenchHistory(input);
  const decoded = decodeWorkbenchHistory(encoded ?? '');

  expect(decoded).toEqual(document);
  expect(encoded).not.toContain('sdk-');
  expect(input[0].id).toBe('sdk-0');
  expect(decodeWorkbenchHistory('{"version":1,"messages":[]}')).toEqual({
    version: 1,
    messages: [],
  });
});

test('rejects unknown fields, unsupported content, incomplete turns and every size limit without truncation', () => {
  const invalid = [
    { ...document, version: 2 },
    { ...document, extra: true },
    { version: 1, messages: [{ ...messages[0], id: 'saved' }, messages[1]] },
    { version: 1, messages: [messages[0]] },
    { version: 1, messages: [messages[1]] },
    { version: 1, messages: [{ role: 'tool', content: 'x' }] },
    { version: 1, messages: [{ ...messages[0], content: {} }, messages[1]] },
    {
      version: 1,
      messages: Array.from({ length: 42 }, (_, i) => messages[i % 2]),
    },
    {
      version: 1,
      messages: [messages[0], { ...messages[1], content: 'x'.repeat(2001) }],
    },
    {
      version: 1,
      messages: Array.from({ length: 40 }, (_, i) => ({
        role: i % 2 ? 'assistant' : 'user',
        content: '界'.repeat(1000),
      })),
    },
  ];

  const results = invalid.map((value) =>
    decodeWorkbenchHistory(JSON.stringify(value)),
  );

  expect(results).toEqual(invalid.map(() => null));
  expect(
    encodeWorkbenchHistory([{ ...observation().messages[1], toolCalls: [] }]),
  ).toBeNull();
});

test('uses two independent atomic slots and preserves invalid bytes until explicit removal', () => {
  const values = new Map<string, string>([
    [workbenchHistoryKey('Lighthouse'), 'corrupt'],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };

  const invalid = readWorkbenchHistory(() => storage, 'Lighthouse');
  const blocked = writeWorkbenchHistory(() => storage, 'Lighthouse', document);
  const harbor = writeWorkbenchHistory(() => storage, 'Harbor', document);

  expect(invalid.status).toBe('invalid');
  expect(blocked.status).toBe('invalid');
  expect(values.get(workbenchHistoryKey('Lighthouse'))).toBe('corrupt');
  expect(harbor.status).toBe('valid');
  expect(removeWorkbenchHistory(() => storage, 'Lighthouse').status).toBe(
    'empty',
  );
  expect(
    writeWorkbenchHistory(() => storage, 'Lighthouse', document).status,
  ).toBe('valid');
  expect(values.size).toBe(2);
});

test('catches storage getter and method failures without claiming a write succeeded', () => {
  const denied = () => {
    throw new Error('denied');
  };
  const storage = { getItem: denied, setItem: denied, removeItem: denied };

  const results = [
    readWorkbenchHistory(denied, 'Lighthouse'),
    writeWorkbenchHistory(() => storage, 'Lighthouse', document),
    removeWorkbenchHistory(() => storage, 'Harbor'),
  ];

  expect(results.map((result) => result.status)).toEqual([
    'unavailable',
    'unavailable',
    'unavailable',
  ]);
});

test('captures idle actual SDK replacements at turn zero without invented transport events', () => {
  const store = createWorkbenchStore('history');

  store.recordHistory(observation());
  store.recordHistoryApp(
    { ...createWorkbenchHistoryApp(), retained: document },
    'restore',
  );
  store.recordHistory(
    observation({
      messages: messages.map((message, index) => ({
        ...message,
        id: `fresh-${index}`,
      })),
      isSending: true,
    }),
  );
  store.recordHistory(
    observation({
      messages: messages.map((message, index) => ({
        ...message,
        id: `fresh-${index}`,
      })),
    }),
  );

  expect(store.getSnapshot().frame?.history?.sdk.messages[0].id).toBe(
    'fresh-0',
  );
  expect(
    store.getSnapshot().events.some((event) => event.kind === 'event'),
  ).toBe(false);
  expect(canSaveWorkbenchHistory(store.getSnapshot())).toBe(false);
  expect(canMutateWorkbenchHistory(store.getSnapshot())).toBe(true);
});

test('requires a successful live generation and blocks every pending or recovery lifecycle', () => {
  const store = createWorkbenchStore('history');
  store.recordHistory(observation());
  const user = store.send('Explain Harbor');
  store.recordHistory(
    observation({
      messages: [
        ...observation().messages,
        user,
        { id: 'reply', role: 'assistant', content: 'Harbor: outline, record.' },
      ],
    }),
  );
  store.settle('complete', 'stop');

  expect(canSaveWorkbenchHistory(store.getSnapshot())).toBe(true);
  for (const extra of [
    { isSending: true },
    { isLoading: true },
    { isResuming: true },
    { error: new Error('failed') },
    { recoveryRequired: true },
    { pendingInterrupts: { id: 'any', interrupts: [] } },
  ]) {
    store.recordHistory(
      observation({
        ...extra,
        messages: [
          ...observation().messages,
          user,
          {
            id: 'reply',
            role: 'assistant',
            content: 'Harbor: outline, record.',
          },
        ],
      }),
    );
    expect(canMutateWorkbenchHistory(store.getSnapshot())).toBe(false);
    expect(canSaveWorkbenchHistory(store.getSnapshot())).toBe(false);
  }
});

test('guards stale send observations while allowing idle ID replacement and inert replay', () => {
  const store = createWorkbenchStore('history');
  store.recordHistory(observation());
  const user = store.send('Follow up');

  expect(store.recordHistory(observation())).toBe(false);
  expect(
    store.recordHistory(
      observation({
        messages: [user, { id: 'a', role: 'assistant', content: 'Done' }],
      }),
    ),
  ).toBe(true);
  store.settle('complete', 'stop');
  const old = store.getSnapshot().events[0];
  store.seek(0);
  expect(store.recordHistory(observation())).toBe(false);
  expect(store.recordHistoryApp(createWorkbenchHistoryApp(), 'clear')).toBe(
    false,
  );
  expect(canSaveWorkbenchHistory(store.getSnapshot())).toBe(false);
  expect(old.history?.sdk.messages[0].id).toBe('sdk-0');
  expect(Object.isFrozen(old.history?.sdk.messages)).toBe(true);
});

test('appends two history lessons and pins real plain text server policy without tools or schema', () => {
  const input = {
    threadId: 't',
    runId: 'r',
    messages: [{ id: 'u', role: 'user', content: 'Explain Lighthouse' }],
    tools: [],
    context: [],
    state: {},
  };

  const pinned = pinWorkbenchInput(input, 'message-history');

  expect(workbenchLessons).toHaveLength(19);
  expect(workbenchLessons[0].id).toBe('generative-ui');
  expect(pinned.tools).toEqual([]);
  expect(pinned.messages[0].content).toContain('Lighthouse');
  expect(JSON.stringify(pinned.forwardedProps)).not.toContain('responseSchema');
});

test('projects SDK metadata and empty tool arrays while rejecting real tool history', () => {
  const sdkMessages = [
    observation().messages[0],
    { ...observation().messages[1], toolCalls: [] },
  ];

  expect(encodeWorkbenchHistory(sdkMessages)).toBe(JSON.stringify(document));
  expect(
    encodeWorkbenchHistory([
      sdkMessages[0],
      { ...sdkMessages[1], toolCalls: [{ name: 'readContext' }] },
    ]),
  ).toBeNull();
  expect(
    encodeWorkbenchHistory([
      sdkMessages[0],
      {
        ...sdkMessages[1],
        serverToolCalls: [],
        metadata: { model: 'test' },
        encryptedValue: 'opaque',
      },
    ]),
  ).toBe(JSON.stringify(document));
});

test('rejects coerced roles and preserves retained text across cancelled or partial runs', () => {
  const store = createWorkbenchStore('history');
  const app = { ...createWorkbenchHistoryApp(), retained: document };
  store.recordHistory(observation());
  store.recordHistoryApp(app, 'keep');
  const user = store.send('Follow up');
  store.recordHistory(
    observation({
      messages: [
        user,
        { id: 'partial', role: 'assistant', content: 'Partial' },
      ],
      finishReason: 'length',
    }),
  );
  store.settle('complete', 'length');

  expect(
    decodeWorkbenchHistory(
      JSON.stringify({
        version: 1,
        messages: [messages[0], { role: ['user'], content: 'x' }, messages[1]],
      }),
    ),
  ).toBeNull();
  expect(canSaveWorkbenchHistory(store.getSnapshot())).toBe(false);
  expect(store.getSnapshot().frame?.history?.app.retained).toEqual(document);
  const second = store.send('Retry');
  store.recordHistory(
    observation({
      messages: [
        second,
        { id: 'cancelled', role: 'assistant', content: 'Partial' },
      ],
      isLoading: true,
    }),
  );
  store.settle('cancelled');
  expect(canSaveWorkbenchHistory(store.getSnapshot())).toBe(false);
  expect(store.getSnapshot().frame?.history?.app.retained).toEqual(document);
});

test('keeps the previous document when an atomic write fails', () => {
  const previous = JSON.stringify(document);
  let writes = 0;
  const storage = {
    getItem: () => previous,
    setItem: () => {
      writes++;
      throw new Error('quota');
    },
    removeItem: () => undefined,
  };

  const failure = writeWorkbenchHistory(() => storage, 'Lighthouse', {
    version: 1,
    messages: [messages[0], { ...messages[1], content: 'New answer' }],
  });

  expect(failure.status).toBe('unavailable');
  expect(failure.document).toEqual(document);
  expect(writes).toBe(1);
  expect(storage.getItem()).toBe(previous);
});

test('keeps setter transitions busy until actual SDK settlement and blocks capture seeking', () => {
  const store = createWorkbenchStore('history');
  store.recordHistory(observation());
  store.recordHistoryApp(
    { ...createWorkbenchHistoryApp(), retained: document },
    'restore',
  );
  store.recordHistory(observation({ isSending: true }));

  store.seek(0);

  expect(canMutateWorkbenchHistory(store.getSnapshot())).toBe(false);
  expect(store.getSnapshot().cursor).toBeNull();
  store.recordHistory(observation());
  expect(canMutateWorkbenchHistory(store.getSnapshot())).toBe(true);
});

test('rejects programmatic sends that would bypass pending or recovery workflows', () => {
  const store = createWorkbenchStore('history');
  store.recordHistory(
    observation({ pendingInterrupts: { id: 'batch', interrupts: [] } }),
  );

  expect(() => store.send('Bypass pending')).toThrow();
  store.recordHistory(observation({ recoveryRequired: true }));
  expect(() => store.send('Bypass recovery')).toThrow();
});

test('replacement intent blocks synchronously before the SDK effect and clears only on settled replacement', () => {
  const store = createWorkbenchStore('history');
  store.recordHistory(observation());
  const app = { ...createWorkbenchHistoryApp(), retained: document };

  expect(store.recordHistoryApp(app, 'restore')).toBe(true);
  store.seek(0);

  expect(store.getSnapshot().cursor).toBeNull();
  expect(canMutateWorkbenchHistory(store.getSnapshot())).toBe(false);
  expect(() => store.send('Too early')).toThrow();
  expect(store.recordHistoryApp(app, 'keep')).toBe(false);
  store.recordHistory(observation());
  expect(canMutateWorkbenchHistory(store.getSnapshot())).toBe(false);
  const restored = messages.map((message, index) => ({
    ...message,
    id: `restored-${index}`,
  }));
  store.recordHistory(observation({ messages: restored, isSending: true }));
  expect(canMutateWorkbenchHistory(store.getSnapshot())).toBe(false);
  store.recordHistory(observation({ messages: restored }));
  expect(canMutateWorkbenchHistory(store.getSnapshot())).toBe(true);
  expect(store.getSnapshot().frame?.history?.sdk.isSending).toBe(false);
});

test('failed setter releases intent without inventing SDK messages or losing retained data', () => {
  const store = createWorkbenchStore('history');
  store.recordHistory(observation());
  store.recordHistoryApp(
    { ...createWorkbenchHistoryApp(), retained: document },
    'clear',
  );

  expect(store.failHistoryReplacement(new Error('setter rejected'))).toBe(true);

  expect(canMutateWorkbenchHistory(store.getSnapshot())).toBe(true);
  expect(store.getSnapshot().frame?.history?.sdk.messages[0].id).toBe('sdk-0');
  expect(store.getSnapshot().frame?.history?.app.retained).toEqual(document);
  expect(store.getSnapshot().frame?.history?.app.error).toBe('setter rejected');
  expect(store.failHistoryReplacement()).toBe(false);
  expect(canSaveWorkbenchHistory(store.getSnapshot())).toBe(false);
});
