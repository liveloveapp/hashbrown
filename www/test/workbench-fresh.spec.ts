import { expect, test } from 'vitest';
import type { WorkbenchFrame } from '../examples/quickstart/runtime/workbench';
import {
  workbenchCardPath,
  workbenchCardProps,
  workbenchFreshAt,
  workbenchFreshText,
  workbenchFreshWindow,
  workbenchSettleAt,
} from '../examples/quickstart/runtime/workbench-fresh';

function frameOf(
  turn: number,
  json: string,
  status: WorkbenchFrame['status'] = 'loading',
): WorkbenchFrame {
  return { turn, json, status } as WorkbenchFrame;
}

const titleChunks = ['{"title":"Ha', '{"title":"Hash', '{"title":"Hashbrown"'];
const streaming = [
  frameOf(1, '{"title":"H'),
  frameOf(1, titleChunks[0]),
  frameOf(1, titleChunks[1]),
  frameOf(1, '{"title":"Hashbrown","steps":["Outline"'),
  frameOf(1, '{"title":"Hashbrown","steps":["Outline","Rec'),
  frameOf(1, '{"title":"Hashbrown","steps":["Outline","Record"]}', 'complete'),
];

test('a growing string reports its new suffix', () => {
  const fresh = workbenchFreshText(
    { steps: ['Outline', 'Rec'] },
    { steps: ['Outline', 'Record the'] },
  );

  expect(fresh).toEqual({ path: 'steps.1', text: 'ord the' });
});

test('a new array item reports the whole item', () => {
  const fresh = workbenchFreshText({ steps: ['A'] }, { steps: ['A', 'B'] });

  expect(fresh).toEqual({ path: 'steps.1', text: 'B' });
});

test('the last changed leaf in document order wins', () => {
  const fresh = workbenchFreshText({ a: 'x' }, { a: 'xy', b: 'z' });

  expect(fresh).toEqual({ path: 'b', text: 'z' });
});

test('no change reports nothing', () => {
  expect(workbenchFreshText({ title: 'X' }, { title: 'X' })).toBeNull();
});

test('a completed frame has no fresh text', () => {
  expect(workbenchFreshAt(streaming, 5)).toBeNull();
});

test('an errored frame has no fresh text', () => {
  const events = [frameOf(1, '{"a":"x"}'), frameOf(1, '{"a":"xy"}', 'error')];

  expect(workbenchFreshAt(events, 1)).toBeNull();
});

test('seeking back compares against the window before the new cursor', () => {
  const fresh = workbenchFreshAt(streaming, 4);

  expect(workbenchFreshWindow).toBe(3);
  expect(fresh).toEqual({ path: 'steps.1', text: 'Rec' });
});

test('the window never reaches into the previous turn', () => {
  const events = [
    frameOf(1, '{"title":"Old answer"}', 'complete'),
    frameOf(2, '{"title":"New"}'),
    frameOf(2, '{"title":"New one"}'),
  ];

  const fresh = workbenchFreshAt(events, 2);

  expect(fresh).toEqual({ path: 'title', text: ' one' });
  expect(workbenchFreshAt(events, 1)).toEqual({ path: 'title', text: 'New' });
});

test('an out of range cursor reports nothing', () => {
  expect(workbenchFreshAt(streaming, 99)).toBeNull();
});

test('a completed frame settles the last streamed text', () => {
  const settle = workbenchSettleAt(streaming, 5);

  expect(settle).toEqual(workbenchFreshAt(streaming, 4));
  expect(settle).not.toBeNull();
});

test('a streaming frame or a lone completed frame has nothing to settle', () => {
  const lone = [frameOf(1, '{"a":"x"}', 'complete')];

  expect(workbenchSettleAt(streaming, 2)).toBeNull();
  expect(workbenchSettleAt(lone, 0)).toBeNull();
});

test('a streamed UI document path maps to the card field', () => {
  const path = 'ui.0.SummaryCard.props.steps.1';

  expect(workbenchCardPath(path)).toBe('steps.1');
  expect(workbenchCardPath('title')).toBe('title');
});

test('card props come from a UI document or a plain plan', () => {
  const ui = { ui: [{ SummaryCard: { props: { title: 'T', steps: ['a'] } } }] };

  expect(workbenchCardProps(ui)).toEqual({ title: 'T', steps: ['a'] });
  expect(workbenchCardProps({ title: 'P' })).toEqual({ title: 'P' });
  expect(workbenchCardProps({})).toBeNull();
});
