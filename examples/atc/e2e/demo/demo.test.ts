import {
  AIRPORTS,
  applySnapshot,
  distanceNm,
  findAircraft,
  INITIAL_STATE,
} from '@atc/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { scenario } from '../src/fixtures';
import { codePane, renderDirector, snapWindowStart } from './director';
import { loopArgs, masterArgs } from './encode';
import {
  APP_FOCUS,
  beatSceneName,
  STORYBOARD,
  storyboardPaths,
} from './storyboard';
import { concatList, sceneOffset, sceneSpan } from './timeline';
import { demoFrame, FILLER, seededRandom } from './traffic';

const ATC = resolve(import.meta.dirname, '../..');
const readAtc = (path: string) => readFileSync(resolve(ATC, path), 'utf8');

test('every code pane marks exactly one line of a real atc file', () => {
  const panes = STORYBOARD.flatMap((beat) =>
    beat.kind === 'code' ? beat.panes.map((pane) => ({ beat, pane })) : [],
  );

  const rendered = panes.map(({ beat, pane }) =>
    codePane(beat.id, pane, readAtc(pane.path), 'one'),
  );

  expect(rendered).toHaveLength(panes.length);
  for (const pane of rendered) {
    expect(pane.html.match(/class="focus"/g)).toHaveLength(1);
  }
});

test('every app beat uses a known camera framing', () => {
  const names = STORYBOARD.flatMap((beat) =>
    beat.kind === 'app' ? [beat.focus, ...(beat.then ? [beat.then] : [])] : [],
  );

  const unknown = names.filter((name) => !(name in APP_FOCUS));

  expect(unknown).toEqual([]);
});

test('the storyboard opens with a title and ends with a close', () => {
  const kinds = STORYBOARD.map((beat) => beat.kind);

  const ends = [kinds[0], kinds.at(-1)];

  expect(ends).toEqual(['title', 'close']);
});

test('a code pane refuses a pattern that matches no line', () => {
  const pane = { path: 'x.ts', focal: /nope/ };

  const render = () => codePane('beat', pane, 'const a = 1;\n', 'one');

  expect(render).toThrow(/0 lines of x.ts/);
});

test('a code pane escapes HTML in source lines', () => {
  const pane = { path: 'x.tsx', focal: /<b>/ };

  const { html } = codePane('beat', pane, 'const a = <b>hi</b>;\n', 'one');

  expect(html).toContain('&lt;b&gt;');
  expect(html).not.toContain('<b>');
});

test('a window snaps back to the start of its block', () => {
  const lines = ['a', 'b', '', 'c', 'd', 'e', 'f'];

  const start = snapWindowStart(lines, 4, 5, 4);

  expect(start).toBe(3);
});

test('the director page renders every beat from the real files', () => {
  const files = Object.fromEntries(
    storyboardPaths().map((path) => [path, readAtc(path)]),
  );

  const html = renderDirector({
    files,
    wordmark: '<svg viewBox="0 0 1 1"></svg>',
    appUrl: '/angular/',
  });

  const codeBeats = STORYBOARD.filter((beat) => beat.kind === 'code');
  expect(html.match(/class="layer code/g)).toHaveLength(codeBeats.length);
  expect(html).toContain('src="/angular/"');
  expect(html).toContain('<svg class="wordmark"');
});

test('scene names number each beat', () => {
  const beat = STORYBOARD[3];

  const name = beatSceneName(3, beat);

  expect(name).toBe(`beat-03-${beat.id}`);
});

test('a concat list holds each frame until the next and trims to the span', () => {
  const frames = [
    { file: 'f0.jpg', t: 9 },
    { file: 'f2.jpg', t: 11 },
    { file: 'f1.jpg', t: 10.5 },
    { file: 'f3.jpg', t: 13 },
  ];

  const list = concatList(frames, '/frames', { start: 10, end: 12 });

  expect(list.split('\n')).toEqual([
    'ffconcat version 1.0',
    "file '/frames/f0.jpg'",
    'duration 0.5000',
    "file '/frames/f1.jpg'",
    'duration 0.5000',
    "file '/frames/f2.jpg'",
    'duration 1.0000',
    "file '/frames/f2.jpg'",
    '',
  ]);
});

test('scene spans and offsets are measured from the first scene', () => {
  const scenes = [
    { name: 'a', start: 100, end: 102 },
    { name: 'b', start: 102, end: 105 },
  ];

  const span = sceneSpan(scenes);
  const offset = sceneOffset(scenes, 'b');

  expect(span).toEqual({ start: 100, end: 105 });
  expect(offset).toBe(2);
});

test('the master clip scales the 2x frames down to the output size', () => {
  const args = masterArgs('in.ffconcat', 'out.mp4', {
    width: 1440,
    height: 810,
  });

  const filter = args[args.indexOf('-vf') + 1];

  expect(filter).toBe('scale=1440:810:flags=lanczos,setsar=1,fps=30');
});

test('a loop crossfades its tail into its head', () => {
  const args = loopArgs('in.mp4', 10, 1, 'out.mp4');

  const filter = args[args.indexOf('-filter_complex') + 1];

  expect(filter).toContain('xfade=transition=fade:duration=1.000:offset=8.000');
  expect(args[args.indexOf('-t') + 1]).toBe('9.000');
});

test('a loop refuses a clip too short for its fade', () => {
  const make = () => loopArgs('in.mp4', 2, 1, 'out.mp4');

  expect(make).toThrow(RangeError);
});

test('the seeded random source repeats', () => {
  const a = seededRandom(7);
  const b = seededRandom(7);

  const values = [a(), a(), a()];

  expect([b(), b(), b()]).toEqual(values);
});

test('filler traffic keeps the scripted answers true', () => {
  const state = applySnapshot(INITIAL_STATE, demoFrame(0));
  const any = {
    airline: null,
    typeCode: null,
    kind: null,
    minAltitudeFt: null,
    maxAltitudeFt: null,
    approaching: null,
    near: null,
    limit: 20,
  } as const;

  const nearBend = findAircraft(state, {
    ...any,
    near: { airport: 'KBDN', radiusNm: 25 },
    sortBy: 'distance',
  });
  const arrivals = findAircraft(state, {
    ...any,
    approaching: 'KSEA',
    sortBy: 'distance',
  });
  const fastest = findAircraft(state, { ...any, sortBy: 'speed' }).filter(
    (row) => row.hex !== scenario.highest.hex,
  );

  expect(nearBend.map((row) => row.hex)).toEqual(
    scenario.nearby.map((row) => row.hex),
  );
  expect(arrivals.map((row) => row.hex)).toEqual(
    scenario.arrivals.map((row) => row.hex),
  );
  expect(fastest[0].hex).toBe(scenario.fastest.hex);
});

test('filler traffic stays clear of the Bend ring', () => {
  const nearest = Math.min(
    ...FILLER.map((aircraft) => distanceNm(aircraft, AIRPORTS.KBDN)),
  );

  const clear = nearest > 25;

  expect(clear).toBe(true);
});
