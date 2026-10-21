import { createSelectionSchema, type Decision } from '@hashbrownai/core';
import { expect, test } from 'vitest';
import { cardGroups, type routeSchema } from './contracts';
import { routeAction, routeBadge } from './route';

type RouteResult = Decision.Result<typeof routeSchema>;

function decision(
  intent: 'filter' | 'chat' | 'other',
  confidence: number,
  clear = false,
  clearProbability = clear ? 0.9 : 0.1,
): RouteResult {
  return {
    value: { intent, clear },
    meta: {
      intent: { confidence, probabilities: { [intent]: confidence } },
      clear: { probability: clearProbability },
    },
  };
}

test('routeAction goes to chat below 0.7 and for other', () => {
  const confidentFilter = decision('filter', 0.97);
  const unsureFilter = decision('filter', 0.69);
  const confidentOther = decision('other', 0.99);
  const confidentChat = decision('chat', 0.91);

  expect(routeAction(confidentFilter)).toEqual({ kind: 'filter' });
  expect(routeAction(unsureFilter)).toEqual({ kind: 'chat' });
  expect(routeAction(confidentOther)).toEqual({ kind: 'chat' });
  expect(routeAction(confidentChat)).toEqual({ kind: 'chat' });
});

test('clear only applies with a filter intent', () => {
  const clearFilter = decision('filter', 0.95, true, 0.5);
  const weakClear = decision('filter', 0.95, true, 0.49);
  const clearChat = decision('chat', 0.95, true, 0.99);

  expect(routeAction(clearFilter)).toEqual({ kind: 'clear' });
  expect(routeAction(weakClear)).toEqual({ kind: 'filter' });
  expect(routeAction(clearChat)).toEqual({ kind: 'chat' });
});

test('a missing decision routes to chat', () => {
  const result = routeAction(null);

  expect(result).toEqual({ kind: 'chat' });
});

test('routeBadge shows the intent and two-decimal confidence, dashed when unsure', () => {
  const filter = routeBadge(decision('filter', 0.97), false);
  const chat = routeBadge(decision('chat', 0.91), false);
  const unsure = routeBadge(decision('chat', 0.6), false);
  const other = routeBadge(decision('other', 0.95), false);
  const empty = routeBadge(null, false);

  expect(filter).toEqual({ label: '→ filter 0.97', tone: 'filter' });
  expect(chat).toEqual({ label: '→ chat 0.91', tone: 'chat' });
  expect(unsure.tone).toBe('unsure');
  expect(other.tone).toBe('unsure');
  expect(empty).toEqual({ label: '', tone: 'idle' });
});

test('routeBadge keeps the last result while a new decision is pending', () => {
  const last = decision('filter', 0.88);

  const pending = routeBadge(last, true);
  const first = routeBadge(null, true);

  expect(pending).toEqual({ label: '→ filter 0.88', tone: 'filter' });
  expect(first).toEqual({ label: '', tone: 'idle' });
});

test('cardGroups flatten in the pinned order with Markdown non-selectable', () => {
  const names = cardGroups.flatMap((group) =>
    group.components.map((component) => component.name),
  );

  const schema = createSelectionSchema(cardGroups, { max: 2 });
  const json = JSON.stringify(schema);

  expect(names).toEqual([
    'Markdown',
    'FlightCard',
    'ArrivalsBoard',
    'AircraftCompare',
    'AirportCard',
  ]);
  expect(cardGroups[0].selectable).toBe(false);
  expect(cardGroups[1].selectable).toBeUndefined();
  expect(json).not.toContain('Markdown');
  const positions = names.slice(1).map((name) => json.indexOf(`"${name}"`));
  expect(positions.every((p) => p >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
});
