import { s } from '../schema';
import { TransportError } from '../transport/transport-error';
import type { Decision } from './index';
import type * as D from './decision.types';
import { createDecisionRuntime } from './decision-runtime';
import { DecisionSchemaError } from './errors';

const schema = s.object('Decision', {
  intent: s.enumeration('Intent', ['filter', 'chat']),
});

const choice = { confidence: 0.9, probabilities: { filter: 0.9, chat: 0.1 } };

function responseFor(intent: string): D.Response {
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: { intent },
    meta: { intent: choice },
  };
}

type Call = {
  request: D.Request;
  signal: AbortSignal;
  resolve: (response: D.Response) => void;
  reject: (error: unknown) => void;
};

function createFakeTransport() {
  const calls: Call[] = [];
  const transport: Decision.Transport = (request, signal) =>
    new Promise<D.Response>((resolve, reject) => {
      calls.push({ request, signal, resolve, reject });
      signal.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
    });
  return { calls, transport };
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

test('throws a DecisionSchemaError at creation for an invalid schema', () => {
  const { transport } = createFakeTransport();

  const create = () =>
    createDecisionRuntime({ schema: s.string('Nope') as never, transport });

  expect(create).toThrow(DecisionSchemaError);
});

test('debounces input changes and sends one request', async () => {
  jest.useFakeTimers();
  try {
    const { calls, transport } = createFakeTransport();
    const runtime = createDecisionRuntime({
      schema,
      transport,
      debounceTime: 100,
    });

    runtime.setInput('a');
    jest.advanceTimersByTime(50);
    runtime.setInput('ab');
    jest.advanceTimersByTime(99);
    await flush();
    const callsBeforeDebounce = calls.length;
    jest.advanceTimersByTime(1);
    await flush();
    calls[0].resolve(responseFor('chat'));
    await flush();

    expect(callsBeforeDebounce).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].request.state).toBe('ab');
    expect(runtime.getState().status).toBe('success');
    expect(runtime.getState().value).toEqual({ intent: 'chat' });
  } finally {
    jest.useRealTimers();
  }
});

test('wraps state with system when system is set', async () => {
  const { calls, transport } = createFakeTransport();
  const runtime = createDecisionRuntime({ schema, transport, system: 'sys' });

  runtime.setInput({ a: 1 });
  await flush();

  expect(calls[0].request.state).toEqual({ system: 'sys', input: { a: 1 } });
  expect(Object.keys(calls[0].request.questions)).toEqual(['intent']);
});

test('a new input aborts the in-flight request', async () => {
  const { calls, transport } = createFakeTransport();
  const runtime = createDecisionRuntime({ schema, transport });

  runtime.setInput('a');
  await flush();
  runtime.setInput('b');
  await flush();

  expect(calls[0].signal.aborted).toBe(true);
  expect(calls).toHaveLength(2);
  expect(runtime.getState().error).toBeUndefined();
  expect(runtime.getState().status).toBe('loading');
});

test('a late response from an older input never overwrites the newer value', async () => {
  const { calls, transport } = createFakeTransport();
  const runtime = createDecisionRuntime({ schema, transport });
  runtime.setInput('a');
  await flush();
  runtime.setInput('b');
  await flush();

  calls[1].resolve(responseFor('chat'));
  await flush();
  calls[0].resolve(responseFor('filter'));
  await flush();

  expect(runtime.getState().value).toEqual({ intent: 'chat' });
});

test('setInput(null) aborts and returns to idle with a null value', async () => {
  const { calls, transport } = createFakeTransport();
  const runtime = createDecisionRuntime({ schema, transport });
  runtime.setInput('a');
  await flush();
  calls[0].resolve(responseFor('chat'));
  await flush();
  runtime.setInput('b');
  await flush();

  runtime.setInput(null);
  await flush();

  expect(calls[1].signal.aborted).toBe(true);
  expect(runtime.getState()).toEqual({
    status: 'idle',
    value: null,
    meta: null,
    error: undefined,
  });
  expect(runtime.reload()).toBe(false);
});

test('retries retryable transport errors up to retries, then errors', async () => {
  jest.useFakeTimers();
  try {
    const { calls, transport } = createFakeTransport();
    const runtime = createDecisionRuntime({ schema, transport, retries: 2 });
    runtime.setInput('a');
    await flush();

    calls[0].reject(new TransportError('boom'));
    await flush();
    jest.advanceTimersByTime(250);
    await flush();
    calls[1].reject(new TransportError('boom'));
    await flush();
    jest.advanceTimersByTime(250);
    await flush();
    calls[2].reject(new TransportError('boom'));
    await flush();

    expect(calls).toHaveLength(3);
    expect(runtime.getState().status).toBe('error');
    expect(runtime.getState().error?.message).toBe('boom');
  } finally {
    jest.useRealTimers();
  }
});

test('non-retryable errors fail immediately', async () => {
  const { calls, transport } = createFakeTransport();
  const runtime = createDecisionRuntime({ schema, transport, retries: 3 });
  runtime.setInput('a');
  await flush();

  calls[0].reject(new TransportError('nope', { retryable: false }));
  await flush();

  expect(calls).toHaveLength(1);
  expect(runtime.getState().status).toBe('error');
});

test('decode errors set status error and keep value null', async () => {
  const { calls, transport } = createFakeTransport();
  const runtime = createDecisionRuntime({ schema, transport, retries: 2 });
  runtime.setInput('a');
  await flush();

  calls[0].resolve({ ...responseFor('chat'), version: 2 } as never);
  await flush();

  expect(calls).toHaveLength(1);
  expect(runtime.getState().status).toBe('error');
  expect(runtime.getState().value).toBeNull();
});

test('stop keeps the last value; reload resends the last input', async () => {
  const { calls, transport } = createFakeTransport();
  const runtime = createDecisionRuntime({ schema, transport });
  runtime.setInput('a');
  await flush();
  calls[0].resolve(responseFor('chat'));
  await flush();
  runtime.setInput('b');
  await flush();

  runtime.stop();
  await flush();
  const stopped = runtime.getState();
  const reloaded = runtime.reload();
  await flush();

  expect(calls[1].signal.aborted).toBe(true);
  expect(stopped.status).toBe('success');
  expect(stopped.value).toEqual({ intent: 'chat' });
  expect(stopped.error).toBeUndefined();
  expect(reloaded).toBe(true);
  expect(calls[2].request.state).toBe('b');
});

test('getState is referentially stable until state changes and subscribers are notified', async () => {
  const { calls, transport } = createFakeTransport();
  const runtime = createDecisionRuntime({ schema, transport });
  const listener = jest.fn();
  const unsubscribe = runtime.subscribe(listener);
  const before = runtime.getState();

  runtime.setInput(null);
  const same = runtime.getState();
  runtime.setInput('a');
  await flush();
  calls[0].resolve(responseFor('chat'));
  await flush();
  unsubscribe();
  runtime.setInput('b');

  expect(same).toBe(before);
  expect(listener).toHaveBeenCalledTimes(2);
});

test('destroy aborts and stops notifying', async () => {
  const { calls, transport } = createFakeTransport();
  const runtime = createDecisionRuntime({ schema, transport });
  const listener = jest.fn();
  runtime.setInput('a');
  await flush();
  runtime.subscribe(listener);

  runtime.destroy();
  runtime.setInput('b');
  const reloaded = runtime.reload();
  await flush();

  expect(calls[0].signal.aborted).toBe(true);
  expect(calls).toHaveLength(1);
  expect(reloaded).toBe(false);
  expect(listener).not.toHaveBeenCalled();
});

test('an older response is ignored even when the transport ignores the signal', async () => {
  const resolvers: Array<(response: D.Response) => void> = [];
  const transport: Decision.Transport = () =>
    new Promise<D.Response>((resolve) => resolvers.push(resolve));
  const runtime = createDecisionRuntime({ schema, transport });
  runtime.setInput('a');
  await flush();
  runtime.setInput('b');
  await flush();

  resolvers[1](responseFor('chat'));
  await flush();
  resolvers[0](responseFor('filter'));
  await flush();

  expect(runtime.getState().value).toEqual({ intent: 'chat' });
  expect(runtime.getState().status).toBe('success');
});

test('a throwing listener does not corrupt state or silence other listeners', async () => {
  const rethrown: unknown[] = [];
  const spy = jest
    .spyOn(globalThis, 'queueMicrotask')
    .mockImplementation((callback) => {
      try {
        callback();
      } catch (error) {
        rethrown.push(error);
      }
    });
  try {
    const { calls, transport } = createFakeTransport();
    const runtime = createDecisionRuntime({ schema, transport });
    const boom = new Error('listener failed');
    const second = jest.fn();
    runtime.subscribe(() => {
      if (runtime.getState().status === 'success') throw boom;
    });
    runtime.subscribe(second);
    runtime.setInput('a');
    await flush();

    calls[0].resolve(responseFor('chat'));
    await flush();

    expect(runtime.getState().status).toBe('success');
    expect(runtime.getState().value).toEqual({ intent: 'chat' });
    expect(runtime.getState().error).toBeUndefined();
    expect(second).toHaveBeenCalledTimes(2);
    expect(rethrown).toEqual([boom]);
  } finally {
    spy.mockRestore();
  }
});

test('a listener that calls setInput re-entrantly sends only the newer input', async () => {
  const { calls, transport } = createFakeTransport();
  const runtime = createDecisionRuntime({ schema, transport });
  let reentered = false;
  runtime.subscribe(() => {
    if (!reentered && runtime.getState().status === 'loading') {
      reentered = true;
      runtime.setInput('b');
    }
  });

  runtime.setInput('a');
  await flush();

  expect(calls).toHaveLength(1);
  expect(calls[0].request.state).toBe('b');
});
