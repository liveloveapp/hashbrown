import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
import * as aimockRunner from './aimock-runner';
import type { AimockHandle } from './aimock-runner';
import * as providerE2E from './provider-e2e';
import { runProviderAGUIWithAimock } from './provider-e2e';

test('provider e2e helpers expose only the AG-UI stream runner', () => {
  expect(providerE2E).not.toHaveProperty('runProviderTextWithAimock');
  expect(providerE2E).toHaveProperty('runProviderAGUIWithAimock');
});

test('runProviderAGUIWithAimock parses and collects canonical events with an owned signal', async () => {
  const calls: string[] = [];
  const events = [
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-provider',
      runId: 'run-provider',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-provider',
      runId: 'run-provider',
    },
  ] satisfies AGUIEvent[];
  const aimock = {
    stop: jest.fn(async () => {
      calls.push('stop');
    }),
  } as unknown as AimockHandle;
  const startAimock = jest
    .spyOn(aimockRunner, 'startAimock')
    .mockImplementation(async () => {
      calls.push('start');
      return aimock;
    });
  const parseEvent = jest.spyOn(EventSchemas, 'parse');
  let receivedAimock: AimockHandle | undefined;
  let receivedSignal: AbortSignal | undefined;
  let signalInitiallyAborted: boolean | undefined;

  try {
    const result = await runProviderAGUIWithAimock({
      fixturePath: '/fixtures/provider.json',
      chunkSize: 17,
      createStream: (_aimock: AimockHandle, signal: AbortSignal) => {
        calls.push('createStream');
        receivedAimock = _aimock;
        receivedSignal = signal;
        signalInitiallyAborted = signal.aborted;
        return (async function* () {
          yield* events;
        })();
      },
    });

    expect(result).toEqual(events);
    expect(startAimock).toHaveBeenCalledWith({
      fixturePath: '/fixtures/provider.json',
      chunkSize: 17,
    });
    expect(calls).toEqual(['start', 'createStream', 'stop']);
    expect(parseEvent.mock.calls.map(([event]) => event)).toEqual(events);
    expect(receivedAimock).toBe(aimock);
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(signalInitiallyAborted).toBe(false);
    expect(receivedSignal?.aborted).toBe(true);
  } finally {
    parseEvent.mockRestore();
    startAimock.mockRestore();
  }
});

test('runProviderAGUIWithAimock rejects malformed events and performs ordered cleanup', async () => {
  const cleanup: string[] = [];
  const malformedEvent = {
    type: EventType.RUN_STARTED,
  } as unknown as AGUIEvent;
  let receivedSignal: AbortSignal | undefined;
  const iterator: AsyncIterator<AGUIEvent> = {
    next: jest.fn(async () => ({ done: false, value: malformedEvent })),
    return: jest.fn(async () => {
      cleanup.push(receivedSignal?.aborted ? 'return' : 'return-before-abort');
      return { done: true as const, value: undefined };
    }),
  };
  const aimock = {
    stop: jest.fn(async () => {
      cleanup.push('stop');
    }),
  } as unknown as AimockHandle;
  const startAimock = jest
    .spyOn(aimockRunner, 'startAimock')
    .mockResolvedValue(aimock);

  try {
    const result = runProviderAGUIWithAimock({
      fixturePath: '/fixtures/provider.json',
      createStream: (_aimock: AimockHandle, signal: AbortSignal) => {
        receivedSignal = signal;
        return {
          [Symbol.asyncIterator]: () => iterator,
        };
      },
    });

    await expect(result).rejects.toThrow();
    expect(iterator.return).toHaveBeenCalledTimes(1);
    expect(cleanup).toEqual(['return', 'stop']);
    expect(receivedSignal?.aborted).toBe(true);
  } finally {
    startAimock.mockRestore();
  }
});

test('runProviderAGUIWithAimock lets an event hook abort after a parsed event', async () => {
  const textMessageStart = {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'message-provider',
  } as unknown as AGUIEvent;
  const runFinished = {
    type: EventType.RUN_FINISHED,
    threadId: 'thread-provider',
    runId: 'run-provider',
  } satisfies AGUIEvent;
  const aimock = {
    stop: jest.fn(async () => undefined),
  } as unknown as AimockHandle;
  const startAimock = jest
    .spyOn(aimockRunner, 'startAimock')
    .mockResolvedValue(aimock);
  let receivedSignal: AbortSignal | undefined;
  let abortEventCount = 0;

  try {
    const result = await runProviderAGUIWithAimock({
      fixturePath: '/fixtures/provider.json',
      createStream: (_aimock: AimockHandle, signal: AbortSignal) => {
        receivedSignal = signal;
        signal.addEventListener('abort', () => {
          abortEventCount += 1;
        });
        return (async function* () {
          yield textMessageStart;
          if (signal.aborted) {
            return;
          }
          yield runFinished;
        })();
      },
      onEvent: async (
        event: AGUIEvent,
        controls: { readonly abort: () => void },
      ) => {
        await Promise.resolve();
        if (
          event.type === EventType.TEXT_MESSAGE_START &&
          event.role === 'assistant'
        ) {
          controls.abort();
          controls.abort();
        }
      },
    });

    expect(result).toEqual([{ ...textMessageStart, role: 'assistant' }]);
    expect(receivedSignal?.aborted).toBe(true);
    expect(abortEventCount).toBe(1);
  } finally {
    startAimock.mockRestore();
  }
});

test('runProviderAGUIWithAimock stops reading when an event hook aborts', async () => {
  const events = [
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-provider',
      runId: 'run-provider',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-provider',
      runId: 'run-provider',
    },
  ] satisfies AGUIEvent[];
  let eventIndex = 0;
  const iterator: AsyncIterator<AGUIEvent> = {
    next: jest.fn(async (): Promise<IteratorResult<AGUIEvent>> => {
      const event = events[eventIndex];
      eventIndex += 1;
      return event
        ? { done: false, value: event }
        : { done: true, value: undefined };
    }),
    return: jest.fn(async () => ({ done: true as const, value: undefined })),
  };
  const aimock = {
    stop: jest.fn(async () => undefined),
  } as unknown as AimockHandle;
  const startAimock = jest
    .spyOn(aimockRunner, 'startAimock')
    .mockResolvedValue(aimock);

  try {
    const result = await runProviderAGUIWithAimock({
      fixturePath: '/fixtures/provider.json',
      createStream: () => ({
        [Symbol.asyncIterator]: () => iterator,
      }),
      onEvent: (event, controls) => {
        if (event.type === EventType.RUN_STARTED) {
          controls.abort();
        }
      },
    });

    expect(result).toEqual([events[0]]);
    expect(iterator.next).toHaveBeenCalledTimes(1);
    expect(iterator.return).toHaveBeenCalledTimes(1);
    expect(aimock.stop).toHaveBeenCalledTimes(1);
  } finally {
    startAimock.mockRestore();
  }
});

test('runProviderAGUIWithAimock stops aimock when createStream throws', async () => {
  const createStreamError = new Error('create stream failed');
  const aimock = {
    stop: jest.fn(async () => undefined),
  } as unknown as AimockHandle;
  const startAimock = jest
    .spyOn(aimockRunner, 'startAimock')
    .mockResolvedValue(aimock);

  try {
    const result = runProviderAGUIWithAimock({
      fixturePath: '/fixtures/provider.json',
      createStream: () => {
        throw createStreamError;
      },
    });

    await expect(result).rejects.toBe(createStreamError);
    expect(aimock.stop).toHaveBeenCalledTimes(1);
  } finally {
    startAimock.mockRestore();
  }
});

test('runProviderAGUIWithAimock stops aimock when iterator cleanup rejects', async () => {
  const cleanupCalls: string[] = [];
  const iteratorReturnError = new Error('iterator return failed');
  const iterator: AsyncIterator<AGUIEvent> = {
    next: jest.fn(async () => ({ done: true as const, value: undefined })),
    return: jest.fn(async () => {
      cleanupCalls.push('return');
      throw iteratorReturnError;
    }),
  };
  const aimock = {
    stop: jest.fn(async () => {
      cleanupCalls.push('stop');
    }),
  } as unknown as AimockHandle;
  const startAimock = jest
    .spyOn(aimockRunner, 'startAimock')
    .mockResolvedValue(aimock);

  try {
    const result = runProviderAGUIWithAimock({
      fixturePath: '/fixtures/provider.json',
      createStream: () => ({
        [Symbol.asyncIterator]: () => iterator,
      }),
    });

    await expect(result).rejects.toBe(iteratorReturnError);
    expect(cleanupCalls).toEqual(['return', 'stop']);
    expect(aimock.stop).toHaveBeenCalledTimes(1);
  } finally {
    startAimock.mockRestore();
  }
});
