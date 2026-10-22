import {
  type Aircraft,
  type AircraftSnapshot,
  AIRPORTS,
  applyAirspace,
  applySnapshot,
  distanceNm,
  findAircraft,
  type FindAircraftInput,
  INITIAL_STATE,
} from '@atc/shared';
import type { BrowserContext, Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { CHART_AIRSPACE } from '../src/chart-fixtures';
import { stubAtcFeeds } from '../src/stubs';
import {
  frame,
  NEAR_BEND,
  NO_FILTERS,
  PORTLAND_CLASS_C,
  scenario,
} from '../src/traffic-fixtures';
import { codePane, renderDirector, snapWindowStart } from './director';
import { loopArgs, masterArgs } from './encode';
import {
  APP_FOCUS,
  beatSceneName,
  STORYBOARD,
  storyboardPaths,
} from './storyboard';
import { concatList, sceneOffset, sceneSpan } from './timeline';
import {
  demoFrame,
  FILLER,
  LIVE_FRAMES,
  LIVE_SNAPSHOT,
  liveFiller,
} from './traffic';

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

test('the storyboard shows deciding, filtering and narrowing', () => {
  const ids = STORYBOARD.map((beat) => beat.id);

  const shown = ['decide', 'filter', 'narrow'].map((id) => ids.indexOf(id));

  expect(shown.every((index) => index > 0)).toBe(true);
  expect(shown).toEqual([...shown].sort((a, b) => a - b));
  const filter = STORYBOARD[ids.indexOf('filter')];
  expect(filter.kind === 'app' && filter.prompt).toBe('filter');
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

/** A level airliner over eastern Washington, clear of every scripted answer. */
function plane(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    hex: 'abc123',
    label: 'UAL123',
    callsign: 'UAL123',
    registration: null,
    typeCode: 'B738',
    category: null,
    kind: 'jet',
    lat: 46.5,
    lon: -118.5,
    altitudeFt: 30_000,
    onGround: false,
    groundSpeedKt: 450,
    trackDeg: 90,
    verticalRateFpm: 0,
    ...overrides,
  };
}

/** A point `nm` nautical miles due north of `from`. */
const northOf = (from: { lat: number; lon: number }, nm: number) => ({
  lat: from.lat + nm / 60,
  lon: from.lon,
});

/** Frames across the recording, and past the last live frame. */
const SAMPLE_FRAMES = [0, 10, 40, 80, 120, LIVE_FRAMES - 1, LIVE_FRAMES + 40];

test('the live filler is most of the captured snapshot', () => {
  const captured = new Set(LIVE_SNAPSHOT.aircraft.map((a) => a.hex));

  const kept = FILLER.filter((aircraft) => captured.has(aircraft.hex));

  expect(LIVE_SNAPSHOT.aircraft.length).toBeGreaterThan(300);
  expect(kept).toHaveLength(FILLER.length);
  expect(FILLER.length).toBeGreaterThan(LIVE_SNAPSHOT.aircraft.length * 0.75);
});

test('the live filler drops aircraft that would change an answer', () => {
  const keep = plane();
  const candidates = [
    keep,
    plane({ hex: 'b00001', ...northOf(AIRPORTS.KBDN, 10) }),
    plane({ hex: 'b00002', ...northOf(AIRPORTS.KBDN, 40), trackDeg: 180 }),
    plane({
      hex: 'b00003',
      ...northOf(AIRPORTS.KSEA, 20),
      altitudeFt: 8_000,
      verticalRateFpm: -800,
    }),
    plane({
      hex: 'b00004',
      ...northOf(AIRPORTS.KSEA, 60),
      altitudeFt: 9_000,
      verticalRateFpm: -800,
      trackDeg: 180,
    }),
    plane({ hex: 'b00005', altitudeFt: 45_000 }),
    plane({ hex: 'b00006', groundSpeedKt: 600 }),
    plane({ hex: scenario.highest.hex }),
    plane({ hex: 'b00007', callsign: 'ASA301', label: 'ASA301' }),
    plane({
      hex: 'b00008',
      ...AIRPORTS.KPDX,
      altitudeFt: 2_000,
      groundSpeedKt: 0,
    }),
  ];

  const kept = liveFiller(candidates);

  expect(kept.map((aircraft) => aircraft.hex)).toEqual([keep.hex]);
});

test('the live filler keeps the scripted answers true in every frame', () => {
  const any = { ...NO_FILTERS, limit: 20 } as const;
  const answers = (snapshot: AircraftSnapshot) => {
    const state = applyAirspace(
      applySnapshot(INITIAL_STATE, snapshot),
      CHART_AIRSPACE,
    );
    const hexes = (input: FindAircraftInput) =>
      findAircraft(state, input).map((row) => row.hex);

    return {
      nearBend: hexes({ ...any, near: NEAR_BEND, sortBy: 'distance' }),
      arrivals: hexes({ ...any, approaching: 'KSEA', sortBy: 'distance' }),
      highest: hexes({ ...any, sortBy: 'altitude' })[0],
      fastest: hexes({ ...any, sortBy: 'speed' }).filter(
        (hex) => hex !== scenario.highest.hex,
      )[0],
      portland: hexes({
        ...any,
        inAirspace: PORTLAND_CLASS_C,
        sortBy: 'distance',
      }),
    };
  };

  const pairs = SAMPLE_FRAMES.map((n) => ({
    withFiller: answers(demoFrame(n)),
    scenarioOnly: answers(frame(n)),
  }));

  for (const { withFiller, scenarioOnly } of pairs) {
    expect(withFiller).toEqual(scenarioOnly);
  }
  expect(pairs[0].withFiller).toEqual({
    nearBend: scenario.nearby.map((row) => row.hex),
    arrivals: scenario.arrivals.map((row) => row.hex),
    highest: scenario.highest.hex,
    fastest: scenario.fastest.hex,
    portland: scenario.portland.map((row) => row.hex),
  });
});

test('the live filler stays clear of the Bend ring in every frame', () => {
  const filler = new Set(FILLER.map((aircraft) => aircraft.hex));

  const nearest = Math.min(
    ...SAMPLE_FRAMES.flatMap((n) =>
      demoFrame(n)
        .aircraft.filter((aircraft) => filler.has(aircraft.hex))
        .map((aircraft) => distanceNm(aircraft, AIRPORTS.KBDN)),
    ),
  );

  expect(nearest).toBeGreaterThan(25);
});

test('the live filler holds still after the last live frame', () => {
  const mover = FILLER.find(
    (aircraft) => (aircraft.groundSpeedKt ?? 0) > 100 && !aircraft.onGround,
  );
  const at = (n: number) =>
    demoFrame(n).aircraft.find((aircraft) => aircraft.hex === mover?.hex);

  const last = at(LIVE_FRAMES - 1);
  const later = at(LIVE_FRAMES + 20);

  expect(later).toEqual(last);
  expect(at(1)).toBeDefined();
  expect(at(1)).not.toEqual(at(0));
});

test('the feed stubs serve the airspace from the chart fixtures', async () => {
  const handlers = new Map<string, (route: Route) => unknown>();
  const context = {
    route: async (url: string, handler: (route: Route) => unknown) => {
      handlers.set(url, handler);
    },
  } as unknown as BrowserContext;
  let served: unknown = null;
  const route = {
    request: () => ({ url: () => 'http://atc.test/api/chart/airspace' }),
    fulfill: async (response: unknown) => {
      served = response;
    },
  } as unknown as Route;

  await stubAtcFeeds(context, { frames: demoFrame, blockTiles: false });
  await handlers.get('**/api/chart/airspace')?.(route);

  expect(served).toEqual({ json: CHART_AIRSPACE });
});
