import { type AGUIEvent, EventType } from '@ag-ui/core';
import type {
  AGUIEvent as AimockAGUIEvent,
  AGUIMock,
  AGUIRunAgentInput,
} from '@copilotkit/aimock/agui';
import {
  Chat,
  HttpTransport,
  createHttpTransport,
  fryHashbrown,
  s,
  type StateSignal,
  type TransportRequest,
  type TransportResponse,
} from '@hashbrownai/core';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AimockHandle, startAimock } from './aimock-runner';

type HashbrownRunInput = NonNullable<TransportRequest['input']>;

function createFixtureFile(workDir: string): string {
  const fixturePath = join(workDir, 'providers.json');
  writeFileSync(fixturePath, JSON.stringify({ fixtures: [] }));
  return fixturePath;
}

function createRequest(
  input: HashbrownRunInput,
  requestId: string,
): TransportRequest {
  return {
    input,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId,
  };
}

async function collectEvents(
  events: AsyncIterable<AGUIEvent>,
): Promise<AGUIEvent[]> {
  const collected: AGUIEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function parseRequestInput(body: BodyInit | null | undefined) {
  if (typeof body !== 'string') {
    throw new Error('Expected a JSON request body');
  }

  return JSON.parse(body) as HashbrownRunInput;
}

function waitForSignal<State>(
  signal: StateSignal<State>,
  predicate: (state: State) => boolean,
  timeoutMs = 5_000,
): Promise<State> {
  const current = signal();
  if (predicate(current)) {
    return Promise.resolve(current);
  }

  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    const timeout = setTimeout(() => {
      unsubscribe?.();
      reject(new Error(`Timed out waiting for state after ${timeoutMs}ms`));
    }, timeoutMs);

    unsubscribe = signal.subscribe((state) => {
      if (!predicate(state)) {
        return;
      }

      clearTimeout(timeout);
      unsubscribe?.();
      resolve(state);
    });
  });
}

function registerFixture(
  aguiMock: AGUIMock,
  predicate: (input: HashbrownRunInput) => boolean,
  events: AGUIEvent[],
): void {
  aguiMock.onPredicate(
    // Aimock 1.38 duplicates AG-UI's wire types and omits Hashbrown's extension.
    (input: AGUIRunAgentInput) => predicate(input as HashbrownRunInput),
    events as unknown as AimockAGUIEvent[],
  );
}

test('createHttpTransport posts Hashbrown run input and collects text events over real SSE', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-agui-http-'));
  const fixturePath = createFixtureFile(workDir);
  const input: HashbrownRunInput = {
    threadId: 'thread-text',
    runId: 'run-text',
    messages: [
      {
        id: 'message-system',
        role: 'system',
        content: 'Answer from the documentation.',
      },
      {
        id: 'message-user',
        role: 'user',
        content: 'What is Hashbrown?',
      },
    ],
    tools: [
      {
        name: 'searchDocs',
        description: 'Search the Hashbrown documentation.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ],
    context: [{ description: 'workspace', value: 'hashbrown' }],
    state: { locale: 'en-US' },
    forwardedProps: { traceId: 'trace-text' },
    hashbrown: {
      responseSchema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
      ui: true,
    },
  };
  const expectedEvents: AGUIEvent[] = [
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-text',
      runId: 'run-text',
      timestamp: 1_700_000_001_000,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'message-assistant-text',
      role: 'assistant',
      timestamp: 1_700_000_001_001,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-assistant-text',
      delta: 'Hashbrown renders ',
      timestamp: 1_700_000_001_002,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-assistant-text',
      delta: 'generative UI.',
      timestamp: 1_700_000_001_003,
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'message-assistant-text',
      timestamp: 1_700_000_001_004,
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-text',
      runId: 'run-text',
      timestamp: 1_700_000_001_005,
    },
  ];
  const capturedInputs: HashbrownRunInput[] = [];
  let handle: AimockHandle | null = null;
  let response: TransportResponse | undefined;

  try {
    handle = await startAimock({ fixturePath });
    registerFixture(
      handle.aguiMock,
      (requestInput) => {
        if (requestInput.runId !== 'run-text') {
          return false;
        }
        capturedInputs.push(requestInput);
        return true;
      },
      expectedEvents,
    );
    const transport = createHttpTransport({ baseUrl: handle.aguiRunUrl });

    response = await transport.send(createRequest(input, 'request-text'));
    const events = await collectEvents(response.events);

    expect(capturedInputs).toEqual([input]);
    expect(events).toEqual(expectedEvents);
  } finally {
    await response?.dispose?.();
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('fryHashbrown executes and continues an AG-UI tool call over real SSE', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-agui-http-'));
  const fixturePath = createFixtureFile(workDir);
  const toolHandler = jest.fn(async ({ city }: { city: string }) => ({
    city,
    temperatureC: 21,
    condition: 'sunny',
  }));
  const tool: Chat.Tool<
    'getWeather',
    { city: string },
    { city: string; temperatureC: number; condition: string }
  > = {
    name: 'getWeather',
    description: 'Get weather for a city.',
    schema: s.object('weather lookup', {
      city: s.string('city name'),
    }),
    handler: toolHandler,
  };
  const capturedInputs: HashbrownRunInput[] = [];
  let handle: AimockHandle | null = null;
  let teardown: (() => void) | undefined;

  try {
    handle = await startAimock({ fixturePath });
    const fetchImpl: typeof fetch = async (input, init) => {
      if (!handle) {
        throw new Error('Aimock stopped before request');
      }

      const requestInput = parseRequestInput(init?.body);
      capturedInputs.push(requestInput);
      const events: AGUIEvent[] =
        capturedInputs.length === 1
          ? [
              {
                type: EventType.RUN_STARTED,
                threadId: requestInput.threadId,
                runId: requestInput.runId,
                timestamp: 1_700_000_002_000,
              },
              {
                type: EventType.TOOL_CALL_START,
                toolCallId: 'call-weather',
                toolCallName: 'getWeather',
                parentMessageId: `${requestInput.threadId}:message:1`,
                timestamp: 1_700_000_002_001,
              },
              {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: 'call-weather',
                delta: '{"city":"Paris"}',
                timestamp: 1_700_000_002_002,
              },
              {
                type: EventType.TOOL_CALL_END,
                toolCallId: 'call-weather',
                timestamp: 1_700_000_002_003,
              },
              {
                type: EventType.RUN_FINISHED,
                threadId: requestInput.threadId,
                runId: requestInput.runId,
                timestamp: 1_700_000_002_004,
              },
            ]
          : [
              {
                type: EventType.RUN_STARTED,
                threadId: requestInput.threadId,
                runId: requestInput.runId,
                timestamp: 1_700_000_003_000,
              },
              {
                type: EventType.TEXT_MESSAGE_START,
                messageId: 'message-weather-final',
                role: 'assistant',
                timestamp: 1_700_000_003_001,
              },
              {
                type: EventType.TEXT_MESSAGE_CONTENT,
                messageId: 'message-weather-final',
                delta: 'It is 21 C and sunny in Paris.',
                timestamp: 1_700_000_003_002,
              },
              {
                type: EventType.TEXT_MESSAGE_END,
                messageId: 'message-weather-final',
                timestamp: 1_700_000_003_003,
              },
              {
                type: EventType.RUN_FINISHED,
                threadId: requestInput.threadId,
                runId: requestInput.runId,
                timestamp: 1_700_000_003_004,
              },
            ];

      registerFixture(
        handle.aguiMock,
        (candidate) =>
          candidate.threadId === requestInput.threadId &&
          candidate.runId === requestInput.runId,
        events,
      );

      return fetch(input, init);
    };
    const transport = new HttpTransport({
      baseUrl: handle.aguiRunUrl,
      fetchImpl,
    });
    const hashbrown = fryHashbrown({
      model: {
        name: 'aimock-tool-model',
        transport,
        capabilities: { tools: true },
      },
      system: 'Answer weather questions with the available tool.',
      tools: [tool],
      threadId: 'thread-tool',
    });
    teardown = hashbrown.sizzle();
    await Promise.resolve();

    hashbrown.sendMessage({
      role: 'user',
      content: 'What is the weather in Paris?',
    });
    const messages = await waitForSignal(hashbrown.messages, (value) =>
      value.some(
        (message) =>
          message.role === 'assistant' &&
          message.content === 'It is 21 C and sunny in Paris.',
      ),
    );
    await waitForSignal(hashbrown.isGenerating, (value) => !value);

    expect(messages).toEqual([
      { role: 'user', content: 'What is the weather in Paris?' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            role: 'tool',
            status: 'done',
            name: 'getWeather',
            args: { city: 'Paris' },
            result: {
              status: 'fulfilled',
              value: {
                city: 'Paris',
                temperatureC: 21,
                condition: 'sunny',
              },
            },
            toolCallId: 'call-weather',
          },
        ],
      },
      {
        role: 'assistant',
        content: 'It is 21 C and sunny in Paris.',
        toolCalls: [],
      },
    ]);
    expect(hashbrown.error()).toBeUndefined();
    expect(hashbrown.isLoading()).toBe(false);
    expect(hashbrown.isReceiving()).toBe(false);
    expect(hashbrown.isSending()).toBe(false);
    expect(hashbrown.isGenerating()).toBe(false);
    expect(hashbrown.isRunningToolCalls()).toBe(false);
    expect(hashbrown.lastAssistantMessage()).toEqual(messages[2]);
    expect(toolHandler).toHaveBeenCalledTimes(1);
    expect(toolHandler).toHaveBeenCalledWith(
      { city: 'Paris' },
      expect.any(AbortSignal),
    );
    expect(capturedInputs).toHaveLength(2);
    expect(capturedInputs[0]?.threadId).toBe('thread-tool');
    expect(capturedInputs[1]?.threadId).toBe('thread-tool');
    expect(capturedInputs[0]?.runId).not.toBe(capturedInputs[1]?.runId);
    expect(capturedInputs[0]?.messages).toEqual([
      {
        id: 'thread-tool:system',
        role: 'system',
        content: 'Answer weather questions with the available tool.',
      },
      {
        id: 'thread-tool:message:0',
        role: 'user',
        content: 'What is the weather in Paris?',
      },
    ]);
    expect(capturedInputs[1]?.messages).toEqual([
      ...capturedInputs[0]!.messages,
      {
        id: 'thread-tool:message:1',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-weather',
            type: 'function',
            function: {
              name: 'getWeather',
              arguments: '{"city":"Paris"}',
            },
          },
        ],
      },
      {
        id: 'call-weather',
        role: 'tool',
        toolCallId: 'call-weather',
        content: '{"city":"Paris","temperatureC":21,"condition":"sunny"}',
      },
    ]);
  } finally {
    teardown?.();
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }
}, 10_000);
