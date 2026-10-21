import { type AGUIEvent, EventType } from '@ag-ui/core';
import { createChatRuntime } from './chat-runtime';
import {
  bindRuntime,
  type RuntimeGrowthObserver,
} from './growth/runtime-binding';
import { s } from './schema';
import type { Transport, TransportRequest } from './transport';

type Script = (request: TransportRequest) => readonly AGUIEvent[];

function scriptedTransport(scripts: readonly Script[]): Transport {
  let call = 0;
  return {
    name: 'scripted',
    send: async (request) => {
      const script = scripts[Math.min(call, scripts.length - 1)];
      call += 1;
      const events = script(request);
      return {
        events: (async function* () {
          yield* events;
        })(),
      };
    },
  };
}

function identity(request: TransportRequest) {
  return { threadId: request.input.threadId, runId: request.input.runId };
}

const textRun: Script = (request) => [
  { type: EventType.RUN_STARTED, ...identity(request) },
  { type: EventType.TEXT_MESSAGE_START, messageId: 'm', role: 'assistant' },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'Hello' },
  { type: EventType.TEXT_MESSAGE_END, messageId: 'm' },
  {
    type: EventType.RUN_FINISHED,
    ...identity(request),
    outcome: { type: 'success' },
  } as AGUIEvent,
];

const chunkRun: Script = (request) => [
  { type: EventType.RUN_STARTED, ...identity(request) },
  {
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'm',
    role: 'assistant',
    delta: 'Hello',
  },
  {
    type: EventType.RUN_FINISHED,
    ...identity(request),
    outcome: { type: 'success' },
  } as AGUIEvent,
];

const emptyRun: Script = (request) => [
  { type: EventType.RUN_STARTED, ...identity(request) },
  {
    type: EventType.RUN_FINISHED,
    ...identity(request),
    outcome: { type: 'success' },
  } as AGUIEvent,
];

const interruptedTextRun: Script = (request) => [
  { type: EventType.RUN_STARTED, ...identity(request) },
  { type: EventType.TEXT_MESSAGE_START, messageId: 'm', role: 'assistant' },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'Wait' },
  { type: EventType.TEXT_MESSAGE_END, messageId: 'm' },
  {
    type: EventType.RUN_FINISHED,
    ...identity(request),
    outcome: {
      type: 'interrupt',
      interrupts: [{ id: 'approval', reason: 'approval' }],
    },
  } as AGUIEvent,
];

const toolRun: Script = (request) => [
  { type: EventType.RUN_STARTED, ...identity(request) },
  { type: EventType.TEXT_MESSAGE_START, messageId: 'm', role: 'assistant' },
  {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'call-1',
    toolCallName: 'lookup',
    parentMessageId: 'm',
  },
  { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call-1', delta: '{}' },
  { type: EventType.TOOL_CALL_END, toolCallId: 'call-1' },
  { type: EventType.TEXT_MESSAGE_END, messageId: 'm' },
  {
    type: EventType.RUN_FINISHED,
    ...identity(request),
    outcome: { type: 'success' },
  } as AGUIEvent,
];

function createObserver(): RuntimeGrowthObserver & {
  sessionStarted: jest.Mock;
  streamCompleted: jest.Mock;
  toolExecuted: jest.Mock;
} {
  return {
    sessionStarted: jest.fn(),
    streamCompleted: jest.fn(),
    toolExecuted: jest.fn(),
  };
}

function flushTaskBoundary(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForIdle(runtime: {
  readonly isLoading: () => boolean;
}): Promise<void> {
  await flushTaskBoundary();
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (!runtime.isLoading()) return;

    await flushTaskBoundary();
  }

  throw new Error('Timed out waiting for the chat runtime to become idle');
}

function createTextRuntime(scripts: readonly Script[]) {
  return createChatRuntime({
    system: 'test',
    debounce: 0,
    transport: scriptedTransport(scripts),
  });
}

test('binding a runtime reports the session start with its transport', () => {
  const runtime = createTextRuntime([textRun]);
  const observer = createObserver();

  const detach = bindRuntime(runtime.resume, observer);

  expect(detach).toEqual(expect.any(Function));
  expect(observer.sessionStarted).toHaveBeenCalledTimes(1);
  expect(observer.sessionStarted).toHaveBeenCalledWith('custom');
  detach?.();
});

test('binding a runtime without a transport reports an http session', () => {
  const runtime = createChatRuntime({ system: 'test' });
  const observer = createObserver();

  const detach = bindRuntime(runtime.resume, observer);

  expect(observer.sessionStarted).toHaveBeenCalledWith('http');
  detach?.();
});

test('the first run with text content reports a stream completion once', async () => {
  const runtime = createTextRuntime([textRun]);
  const observer = createObserver();
  const detach = bindRuntime(runtime.resume, observer);
  const teardown = runtime.start();

  runtime.sendMessage({ role: 'user', content: 'Hi' });
  await waitForIdle(runtime);
  runtime.sendMessage({ role: 'user', content: 'Again' });
  await waitForIdle(runtime);

  expect(observer.streamCompleted).toHaveBeenCalledTimes(1);
  const [duration] = observer.streamCompleted.mock.calls[0];
  expect(Number.isFinite(duration)).toBe(true);
  expect(duration).toBeGreaterThanOrEqual(0);
  teardown();
  detach?.();
});

test('a run that streams only text chunks reports a stream completion', async () => {
  const runtime = createTextRuntime([chunkRun]);
  const observer = createObserver();
  const detach = bindRuntime(runtime.resume, observer);
  const teardown = runtime.start();

  runtime.sendMessage({ role: 'user', content: 'Hi' });
  await waitForIdle(runtime);

  expect(observer.streamCompleted).toHaveBeenCalledTimes(1);
  teardown();
  detach?.();
});

test('a run without content or with an interrupt outcome reports no stream completion', async () => {
  const empty = createTextRuntime([emptyRun]);
  const interrupted = createTextRuntime([interruptedTextRun]);
  const emptyObserver = createObserver();
  const interruptedObserver = createObserver();
  const detachEmpty = bindRuntime(empty.resume, emptyObserver);
  const detachInterrupted = bindRuntime(
    interrupted.resume,
    interruptedObserver,
  );
  const teardownEmpty = empty.start();
  const teardownInterrupted = interrupted.start();

  empty.sendMessage({ role: 'user', content: 'Hi' });
  interrupted.sendMessage({ role: 'user', content: 'Hi' });
  await waitForIdle(empty);
  await waitForIdle(interrupted);

  expect(interrupted.pendingInterrupts()).toBeDefined();
  expect(emptyObserver.streamCompleted).not.toHaveBeenCalled();
  expect(interruptedObserver.streamCompleted).not.toHaveBeenCalled();
  teardownEmpty();
  teardownInterrupted();
  detachEmpty?.();
  detachInterrupted?.();
});

test('a settled tool turn that started reports one tool execution', async () => {
  const handler = jest.fn(async () => 'found');
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    tools: [
      {
        name: 'lookup',
        description: 'lookup',
        schema: s.object('args', {}),
        handler,
      },
    ],
    transport: scriptedTransport([toolRun, textRun]),
  });
  const observer = createObserver();
  const detach = bindRuntime(runtime.resume, observer);
  const teardown = runtime.start();

  runtime.sendMessage({ role: 'user', content: 'Look it up' });
  await waitForIdle(runtime);

  expect(handler).toHaveBeenCalledTimes(1);
  expect(observer.toolExecuted).toHaveBeenCalledTimes(1);
  teardown();
  detach?.();
});

test('a tool turn settled without starting reports nothing', async () => {
  const handler = jest.fn(async () => 'found');
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    tools: [
      {
        name: 'lookup',
        description: 'lookup',
        schema: s.object('args', {}),
        handler,
      },
    ],
    transport: scriptedTransport([toolRun, textRun]),
  });
  const observer = createObserver();
  const detach = bindRuntime(runtime.resume, observer);
  const teardown = runtime.start();
  let superseded = false;
  let generated = false;
  const supersedeOnToolCall = runtime.isGenerating.subscribe((generating) => {
    if (generating) {
      generated = true;
      return;
    }
    if (!generated || superseded) return;
    superseded = true;
    runtime.setMessages([{ role: 'user', content: 'Start over' }]);
  });

  runtime.sendMessage({ role: 'user', content: 'Look it up' });
  await waitForIdle(runtime);

  expect(handler).not.toHaveBeenCalled();
  expect(observer.toolExecuted).not.toHaveBeenCalled();
  expect(superseded).toBe(true);
  supersedeOnToolCall();
  teardown();
  detach?.();
});

test('detaching stops further reports', async () => {
  const handler = jest.fn(async () => 'found');
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    tools: [
      {
        name: 'lookup',
        description: 'lookup',
        schema: s.object('args', {}),
        handler,
      },
    ],
    transport: scriptedTransport([toolRun, textRun]),
  });
  const observer = createObserver();
  const detach = bindRuntime(runtime.resume, observer);
  const teardown = runtime.start();

  detach?.();
  runtime.sendMessage({ role: 'user', content: 'Look it up' });
  await waitForIdle(runtime);

  expect(handler).toHaveBeenCalledTimes(1);
  expect(observer.sessionStarted).toHaveBeenCalledTimes(1);
  expect(observer.streamCompleted).not.toHaveBeenCalled();
  expect(observer.toolExecuted).not.toHaveBeenCalled();
  teardown();
});
