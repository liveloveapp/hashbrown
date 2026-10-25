import { runInput, withDotnetFixture } from '../harness/http-fixture';

const start = {
  type: 'TEXT_MESSAGE_START',
  messageId: 'answer',
  role: 'assistant',
};
const content = {
  type: 'TEXT_MESSAGE_CONTENT',
  messageId: 'answer',
  delta: 'Hello 🌎',
};
const end = { type: 'TEXT_MESSAGE_END', messageId: 'answer' };
const finished = {
  type: 'RUN_FINISHED',
  threadId: 'fixture-thread',
  runId: 'resumed',
};

function sse(events: readonly unknown[], separator = '\r\n', trailing = true) {
  return events
    .map((event) => `data: ${JSON.stringify(event)}${separator}${separator}`)
    .join('')
    .replace(trailing ? /$^/ : /\r?\n\r?\n$/, '');
}

test('native observer handles every UTF-8 byte boundary and holds terminal output until persistence', async () => {
  await withDotnetFixture('openai', async (fixture) => {
    const wire = sse([start, content, end, finished]);
    const bytes = Buffer.from(wire);

    const response = await fetch(`${fixture.url}/__test/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original: runInput(),
        chunks: [...bytes].map((byte) =>
          Buffer.from([byte]).toString('base64'),
        ),
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      outcome: 'Finished',
      committedBeforeTerminal: true,
      snapshot: {
        messages: [
          runInput().messages[0],
          { id: 'answer', role: 'assistant', content: 'Hello 🌎' },
        ],
      },
      forwarded: wire,
    });
  });
});

for (const [name, events, outcome] of [
  [
    'unknown meaningful custom event',
    [
      start,
      content,
      { type: 'CUSTOM', name: 'private', value: {} },
      end,
      finished,
    ],
    'Finished',
  ],
  [
    'JSON patch',
    [
      start,
      content,
      { type: 'STATE_DELTA', delta: [{ op: 'add', path: '/x', value: 1 }] },
      end,
      finished,
    ],
    'Finished',
  ],
  ['unfinished text', [start, content, finished], 'Finished'],
  [
    'pending browser tool',
    [
      start,
      content,
      end,
      {
        ...finished,
        outcome: { type: 'success', pendingToolCallIds: ['browser'] },
      },
    ],
    'Finished',
  ],
  [
    'unanswered tool call',
    [
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'browser',
        toolCallName: 'client',
      },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'browser', delta: '{}' },
      { type: 'TOOL_CALL_END', toolCallId: 'browser' },
      finished,
    ],
    'Finished',
  ],
  [
    'interrupted outcome',
    [start, content, end, { ...finished, outcome: { type: 'cancelled' } }],
    'Interrupted',
  ],
  ['missing terminal', [start, content, end], 'Unavailable'],
] as const) {
  test(`${name} preserves outcome with unavailable terminal transcript`, async () => {
    await withDotnetFixture('openai', async (fixture) => {
      const response = await fetch(`${fixture.url}/__test/observe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original: runInput(),
          chunks: [Buffer.from(sse(events)).toString('base64')],
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ outcome, snapshot: null });
    });
  });
}

for (const [name, rawChange] of [
  ['matching redundant text', {}],
  ['mismatched identity', { messageId: 'different' }],
  ['mismatched role', { role: 'user' }],
  ['continuation data', { continuationToken: 'opaque' }],
  [
    'extra meaningful content',
    {
      contents: [
        { $type: 'text', text: 'Hello 🌎' },
        { $type: 'data', data: {} },
      ],
    },
  ],
  [
    'annotations',
    {
      contents: [
        {
          $type: 'text',
          text: 'Hello 🌎',
          annotations: [{ type: 'citation' }],
        },
      ],
    },
  ],
] as const) {
  test(`native raw text diagnostics: ${name}`, async () => {
    await withDotnetFixture('openai', async (fixture) => {
      const rawEvent = {
        authorName: null,
        role: 'assistant',
        contents: [
          {
            $type: 'text',
            text: 'Hello 🌎',
            annotations: null,
            additionalProperties: null,
          },
        ],
        additionalProperties: null,
        responseId: 'answer',
        messageId: 'answer',
        conversationId: null,
        createdAt: '2026-01-01T00:00:00Z',
        finishReason: null,
        modelId: 'fixture',
        continuationToken: null,
        ...rawChange,
      };
      const wire = sse(
        [start, { ...content, rawEvent }, end, finished],
        '\n',
        false,
      );

      const response = await fetch(`${fixture.url}/__test/observe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original: runInput(),
          chunks: [Buffer.from(wire).toString('base64')],
        }),
      });
      const result = await response.json();

      expect(result.outcome).toBe('Finished');
      expect(result.forwarded).toBe(wire);
      if (name === 'matching redundant text')
        expect(result.snapshot.messages.at(-1).content).toBe('Hello 🌎');
      else expect(result.snapshot).toBeNull();
    });
  });
}

test('an oversized frame stops observation without acknowledging a completed answer', async () => {
  await withDotnetFixture('openai', async (fixture) => {
    const wire = sse([
      start,
      { ...content, delta: 'x'.repeat(4096) },
      end,
      finished,
    ]);

    const response = await fetch(`${fixture.url}/__test/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original: runInput(),
        maximumBytes: 1024,
        chunks: [Buffer.from(wire).toString('base64')],
      }),
    });

    const result = await response.json();
    expect(result.error).toBeTruthy();
    expect(result.snapshot).toBeNull();
    expect(result.forwarded).not.toContain('RUN_FINISHED');
  });
});

test('multiple data lines and complete native messages/state snapshots are folded without replay', async () => {
  await withDotnetFixture('openai', async (fixture) => {
    const message = {
      id: 'retained',
      role: 'assistant',
      content: 'Actual snapshot',
    };
    const wire = [
      {
        type: 'MESSAGES_SNAPSHOT',
        messages: [runInput().messages[0], message],
      },
      { type: 'STATE_SNAPSHOT', snapshot: { count: 2 } },
      finished,
    ]
      .map(
        (event) =>
          JSON.stringify(event, null, 2)
            .split('\n')
            .map((line) => `data: ${line}`)
            .join('\r\n') + '\r\n\r\n',
      )
      .join('');

    const response = await fetch(`${fixture.url}/__test/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original: runInput(),
        chunks: [Buffer.from(wire).toString('base64')],
      }),
    });

    expect(await response.json()).toMatchObject({
      outcome: 'Finished',
      snapshot: {
        messages: [runInput().messages[0], message],
        state: { count: 2 },
      },
      forwarded: wire,
    });
  });
});

test('many small valid frames stop retaining fold payload after the cumulative bound', async () => {
  await withDotnetFixture('openai', async (fixture) => {
    const wire = sse([
      start,
      ...Array.from({ length: 1000 }, () => ({
        ...content,
        delta: 'x'.repeat(80),
      })),
      end,
      finished,
    ]);

    const response = await fetch(`${fixture.url}/__test/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original: runInput(),
        maximumBytes: 1024,
        chunks: [Buffer.from(wire).toString('base64')],
      }),
    });
    const result = await response.json();

    expect(result.outcome).toBe('Finished');
    expect(result.snapshot).toBeNull();
    expect(result.retainedBytes).toBeLessThanOrEqual(1024);
    expect(result.forwarded).toBe(wire);
  });
});

test('an oversized successful terminal cannot bypass terminal persistence and acknowledge completion', async () => {
  await withDotnetFixture('openai', async (fixture) => {
    const wire = sse([
      start,
      content,
      end,
      { ...finished, result: 'x'.repeat(4096) },
    ]);

    const response = await fetch(`${fixture.url}/__test/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original: runInput(),
        maximumBytes: 1024,
        failCommit: true,
        chunks: [Buffer.from(wire).toString('base64')],
      }),
    });
    const result = await response.json();

    expect(result.error).toBeTruthy();
    expect(result.forwarded).not.toContain('RUN_FINISHED');
    expect(result.committedBeforeTerminal).toBe(false);
  });
});

for (const mismatch of [
  'none',
  'arguments',
  'call-id',
  'result',
  'annotations',
  'continuation',
  'repeated-metadata',
  'arguments-with-missing-end-raw',
] as const) {
  test(`native tool diagnostics ${mismatch} preserve canonical content only when equivalent`, async () => {
    await withDotnetFixture('openai', async (fixture) => {
      const callRaw = {
        authorName: 'Hashbrown',
        role: 'assistant',
        contents: [
          {
            $type: 'functionCall',
            name: 'lookupAirport',
            arguments: { code: 'PDX' },
            informationalOnly: false,
            callId: 'call',
            annotations: null,
            additionalProperties: null,
          },
        ],
        additionalProperties: null,
        responseId: 'assistant-call',
        messageId: 'assistant-call',
        conversationId: null,
        createdAt: '2026-01-01T00:00:00Z',
        finishReason: 'tool_calls',
        modelId: 'fixture',
        continuationToken: null,
      };
      const resultRaw = {
        ...callRaw,
        role: 'tool',
        responseId: 'diagnostic-result-id',
        messageId: 'diagnostic-result-id',
        finishReason: null,
        modelId: null,
        contents: [
          {
            $type: 'functionResult',
            result: { code: mismatch === 'result' ? 'BAD' : 'PDX' },
            callId: 'call',
            annotations:
              mismatch === 'annotations' ? [{ type: 'citation' }] : null,
            additionalProperties: null,
          },
        ],
        continuationToken: mismatch === 'continuation' ? 'opaque' : null,
      };
      const wire = sse([
        {
          type: 'TOOL_CALL_START',
          toolCallId: 'call',
          toolCallName: 'lookupAirport',
          parentMessageId: 'assistant-call',
          rawEvent: callRaw,
        },
        {
          type: 'TOOL_CALL_ARGS',
          toolCallId: 'call',
          delta: '{"code":',
          rawEvent: callRaw,
        },
        {
          type: 'TOOL_CALL_ARGS',
          toolCallId: 'call',
          delta:
            mismatch === 'arguments' ||
            mismatch === 'arguments-with-missing-end-raw'
              ? '"BAD"}'
              : '"PDX"}',
          rawEvent: callRaw,
        },
        {
          type: 'TOOL_CALL_END',
          toolCallId: 'call',
          rawEvent:
            mismatch === 'arguments-with-missing-end-raw'
              ? undefined
              : mismatch === 'repeated-metadata'
                ? { ...callRaw, modelId: 'changed' }
                : mismatch === 'call-id'
                  ? {
                      ...callRaw,
                      contents: [{ ...callRaw.contents[0], callId: 'forged' }],
                    }
                  : callRaw,
        },
        {
          type: 'TOOL_CALL_RESULT',
          toolCallId: 'call',
          messageId: 'canonical-result-id',
          content: '{ "code": "PDX" }',
          rawEvent: resultRaw,
        },
        start,
        content,
        end,
        finished,
      ]);

      const response = await fetch(`${fixture.url}/__test/observe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original: runInput(),
          chunks: [Buffer.from(wire).toString('base64')],
        }),
      });
      const result = await response.json();

      expect(result.outcome).toBe('Finished');
      if (mismatch === 'none') {
        expect(result.snapshot.messages).toContainEqual(
          expect.objectContaining({
            role: 'assistant',
            toolCalls: [
              {
                id: 'call',
                type: 'function',
                function: {
                  name: 'lookupAirport',
                  arguments: '{"code":"PDX"}',
                },
              },
            ],
          }),
        );
        expect(result.snapshot.messages).toContainEqual({
          id: 'canonical-result-id',
          role: 'tool',
          toolCallId: 'call',
          content: '{ "code": "PDX" }',
        });
      } else expect(result.snapshot).toBeNull();
    });
  });
}

test('a messages snapshot cannot bypass deferred native raw argument validation', async () => {
  await withDotnetFixture('openai', async (fixture) => {
    const rawEvent = {
      authorName: 'Hashbrown',
      role: 'assistant',
      contents: [
        {
          $type: 'functionCall',
          name: 'lookupAirport',
          arguments: { code: 'PDX' },
          informationalOnly: false,
          callId: 'call',
          annotations: null,
          additionalProperties: null,
        },
      ],
      additionalProperties: null,
      responseId: 'assistant-call',
      messageId: 'assistant-call',
      conversationId: null,
      createdAt: '2026-01-01T00:00:00Z',
      finishReason: 'tool_calls',
      modelId: 'fixture',
      continuationToken: null,
    };
    const wire = sse([
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'call',
        toolCallName: 'lookupAirport',
        parentMessageId: 'assistant-call',
        rawEvent,
      },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'call', delta: '{"code":"BAD"}' },
      {
        type: 'MESSAGES_SNAPSHOT',
        messages: [
          ...runInput().messages,
          { id: 'replacement', role: 'assistant', content: 'Replacement' },
        ],
      },
      finished,
    ]);

    const response = await fetch(`${fixture.url}/__test/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original: runInput(),
        chunks: [Buffer.from(wire).toString('base64')],
      }),
    });

    expect(await response.json()).toMatchObject({
      outcome: 'Finished',
      snapshot: null,
    });
  });
});

test('malformed raw diagnostic field types make history unavailable while retaining the actual terminal outcome', async () => {
  await withDotnetFixture('openai', async (fixture) => {
    const rawEvent = {
      authorName: null,
      role: { unsupported: true },
      contents: [
        {
          $type: 'text',
          text: 'Hello 🌎',
          annotations: null,
          additionalProperties: null,
        },
      ],
      responseId: 'answer',
      messageId: 'answer',
    };
    const wire = sse([start, { ...content, rawEvent }, end, finished]);

    const response = await fetch(`${fixture.url}/__test/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original: runInput(),
        chunks: [Buffer.from(wire).toString('base64')],
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      outcome: 'Finished',
      snapshot: null,
    });
  });
});
