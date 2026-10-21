import { expect, test } from 'vitest';
import {
  addTurn,
  alignTurns,
  answerTurns,
  cardPicks,
  cardsBlock,
  decisionView,
  filterBlocks,
  filterPanelVisible,
  observeDecisions,
  ROUTER_SKIPPED,
  routerBlock,
  routerShown,
  settleCards,
  streamJson,
  toolBlocks,
  withDecoded,
} from './stream-view';
import { createRouterInput } from './router-input';
import { createAtcStore } from './store';
import { testShelf } from './testing';
import type { MapFilter } from './find-aircraft';

const NO_MAP_FILTER: MapFilter = {
  airline: null,
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  near: null,
  inAirspace: null,
};

const ROUTE = {
  value: { intent: 'filter', clear: false },
  meta: {
    intent: {
      confidence: 0.97,
      probabilities: { filter: 0.97, chat: 0.02, other: 0.01 },
    },
    clear: { probability: 0.12 },
  },
};

const CARDS = {
  value: {
    FlightCard: true,
    ArrivalsBoard: false,
    AircraftCompare: false,
    AirportCard: true,
  },
  meta: {
    FlightCard: { probability: 0.9 },
    ArrivalsBoard: { probability: 0.02 },
    AircraftCompare: { probability: 0.05 },
    AirportCard: { probability: 0.8 },
  },
};

test('decisionView lists answers with probabilities and ms', () => {
  const rows = decisionView(ROUTE, 184);

  expect(rows).toEqual([
    { key: 'intent', answer: 'filter', probability: 0.97 },
    { key: 'clear', answer: 'no', probability: 0.88 },
    { key: 'ms', answer: '184', probability: null },
  ]);
});

test('decisionView of a null result is only the ms row, or nothing', () => {
  const withMs = decisionView(null, 12.4);
  const without = decisionView(null, null);

  expect(withMs).toEqual([{ key: 'ms', answer: '12', probability: null }]);
  expect(without).toEqual([]);
});

test('decisionView of a multi-select has a row per option', () => {
  const rows = decisionView(CARDS, null);

  expect(rows.map((row) => `${row.key}:${row.answer}`)).toEqual([
    'FlightCard:yes',
    'ArrivalsBoard:no',
    'AircraftCompare:no',
    'AirportCard:yes',
  ]);
  expect(rows[1].probability).toBeCloseTo(0.98);
});

test('decisionView falls back to confidence and tolerates missing meta', () => {
  const result = {
    value: { pick: 'a', n: 3 },
    meta: { pick: { confidence: 0.6, probabilities: {} } },
  };

  const rows = decisionView(result, null);

  expect(rows).toEqual([{ key: 'pick', answer: 'a', probability: 0.6 }]);
});

test('streamJson pretty-prints deterministically with a caret only while streaming', () => {
  const value = { b: 1, a: [1, 2] };

  const settled = streamJson(value);
  const streaming = streamJson(value, true);

  expect(settled).toBe(JSON.stringify(value, null, 2));
  expect(streamJson(value)).toBe(settled);
  expect(streaming).toBe(`${settled}▍`);
  expect(settled).not.toContain('▍');
});

test('streamJson of nothing is empty, or just the caret while streaming', () => {
  expect(streamJson(undefined)).toBe('');
  expect(streamJson(null, true)).toBe('▍');
  expect(streamJson(null)).toBe('null');
});

test('routerBlock shows the answers, the skipped starter and the fallbacks', () => {
  const decided = routerBlock({ kind: 'decided', result: ROUTE, ms: 184 });

  expect(decided.text).toBe(
    '→ filter\nintent: filter 0.97\nclear: no 0.88\nms: 184',
  );
  expect(routerBlock(ROUTER_SKIPPED).text).toBe('skipped (starter)');
  expect(routerBlock({ kind: 'fallback', reason: 'unavailable' }).text).toBe(
    '→ chat (unavailable)',
  );
  expect(
    routerBlock({ kind: 'fallback', reason: 'router unavailable' }).text,
  ).toBe('→ chat (router unavailable)');
});

test('routerShown reads the router state at send time', () => {
  const input = createRouterInput();
  const typed = input.reduce(input.initial, { type: 'typed', text: 'hello' });
  const decided = input.reduce(typed, {
    type: 'decided',
    text: 'hello',
    result: ROUTE as never,
  });
  const failed = input.reduce(typed, { type: 'failed', text: 'hello' });

  expect(routerShown(decided, 50)).toEqual({
    kind: 'decided',
    result: ROUTE,
    ms: 50,
  });
  expect(routerShown(failed, 50).kind).toBe('fallback');
  expect(routerShown(typed, null)).toEqual({
    kind: 'fallback',
    reason: 'no answer in time',
  });
});

test('routerShown says why text too short to decide went to chat', () => {
  const input = createRouterInput();

  const typed = input.reduce(input.initial, { type: 'typed', text: 'hi' });

  expect(routerShown(typed, null)).toEqual({
    kind: 'fallback',
    reason: 'too short',
  });
});

test('cardsBlock lists the picks with probabilities', () => {
  const block = cardsBlock({ result: CARDS, ms: 90 });

  expect(block.text.split('\n')[0]).toBe('picks: FlightCard, AirportCard');
  expect(block.text).toContain('FlightCard: yes 0.90');
  expect(block.text).toContain('ms: 90');
});

test('cardsBlock names the fallback when unsure, failed or pending', () => {
  const unsure = {
    value: { FlightCard: true },
    meta: { FlightCard: { probability: 0.55 } },
  };

  expect(cardsBlock({ result: unsure, ms: 5 }).text).toContain(
    'all (fallback: unsure)',
  );
  expect(cardsBlock({ result: null, ms: 5, error: 'status 503' }).text).toBe(
    'all (fallback: status 503)',
  );
  expect(cardsBlock(undefined).text).toBe('deciding…');
});

test('answerTurns puts the panel on the last answer of each send', () => {
  const kinds = [
    { kind: 'user' },
    { kind: 'tools' },
    { kind: 'answer' },
    { kind: 'answer' },
    { kind: 'user' },
    { kind: 'answer' },
  ];

  const turns = answerTurns(kinds);

  expect(turns).toEqual([null, null, null, 0, null, 1]);
});

test('filterBlocks orders the layers', () => {
  const filter = filterBlocks(null, { airline: 'Alaska' }, true);

  expect(filter.map((block) => block.title)).toEqual(['router', 'filter']);
  expect(filter[1].text.endsWith('▍')).toBe(true);
});

test('toolBlocks show each call with its arguments as JSON', () => {
  const blocks = toolBlocks([
    { name: 'findAircraft', args: { near: 'KSEA' }, status: 'done' },
    { name: 'showArea', args: { code: 'KS' }, status: 'pending' },
  ]);

  expect(blocks[0]).toEqual({
    title: 'findAircraft',
    text: JSON.stringify({ near: 'KSEA' }, null, 2),
  });
  expect(blocks[1].text.endsWith('▍')).toBe(true);
});

test('observeDecisions reports settled and failed requests but not aborted ones', async () => {
  const settled: (string | null)[] = [];
  const ok = observeDecisions(
    async () => ({
      kind: 'hashbrown.decision' as const,
      version: 1 as const,
      value: {},
      meta: {},
    }),
    (s) => settled.push(s.error),
  );
  const bad = observeDecisions(
    async () => {
      throw new Error('503');
    },
    (s) => settled.push(s.error),
  );
  const aborted = new AbortController();
  aborted.abort();

  await ok({ state: 'x', questions: {} }, new AbortController().signal);
  await bad({ state: 'x', questions: {} }, new AbortController().signal).catch(
    () => undefined,
  );
  await ok({ state: 'x', questions: {} }, aborted.signal);

  expect(settled).toEqual([null, '503']);
});

test('settleCards records the decision on the newest send only', () => {
  const first = addTurn([], ROUTER_SKIPPED, 'a');
  const two = addTurn(first, { kind: 'fallback', reason: 'x' }, 'b');

  const settled = settleCards(two, {
    response: {
      kind: 'hashbrown.decision',
      version: 1,
      value: CARDS.value,
      meta: CARDS.meta,
    },
    error: null,
    ms: 70,
  });
  const failed = settleCards(first, { response: null, error: '503', ms: 9 });

  expect(settled[0].cards).toBeUndefined();
  expect(settled[1].cards?.ms).toBe(70);
  expect(failed[0].cards).toEqual({ result: null, ms: 9, error: '503' });
  expect(two).toHaveLength(2);
  expect(settleCards([], { response: null, error: null, ms: 1 })).toEqual([]);
});

test('routerBlock states the outcome: filter, clear, chat, and chat when unsure', () => {
  const route = (intent: string, confidence: number, clear: number) => ({
    value: { intent, clear: clear >= 0.5 },
    meta: {
      intent: { confidence, probabilities: { [intent]: confidence } },
      clear: { probability: clear },
    },
  });
  const head = (result: unknown) =>
    routerBlock({ kind: 'decided', result: result as never, ms: 1 }).text.split(
      '\n',
    )[0];

  expect(head(route('filter', 0.9, 0.1))).toBe('→ filter');
  expect(head(route('filter', 0.9, 0.9))).toBe('→ clear');
  expect(head(route('chat', 0.9, 0.1))).toBe('→ chat');
  expect(head(route('filter', 0.4, 0.1))).toBe('→ chat (unsure)');
  expect(head(route('other', 0.9, 0.1))).toBe('→ chat (unsure)');
});

test('alignTurns drops a superseded send so later answers keep their own decisions', () => {
  const first = addTurn([], ROUTER_SKIPPED, 'jets');
  const second = addTurn(first, { kind: 'fallback', reason: 'x' }, 'jets');
  const third = addTurn(second, ROUTER_SKIPPED, 'Seattle?');

  const aligned = alignTurns(third, ['jets', 'Seattle?']);

  expect(aligned[0]).toBe(third[1]);
  expect(aligned[1]).toBe(third[2]);
});

test('alignTurns gives a user row without a send no panel, and ignores refused sends', () => {
  const turns = addTurn(
    addTurn([], ROUTER_SKIPPED, 'refused'),
    ROUTER_SKIPPED,
    'b',
  );

  const aligned = alignTurns(turns, ['b', 'typed elsewhere']);

  expect(aligned[0]).toBe(turns[1]);
  expect(aligned[1]).toBeUndefined();
});

test('cardPicks keeps probability at least 0.5 whatever the value says, like core', () => {
  const result = {
    value: { A: false, B: true, C: true },
    meta: {
      A: { probability: 0.5 },
      B: { probability: 0.49 },
      C: { probability: 0.9 },
    },
  };

  const { picks, confident } = cardPicks(result);

  expect(picks).toEqual(['C', 'A']);
  expect(confident).toBe(true);
});

test('withDecoded prefers the hook decision, and an error empties the cards', () => {
  const turns = settleCards(addTurn([], ROUTER_SKIPPED, 'a'), {
    response: {
      kind: 'hashbrown.decision',
      version: 1,
      value: {},
      meta: {},
    },
    error: null,
    ms: 40,
  });

  const decoded = withDecoded(turns, { value: CARDS.value, meta: CARDS.meta });
  const failed = withDecoded(turns, new Error('stopped'));

  expect(decoded[0].cards).toEqual({ result: CARDS, ms: 40 });
  expect(failed[0].cards).toEqual({ result: null, ms: 40, error: 'stopped' });
  expect(withDecoded([], new Error('x'))).toEqual([]);
});

test('the filter panel goes when another writer or a clear replaces the filter', () => {
  const store = createAtcStore();
  const filter = { ...NO_MAP_FILTER, airline: 'Alaska' };
  store.setMapFilter(filter);
  const run = store.getState().mapFilter;
  const base = {
    route: ROUTER_SKIPPED,
    loading: false,
    current: run,
    produced: run,
  };

  store.setMapFilter({ ...NO_MAP_FILTER, airline: 'Delta' });
  const replaced = store.getState().mapFilter;
  store.clearMapFilter();

  expect(filterPanelVisible({ ...base, loading: true, current: null })).toBe(
    true,
  );
  expect(filterPanelVisible(base)).toBe(true);
  expect(filterPanelVisible({ ...base, current: replaced })).toBe(false);
  expect(
    filterPanelVisible({ ...base, current: store.getState().mapFilter }),
  ).toBe(false);
  expect(filterPanelVisible({ ...base, route: null })).toBe(false);
});

test('the filter panel stays when airspace or chart data re-resolves the same filter', () => {
  const store = createAtcStore();
  store.setMapFilter({
    ...NO_MAP_FILTER,
    inAirspace: { airport: 'KPDX', class: null },
  });
  const run = store.getState().mapFilter;

  store.setAirspace({
    cycle: '2610',
    effective: '2026-10-08',
    shelves: [testShelf()],
  });
  const resolved = store.getState().mapFilter;

  expect(resolved).not.toBe(run);
  expect(
    filterPanelVisible({
      route: ROUTER_SKIPPED,
      loading: false,
      current: resolved,
      produced: run,
    }),
  ).toBe(true);
});
