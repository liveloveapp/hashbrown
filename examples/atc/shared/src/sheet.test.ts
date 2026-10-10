import { expect, test } from 'vitest';
import { createAtcStore, INITIAL_STATE } from './store';
import {
  INITIAL_SHEET,
  isNearBottom,
  nextSheet,
  sheetEventFor,
  sheetExpanded,
  type SheetState,
  watchSheetEvents,
} from './sheet';

test('a scroller at the end follows new content', () => {
  const metrics = { scrollTop: 500, scrollHeight: 1000, clientHeight: 500 };

  expect(isNearBottom(metrics)).toBe(true);
});

test('a scroller within the threshold still follows', () => {
  const metrics = { scrollTop: 460, scrollHeight: 1000, clientHeight: 500 };

  expect(isNearBottom(metrics)).toBe(true);
});

test('a user who scrolled up is left alone', () => {
  const metrics = { scrollTop: 100, scrollHeight: 1000, clientHeight: 500 };

  expect(isNearBottom(metrics)).toBe(false);
});

const peek: SheetState = { snap: 'peek', held: false };
const half: SheetState = { snap: 'half', held: false };
const full: SheetState = { snap: 'full', held: false };
const held: SheetState = { snap: 'full', held: true };

test('the sheet starts at its peek, not held', () => {
  expect(INITIAL_SHEET).toEqual(peek);
});

test('a short drag moves the sheet one snap; a long drag goes all the way', () => {
  const results = [
    nextSheet(peek, { type: 'drag', deltaY: -80 }).snap,
    nextSheet(half, { type: 'drag', deltaY: -80 }).snap,
    nextSheet(peek, { type: 'drag', deltaY: -240 }).snap,
    nextSheet(full, { type: 'drag', deltaY: 80 }).snap,
    nextSheet(half, { type: 'drag', deltaY: 80 }).snap,
    nextSheet(full, { type: 'drag', deltaY: 240 }).snap,
    nextSheet(full, { type: 'drag', deltaY: -80 }).snap,
    nextSheet(peek, { type: 'drag', deltaY: 80 }).snap,
  ];

  expect(results).toEqual([
    'half',
    'full',
    'full',
    'half',
    'peek',
    'peek',
    'full',
    'peek',
  ]);
});

test('a tap on the handle opens the sheet fully, or closes it from full', () => {
  const results = [peek, half, full].map(
    (state) => nextSheet(state, { type: 'drag', deltaY: 2 }).snap,
  );

  expect(results).toEqual(['full', 'full', 'peek']);
});

test('the user holds the sheet at full by dragging, tapping or typing', () => {
  const results = [
    nextSheet(half, { type: 'drag', deltaY: -80 }),
    nextSheet(peek, { type: 'drag', deltaY: 0 }),
    nextSheet(peek, { type: 'focus' }),
  ];

  expect(results).toEqual([held, held, held]);
});

test('sending lowers the sheet to half, so the map shows above the answer', () => {
  const results = [peek, half, held].map((state) =>
    nextSheet(state, { type: 'send' }),
  );

  expect(results).toEqual([half, half, half]);
});

test('a map move lowers an open sheet to half unless the user is holding it there', () => {
  const results = [peek, half, full, held].map((state) =>
    nextSheet(state, { type: 'map' }),
  );

  expect(results).toEqual([peek, half, half, held]);
});

test('picking a plane from the chat lowers even a held sheet to half', () => {
  const results = [peek, half, held].map((state) =>
    nextSheet(state, { type: 'reveal' }),
  );

  expect(results).toEqual([peek, half, half]);
});

test('Escape closes the sheet to its peek', () => {
  expect(nextSheet(held, { type: 'escape' })).toEqual(peek);
});

test('the handle reports expanded only at full', () => {
  expect([peek, half, full].map(sheetExpanded)).toEqual([false, false, true]);
});

test('store changes that move or mark the map, or pick a plane, become sheet events', () => {
  const moved = { ...INITIAL_STATE, viewSeq: 1 };
  const followed = { ...INITIAL_STATE, followingHex: 'aaaaaa' };
  const highlighted = { ...INITIAL_STATE, highlighted: new Set(['aaaaaa']) };
  const selected = { ...INITIAL_STATE, selectedHex: 'aaaaaa' };

  const results = [
    sheetEventFor(INITIAL_STATE, moved),
    sheetEventFor(INITIAL_STATE, followed),
    sheetEventFor(INITIAL_STATE, highlighted),
    sheetEventFor(INITIAL_STATE, selected),
    sheetEventFor(INITIAL_STATE, { ...INITIAL_STATE, updatedAt: 5 }),
    sheetEventFor(highlighted, { ...INITIAL_STATE }),
    sheetEventFor(selected, { ...INITIAL_STATE }),
  ];

  expect(results).toEqual([
    { type: 'map' },
    { type: 'map' },
    { type: 'map' },
    { type: 'reveal' },
    null,
    null,
    null,
  ]);
});

test('watchSheetEvents reports the sheet events of each store change until stopped', () => {
  const store = createAtcStore();
  const events: unknown[] = [];
  const stop = watchSheetEvents(store, (event) => events.push(event));

  store.setFeedStatus('live');
  store.revealAircraft('aaaaaa');
  store.showArea({ airport: 'KBDN', radiusNm: 25 });
  stop();
  store.resetView();

  expect(events).toEqual([{ type: 'reveal' }, { type: 'map' }]);
});
