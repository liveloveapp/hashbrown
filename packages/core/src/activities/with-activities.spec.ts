import { type AGUIEvent, EventType } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import { verifyEvents } from '@ag-ui/client';
import { from } from 'rxjs';
import { type ActivityContext, ɵwithActivities } from './with-activities';

const threadId = 'thread-1';
const runId = 'run-1';
const messageId = 'run-1:assistant';

const runStarted: AGUIEvent = { type: EventType.RUN_STARTED, threadId, runId };
const runFinished: AGUIEvent = {
  type: EventType.RUN_FINISHED,
  threadId,
  runId,
};
const textStart: AGUIEvent = {
  type: EventType.TEXT_MESSAGE_START,
  messageId,
  role: 'assistant',
};
const textContent = (delta: string): AGUIEvent => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId,
  delta,
});
const textEnd: AGUIEvent = { type: EventType.TEXT_MESSAGE_END, messageId };

function createDeferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * A fake provider that mirrors the real providers: RUN_STARTED first, then
 * the given events (awaiting any gate promises), then RUN_FINISHED, or
 * RUN_ERROR when a step throws, and nothing terminal when aborted.
 */
function fakeProvider(
  steps: ReadonlyArray<AGUIEvent | (() => Promise<void>)>,
  seen: { signal?: AbortSignal; closed?: boolean } = {},
) {
  return async function* (
    signal: AbortSignal | undefined,
  ): AsyncIterable<AGUIEvent> {
    seen.signal = signal;
    yield runStarted;
    try {
      for (const step of steps) {
        if (signal?.aborted) {
          return;
        }
        if (typeof step === 'function') {
          await waitOrAbort(step(), signal);
          if (signal?.aborted) {
            return;
          }
          continue;
        }
        yield step;
      }
      if (signal?.aborted) {
        return;
      }
      yield runFinished;
    } catch (error) {
      if (!signal?.aborted) {
        yield {
          type: EventType.RUN_ERROR,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    } finally {
      seen.closed = true;
    }
  };
}

function waitOrAbort(
  promise: Promise<void>,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.addEventListener('abort', () => resolve(), { once: true });
    promise.then(resolve, reject);
  });
}

async function collect(stream: AsyncIterable<AGUIEvent>) {
  const events: AGUIEvent[] = [];
  for await (const event of stream) {
    events.push(EventSchemas.parse(event) as AGUIEvent);
  }
  return events;
}

/**
 * Runs a finished sequence through `@ag-ui/client`'s verifier. The client
 * bundles its own rxjs, so the operator is applied directly rather than piped.
 */
function verify(events: readonly AGUIEvent[]) {
  return new Promise<void>((resolve, reject) => {
    verifyEvents()(from(events) as never).subscribe({
      error: reject,
      complete: resolve,
    });
  });
}

function types(events: readonly AGUIEvent[]) {
  return events.map((event) => event.type);
}

test('without a callback the provider events pass through unchanged', async () => {
  const provider = fakeProvider([textStart, textContent('hi'), textEnd]);
  const signal = new AbortController().signal;
  const createEvents = jest.fn(provider);

  const stream = ɵwithActivities(createEvents, undefined, signal);
  const events = await collect(stream);

  expect(createEvents).toHaveBeenCalledWith(signal);
  expect(events).toEqual([
    runStarted,
    textStart,
    textContent('hi'),
    textEnd,
    runFinished,
  ]);
  await verify(events);
});

test('activities sent before, during and after the model arrive in order inside the run', async () => {
  const midway = createDeferred();
  const provider = fakeProvider([
    textStart,
    textContent('a'),
    () => midway.promise,
    textContent('b'),
    textEnd,
  ]);

  const stream = ɵwithActivities(
    provider,
    async ({ activity, model }) => {
      const plan = activity.snapshot('plan-1', 'PLAN', { step: 'before' });
      await Promise.resolve();
      plan.replace({ step: 'during' });
      midway.resolve();
      await model;
      plan.patch([{ op: 'replace', path: '/step', value: 'after' }]);
    },
    undefined,
  );
  const events = await collect(stream);

  expect(types(events)[0]).toBe(EventType.RUN_STARTED);
  expect(types(events)[1]).toBe(EventType.ACTIVITY_SNAPSHOT);
  expect(events.at(-1)).toEqual(runFinished);
  expect(events.at(-2)).toEqual({
    type: EventType.ACTIVITY_DELTA,
    messageId: 'plan-1',
    activityType: 'PLAN',
    patch: [{ op: 'replace', path: '/step', value: 'after' }],
  });
  expect(events.at(-3)).toEqual(textEnd);
  expect(
    events.filter((event) => event.type === EventType.ACTIVITY_SNAPSHOT),
  ).toEqual([
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'plan-1',
      activityType: 'PLAN',
      content: { step: 'before' },
      replace: true,
    },
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'plan-1',
      activityType: 'PLAN',
      content: { step: 'during' },
      replace: true,
    },
  ]);
  const duringIndex = events.findIndex(
    (event) =>
      event.type === EventType.ACTIVITY_SNAPSHOT &&
      event.content['step'] === 'during',
  );
  const secondDeltaIndex = events.findIndex(
    (event) =>
      event.type === EventType.TEXT_MESSAGE_CONTENT && event.delta === 'b',
  );
  expect(duringIndex).toBeLessThan(secondDeltaIndex);
  await verify(events);
});

test('provider text events are not delayed by a pending callback', async () => {
  const callbackGate = createDeferred();
  const provider = fakeProvider([textStart, textContent('hi'), textEnd]);
  const stream = ɵwithActivities(
    provider,
    () => callbackGate.promise,
    undefined,
  );
  const iterator = stream[Symbol.asyncIterator]();

  const received: AGUIEvent[] = [];
  for (let index = 0; index < 4; index++) {
    const result = await iterator.next();
    received.push(EventSchemas.parse(result.value) as AGUIEvent);
  }
  callbackGate.resolve();
  const rest = await iterator.next();
  const end = await iterator.next();

  expect(received).toEqual([runStarted, textStart, textContent('hi'), textEnd]);
  expect(rest.value).toEqual(runFinished);
  expect(end.done).toBe(true);
  await verify([...received, rest.value]);
});

test('RUN_FINISHED is held until the callback settles', async () => {
  const callbackGate = createDeferred();
  const modelEnded = createDeferred();
  const provider = fakeProvider([textStart, textEnd]);
  const stream = ɵwithActivities(
    provider,
    async ({ activity, model }) => {
      await model;
      modelEnded.resolve();
      await callbackGate.promise;
      activity.snapshot('status', 'STATUS', { done: true });
    },
    undefined,
  );
  const iterator = stream[Symbol.asyncIterator]();
  const received: AGUIEvent[] = [];
  for (let index = 0; index < 3; index++) {
    received.push((await iterator.next()).value);
  }
  const pending = iterator.next();
  await modelEnded.promise;
  let settled = false;
  void pending.then(() => (settled = true));
  await new Promise((resolve) => setTimeout(resolve, 10));

  const settledBeforeCallback = settled;
  callbackGate.resolve();
  const snapshot = await pending;
  const finished = await iterator.next();
  const end = await iterator.next();

  expect(settledBeforeCallback).toBe(false);
  expect(snapshot.value.type).toBe(EventType.ACTIVITY_SNAPSHOT);
  expect(finished.value).toEqual(runFinished);
  expect(end.done).toBe(true);
  const events = [...received, snapshot.value, finished.value].map(
    (event) => EventSchemas.parse(event) as AGUIEvent,
  );
  await verify(events);
});

test('a callback error while streaming aborts the model and emits one RUN_ERROR', async () => {
  const neverEnds = createDeferred();
  const seen: { signal?: AbortSignal; closed?: boolean } = {};
  const provider = fakeProvider([textStart, () => neverEnds.promise], seen);
  let modelOutcome: unknown;

  const stream = ɵwithActivities(
    provider,
    async ({ activity, model }) => {
      model.catch((error) => (modelOutcome = error));
      activity.snapshot('plan-1', 'PLAN', { step: 1 });
      await Promise.resolve();
      throw new Error('callback broke');
    },
    undefined,
  );
  const events = await collect(stream);

  expect(seen.signal?.aborted).toBe(true);
  expect(
    events.filter(
      (event) =>
        event.type === EventType.RUN_ERROR ||
        event.type === EventType.RUN_FINISHED,
    ),
  ).toEqual([{ type: EventType.RUN_ERROR, message: 'callback broke' }]);
  expect(events.at(-1)).toEqual({
    type: EventType.RUN_ERROR,
    message: 'callback broke',
  });
  expect((modelOutcome as Error).name).toBe('AbortError');
  await verify(events);
});

test('a callback error after the model ends replaces RUN_FINISHED with RUN_ERROR', async () => {
  const provider = fakeProvider([textStart, textContent('hi'), textEnd]);

  const stream = ɵwithActivities(
    provider,
    async ({ model }) => {
      await model;
      throw new Error('late failure');
    },
    undefined,
  );
  const events = await collect(stream);

  expect(events).toEqual([
    runStarted,
    textStart,
    textContent('hi'),
    textEnd,
    { type: EventType.RUN_ERROR, message: 'late failure' },
  ]);
  await verify(events);
});

test('a model failure waits for the callback, then emits RUN_ERROR', async () => {
  const provider = fakeProvider([
    textStart,
    () => Promise.reject(new Error('model failed')),
  ]);
  let modelError: unknown;

  const stream = ɵwithActivities(
    provider,
    async ({ activity, model }) => {
      const plan = activity.snapshot('plan-1', 'PLAN', { state: 'running' });
      try {
        await model;
      } catch (error) {
        modelError = error;
        await new Promise((resolve) => setTimeout(resolve, 5));
        plan.replace({ state: 'failed' });
      }
    },
    undefined,
  );
  const events = await collect(stream);

  expect(modelError).toEqual(new Error('model failed'));
  expect(events.slice(-2)).toEqual([
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'plan-1',
      activityType: 'PLAN',
      content: { state: 'failed' },
      replace: true,
    },
    { type: EventType.RUN_ERROR, message: 'model failed' },
  ]);
  await verify(events);
});

test('abort ends without a terminal event, makes writes no-ops and rejects model', async () => {
  const controller = new AbortController();
  const neverEnds = createDeferred();
  const afterAbort = createDeferred();
  const provider = fakeProvider([textStart, () => neverEnds.promise]);
  let modelError: unknown;
  let writeError: unknown;

  const stream = ɵwithActivities(
    provider,
    async ({ activity, model, signal }) => {
      const plan = activity.snapshot('plan-1', 'PLAN', { step: 1 });
      try {
        await model;
      } catch (error) {
        modelError = error;
      }
      try {
        expect(signal.aborted).toBe(true);
        plan.patch([{ op: 'replace', path: '/step', value: 2 }]);
        plan.replace({ step: 3 });
        activity.snapshot('plan-2', 'PLAN', { step: 1 });
      } catch (error) {
        writeError = error;
      }
      afterAbort.resolve();
    },
    controller.signal,
  );
  const iterator = stream[Symbol.asyncIterator]();
  const events: AGUIEvent[] = [];
  for (let index = 0; index < 3; index++) {
    events.push(EventSchemas.parse((await iterator.next()).value) as AGUIEvent);
  }

  controller.abort();
  await afterAbort.promise;
  const end = await iterator.next();

  expect(end.done).toBe(true);
  expect(types(events)).toEqual([
    EventType.RUN_STARTED,
    EventType.ACTIVITY_SNAPSHOT,
    EventType.TEXT_MESSAGE_START,
  ]);
  expect((modelError as Error).name).toBe('AbortError');
  expect(writeError).toBeUndefined();
  await verify(events);
});

test('a write after the run closes throws', async () => {
  const provider = fakeProvider([textStart, textEnd]);
  let context: ActivityContext | undefined;
  const stream = ɵwithActivities(
    provider,
    (ctx) => {
      context = ctx;
    },
    undefined,
  );
  const events = await collect(stream);

  const write = () => context?.activity.snapshot('late', 'PLAN', {});

  expect(write).toThrow(/closed/);
  expect(events.at(-1)).toEqual(runFinished);
  await verify(events);
});

test('a duplicate snapshot with a different activityType throws', async () => {
  const provider = fakeProvider([textStart, textEnd]);
  let thrown: unknown;

  const stream = ɵwithActivities(
    provider,
    ({ activity }) => {
      activity.snapshot('item-1', 'PLAN', {});
      activity.snapshot('item-1', 'PLAN', { again: true });
      try {
        activity.snapshot('item-1', 'SEARCH', {});
      } catch (error) {
        thrown = error;
        throw error;
      }
    },
    undefined,
  );
  const events = await collect(stream);

  expect((thrown as Error).message).toMatch(/item-1/);
  expect(
    events.filter((event) => event.type === EventType.ACTIVITY_SNAPSHOT),
  ).toHaveLength(2);
  expect(events.at(-1)).toEqual({
    type: EventType.RUN_ERROR,
    message: (thrown as Error).message,
  });
  await verify(events);
});

test('patch emits ACTIVITY_DELTA with activityType', async () => {
  const provider = fakeProvider([textStart, textEnd]);

  const stream = ɵwithActivities(
    provider,
    ({ activity }) => {
      activity
        .snapshot('search-1', 'SEARCH', { results: [] as string[] })
        .patch([{ op: 'add', path: '/results/-', value: 'a' }]);
    },
    undefined,
  );
  const events = await collect(stream);

  expect(events).toEqual([
    runStarted,
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'search-1',
      activityType: 'SEARCH',
      content: { results: [] },
      replace: true,
    },
    {
      type: EventType.ACTIVITY_DELTA,
      messageId: 'search-1',
      activityType: 'SEARCH',
      patch: [{ op: 'add', path: '/results/-', value: 'a' }],
    },
    textStart,
    textEnd,
    runFinished,
  ]);
  await verify(events);
});
