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
import { EventType } from '@ag-ui/core';
import { text } from './text.fn';
import type { AzureTextStreamOptions } from './types';

/** Supplies fake credentials for deterministic real-SDK HTTP regressions. */
function createOptions(): AzureTextStreamOptions {
  return {
    clientOptions: {
      apiKey: 'test-api-key',
      endpoint: 'https://azure.test',
      apiVersion: '2025-04-01-preview',
    },
    model: 'gpt-4.1',
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
