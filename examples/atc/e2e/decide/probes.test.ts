import { cardGroups, STARTER_PROMPTS } from '@atc/shared';
import { expect, test } from 'vitest';
import {
  CARDS_PROBES,
  correctCount,
  ROUTE_PROBES,
  scoreCards,
  scoreRoute,
} from './probes';

/** A router decision with the given intent, confidence and clear probability. */
function routeResult(
  intent: 'filter' | 'chat' | 'other',
  confidence: number,
  clear = 0.05,
) {
  return {
    value: { intent, clear: clear >= 0.5 },
    meta: {
      intent: { confidence, probabilities: { [intent]: confidence } },
      clear: { probability: clear },
    },
  } as unknown as Parameters<typeof scoreRoute>[1];
}

test('every starter is a router probe with the route its button uses', () => {
  const probes = new Map(
    ROUTE_PROBES.map((probe) => [probe.input, probe.expected]),
  );

  const routes = STARTER_PROMPTS.map((starter) => probes.get(starter.text));

  expect(routes).toEqual(STARTER_PROMPTS.map((starter) => starter.route));
});

test('every card is expected by at least one cards probe', () => {
  const cards = cardGroups
    .filter((group) => group.selectable !== false)
    .flatMap((group) => group.components.map((component) => component.name));

  const expected = new Set(CARDS_PROBES.map((probe) => probe.expected));

  expect([...expected].sort()).toEqual([...cards].sort());
});

test('an unsure filter decision is scored as chat, as Enter would send it', () => {
  const probe = { input: 'Delta', expected: 'filter' as const };

  const unsure = scoreRoute(probe, routeResult('filter', 0.6));
  const sure = scoreRoute(probe, routeResult('filter', 0.9));

  expect(unsure).toMatchObject({ got: 'chat', ok: false });
  expect(sure).toMatchObject({ got: 'filter', ok: true });
});

test('a filter decision that also clears is scored as a clear', () => {
  const probe = { input: 'show everything', expected: 'clear' as const };

  const outcome = scoreRoute(probe, routeResult('filter', 0.95, 0.9));

  expect(outcome).toMatchObject({ got: 'clear', ok: true });
});

test('a cards decision counts only when it is confident and picks the expected card first', () => {
  const probe = {
    input: 'Compare the two fastest jets',
    expected: 'AircraftCompare',
  };
  const result = (compare: number, flight: number) => ({
    value: {},
    meta: {
      FlightCard: { probability: flight },
      AircraftCompare: { probability: compare },
    },
  });

  const outcomes = [
    scoreCards(probe, result(0.95, 0.1)),
    scoreCards(probe, result(0.65, 0.5)),
    scoreCards(probe, result(0.6, 0.9)),
  ];

  expect(outcomes.map(({ sent, ok }) => ({ sent, ok }))).toEqual([
    { sent: ['AircraftCompare'], ok: true },
    { sent: 'all', ok: false },
    { sent: ['FlightCard', 'AircraftCompare'], ok: false },
  ]);
  expect(correctCount(outcomes)).toBe(1);
});
