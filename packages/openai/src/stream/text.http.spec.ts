/* eslint-disable @nx/enforce-module-boundaries -- Drives native HTTP results through the real internal root store. */
import type { Message } from '@ag-ui/core';
import type OpenAI from 'openai';
import {
  apiActions,
  devActions,
  internalActions,
} from '../../../core/src/actions';
import {
  reducers,
  ɵprepareRootAction,
  ɵselectCommittedAgUiMessages,
} from '../../../core/src/reducers';
import { createCanonicalRunAgentInput } from '../../../core/src/transport/hashbrown-run-agent-input';
import { createStore } from '../../../core/src/utils/micro-ngrx';
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

test.each([
  {
    title: 'default automatic',
    option: true as const,
    container: { type: 'auto' },
  },
  {
    title: 'configured automatic',
    option: {
      container: {
        type: 'auto' as const,
        file_ids: ['file-input'],
        memory_limit: '4g' as const,
      },
    },
    container: { type: 'auto', file_ids: ['file-input'], memory_limit: '4g' },
  },
  {
    title: 'explicit retained',
    option: { container: 'container-retained' },
    container: 'container-retained',
  },
])(
  'sends $title code execution through the real SDK and replays only ordinary app calls on the next HTTP request',
  async ({ option, container }) => {
    const schema = {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
      additionalProperties: false,
    };
    const parameters = { type: 'object', properties: {} };
    const builtInTools = freezeHttp({
      codeExecution: option,
      webSearch: true as const,
    });
    const options = createOptions();
    const input = freezeHttp({
      ...options.input,
      tools: [
        {
          name: 'code_interpreter',
          description: 'Ordinary app tool',
          parameters,
        },
      ],
      forwardedProps: { hashbrown: { responseSchema: schema } },
    });
    const original = JSON.stringify({ input, builtInTools });
    const native = {
      type: 'code_interpreter_call',
      id: 'code-http',
      code: 'print(42)',
      status: 'completed',
      container_id: 'container-http',
      outputs: [
        { type: 'logs', logs: '42' },
        { type: 'image', url: 'https://files.test/chart.png' },
      ],
    };
    const annotation = {
      type: 'container_file_citation',
      file_id: 'file-http',
      container_id: 'container-http',
      filename: 'answer.csv',
      start_index: 0,
      end_index: 4,
    };
    const answer = {
      type: 'message',
      id: 'native-answer',
      role: 'assistant',
      status: 'completed',
      content: [
        { type: 'output_text', text: 'File ready', annotations: [annotation] },
      ],
    };
    const app = {
      type: 'function_call',
      id: 'native-app',
      call_id: 'app-http',
      name: 'code_interpreter',
      arguments: '{}',
      status: 'completed',
    };
    const bodies: Record<string, unknown>[] = [];
    let transformed: OpenAI.Responses.ResponseCreateParamsStreaming | undefined;
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_url, init) => {
        bodies.push(JSON.parse(init?.body as string));
        return httpEvents(
          bodies.length === 1
            ? [
                {
                  type: 'response.output_item.added',
                  output_index: 0,
                  item: { ...native, code: null, status: 'in_progress' },
                },
                {
                  type: 'response.code_interpreter_call_code.delta',
                  output_index: 0,
                  item_id: native.id,
                  delta: native.code,
                },
                {
                  type: 'response.code_interpreter_call_code.done',
                  output_index: 0,
                  item_id: native.id,
                  code: native.code,
                },
                {
                  type: 'response.output_item.added',
                  output_index: 1,
                  item: { ...answer, content: [] },
                },
                {
                  type: 'response.output_item.added',
                  output_index: 2,
                  item: { ...app, arguments: '' },
                },
                {
                  type: 'response.output_item.done',
                  output_index: 2,
                  item: app,
                },
                {
                  type: 'response.completed',
                  response: {
                    status: 'completed',
                    output: [native, answer, app],
                  },
                },
              ]
            : [
                {
                  type: 'response.completed',
                  response: { status: 'completed', output: [] },
                },
              ],
        );
      });
    const store = createStore({
      reducers,
      effects: [],
      prepareAction: ɵprepareRootAction,
    });
    store.dispatch(
      devActions.init({ system: '', canonicalMessages: input.messages }),
    );
    store.dispatch(internalActions.generationAttemptStarted());
    store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));

    try {
      const events = await Array.fromAsync(
        text({
          ...options,
          input,
          builtInTools,
          model: 'gpt-5-mini',
          reasoning: { effort: 'low' },
          transformRequestOptions: (request) => {
            transformed = request;
            return { ...request, metadata: { boundary: 'preserved' } };
          },
        }),
      );
      for (const event of events)
        store.dispatch(apiActions.generateMessageEvent(event));
      store.dispatch(
        apiActions.generateMessageSuccess({
          message: { role: 'assistant', content: '', toolCallIds: [] },
          toolCalls: [],
        }),
      );
      const messages: Message[] = freezeHttp(
        JSON.parse(
          JSON.stringify([
            ...store.read(ɵselectCommittedAgUiMessages),
            {
              id: 'app-result',
              role: 'tool',
              toolCallId: 'app-http',
              content: 'app result',
            },
          ]),
        ),
      );
      const second = createCanonicalRunAgentInput({
        threadId: 'thread',
        runId: 'second',
        messages,
        state: undefined,
        tools: input.tools,
      });
      const secondBefore = JSON.stringify(second);
      const later = await Array.fromAsync(
        text({
          ...options,
          input: second,
          builtInTools: { codeExecution: { container: 'container-http' } },
        }),
      );

      expect(
        events.filter((event) => event.type === EventType.RUN_ERROR),
      ).toEqual([]);
      expect(
        store.read((state) => state.agUiMessages.protocolError),
      ).toBeUndefined();
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toMatchObject({
        stream: true,
        store: false,
        model: 'gpt-5-mini',
        metadata: { boundary: 'preserved' },
        reasoning: { effort: 'low', summary: 'auto' },
        tools: [
          {
            type: 'function',
            name: 'code_interpreter',
            description: 'Ordinary app tool',
            parameters,
            strict: true,
          },
          { type: 'web_search' },
          { type: 'code_interpreter', container },
        ],
        include: [
          'reasoning.encrypted_content',
          'web_search_call.action.sources',
          'code_interpreter_call.outputs',
        ],
        text: {
          format: { type: 'json_schema', name: 'schema', schema, strict: true },
        },
      });
      const transformedTool = transformed?.tools?.find(
        (tool) => tool.type === 'code_interpreter',
      );
      expect(transformedTool).not.toBe(option);
      if (
        typeof option === 'object' &&
        typeof option.container === 'object' &&
        transformedTool?.type === 'code_interpreter' &&
        typeof transformedTool.container === 'object'
      ) {
        expect(transformedTool.container).not.toBe(option.container);
        expect(transformedTool.container.file_ids).not.toBe(
          option.container.file_ids,
        );
      }
      expect(
        events.find(
          (event) =>
            event.type === EventType.TOOL_CALL_RESULT &&
            event.toolCallId === native.id,
        ),
      ).toMatchObject({ content: JSON.stringify(native) });
      const answerEnd = events.find(
        (event) => event.type === EventType.TEXT_MESSAGE_END,
      );
      expect(answerEnd?.metadata?.['b4.answer']).toMatchObject({
        sources: [
          {
            id: 'run:assistant:cite:0',
            kind: 'file',
            title: 'answer.csv',
            fileId: 'file-http',
            containerId: 'container-http',
          },
        ],
        citations: [
          { sourceId: 'run:assistant:cite:0', quote: 'File', start: 0, end: 4 },
        ],
      });
      expect(bodies[1]).toMatchObject({
        store: false,
        tools: [
          { type: 'function', name: 'code_interpreter' },
          { type: 'code_interpreter', container: 'container-http' },
        ],
        input: [
          { role: 'user', content: 'Call lookup.' },
          {
            type: 'message',
            id: 'native-answer',
            role: 'assistant',
            status: 'completed',
            content: [
              { type: 'output_text', text: 'File ready', annotations: [] },
            ],
          },
          {
            type: 'function_call',
            id: 'native-app',
            call_id: 'app-http',
            name: 'code_interpreter',
            arguments: '{}',
          },
          {
            type: 'function_call_output',
            call_id: 'app-http',
            output: 'app result',
          },
        ],
      });
      expect(bodies[1]['input'] as unknown[]).toHaveLength(4);
      expect(later.at(-1)).toMatchObject({
        type: EventType.RUN_FINISHED,
        metadata: { hashbrown: { finishReason: 'stop' } },
      });
      expect(JSON.stringify({ input, builtInTools })).toBe(original);
      expect(JSON.stringify(second)).toBe(secondBefore);
    } finally {
      fetchSpy.mockRestore();
    }
  },
);

/** Freezes native configuration and canonical history at the HTTP boundary. */
function freezeHttp<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeHttp);
    Object.freeze(value);
  }
  return value;
}

/** Encodes controlled Responses SSE for the actual SDK parser. */
function httpEvents(events: readonly Record<string, unknown>[]) {
  return new Response(
    [
      {
        type: 'response.created',
        response: { status: 'in_progress', output: [] },
      },
      ...events,
    ]
      .map(
        (event, sequence_number) =>
          `event: ${event['type']}\ndata: ${JSON.stringify({ sequence_number, ...event })}\n\n`,
      )
      .join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}
