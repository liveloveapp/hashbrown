import { expect, test } from 'vitest';
import type { Aircraft } from './aircraft';
import { applySnapshot, INITIAL_STATE } from './store';
import {
  labelForHex,
  toolCallLabel,
  type ToolCallLike,
  toolChipView,
  toolRunView,
} from './tool-chips';

const base = {
  airline: null,
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  near: null,
  sortBy: 'distance',
  limit: 10,
};

function done(name: string, args: unknown = {}): ToolCallLike {
  return { name, args, status: 'done', result: { status: 'fulfilled' } };
}

test('toolCallLabel says what findAircraft is doing in plain words, naming airports by city', () => {
  const labels = [
    toolCallLabel('findAircraft', { ...base, approaching: 'KSEA' }),
    toolCallLabel('findAircraft', {
      ...base,
      kind: 'single',
      near: { airport: 'kbdn', radiusNm: 25 },
    }),
    toolCallLabel('findAircraft', { ...base, sortBy: 'altitude' }),
    toolCallLabel('findAircraft', {
      ...base,
      airline: 'UAL',
      typeCode: '737',
      minAltitudeFt: 10000,
      maxAltitudeFt: 30000,
    }),
  ];

  expect(labels).toEqual([
    'Finding aircraft approaching Seattle',
    'Finding single-engine aircraft within 25 nm of Bend',
    'Finding aircraft sorted by altitude',
    'Finding UAL 737 aircraft above 10,000 ft, below 30,000 ft',
  ]);
});

test('toolCallLabel names the other tools by what they do, with labels for planes', () => {
  const calls: [string, unknown][] = [
    ['lookupRoute', { callsign: ' ual1372 ' }],
    ['highlightAircraft', { hexes: ['a', 'b', 'c'] }],
    ['highlightAircraft', { hexes: ['a'] }],
    ['followAircraft', { hex: 'A1B2C3' }],
    ['followAircraft', { hex: 'ffffff' }],
    ['stopFollowing', {}],
    ['getSelectedAircraft', {}],
    ['clearHighlight', {}],
    ['lookupPlace', { query: 'Bend' }],
    ['showArea', { airport: 'kbdn', radiusNm: 25 }],
    ['showArea', { airport: 'KBDN', radiusNm: null }],
    ['resetMap', {}],
  ];
  const labelFor = (hex: string) => (hex === 'a1b2c3' ? 'UAL1802' : null);

  const labels = calls.map(([name, args]) =>
    toolCallLabel(name, args, labelFor),
  );

  expect(labels).toEqual([
    'Looking up the route of UAL1372',
    'Highlighting 3 aircraft',
    'Highlighting 1 aircraft',
    'Following UAL1802',
    'Following FFFFFF',
    'Stopping the follow',
    'Checking the selected plane',
    'Clearing the highlight',
    'Looking up Bend',
    'Showing 25 nm around Bend',
    'Showing Bend',
    'Returning to central Oregon',
  ]);
});

test('toolCallLabel falls back to a plain phrase for partial or odd arguments', () => {
  const calls: [string, unknown][] = [
    ['findAircraft', undefined],
    ['findAircraft', { approaching: null }],
    ['lookupRoute', { callsign: 42 }],
    ['highlightAircraft', { hexes: 'nope' }],
    ['followAircraft', null],
    ['someNewTool', {}],
  ];

  const labels = calls.map(([name, args]) => toolCallLabel(name, args));

  expect(labels).toEqual([
    'Finding aircraft',
    'Finding aircraft',
    'Looking up a route',
    'Highlighting aircraft',
    'Following a plane',
    'someNewTool',
  ]);
});

test('toolCallLabel shortens long free-text arguments', () => {
  const airline = 'x'.repeat(60);

  const label = toolCallLabel('findAircraft', { airline, sortBy: 'distance' });

  expect(label).toBe(`Finding ${'x'.repeat(23)}… aircraft`);
});

test('toolChipView spins only while the call is pending and the chat is busy', () => {
  const pending = {
    name: 'highlightAircraft',
    args: { hexes: ['a', 'b'] },
    status: 'pending' as const,
  };
  const failed = {
    ...pending,
    status: 'done' as const,
    result: { status: 'rejected' as const },
  };

  const states = [
    toolChipView(pending, true).state,
    toolChipView(pending, false).state,
    toolChipView(done('highlightAircraft'), true).state,
    toolChipView(failed, true).state,
  ];

  expect(states).toEqual(['running', 'stopped', 'done', 'failed']);
  expect(toolChipView(pending, true).label).toBe('Highlighting 2 aircraft');
});

test('toolRunView folds finished calls into one summary line and keeps running ones live', () => {
  const calls: ToolCallLike[] = [
    done('getSelectedAircraft'),
    done('findAircraft', { ...base, approaching: 'KSEA' }),
    ...['UAL1', 'ASA2', 'DAL3'].map((callsign) =>
      done('lookupRoute', { callsign }),
    ),
    done('highlightAircraft', { hexes: ['a', 'b'] }),
    done('highlightAircraft', { hexes: ['a', 'b', 'c'] }),
    { name: 'followAircraft', args: { hex: 'a1b2c3' }, status: 'pending' },
  ];

  const view = toolRunView(calls, true, () => 'UAL1802');

  expect(view.summary).toBe(
    'Checked the selected plane, searched traffic, looked up 3 routes, highlighted 3 aircraft',
  );
  expect(view.live).toEqual([
    { key: 'step-7', label: 'Following UAL1802', state: 'running' },
  ]);
  expect(view.chips).toHaveLength(8);
});

test('toolRunView counts failed and stopped calls, and has no summary before anything finishes', () => {
  const failed: ToolCallLike = {
    name: 'lookupRoute',
    args: { callsign: 'UAL1' },
    status: 'done',
    result: { status: 'rejected' },
  };
  const pending: ToolCallLike = {
    name: 'showArea',
    args: { airport: 'KBDN', radiusNm: 25 },
    status: 'pending',
  };

  const first = toolRunView([pending], true);
  const settled = toolRunView(
    [done('lookupPlace', { query: 'Bend' }), failed, pending],
    false,
  );
  const places = toolRunView(
    [
      done('lookupPlace', { query: 'Bend' }),
      done('lookupPlace', { query: 'Redmond' }),
      done('showArea', { airport: 'KBDN' }),
      done('followAircraft', { hex: 'a1b2c3' }),
      done('stopFollowing'),
      done('clearHighlight'),
      done('resetMap'),
    ],
    false,
  );

  expect(first.summary).toBeNull();
  expect(first.live).toHaveLength(1);
  expect(settled.summary).toBe('Looked up Bend, 1 failed, 1 stopped');
  expect(settled.live).toEqual([]);
  expect(places.summary).toBe(
    'Looked up 2 places, showed Bend, followed A1B2C3, stopped following, cleared the highlight, returned to central Oregon',
  );
});

test('labelForHex names live planes by label and others not at all', () => {
  const plane = {
    hex: 'a1b2c3',
    label: 'UAL1802',
  } as unknown as Aircraft;
  const state = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [plane] });

  const labelFor = labelForHex(state);

  expect([labelFor('A1B2C3'), labelFor('ffffff')]).toEqual(['UAL1802', null]);
});

test('toolRunView names the current step and counts the steps for the summary', () => {
  const running: ToolCallLike = {
    name: 'findAircraft',
    args: { ...base, approaching: 'KSEA' },
    status: 'pending',
  };
  const calls = [done('lookupPlace', { query: 'Seattle' }), running];

  const busy = toolRunView(calls, true);
  const finished = toolRunView(
    [...calls.slice(0, 1), done('findAircraft'), done('highlightAircraft')],
    false,
  );
  const one = toolRunView([done('resetMap')], false);

  expect(busy.current).toBe('Finding aircraft approaching Seattle…');
  expect(busy.steps).toBe('2 steps');
  expect(finished.current).toBeNull();
  expect(finished.steps).toBe('3 steps');
  expect(one.steps).toBe('1 step');
});

test('toolRunView keys each step by its tool call id, else by its position', () => {
  const calls: ToolCallLike[] = [
    { ...done('lookupPlace', { query: 'Bend' }), toolCallId: 'call-1' },
    done('showArea', { airport: 'KBDN' }),
  ];

  const view = toolRunView(calls, false);

  expect(view.chips.map((chip) => chip.key)).toEqual(['call-1', 'step-1']);
});
