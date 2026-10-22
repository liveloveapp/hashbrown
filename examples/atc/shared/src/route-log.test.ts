import { expect, test } from 'vitest';
import { recordRoute, routeLine, type RouteSend } from './route-log';
import {
  ROUTER_SKIPPED,
  ROUTER_SKIPPED_REFINEMENT,
  type RouterShown,
} from './stream-view';

const FILTER_ROUTE: RouterShown = {
  kind: 'decided',
  result: {
    value: { intent: 'filter', clear: false },
    meta: {
      intent: { confidence: 0.97, probabilities: { filter: 0.97 } },
      clear: { probability: 0.02 },
    },
  },
  ms: 120,
};

const CHAT_ROUTE: RouterShown = {
  kind: 'decided',
  result: {
    value: { intent: 'chat', clear: false },
    meta: {
      intent: { confidence: 0.91, probabilities: { chat: 0.91 } },
      clear: { probability: 0.01 },
    },
  },
  ms: 80,
};

function send(text: string, outcome: RouteSend['outcome']): RouteSend {
  return { text, router: ROUTER_SKIPPED, outcome };
}

test('recordRoute puts the newest send first', () => {
  const first = recordRoute([], send('one', 'chat'));

  const second = recordRoute(first, send('two', 'filter'));

  expect(second.map((entry) => entry.text)).toEqual(['two', 'one']);
  expect(first.map((entry) => entry.text)).toEqual(['one']);
});

test('recordRoute keeps at most max sends, dropping the oldest', () => {
  const log = Array.from({ length: 12 }, (_, index) =>
    send(`s${index}`, 'chat'),
  ).reduce<readonly RouteSend[]>((acc, entry) => recordRoute(acc, entry), []);

  const capped = recordRoute(log, send('newest', 'filter'), 3);

  expect(log.length).toBe(10);
  expect(log[0].text).toBe('s11');
  expect(capped.map((entry) => entry.text)).toEqual(['newest', 's11', 's10']);
});

test('routeLine is one line: the text, the route and why', () => {
  const decidedChat = {
    text: 'busiest airport?',
    router: CHAT_ROUTE,
    outcome: 'chat',
  } as const;
  const decidedFilter = {
    text: 'only jets below 8000 ft',
    router: FILTER_ROUTE,
    outcome: 'filter',
  } as const;
  const starter = send('jets', 'filter');
  const refinement = {
    text: 'below 5000 ft',
    router: ROUTER_SKIPPED_REFINEMENT,
    outcome: 'filter',
  } as const;
  const fallback = {
    text: 'hi',
    router: { kind: 'fallback', reason: 'too short' },
    outcome: 'chat',
  } as const;
  const long = send('x'.repeat(80), 'chat');

  const lines = [decidedChat, decidedFilter, starter, refinement, fallback].map(
    routeLine,
  );
  const longLine = routeLine(long);

  expect(lines).toEqual([
    '"busiest airport?" → chat 0.91',
    '"only jets below 8000 ft" → filter 0.97',
    '"jets" → filter (starter)',
    '"below 5000 ft" → filter (refinement)',
    '"hi" → chat (too short)',
  ]);
  expect(longLine).toBe(`"${'x'.repeat(47)}…" → chat (starter)`);
});
