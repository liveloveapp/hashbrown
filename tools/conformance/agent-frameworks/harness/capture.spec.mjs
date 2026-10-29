import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureEvents, semanticProjection } from './capture.mjs';

test('captures immutable delivery-time snapshots and synchronous completion', async () => {
  const event = { type: 'ACTIVITY_SNAPSHOT', content: { count: 1 } };
  let unsubscribed = 0;
  const observable = {
    subscribe(observer) {
      observer.next(event);
      event.content.count = 2;
      observer.next(event);
      observer.complete();
      return {
        unsubscribe() {
          unsubscribed++;
        },
      };
    },
  };

  const events = await captureEvents(observable);

  assert.deepEqual(events, [
    { type: 'ACTIVITY_SNAPSHOT', content: { count: 1 } },
    { type: 'ACTIVITY_SNAPSHOT', content: { count: 2 } },
  ]);
  assert.equal(unsubscribed, 1);
});

test('calls onEvent during delivery without exposing the captured snapshot', async () => {
  const event = { type: 'TOOL_CALL_START', toolCallId: 'call-a' };
  const seen = [];
  const observable = {
    subscribe(observer) {
      observer.next(event);
      assert.equal(seen.length, 1);
      observer.complete();
      return {
        unsubscribe() {
          return undefined;
        },
      };
    },
  };

  const events = await captureEvents(observable, {
    onEvent(value) {
      seen.push(value.type);
      value.type = 'changed';
    },
  });

  assert.deepEqual(events, [event]);
  assert.equal(event.type, 'TOOL_CALL_START');
});

test('rejects stream errors and unsubscribes after synchronous errors', async () => {
  const failure = new Error('producer failed');
  let unsubscribed = 0;
  const observable = {
    subscribe(observer) {
      observer.error(failure);
      return {
        unsubscribe() {
          unsubscribed++;
        },
      };
    },
  };

  const result = captureEvents(observable);

  await assert.rejects(result, (error) => error === failure);
  assert.equal(unsubscribed, 1);
});

test('rejects a stalled stream within a bounded wait and unsubscribes', async () => {
  let unsubscribed = 0;
  const observable = {
    subscribe() {
      return {
        unsubscribe() {
          unsubscribed++;
        },
      };
    },
  };

  const result = captureEvents(observable, { timeoutMs: 5 });

  await assert.rejects(result, /timed out.*5/i);
  assert.equal(unsubscribed, 1);
});

test('unsubscribes after asynchronous completion and ignores post-terminal events', async () => {
  let observer;
  let unsubscribed = 0;
  const observable = {
    subscribe(value) {
      observer = value;
      return {
        unsubscribe() {
          unsubscribed++;
        },
      };
    },
  };

  const result = captureEvents(observable);
  observer.next({ type: 'RUN_FINISHED' });
  observer.complete();
  observer.next({ type: 'late' });

  assert.deepEqual(await result, [{ type: 'RUN_FINISHED' }]);
  assert.equal(unsubscribed, 1);
});

test('rejects callback failures and releases the subscription', async () => {
  const failure = new Error('timing assertion failed');
  let unsubscribed = 0;
  const observable = {
    subscribe(observer) {
      observer.next({ type: 'TOOL_CALL_START' });
      return {
        unsubscribe() {
          unsubscribed++;
        },
      };
    },
  };

  const result = captureEvents(observable, {
    onEvent() {
      throw failure;
    },
  });

  await assert.rejects(result, (error) => error === failure);
  assert.equal(unsubscribed, 1);
});

test('rejects synchronous subscribe failures', async () => {
  const failure = new Error('cannot subscribe');
  const observable = {
    subscribe() {
      throw failure;
    },
  };

  const result = captureEvents(observable);

  await assert.rejects(result, (error) => error === failure);
});

test('preserves producer RUN_ERROR events as evidence', async () => {
  const event = Object.freeze({
    type: 'RUN_ERROR',
    message: 'readable failure',
    code: 'FAILED',
  });
  const observable = {
    subscribe(observer) {
      observer.next(event);
      observer.complete();
      return {
        unsubscribe() {
          return undefined;
        },
      };
    },
  };

  const events = await captureEvents(observable);

  assert.deepEqual(events, [event]);
});

test('normalizes IDs consistently across event types and preserves distinct IDs', () => {
  const events = [
    {
      type: 'RUN_STARTED',
      threadId: 'thread-a',
      runId: 'run-a',
      timestamp: 123,
    },
    {
      type: 'TOOL_CALL_START',
      toolCallId: 'call-a',
      parentMessageId: 'message-a',
    },
    {
      type: 'TOOL_CALL_START',
      toolCallId: 'call-b',
      parentMessageId: 'message-a',
    },
    {
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'call-a',
      messageId: 'message-b',
      content: 'ok',
    },
    {
      type: 'RUN_FINISHED',
      threadId: 'thread-a',
      runId: 'run-a',
      parentRunId: 'run-b',
    },
  ];
  const renamed = events.map((event) =>
    Object.fromEntries(
      Object.entries(event).map(([key, value]) => [
        key,
        key.endsWith('Id') ? `new-${value}` : key === 'timestamp' ? 456 : value,
      ]),
    ),
  );

  const result = semanticProjection(events);

  assert.deepEqual(result, semanticProjection(renamed));
  assert.equal(result[1].toolCallId, result[3].toolCallId);
  assert.equal(result[1].parentMessageId, result[2].parentMessageId);
  assert.notEqual(result[1].toolCallId, result[2].toolCallId);
  assert.notEqual(result[0].runId, result[4].parentRunId);
  assert.equal('timestamp' in result[0], false);
  assert.equal(events[0].timestamp, 123);
});

test('preserves semantic payloads, ordering and absent fields', () => {
  const content = Object.freeze({
    runId: 'user-value',
    timestamp: 10,
    id: 'semantic-id',
  });
  const events = Object.freeze([
    Object.freeze({
      type: 'ACTIVITY_SNAPSHOT',
      messageId: 'activity-a',
      activityType: 'progress',
      content,
    }),
    Object.freeze({ type: 'CUSTOM', name: 'metadata', value: content }),
  ]);

  const result = semanticProjection(events);

  assert.deepEqual(result[0].content, content);
  assert.deepEqual(result[1], events[1]);
  assert.equal('timestamp' in result[0], false);
  assert.equal(result[0].activityType, 'progress');
});

test('normalizes message snapshot identities and tool references', () => {
  const events = [
    {
      type: 'TOOL_CALL_START',
      toolCallId: 'call-a',
      parentMessageId: 'message-a',
    },
    {
      type: 'MESSAGES_SNAPSHOT',
      messages: [
        {
          id: 'message-a',
          role: 'assistant',
          toolCalls: [
            {
              id: 'call-a',
              type: 'function',
              function: { name: 'lookup', arguments: '{}' },
            },
          ],
        },
        {
          id: 'message-b',
          role: 'tool',
          toolCallId: 'call-a',
          content: 'result',
        },
      ],
    },
  ];

  const result = semanticProjection(events);

  assert.equal(result[1].messages[0].id, result[0].parentMessageId);
  assert.equal(result[1].messages[0].toolCalls[0].id, result[0].toolCallId);
  assert.equal(result[1].messages[1].toolCallId, result[0].toolCallId);
  assert.deepEqual(
    result[1].messages[0].toolCalls[0].function,
    events[1].messages[0].toolCalls[0].function,
  );
});

test('rejects even when a producer supplies an undefined stream error', async () => {
  const observable = {
    subscribe(observer) {
      observer.error(undefined);
      return {
        unsubscribe() {
          return undefined;
        },
      };
    },
  };

  const result = await captureEvents(observable).then(
    () => ({ resolved: true }),
    (error) => ({ resolved: false, error }),
  );

  assert.deepEqual(result, { resolved: false, error: undefined });
});

test('rejects an asynchronous completion teardown failure without throwing from delivery', async () => {
  const failure = new Error('teardown failed');
  let observer;
  const observable = {
    subscribe(value) {
      observer = value;
      return {
        unsubscribe() {
          throw failure;
        },
      };
    },
  };
  const result = captureEvents(observable);

  assert.doesNotThrow(() => observer.complete());

  await assert.rejects(result, (error) => error === failure);
});

test('retains the timeout error when teardown also throws', async () => {
  const observable = {
    subscribe() {
      return {
        unsubscribe() {
          throw new Error('teardown failed');
        },
      };
    },
  };

  const result = captureEvents(observable, { timeoutMs: 5 });

  await assert.rejects(result, /timed out.*5/i);
});

test('retains the stream failure when teardown also throws', async () => {
  const failure = new Error('producer failed');
  let observer;
  const observable = {
    subscribe(value) {
      observer = value;
      return {
        unsubscribe() {
          throw new Error('teardown failed');
        },
      };
    },
  };
  const result = captureEvents(observable);

  assert.doesNotThrow(() => observer.error(failure));

  await assert.rejects(result, (error) => error === failure);
});

test('rejects a synchronous completion teardown failure', async () => {
  const failure = new Error('teardown failed');
  const observable = {
    subscribe(observer) {
      observer.complete();
      return {
        unsubscribe() {
          throw failure;
        },
      };
    },
  };

  const result = captureEvents(observable);

  await assert.rejects(result, (error) => error === failure);
});

test('captures the actual JSON wire representation of class-backed producer payloads', async () => {
  class WireMessage {
    privateField = 'internal';
    toJSON() {
      return { role: 'tool', content: 'wire result' };
    }
  }
  const message = new WireMessage();
  const event = { type: 'STATE_SNAPSHOT', snapshot: { message } };
  const observable = {
    subscribe(observer) {
      observer.next(event);
      observer.complete();
      return {
        unsubscribe() {
          return undefined;
        },
      };
    },
  };

  const events = await captureEvents(observable);

  assert.deepEqual(events, [JSON.parse(JSON.stringify(event))]);
});
