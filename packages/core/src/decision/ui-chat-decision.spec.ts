import type { ExposedComponentDescriptor } from '../ui/expose-component';
import { createUiKit } from '../ui/ui-kit';
import { compileDecision } from './compile-decision';
import type { Request, Response, Transport } from './decision.types';
import { DecisionSchemaError } from './errors';
import { createUiChatDecision } from './ui-chat-decision';
import { createSelectionSchema } from './ui-selection';

function component(
  name: string,
  children?: ExposedComponentDescriptor['children'],
): ExposedComponentDescriptor {
  return {
    component: { name },
    name,
    description: `The ${name} component`,
    ...(children === undefined ? {} : { children }),
  };
}

const flight = component('Flight');
const airport = component('Airport');
const row = component('Row');
const table = component('Table', [row]);

function pick(id: string, confidence: number): Response {
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: { pick: id },
    meta: { pick: { confidence, probabilities: { [id]: confidence } } },
  };
}

function deferredTransport() {
  const calls: Array<{ request: Request; signal: AbortSignal }> = [];
  const resolvers: Array<(response: Response) => void> = [];
  const rejecters: Array<(error: Error) => void> = [];
  const transport: Transport = (request, signal) => {
    calls.push({ request, signal });
    return new Promise((resolve, reject) => {
      resolvers.push(resolve);
      rejecters.push(reject);
    });
  };
  return { calls, transport, resolvers, rejecters };
}

test('createUiChatDecision narrows to the chosen components with their declared children', async () => {
  const kit = createUiKit({ components: [flight, table] });
  const transport: Transport = async () => pick('Table', 0.9);
  const decision = createUiChatDecision();

  const outcome = await decision.decide('show rows', [kit, airport], {
    select: 'one',
    transport,
  });

  expect(outcome).toEqual({ kind: 'narrowed', components: [table, row] });
  expect(decision.getState()).toEqual({
    status: 'success',
    value: { pick: 'Table' },
    meta: { pick: { confidence: 0.9, probabilities: { Table: 0.9 } } },
    error: undefined,
  });
});

test('createUiChatDecision asks the questions createSelectionSchema builds, with system', async () => {
  const kit = createUiKit({ components: [flight, table] });
  const deferred = deferredTransport();
  const decision = createUiChatDecision();

  void decision.decide('show rows', [kit, airport], {
    select: 'one',
    system: 'A flight app.',
    transport: deferred.transport,
  });

  expect(deferred.calls[0].request).toEqual({
    state: { system: 'A flight app.', input: 'show rows' },
    questions: compileDecision(createSelectionSchema([kit, airport], 'one')),
  });
  expect(decision.getState().status).toBe('loading');
});

test('createUiChatDecision falls back below minConfidence', async () => {
  const transport: Transport = async () => pick('Flight', 0.4);
  const decision = createUiChatDecision();

  const outcome = await decision.decide('hi', [flight, airport], {
    select: 'one',
    minConfidence: 0.5,
    transport,
  });

  expect(outcome).toEqual({ kind: 'fallback' });
  expect(decision.getState().error).toBeUndefined();
});

test('createUiChatDecision falls back and exposes a transport failure', async () => {
  const failure = new Error('offline');
  const transport: Transport = async () => {
    throw failure;
  };
  const decision = createUiChatDecision();

  const outcome = await decision.decide('hi', [flight, airport], {
    select: 'one',
    transport,
  });

  expect(outcome).toEqual({ kind: 'fallback' });
  expect(decision.getState()).toMatchObject({
    status: 'error',
    error: failure,
  });
});

test('createUiChatDecision falls back without a request when the components break the selection limits', async () => {
  const deferred = deferredTransport();
  const decision = createUiChatDecision();

  const outcome = await decision.decide('hi', [component('a.b')], {
    select: 'one',
    transport: deferred.transport,
  });

  expect(outcome).toEqual({ kind: 'fallback' });
  expect(deferred.calls).toHaveLength(0);
  expect(decision.getState().error).toBeInstanceOf(DecisionSchemaError);
});

test('createUiChatDecision falls back without a request when there are no components', async () => {
  const deferred = deferredTransport();
  const decision = createUiChatDecision();

  const outcome = await decision.decide('hi', [], {
    select: 'one',
    transport: deferred.transport,
  });

  expect(outcome).toEqual({ kind: 'fallback' });
  expect(deferred.calls).toHaveLength(0);
  expect(decision.getState().status).toBe('idle');
});

test('createUiChatDecision supersedes a pending decision with the latest', async () => {
  const deferred = deferredTransport();
  const decision = createUiChatDecision();
  const options = { select: 'one' as const, transport: deferred.transport };

  const first = decision.decide('one', [flight, airport], options);
  const second = decision.decide('two', [flight, airport], options);
  deferred.resolvers[1](pick('Airport', 0.9));

  await expect(first).resolves.toEqual({ kind: 'superseded' });
  await expect(second).resolves.toEqual({
    kind: 'narrowed',
    components: [airport],
  });
  expect(deferred.calls[0].signal.aborted).toBe(true);
});

test('createUiChatDecision falls back when stopped', async () => {
  const deferred = deferredTransport();
  const decision = createUiChatDecision();

  const pending = decision.decide('one', [flight, airport], {
    select: 'one',
    transport: deferred.transport,
  });
  decision.stop();

  await expect(pending).resolves.toEqual({ kind: 'fallback' });
  expect(decision.getState().status).toBe('idle');
});

test('createUiChatDecision dispose drops a pending decision', async () => {
  const deferred = deferredTransport();
  const decision = createUiChatDecision();

  const pending = decision.decide('one', [flight, airport], {
    select: 'one',
    transport: deferred.transport,
  });
  decision.dispose();

  await expect(pending).resolves.toEqual({ kind: 'superseded' });
  expect(decision.getState().status).toBe('idle');
});

test('createUiChatDecision notifies subscribers of state changes', async () => {
  const transport: Transport = async () => pick('Flight', 0.9);
  const decision = createUiChatDecision();
  const statuses: string[] = [];
  decision.subscribe(() => statuses.push(decision.getState().status));

  await decision.decide('hi', [flight, airport], { select: 'one', transport });

  expect(statuses).toEqual(['loading', 'success']);
});

test('createUiChatDecision fail exposes an error from after the decision', () => {
  const decision = createUiChatDecision();
  const failure = new Error('send refused');

  decision.fail(failure);

  expect(decision.getState()).toMatchObject({
    status: 'error',
    error: failure,
  });
});

test('chat decision with only non-selectable components falls back without deciding', async () => {
  const deferred = deferredTransport();
  const decision = createUiChatDecision();
  const kit = createUiKit({ components: [flight, airport], selectable: false });

  const outcome = await decision.decide('hi', [kit], {
    select: 'one',
    transport: deferred.transport,
  });

  expect(outcome).toEqual({ kind: 'fallback' });
  expect(deferred.calls).toHaveLength(0);
});
