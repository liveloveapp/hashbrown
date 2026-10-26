import { type AGUIEvent, EventType } from '@ag-ui/core';
import { text } from './text.fn';
import type { OpenAITextStreamOptions } from './types';

/** Supplies one deterministic request for HTTP-boundary regressions. */
function createOptions(signal?: AbortSignal): OpenAITextStreamOptions {
  return {
    apiKey: 'test-api-key',
    baseURL: 'https://openai.test/v1',
    model: 'qwen2.5:14b',
    signal,
    input: {
      threadId: 'thread',
      runId: 'run',
      messages: [{ id: 'user', role: 'user', content: 'Call lookup.' }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    },
  };
}

/** Exercises the real SDK HTTP boundary with a controlled HTTP event stream. */
async function runResponse(
  response: Record<string, unknown>,
  precedingEvents: readonly Record<string, unknown>[] = [],
) {
  const events = [
    {
      type: 'response.created',
      sequence_number: 0,
      response: { status: 'in_progress', output: [] },
    },
    ...precedingEvents,
    {
      type:
        response['status'] === 'incomplete'
          ? 'response.incomplete'
          : 'response.completed',
      sequence_number: precedingEvents.length + 1,
      response,
    },
  ];
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(
        events
          .map(
            (event) =>
              `event: ${event['type']}\ndata: ${JSON.stringify(event)}\n\n`,
          )
          .join(''),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

  try {
    return await Array.fromAsync(text(createOptions()));
  } finally {
    fetchSpy.mockRestore();
  }
}

test.each([null, undefined, {}])(
  'rejects a completed HTTP response with malformed output %p',
  async (output) => {
    // Ollama 0.35 reports completed with output:null after exhausting a
    // five-token tool request. Its missing incomplete_details cannot establish
    // a length finish; the malformed response must remain an error.
    const response = {
      status: 'completed',
      output,
      incomplete_details: null,
      model: 'qwen2.5:14b',
      usage: { input_tokens: 175, output_tokens: 5, total_tokens: 180 },
    };

    const events: AGUIEvent[] = await runResponse(response);

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_ERROR,
    ]);
    expect(events.at(-1)).toEqual({
      type: EventType.RUN_ERROR,
      message:
        'OpenAI Responses protocol error: response.completed response.output must be an array',
    });
  },
);

test('preserves the length finish for a valid empty incomplete HTTP response', async () => {
  const response = {
    status: 'incomplete',
    output: [],
    incomplete_details: { reason: 'max_output_tokens' },
    model: 'qwen2.5:14b',
    usage: { input_tokens: 175, output_tokens: 5, total_tokens: 180 },
  };

  const events = await runResponse(response);

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.RUN_FINISHED,
  ]);
  expect(events.at(-1)).toMatchObject({
    metadata: {
      hashbrown: { finishReason: 'length' },
      openai: { status: 'incomplete', incompleteReason: 'max_output_tokens' },
    },
  });
});

test('accepts a valid empty completed HTTP response', async () => {
  const response = { status: 'completed', output: [] };

  const events = await runResponse(response);

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.RUN_FINISHED,
  ]);
  expect(events.at(-1)).toMatchObject({
    metadata: { hashbrown: { finishReason: 'stop' } },
  });
});

test('does not close a partial tool call when terminal HTTP output is malformed', async () => {
  const response = { status: 'completed', output: null };
  const precedingEvents = [
    {
      type: 'response.output_item.added',
      sequence_number: 1,
      output_index: 0,
      item: {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        name: 'lookup',
        arguments: '',
      },
    },
    {
      type: 'response.function_call_arguments.delta',
      sequence_number: 2,
      item_id: 'fc_1',
      output_index: 0,
      delta: '{"query":',
    },
  ];

  const events = await runResponse(response, precedingEvents);

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_ARGS,
    EventType.RUN_ERROR,
  ]);
  expect(events.at(-1)).toMatchObject({
    message:
      'OpenAI Responses protocol error: response.completed response.output must be an array',
  });
});

test.each([null, undefined, {}])(
  'rejects malformed incomplete HTTP output %p without inferring a length finish',
  async (output) => {
    const response = {
      status: 'incomplete',
      output,
      incomplete_details: { reason: 'max_output_tokens' },
    };

    const events = await runResponse(response);

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_ERROR,
    ]);
    expect(events.at(-1)).toMatchObject({
      message:
        'OpenAI Responses protocol error: response.incomplete response.output must be an array',
    });
  },
);

test('cancels a real SDK HTTP request before response headers without a run error', async () => {
  const controller = new AbortController();
  let requestSignal: AbortSignal | null | undefined;
  let requestStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        requestSignal = init?.signal;
        requestSignal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
        requestStarted();
      }),
  );
  const iterator = text(createOptions(controller.signal))[
    Symbol.asyncIterator
  ]();

  try {
    const first = await iterator.next();
    const pending = iterator.next();
    await started;
    controller.abort();
    const last = await pending;

    expect(first.value).toMatchObject({ type: EventType.RUN_STARTED });
    expect(last).toEqual({ done: true, value: undefined });
    expect(requestSignal?.aborted).toBe(true);
  } finally {
    controller.abort();
    await iterator.return?.();
    fetchSpy.mockRestore();
  }
});
