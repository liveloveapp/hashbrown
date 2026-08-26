import { type AGUIEvent, EventType } from '@ag-ui/core';
import type {
  AGUIMock,
  AGUIRunAgentInput,
  AGUIEvent as AimockAGUIEvent,
} from '@copilotkit/aimock/agui';
import { HttpTransport, type TransportRequest } from '@hashbrownai/core';
import { startAimock } from '@hashbrownai/testing/aimock';
import { join } from 'node:path';
import { runAimockWorker } from './aimock-worker';
import {
  createRunErrorEvents,
  createTextRunEvents,
  type HashbrownRunInput,
  registerRunFixture,
} from './agui';

function createRunInput(
  threadId: string,
  runId: string,
  state: Record<string, unknown> = {},
): HashbrownRunInput {
  return {
    threadId,
    runId,
    messages: [],
    tools: [],
    context: [],
    state,
  };
}

function createTransportRequest(
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

async function collectRemainingEvents(
  iterator: AsyncIterator<AGUIEvent>,
): Promise<AGUIEvent[]> {
  const events: AGUIEvent[] = [];
  let result = await iterator.next();
  while (!result.done) {
    events.push(result.value);
    result = await iterator.next();
  }
  return events;
}

test('creates deterministic text events with request identity and one terminal', () => {
  const input = createRunInput('thread-text', 'run-text');

  const events = createTextRunEvents(input, 'message-text', [
    'Hello',
    ' world',
  ]);

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-text',
      runId: 'run-text',
      timestamp: 1_700_000_000_000,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'message-text',
      role: 'assistant',
      timestamp: 1_700_000_000_001,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-text',
      delta: 'Hello',
      timestamp: 1_700_000_000_002,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-text',
      delta: ' world',
      timestamp: 1_700_000_000_003,
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'message-text',
      timestamp: 1_700_000_000_004,
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-text',
      runId: 'run-text',
      timestamp: 1_700_000_000_005,
    },
  ]);
  expect(
    events.filter(
      (event) =>
        event.type === EventType.RUN_FINISHED ||
        event.type === EventType.RUN_ERROR,
    ),
  ).toHaveLength(1);
});

test('creates deterministic run-error events without a success terminal', () => {
  const input = createRunInput('thread-error', 'run-error');

  const events = createRunErrorEvents(input, 'Deterministic failure');

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-error',
      runId: 'run-error',
      timestamp: 1_700_000_000_000,
    },
    {
      type: EventType.RUN_ERROR,
      message: 'Deterministic failure',
      timestamp: 1_700_000_000_001,
    },
  ]);
  expect(events.some((event) => event.type === EventType.RUN_FINISHED)).toBe(
    false,
  );
});

test('registers request-specific events and captures cloned matching inputs', () => {
  let registeredPredicate: ((input: AGUIRunAgentInput) => boolean) | undefined;
  let sharedEvents: AimockAGUIEvent[] | undefined;
  let registeredDelayMs: number | undefined;
  const aguiMock = {
    onPredicate(
      predicate: (input: AGUIRunAgentInput) => boolean,
      events: AimockAGUIEvent[],
      delayMs?: number,
    ) {
      registeredPredicate = predicate;
      sharedEvents = events;
      registeredDelayMs = delayMs;
      return this;
    },
  } as Pick<AGUIMock, 'onPredicate'>;
  const capturedInputs: HashbrownRunInput[] = [];
  const attemptedInputs: HashbrownRunInput[] = [];
  const predicateCalls: Array<{
    readonly threadId: string;
    readonly requestIndex: number;
  }> = [];
  const createEventsCalls: Array<{
    readonly input: HashbrownRunInput;
    readonly requestIndex: number;
  }> = [];
  const nonMatchingInput = createRunInput('ignore', 'run-ignore');
  const firstInput = createRunInput('match-one', 'run-one', {
    nested: { value: 'original' },
  });
  const secondInput = createRunInput('match-two', 'run-two');

  registerRunFixture(
    aguiMock,
    capturedInputs,
    (input, requestIndex) => {
      predicateCalls.push({ threadId: input.threadId, requestIndex });
      return input.threadId.startsWith('match');
    },
    (input, requestIndex) => {
      createEventsCalls.push({ input, requestIndex });
      return createTextRunEvents(
        input,
        `message-${requestIndex}`,
        [`response-${input.runId}`],
        1_700_000_001_000 + requestIndex * 100,
      );
    },
    25,
    attemptedInputs,
  );
  const predicate = registeredPredicate;
  const events = sharedEvents;
  if (!predicate || !events) {
    throw new Error('Expected one aimock predicate registration');
  }

  const didMatchNonMatchingInput = predicate(
    nonMatchingInput as AGUIRunAgentInput,
  );

  expect(didMatchNonMatchingInput).toBe(false);
  expect(capturedInputs).toEqual([]);
  expect(attemptedInputs).toEqual([nonMatchingInput]);
  expect(events).toEqual([]);

  const didMatchFirstInput = predicate(firstInput as AGUIRunAgentInput);

  expect(didMatchFirstInput).toBe(true);
  expect(events).toEqual(
    createTextRunEvents(
      firstInput,
      'message-0',
      ['response-run-one'],
      1_700_000_001_000,
    ),
  );
  const firstEvents = [...events];

  const didMatchSecondInput = predicate(secondInput as AGUIRunAgentInput);

  expect(didMatchSecondInput).toBe(true);
  expect(events).not.toEqual(firstEvents);
  expect(events).toEqual(
    createTextRunEvents(
      secondInput,
      'message-1',
      ['response-run-two'],
      1_700_000_001_100,
    ),
  );
  expect(predicateCalls).toEqual([
    { threadId: 'ignore', requestIndex: 0 },
    { threadId: 'match-one', requestIndex: 0 },
    { threadId: 'match-two', requestIndex: 1 },
  ]);
  expect(createEventsCalls).toEqual([
    { input: firstInput, requestIndex: 0 },
    { input: secondInput, requestIndex: 1 },
  ]);
  expect(capturedInputs).toHaveLength(2);
  expect(capturedInputs[0]).not.toBe(firstInput);
  expect(attemptedInputs).toEqual([nonMatchingInput, firstInput, secondInput]);
  expect(attemptedInputs[1]).not.toBe(firstInput);
  expect(registeredDelayMs).toBe(25);

  (firstInput.state as { nested: { value: string } }).nested.value = 'mutated';

  expect(capturedInputs[0]?.state).toEqual({
    nested: { value: 'original' },
  });
  expect(attemptedInputs[1]?.state).toEqual({
    nested: { value: 'original' },
  });
});

test('keeps overlapping delayed aimock streams bound to their request identity', async () => {
  await runAimockWorker(
    () =>
      startAimock({
        fixturePath: join(__dirname, '../fixtures/empty.json'),
      }),
    async (handle) => {
      const capturedInputs: HashbrownRunInput[] = [];
      const firstInput = createRunInput('thread-first', 'run-first');
      const secondInput = createRunInput('thread-second', 'run-second');
      const createIdentityEvents = (
        input: HashbrownRunInput,
        requestIndex: number,
      ): AGUIEvent[] => [
        {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
          timestamp: 1_700_000_002_000 + requestIndex * 10,
        },
        {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
          timestamp: 1_700_000_002_001 + requestIndex * 10,
        },
      ];
      registerRunFixture(
        handle.aguiMock,
        capturedInputs,
        () => true,
        createIdentityEvents,
        1_000,
      );
      const transport = new HttpTransport({ baseUrl: handle.aguiRunUrl });
      const firstResponse = await transport.send(
        createTransportRequest(firstInput, 'request-first'),
      );
      const firstIterator = firstResponse.events[Symbol.asyncIterator]();

      const firstStarted = await firstIterator.next();
      if (firstStarted.done) {
        throw new Error('Expected the first stream to start');
      }

      const secondResponse = await transport.send(
        createTransportRequest(secondInput, 'request-second'),
      );
      const secondIterator = secondResponse.events[Symbol.asyncIterator]();
      const secondStarted = await secondIterator.next();
      if (secondStarted.done) {
        throw new Error('Expected the second stream to start');
      }

      const [firstRemaining, secondRemaining] = await Promise.all([
        collectRemainingEvents(firstIterator),
        collectRemainingEvents(secondIterator),
      ]);
      const firstEvents = [firstStarted.value, ...firstRemaining];
      const secondEvents = [secondStarted.value, ...secondRemaining];

      expect(firstEvents).toEqual(createIdentityEvents(firstInput, 0));
      expect(secondEvents).toEqual(createIdentityEvents(secondInput, 1));
      expect(capturedInputs).toEqual([firstInput, secondInput]);
    },
  );
}, 10_000);
