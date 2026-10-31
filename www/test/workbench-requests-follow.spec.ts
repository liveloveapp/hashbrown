import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { workbenchExchanges } from '../examples/quickstart/runtime/workbench-requests';
import { exchangeAtPlayhead } from '../examples/quickstart/runtime/workbench-requests-follow';

const request = (requestId: string) => ({
  url: 'http://localhost:4300/api/workbench/chat',
  requestId,
  attempt: 1,
  input: { threadId: 't', runId: requestId, messages: [] },
});

/** Turn 1: a request, a tool call and a continuation; Turn 2: one request. */
function recordTwoTurns() {
  const store = createWorkbenchStore();
  store.send('Look it up');
  store.record('request', request('r1'));
  store.record('event', { type: 'RUN_STARTED' });
  store.record('event', { type: 'RUN_FINISHED' });
  store.record('tool', { name: 'readContext', result: { ok: true } });
  store.record('request', request('r2'));
  store.record('event', { type: 'TEXT_MESSAGE_CONTENT', delta: 'Done' });
  store.record('event', { type: 'RUN_FINISHED' });
  store.settle('complete', 'stop');
  store.send('Again');
  store.record('request', request('r3'));
  store.record('event', { type: 'RUN_FINISHED' });
  store.settle('complete', 'stop');
  const events = store.getSnapshot().events;
  const exchanges = workbenchExchanges(events, {}).flatMap(
    (turn) => turn.exchanges,
  );
  return { events, exchanges };
}

test('gives null when the playhead is before the first request', () => {
  const { events, exchanges } = recordTwoTurns();
  const beforeFirst = exchanges[0].firstIndex - 1;

  const result = exchangeAtPlayhead(exchanges, events, beforeFirst);

  expect(beforeFirst).toBeGreaterThanOrEqual(0);
  expect(result).toBeNull();
});

test('gives the continuation while the playhead is inside it', () => {
  const { events, exchanges } = recordTwoTurns();
  const continuation = exchanges.find(
    (exchange) => exchange.name === 'Continuation',
  );
  const inside = (continuation?.firstIndex ?? 0) + 1;

  const result = exchangeAtPlayhead(exchanges, events, inside);

  expect(continuation?.eventIndexes).toContain(inside);
  expect(result?.id).toBe(continuation?.id);
});

test('gives the last Turn 1 exchange while Turn 2 has not sent its request', () => {
  const { events, exchanges } = recordTwoTurns();
  const turnTwoRequest = exchanges.find((exchange) => exchange.turn === 2);
  const userEvent = events.findIndex((event) => event.turn === 2);
  const lastTurnOne = exchanges
    .filter((exchange) => exchange.turn === 1)
    .at(-1);

  const result = exchangeAtPlayhead(exchanges, events, userEvent);

  expect(userEvent).toBeLessThan(turnTwoRequest?.firstIndex ?? 0);
  expect(result?.id).toBe(lastTurnOne?.id);
  expect(result?.name).toBe('Continuation');
});

test('gives the Turn 2 request once the playhead reaches it', () => {
  const { events, exchanges } = recordTwoTurns();
  const turnTwoRequest = exchanges.find((exchange) => exchange.turn === 2);

  const result = exchangeAtPlayhead(
    exchanges,
    events,
    turnTwoRequest?.firstIndex ?? 0,
  );

  expect(result?.id).toBe(turnTwoRequest?.id);
});
