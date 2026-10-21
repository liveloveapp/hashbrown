import { expect, test } from 'vitest';
import {
  clampDrawerHeight,
  DEV_MODE_KEY,
  DEV_TABS,
  devTabBlocks,
  type DevToolInput,
  DRAWER_HEIGHT_KEY,
  followLatest,
  readDevMode,
  readDrawerHeight,
  routerTyping,
  rowTurns,
  selectedTurn,
  selectSend,
  sendActivity,
  shownTurn,
  writeDevMode,
  writeDrawerHeight,
} from './dev-tool';
import { createRouterInput } from './router-input';
import type { TurnShown } from './stream-view';
import { ROUTER_SKIPPED } from './stream-view';

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));

  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const THROWING = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

const ROUTE = {
  value: { intent: 'chat' },
  meta: { intent: { confidence: 0.9, probabilities: { chat: 0.9 } } },
};

const EMPTY: DevToolInput = {
  typing: null,
  turn: undefined,
  answer: null,
  tools: [],
  filter: null,
};

const TURNS: TurnShown[] = [
  { text: 'one', router: ROUTER_SKIPPED },
  { text: 'two', router: ROUTER_SKIPPED },
];

test('dev mode is off by default and survives a throwing storage', () => {
  const storage = memoryStorage();

  const initial = readDevMode(storage);
  writeDevMode(storage, true);

  expect(initial).toBe(false);
  expect(readDevMode(null)).toBe(false);
  expect(readDevMode(THROWING)).toBe(false);
  expect(() => writeDevMode(THROWING, true)).not.toThrow();
  expect(storage.data.get(DEV_MODE_KEY)).toBe('on');
  expect(readDevMode(storage)).toBe(true);
  writeDevMode(storage, false);
  expect(readDevMode(storage)).toBe(false);
});

test('an old atc.showStream value does not turn dev mode on', () => {
  const storage = memoryStorage({ 'atc.showStream': 'on' });

  const on = readDevMode(storage);

  expect(on).toBe(false);
});

test('the drawer height is remembered and a bad value is ignored', () => {
  const storage = memoryStorage();

  const initial = readDrawerHeight(storage);
  writeDrawerHeight(storage, 320);

  expect(initial).toBeNull();
  expect(storage.data.get(DRAWER_HEIGHT_KEY)).toBe('320');
  expect(readDrawerHeight(storage)).toBe(320);
  expect(
    readDrawerHeight(memoryStorage({ [DRAWER_HEIGHT_KEY]: 'tall' })),
  ).toBeNull();
  expect(readDrawerHeight(THROWING)).toBeNull();
  expect(() => writeDrawerHeight(THROWING, 1)).not.toThrow();
});

test('clampDrawerHeight defaults to 35% and clamps to 160 px and 60%', () => {
  const fallback = clampDrawerHeight(null, 800);
  const low = clampDrawerHeight(100, 800);
  const high = clampDrawerHeight(700, 800);
  const inside = clampDrawerHeight(300, 800);
  const short = clampDrawerHeight(500, 200);

  expect(fallback).toBe(280);
  expect(low).toBe(160);
  expect(high).toBe(480);
  expect(inside).toBe(300);
  expect(short).toBe(120);
});

test('selection follows the newest send until an earlier one is selected', () => {
  const following = followLatest();

  const newest = selectedTurn(TURNS, following);
  const earlier = selectedTurn(TURNS, selectSend(0));

  expect(following).toEqual({ follow: true, index: null });
  expect(newest).toBe(1);
  expect(earlier).toBe(0);
  expect(selectedTurn([], following)).toBeNull();
  expect(selectedTurn(TURNS, selectSend(5))).toBeNull();
});

test('a selected send is kept while a newer one streams', () => {
  const selection = selectSend(0);
  const more = [...TURNS, { text: 'three', router: ROUTER_SKIPPED }];

  const kept = selectedTurn(more, selection);
  const latest = selectedTurn(more, followLatest());

  expect(kept).toBe(0);
  expect(latest).toBe(2);
});

test('each tab lists its blocks in order', () => {
  const input: DevToolInput = {
    typing: { kind: 'decided', result: ROUTE, ms: 10 },
    turn: { text: 'x', router: ROUTER_SKIPPED },
    answer: { content: { a: 1 }, streaming: false },
    tools: [{ name: 'findAircraft', args: { q: 1 }, status: 'done' }],
    filter: {
      router: ROUTER_SKIPPED,
      output: { airline: 'UAL' },
      streaming: true,
      applied: { airline: 'UAL' },
    },
  };
  const titles = (tab: Parameters<typeof devTabBlocks>[0]) =>
    devTabBlocks(tab, input).map((block) => block.title);

  expect(DEV_TABS.map((tab) => tab.label)).toEqual([
    'Router',
    'Cards',
    'Filter',
    'UI stream',
    'Tools',
  ]);
  expect(titles('router')).toEqual(['typing', 'router']);
  expect(devTabBlocks('router', input)[0].text).toContain('chat');
  expect(devTabBlocks('router', input)[1].text).toBe('skipped (starter)');
  expect(titles('cards')).toEqual(['cards']);
  expect(titles('filter')).toEqual(['router', 'filter', 'applied']);
  expect(devTabBlocks('filter', input)[1].text).toBe(
    '{\n  "airline": "UAL"\n}▍',
  );
  expect(devTabBlocks('filter', input)[2].text).toBe(
    '{\n  "airline": "UAL"\n}',
  );
  expect(devTabBlocks('ui', input)).toEqual([
    { title: 'ui', text: '{\n  "a": 1\n}' },
  ]);
  expect(titles('tools')).toEqual(['findAircraft']);
});

test('empty tabs say so instead of rendering nothing', () => {
  const filtered: DevToolInput = {
    ...EMPTY,
    filter: { router: null, output: null, streaming: false, applied: null },
  };

  expect(devTabBlocks('router', EMPTY)).toEqual([
    { title: 'typing', text: 'waiting' },
    { title: 'router', text: 'waiting' },
  ]);
  expect(devTabBlocks('cards', EMPTY)).toEqual([
    { title: 'cards', text: 'deciding…' },
  ]);
  expect(devTabBlocks('filter', filtered).at(-1)).toEqual({
    title: 'applied',
    text: 'no filter',
  });
  expect(devTabBlocks('tools', EMPTY)).toEqual([
    { title: 'tools', text: 'no tool calls' },
  ]);
  expect(devTabBlocks('ui', EMPTY).length).toBe(1);
  expect(devTabBlocks('filter', EMPTY)).toEqual([
    { title: 'applied', text: 'no filter' },
  ]);
});

/** Transcript rows for two sends; the first used a tool. */
const ROWS = [
  { kind: 'user', text: 'one' },
  {
    kind: 'tools',
    calls: [{ name: 'findAircraft', args: { q: 1 }, status: 'done' }],
  },
  { kind: 'answer', message: { role: 'assistant', content: { ui: 'a1' } } },
  { kind: 'answer', message: { role: 'assistant', content: { ui: 'a2' } } },
  { kind: 'user', text: 'two' },
  { kind: 'answer', message: { role: 'assistant', content: { ui: 'b' } } },
] as const;

test('rowTurns maps each transcript row to its send in the recorded turns', () => {
  const turns: TurnShown[] = [
    { text: 'one', router: ROUTER_SKIPPED },
    { text: 'two', router: { kind: 'fallback', reason: 'superseded' } },
    { text: 'two', router: ROUTER_SKIPPED },
  ];

  const owners = rowTurns(ROWS, turns);

  expect(owners).toEqual([0, 0, 0, 0, 2, 2]);
  expect(rowTurns([{ kind: 'user', text: 'gone' }], turns)).toEqual([null]);
});

test('sendActivity reads one send: its last answer and every tool call', () => {
  const turns: TurnShown[] = [
    { text: 'one', router: ROUTER_SKIPPED },
    { text: 'two', router: ROUTER_SKIPPED },
  ];

  const first = sendActivity(ROWS, turns, 0, true);
  const newest = sendActivity(ROWS, turns, 1, true);
  const none = sendActivity(ROWS, turns, null, false);

  expect(first).toEqual({
    answer: { content: { ui: 'a2' }, streaming: false },
    tools: [{ name: 'findAircraft', args: { q: 1 }, status: 'done' }],
  });
  expect(newest).toEqual({
    answer: { content: { ui: 'b' }, streaming: true },
    tools: [],
  });
  expect(none).toEqual({ answer: null, tools: [] });
});

test('shownTurn falls back to the newest send when the chosen one is gone', () => {
  const kept = shownTurn(TURNS, selectSend(0));
  const gone = shownTurn(TURNS, selectSend(7));
  const empty = shownTurn([], selectSend(0));

  expect(kept).toBe(0);
  expect(gone).toBe(1);
  expect(empty).toBeNull();
});

test('routerTyping shows the live decision, or waiting while none is in', () => {
  const input = createRouterInput();
  const typed = input.reduce(input.initial, { type: 'typed', text: 'hello' });
  const decided = input.reduce(typed, {
    type: 'decided',
    text: 'hello',
    result: ROUTE as never,
  });
  const short = input.reduce(input.initial, { type: 'typed', text: 'hi' });

  const empty = routerTyping(input.initial, null);
  const waiting = routerTyping(typed, null);
  const live = routerTyping(decided, 40);
  const tooShort = routerTyping(short, null);

  expect(empty).toBeNull();
  expect(waiting).toBeNull();
  expect(live).toEqual({ kind: 'decided', result: ROUTE, ms: 40 });
  expect(tooShort).toEqual({ kind: 'fallback', reason: 'too short' });
});
