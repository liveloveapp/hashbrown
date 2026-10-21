import { expect, test } from 'vitest';
import {
  clampDrawerHeight,
  DEV_MODE_KEY,
  DEV_TABS,
  devFilter,
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
  TYPING_EMPTY,
  wireUi,
  writeDevMode,
  writeDrawerHeight,
} from './dev-tool';
import { createRouterInput } from './router-input';
import type { RouteSend } from './route-log';
import type { TurnShown } from './stream-view';
import { ROUTER_SKIPPED, ROUTER_SKIPPED_REFINEMENT } from './stream-view';

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
  typing: TYPING_EMPTY,
  turn: undefined,
  following: true,
  routes: [],
  answer: null,
  tools: [],
  filter: { run: null, applied: null },
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
    following: false,
    routes: [],
    answer: { content: { a: 1 }, streaming: false },
    tools: [{ name: 'findAircraft', args: { q: 1 }, status: 'done' }],
    filter: {
      run: {
        router: ROUTER_SKIPPED,
        output: { airline: 'UAL' },
        streaming: true,
      },
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
  expect(titles('router')).toEqual(['typing', 'sent: "x" → chat']);
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
  expect(devTabBlocks('router', EMPTY)).toEqual([
    { title: 'typing', text: 'type to see where it goes' },
    { title: 'sent', text: 'nothing sent yet' },
  ]);
  expect(devTabBlocks('cards', EMPTY)).toEqual([
    { title: 'cards', text: 'deciding…' },
  ]);
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

test('routerTyping shows the live decision, empty for an empty box, or waiting while none is in', () => {
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

  expect(empty).toBe(TYPING_EMPTY);
  expect(waiting).toBeNull();
  expect(live).toEqual({ kind: 'decided', result: ROUTE, ms: 40 });
  expect(tooShort).toEqual({ kind: 'fallback', reason: 'too short' });
});

test('wireUi shows the UI as the model wrote it, without parse wrappers', () => {
  const parsed = {
    ui: [
      {
        Card: {
          props: {
            complete: true,
            partialValue: { title: 'Two' },
            value: { title: 'Two' },
          },
          children: [
            {
              Markdown: {
                props: { complete: false, partialValue: { children: 'Fl' } },
              },
            },
          ],
        },
      },
      { Plain: { props: { title: 'kept' } } },
    ],
  };

  const wire = wireUi(parsed);

  expect(wire).toEqual({
    ui: [
      {
        Card: {
          props: { title: 'Two' },
          children: [{ Markdown: { props: { children: 'Fl' } } }],
        },
      },
      { Plain: { props: { title: 'kept' } } },
    ],
  });
  expect(wireUi('text')).toBe('text');
  expect(wireUi(undefined)).toBeUndefined();
  expect(
    devTabBlocks('ui', {
      ...EMPTY,
      answer: { content: parsed, streaming: false },
    })[0].text,
  ).not.toContain('partialValue');
});

const ALASKA = { filter: { airline: 'Alaska' } };
const JETS = { filter: { kind: 'jet' } };

test('the filter tab shows a run only while the map holds what it produced', () => {
  const route = ROUTER_SKIPPED;

  const streaming = devFilter({
    route,
    loading: true,
    current: null,
    produced: null,
    output: { airline: 'Al' },
  });
  const settled = devFilter({
    route,
    loading: false,
    current: ALASKA,
    produced: ALASKA,
    output: ALASKA.filter,
  });

  expect(streaming).toEqual({
    run: { router: route, output: { airline: 'Al' }, streaming: true },
    applied: null,
  });
  expect(settled.run?.output).toEqual(ALASKA.filter);
  expect(
    devTabBlocks('filter', { ...EMPTY, filter: settled }).map(
      (block) => block.title,
    ),
  ).toEqual(['router', 'filter', 'applied']);
});

test('a filter the assistant applied shows as applied with no run', () => {
  const filter = devFilter({
    route: null,
    loading: false,
    current: JETS,
    produced: null,
    output: null,
  });

  const blocks = devTabBlocks('filter', { ...EMPTY, filter });

  expect(filter.run).toBeNull();
  expect(blocks).toEqual([
    {
      title: 'applied',
      text: 'applied by the assistant or the pill (no filter run)\n{\n  "kind": "jet"\n}',
    },
  ]);
});

test('the pill clearing a run leaves no filter', () => {
  const filter = devFilter({
    route: ROUTER_SKIPPED,
    loading: false,
    current: null,
    produced: ALASKA,
    output: ALASKA.filter,
  });

  const blocks = devTabBlocks('filter', { ...EMPTY, filter });

  expect(blocks).toEqual([{ title: 'applied', text: 'no filter' }]);
});

test('a tool replacing a run hides the run', () => {
  const filter = devFilter({
    route: ROUTER_SKIPPED,
    loading: false,
    current: JETS,
    produced: ALASKA,
    output: ALASKA.filter,
  });

  const blocks = devTabBlocks('filter', { ...EMPTY, filter });

  expect(filter.run).toBeNull();
  expect(blocks.map((block) => block.title)).toEqual(['applied']);
  expect(blocks[0].text).toContain('"kind": "jet"');
});

test('the cards tab settles when a finished answer never had a decision', () => {
  const base: DevToolInput = {
    typing: null,
    turn: { text: 'x', router: ROUTER_SKIPPED },
    following: true,
    routes: [],
    answer: { content: { a: 1 }, streaming: false },
    tools: [],
    filter: { run: null, applied: null },
  };
  const streaming = { ...base, answer: { content: { a: 1 }, streaming: true } };
  const absent = { ...base, answer: { content: undefined, streaming: false } };

  const settled = devTabBlocks('cards', base)[0].text;
  const whileStreaming = devTabBlocks('cards', streaming)[0].text;
  const noAnswer = devTabBlocks('cards', absent)[0].text;

  expect(settled).toBe('all (fallback: not asked)');
  expect(whileStreaming).toBe('deciding…');
  expect(noAnswer).toBe('deciding…');
});

const FILTER_ROUTE = {
  kind: 'decided',
  result: {
    value: { intent: 'filter', clear: false },
    meta: {
      intent: { confidence: 0.97, probabilities: { filter: 0.97 } },
      clear: { probability: 0.02 },
    },
  },
  ms: 120,
} as const;

test('the router tab says to type while the box is empty, and waits only for typed text', () => {
  const typed = { ...EMPTY, typing: null };

  const empty = devTabBlocks('router', EMPTY)[0];
  const waiting = devTabBlocks('router', typed)[0];

  expect(empty).toEqual({ title: 'typing', text: 'type to see where it goes' });
  expect(waiting).toEqual({ title: 'typing', text: 'waiting' });
});

test('after a filter send the router tab shows that send, then earlier ones on one line each', () => {
  const routes: RouteSend[] = [
    {
      text: 'only jets below 8000 ft',
      router: FILTER_ROUTE,
      outcome: 'filter',
    },
    {
      text: 'below 5000 ft',
      router: ROUTER_SKIPPED_REFINEMENT,
      outcome: 'filter',
    },
    { text: 'jets', router: ROUTER_SKIPPED, outcome: 'filter' },
    { text: 'a', router: ROUTER_SKIPPED, outcome: 'chat' },
    { text: 'b', router: ROUTER_SKIPPED, outcome: 'chat' },
    { text: 'c', router: ROUTER_SKIPPED, outcome: 'chat' },
  ];
  const input: DevToolInput = {
    ...EMPTY,
    turn: { text: 'older chat', router: ROUTER_SKIPPED },
    routes,
  };

  const blocks = devTabBlocks('router', input);

  expect(blocks.map((block) => block.title)).toEqual([
    'typing',
    'sent: "only jets below 8000 ft" → filter',
    'earlier',
  ]);
  expect(blocks[1].text).toContain('→ filter');
  expect(blocks[1].text).toContain('intent: filter 0.97');
  expect(blocks[2].text).toBe(
    [
      '"below 5000 ft" → filter (refinement)',
      '"jets" → filter (starter)',
      '"a" → chat (starter)',
      '"b" → chat (starter)',
    ].join('\n'),
  );
});

test('a selected chat send is still shown, whatever was sent after it', () => {
  const routes: RouteSend[] = [
    {
      text: 'only jets below 8000 ft',
      router: FILTER_ROUTE,
      outcome: 'filter',
    },
  ];
  const input: DevToolInput = {
    ...EMPTY,
    turn: { text: 'Seattle?', router: ROUTER_SKIPPED },
    following: false,
    routes,
  };

  const blocks = devTabBlocks('router', input);

  expect(blocks).toEqual([
    { title: 'typing', text: 'type to see where it goes' },
    { title: 'sent: "Seattle?" → chat', text: 'skipped (starter)' },
  ]);
});
