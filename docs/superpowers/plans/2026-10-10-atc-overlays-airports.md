# atc Chart Overlays Part 1 (Foundation and Airports) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw about 300 Pacific Northwest public-use airports on atc's map as
FAA sectional chart symbols with data blocks. When zoomed in, draw accurately
sized airport diagrams. Add a layers control, and give the assistant
`showAirport`, `setLayers` and an AirportCard.

**Architecture:** Two new cached server routes turn FAA NASR (airports, runways,
frequencies), FAA ADDS (`AM_*` airport-mapping outlines) and OpenStreetMap
(Overpass) data into compact JSON. The browser loads the airports once into new
store slices (`chart`, `surfaces`, `layers`). It fetches one airport's diagram
when that airport is on screen at zoom 12 or more. Pure, framework-free modules
build symbols, data blocks and decluttering; `airspace-map.ts` composes them.
Tools read the same store.

**Tech Stack:** TypeScript, Leaflet 1.9 (already a dependency), Express (dev
server), Vercel Node functions, Vitest, Playwright, Angular (signals),
React 19, Hashbrown (`@hashbrownai/core` Skillet `s`).

**Spec:** `docs/superpowers/specs/2026-10-10-atc-overlays-airports-design.md`
(read it first). Research behind it is in `docs/superpowers/research/atc-overlays/`.

## Global Constraints

- No new npm dependencies in any package. Zip reading uses `node:zlib`; CSV
  parsing is hand-written.
- Tests use top-level `test(...)` only, with arrange, act and assert separated by
  blank lines. Never use `describe`, `it`, `beforeEach` or `afterEach`.
- Every new exported function, type or constant has a TSDoc block (`/** ... */`).
- Prefer immutability and pure functions. Reducers return new objects, and inputs
  are never mutated.
- Shared code (`examples/atc/shared`) stays framework-free. The Angular and React
  apps stay thin and mirror each other.
- LLA design rules: no `uppercase` (CSS or class), no positive letter-spacing, no
  gradients, shadows or glass, no dark-mode queries, only Hanken Grotesk and
  JetBrains Mono, and no em or en dashes in scanned source.
- Chart colours, measured from the sectional:
  - `--atc-chart-blue: #086CA8` for towered airports
  - `--atc-chart-magenta: #76334F` for non-towered airports
  - `--atc-diagram-pavement: #CFCFCF`
  - `--atc-diagram-hotspot: #955101`

  These hexes appear only in `shared/src/styles/chart.css`. TypeScript reads them
  from CSS custom properties at runtime.

- Cobalt (`--atc-accent`) is never used to fill or recolour a chart symbol.
- Text from upstream data reaches the DOM only through `textContent` or framework
  text bindings, never `innerHTML`. Marker HTML strings may contain only numbers
  and fixed literals.
- Data blocks keep NASR's own capitals, and CSS `text-transform` is never used.
- Commands: `npx nx <target> <project>`, where the projects are `atc-shared`,
  `atc-server`, `atc-angular`, `atc-react`, `atc-e2e` and `atc`.
- Commits use conventional messages scoped to `atc` and end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- An airport with no ICAO code (for example Sisters, `6K5`) must still resolve,
  draw and serve surfaces under its FAA ident. Pinned in Task 4 (`code` falls back
  to the FAA ident) and Task 2 (`lookupPlace` matches `6K5`).
- A query that matches both the alias table and a chart airport (for example
  "SeaTac", or Seattle with KSEA and KBFI) keeps today's priority: the first
  `AIRPORT_CODES` entry wins. Pinned in Task 2.
- When `/api/chart/airports` fails on first load, the tools still work on the
  40-airport fallback, and nothing draws chart colour. Pinned in Task 7
  (`limited` status) and Task 9 (fallback symbols are ink rings).
- When a user zooms or drags during `showAirport`'s fit, the move is cancelled
  like any other view request, and following a plane blocks it. Pinned in Task 3
  (reducer) and Task 11 (tool refusal).
- Runway numbers such as `05/23` versus OSM's `5/23`, and helipads (`H1`), must
  not produce symbol bars or bogus runway rows. Pinned in Task 4 (helipads
  skipped for non-heliports) and Task 8 (bearing from end coordinates, not from
  the name).

---

## File structure

```
examples/atc/shared/src/
  chart/
    types.ts            ChartAirport, Runway, Surfaces, Layers, ChartState types
    cycle.ts            currentCycle(date) for the 28-day AIRAC/NASR cycle
    runway-geometry.ts  runwayCorners, runwayBearing, metresPerPixel
    parse.ts            parseChartAirports, parseSurfaces (browser-side validation)
    chart-feed.ts       startChartFeed (airports with retry), loadSurfaces
    index.ts            barrel, re-exported from shared/src/index.ts
  places.ts             (modified) fallback table, Airport type, lookupPlace(query, directory)
  directory.ts          airportDirectory(state), airportByCode(state, code)
  store.ts              (modified) chart, surfaces, layers slices; 'airport' view request
  views.ts              (modified) arrivals use airportByCode; airportCardView
  find-aircraft.ts      (modified) approaching: s.string; directory lookups
  contracts.ts          (modified) ArrivalsBoard airport: s.string; airportCardContract; prompt
  tools.ts              (modified) lookupPlace, showAirport, setLayers
  tool-chips.ts         (modified) labels for showAirport, setLayers
  feed.ts               (modified) startAtcFeed also starts the chart feed
  map/chart/
    airport-symbol.ts   airportSymbol(airport) -> { className, html }
    data-block.ts       dataBlockLines(airport) and renderDataBlock(doc, lines)
    declutter.ts        visibleAirports, placeBlocks
    chart-colours.ts    chartColours(element) reads CSS tokens
    airport-layer.ts    createAirportLayer: symbols and blocks, redraw on zoom
    diagram-layer.ts    createDiagramLayer: runways, surfaces, labels at z>=12
    layers-control.ts   createLayersControl: the Layers pill
  map/airspace-map.ts   (modified) panes, composes the chart modules
  map/view-controller.ts (modified) 'airport' requests
  map/tiles.ts          (modified) attribution
  styles/chart.css      chart tokens and chart-layer styles
  styles/atc.css        (modified) imports chart.css after markers.css
  styles/cards.css      (modified) AirportCard styles
  design-rules.test.ts  (modified) chart-colour allowlist rule
examples/atc/server/src/
  chart/zip.ts          readZipEntries(buffer) via node:zlib
  chart/csv.ts          parseCsv(text) -> records keyed by header
  chart/nasr.ts         buildChartAirports({ aptBase, aptRwy, aptRwyEnd, frq }, area)
  chart/upstream.ts     fetchNasr, fetchAddsAirport, fetchAmSurfaces, fetchOsmSurfaces
  chart/surfaces.ts     amToSurfaces, osmToSurfaces (pure)
  chart/cached-loader.ts createCachedLoader (fresh, stale, in-flight sharing)
  chart-airports-handler.ts   /api/chart/airports
  chart-surfaces-handler.ts   /api/chart/surfaces
  vercel/chart-airports.ts, vercel/chart-surfaces.ts
  app.ts                (modified) mounts both routes
examples/atc/tools/build-vercel-output.mts (modified) two functions under api/chart/
examples/atc/angular/src/app/components/airport-card.ts (+ spec)
examples/atc/react/src/components/airport-card.tsx (+ test)
examples/atc/angular/src/app/assistant.ts, react/src/assistant.tsx (modified)
examples/atc/e2e/src/fixtures.ts, atc.spec.ts (modified)
examples/atc/README.md, AGENTS.md, the spec (modified)
```

---

### Task 1: Chart types, cycle and runway geometry

**Files:**

- Create: `examples/atc/shared/src/chart/types.ts`
- Create: `examples/atc/shared/src/chart/cycle.ts`
- Create: `examples/atc/shared/src/chart/runway-geometry.ts`
- Create: `examples/atc/shared/src/chart/index.ts`
- Modify: `examples/atc/shared/src/index.ts` (add `export * from './chart';`)
- Test: `examples/atc/shared/src/chart/cycle.test.ts`
- Test: `examples/atc/shared/src/chart/runway-geometry.test.ts`

**Interfaces:**

- Produces (types.ts, used by every later task):

```ts
import type { LatLon } from '../places';

/** One end of a runway: its number and surveyed threshold position. */
export interface RunwayEnd extends LatLon {
  /** Runway end number as NASR writes it, such as "05" or "23". */
  readonly id: string;
}

/** A runway with its true-size outline. */
export interface Runway {
  /** NASR runway ID, such as "05/23". */
  readonly id: string;
  readonly lengthFt: number;
  readonly widthFt: number;
  /** NASR surface code, such as "ASPH" or "TURF", or null. */
  readonly surface: string | null;
  /** True for asphalt, concrete or other paved surfaces. */
  readonly hard: boolean;
  /** Both ends, or null when NASR has no surveyed ends. */
  readonly ends: readonly [RunwayEnd, RunwayEnd] | null;
  /** Four outline corners (true size), or null without ends. */
  readonly corners: readonly LatLon[] | null;
  /** True bearing from the first end to the second, 0 to 360, or null. */
  readonly bearingDeg: number | null;
}

/** An airport's published frequencies in MHz as text, or null. */
export interface Frequencies {
  readonly tower: string | null;
  readonly atis: string | null;
  readonly ctaf: string | null;
  readonly unicom: string | null;
}

/** An automated weather station on the field, such as AWOS-3 134.425. */
export interface FieldWeather {
  readonly kind: string;
  readonly frequency: string;
}

/** What kind of landing facility: drawn with different symbols. */
export type FacilityKind = 'airport' | 'heliport' | 'seaplane';

/** How the field is lit: L (sunset to sunrise), *L (limited) or none. */
export type Lighting = 'full' | 'limited' | 'none';

/** A public-use airport from FAA NASR, as the chart draws it. */
export interface ChartAirport extends LatLon {
  /** ICAO code, or the FAA ident when there is none (such as 6K5). */
  readonly code: string;
  /** FAA location identifier, such as RDM. */
  readonly faa: string;
  readonly name: string;
  readonly city: string;
  readonly state: string;
  readonly aliases: readonly string[];
  readonly elevationFt: number;
  readonly kind: FacilityKind;
  readonly towered: boolean;
  readonly towerPartTime: boolean;
  readonly frequencies: Frequencies;
  readonly weather: FieldWeather | null;
  readonly lighting: Lighting;
  readonly fuel: boolean;
  readonly military: boolean;
  readonly runways: readonly Runway[];
  /** 0 is the most important; lower ranks win label space. */
  readonly rank: number;
}

/** The `/api/chart/airports` payload. */
export interface ChartAirports {
  /** AIRAC cycle ident, such as "2610". */
  readonly cycle: string;
  /** Effective date, YYYY-MM-DD. */
  readonly effective: string;
  readonly airports: readonly ChartAirport[];
}

/** A drawn surface feature. Coordinates are [lon, lat] like GeoJSON. */
export type SurfaceFeature =
  | {
      readonly kind: 'taxiway' | 'apron' | 'hotspot';
      readonly shape: 'polygon';
      readonly rings: readonly (readonly (readonly [number, number])[])[];
      readonly ref: string | null;
    }
  | {
      readonly kind: 'taxiway' | 'hold';
      readonly shape: 'line';
      readonly points: readonly (readonly [number, number])[];
      readonly ref: string | null;
      readonly widthFt: number | null;
    };

/** One airport's diagram surfaces (runways come from ChartAirport). */
export interface Surfaces {
  readonly code: string;
  /** Where taxiways and aprons came from; runways-only when neither had any. */
  readonly source: 'faa' | 'osm' | 'runways-only';
  readonly features: readonly SurfaceFeature[];
}

/** Which overlays the map draws. Later parts add keys. */
export interface Layers {
  readonly airports: boolean;
}

/** The chart data in the store. */
export interface ChartState {
  /** loading: first fetch pending; ready: FAA data; limited: fallback table. */
  readonly status: 'loading' | 'ready' | 'limited';
  readonly cycle: string | null;
  readonly airports: readonly ChartAirport[];
}
```

- Produces (cycle.ts): `currentCycle(date: Date): { ident: string; effective: string; nasrDate: string }`.
  `nasrDate` is NASR's URL date format, for example `01_Oct_2026`.
- Produces (runway-geometry.ts):
  - `runwayCorners(a: LatLon, b: LatLon, widthFt: number): LatLon[]`
  - `bearingDeg(a: LatLon, b: LatLon): number`
  - `metresPerPixel(zoom: number, lat: number): number`
  - `FT_TO_M = 0.3048`

- [ ] **Step 1: Write failing tests**

`cycle.test.ts`:

```ts
import { expect, test } from 'vitest';
import { currentCycle } from './cycle';

test('the cycle effective on 1 October 2026 is 2610', () => {
  const date = new Date(Date.UTC(2026, 9, 10));

  const cycle = currentCycle(date);

  expect(cycle).toEqual({
    ident: '2610',
    effective: '2026-10-01',
    nasrDate: '01_Oct_2026',
  });
});

test('a new cycle starts every 28 days', () => {
  const lastDay = new Date(Date.UTC(2026, 9, 28));
  const firstDay = new Date(Date.UTC(2026, 9, 29));

  const before = currentCycle(lastDay);
  const after = currentCycle(firstDay);

  expect(before.ident).toBe('2610');
  expect(after).toEqual({
    ident: '2611',
    effective: '2026-10-29',
    nasrDate: '29_Oct_2026',
  });
});

test('the first cycle of a year is numbered 01', () => {
  const date = new Date(Date.UTC(2026, 0, 23));

  const cycle = currentCycle(date);

  expect(cycle.ident).toBe('2601');
  expect(cycle.effective).toBe('2026-01-22');
});

test('cycles before the reference date count backwards', () => {
  const date = new Date(Date.UTC(2025, 11, 30));

  const cycle = currentCycle(date);

  expect(cycle.ident).toBe('2513');
  expect(cycle.effective).toBe('2025-12-25');
});
```

`runway-geometry.test.ts`:

```ts
import { expect, test } from 'vitest';
import { distanceNm } from '../geo';
import { bearingDeg, metresPerPixel, runwayCorners } from './runway-geometry';

const NM_TO_FT = 6076.12;
// KRDM runway 05/23 thresholds from NASR (7,038 ft by 150 ft).
const end05 = { lat: 44.24950936, lon: -121.16178461 };
const end23 = { lat: 44.25905422, lon: -121.13844225 };

test('runway corners are as long as the runway and as wide as its width', () => {
  const corners = runwayCorners(end05, end23, 150);

  const [a, b, c, d] = corners;
  const lengthFt = distanceNm(a!, b!) * NM_TO_FT;
  const widthFt = distanceNm(b!, c!) * NM_TO_FT;

  expect(corners).toHaveLength(4);
  expect(lengthFt).toBeGreaterThan(7038 - 15);
  expect(lengthFt).toBeLessThan(7038 + 15);
  expect(widthFt).toBeGreaterThan(148);
  expect(widthFt).toBeLessThan(152);
  expect(distanceNm(a!, d!) * NM_TO_FT).toBeCloseTo(widthFt, 0);
});

test('bearing between runway ends is the true alignment', () => {
  const bearing = bearingDeg(end05, end23);

  expect(bearing).toBeGreaterThan(58);
  expect(bearing).toBeLessThan(62);
});

test('metres per pixel halves with each zoom level', () => {
  const z10 = metresPerPixel(10, 44);
  const z11 = metresPerPixel(11, 44);

  expect(z10).toBeCloseTo(111.2, 0);
  expect(z11 * 2).toBeCloseTo(z10, 6);
});
```

(NASR gives the 05 end a true alignment of 60°.)

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npx vitest run --config examples/atc/shared/vitest.config.mts examples/atc/shared/src/chart`
Expected: FAIL with modules not found.

- [ ] **Step 3: Implement**

Write `types.ts` exactly as in Interfaces. Then write `cycle.ts`:

```ts
/** Days in one AIRAC (and NASR 28-day subscription) cycle. */
const CYCLE_DAYS = 28;
/** A known cycle start: AIRAC 2610, effective 1 October 2026 (UTC). */
const REFERENCE = Date.UTC(2026, 9, 1);
const DAY_MS = 86_400_000;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The AIRAC cycle in effect on `date`: its ident (YYNN), effective date and
 * the date as NASR writes it in subscription URLs (DD_Mon_YYYY). The first
 * cycle that starts in a year is numbered 01.
 */
export function currentCycle(date: Date): {
  ident: string;
  effective: string;
  nasrDate: string;
} {
  const offset = Math.floor((date.getTime() - REFERENCE) / DAY_MS / CYCLE_DAYS);
  const start = new Date(REFERENCE + offset * CYCLE_DAYS * DAY_MS);
  const year = start.getUTCFullYear();
  const dayOfYear = Math.floor(
    (start.getTime() - Date.UTC(year, 0, 1)) / DAY_MS,
  );
  const number = Math.floor(dayOfYear / CYCLE_DAYS) + 1;
  const day = pad(start.getUTCDate());

  return {
    ident: `${String(year).slice(2)}${pad(number)}`,
    effective: `${year}-${pad(start.getUTCMonth() + 1)}-${day}`,
    nasrDate: `${day}_${MONTHS[start.getUTCMonth()]}_${year}`,
  };
}
```

Then `runway-geometry.ts`. Use a local flat projection, which is accurate to
centimetres over a runway's length:

```ts
import type { LatLon } from '../places';

/** Feet to metres. */
export const FT_TO_M = 0.3048;
const EARTH_M = 6_371_008.8;
const RAD = Math.PI / 180;

/** Metres east and north of `origin`, on a local flat projection. */
function toLocal(origin: LatLon, point: LatLon): [number, number] {
  const x =
    (point.lon - origin.lon) * RAD * EARTH_M * Math.cos(origin.lat * RAD);
  const y = (point.lat - origin.lat) * RAD * EARTH_M;

  return [x, y];
}

function fromLocal(origin: LatLon, [x, y]: [number, number]): LatLon {
  return {
    lat: origin.lat + y / EARTH_M / RAD,
    lon: origin.lon + x / (EARTH_M * Math.cos(origin.lat * RAD)) / RAD,
  };
}

/** True bearing from `a` to `b` in degrees, 0 to 360. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const [x, y] = toLocal(a, b);

  return (Math.atan2(x, y) / RAD + 360) % 360;
}

/**
 * The four corners of a runway `widthFt` wide between threshold `a` and
 * threshold `b`, in order a-left, b-left, b-right, a-right.
 */
export function runwayCorners(a: LatLon, b: LatLon, widthFt: number): LatLon[] {
  const [bx, by] = toLocal(a, b);
  const length = Math.hypot(bx, by);
  const half = (widthFt * FT_TO_M) / 2;
  // Unit normal to the left of a->b.
  const nx = length === 0 ? 0 : -by / length;
  const ny = length === 0 ? 0 : bx / length;

  return [
    fromLocal(a, [nx * half, ny * half]),
    fromLocal(a, [bx + nx * half, by + ny * half]),
    fromLocal(a, [bx - nx * half, by - ny * half]),
    fromLocal(a, [-nx * half, -ny * half]),
  ];
}

/** Ground metres per CSS pixel on a Web Mercator map at `zoom` and `lat`. */
export function metresPerPixel(zoom: number, lat: number): number {
  return (40_075_016.686 * Math.cos(lat * RAD)) / (256 * 2 ** zoom);
}
```

`chart/index.ts`:

```ts
export * from './types';
export * from './cycle';
export * from './runway-geometry';
```

Add `export * from './chart';` to `shared/src/index.ts`, after `./places`.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run --config examples/atc/shared/vitest.config.mts examples/atc/shared/src/chart`
Expected: PASS. Then run `npx nx build atc-shared` (tsc), which must pass.

- [ ] **Step 5: Commit**

```bash
git add examples/atc/shared/src/chart examples/atc/shared/src/index.ts
git commit -m "feat(atc): chart types, AIRAC cycle and runway geometry"
```

---

### Task 2: Airport directory and dynamic airport codes

Replace the compile-time `AirportCode` union with runtime strings. A directory
reads chart airports from the store and falls back to the 40-entry table.

**Files:**

- Modify: `examples/atc/shared/src/places.ts`
- Create: `examples/atc/shared/src/directory.ts`
- Modify: `examples/atc/shared/src/store.ts` (this task adds only the `chart` slice
  and `airportByCode` usage in `allInside`; Task 3 adds the rest)
- Modify: `examples/atc/shared/src/find-aircraft.ts`, `views.ts`, `contracts.ts`,
  `tools.ts`, `map/airspace-map.ts`, `map/view-controller.ts`
- Modify: `examples/atc/angular/src/app/components/arrivals-board.ts` and
  `react/src/components/arrivals-board.tsx` (the `AirportCode` type becomes `string`)
- Modify: `examples/atc/shared/src/index.ts` (export `./directory`)
- Test: `examples/atc/shared/src/directory.test.ts`; update `places.test.ts`,
  `contracts.test.ts`, `tools.test.ts`, `views.test.ts` and `store.test.ts` where
  they use the old types or enums.

**Interfaces:**

- Consumes: `ChartAirport` and `ChartState` (Task 1).
- Produces:
  - `places.ts`:
    - `Airport` loses its `AirportCode` restriction and becomes
      `{ code: string; faa; name; city; state; aliases; lat; lon }`.
    - `AirportCode` stays as `string` (a type alias), for source compatibility.
    - `AIRPORT_CODES` stays as the fallback list in priority order.
    - `AIRPORTS: Readonly<Record<string, Airport>>` becomes the fallback table.
    - `FALLBACK_AIRPORTS: readonly Airport[]`
    - `lookupPlace(query: string, directory: readonly Airport[] = FALLBACK_AIRPORTS): Airport | null`
    - `isAirportCode` is removed (grep for callers first).
  - `directory.ts`:
    - `airportDirectory(state: AtcState): readonly Airport[]`. When
      `state.chart.status === 'ready'`, this is the chart airports with fallback
      aliases merged in by code, ordered so that the codes in `AIRPORT_CODES` come
      first in their order, then the rest by `rank`. Otherwise it is
      `FALLBACK_AIRPORTS`.
    - `airportByCode(state: AtcState, code: string): Airport | null`, matched case-insensitively on `code` or `faa`
    - `chartAirportByCode(state: AtcState, code: string): ChartAirport | null`
  - `AtcState.chart: ChartState`, initially
    `{ status: 'loading', cycle: null, airports: [] }`
  - `ShownArea.airport: string`

- [ ] **Step 1: Write failing tests** (`directory.test.ts`)

```ts
import { expect, test } from 'vitest';
import type { ChartAirport } from './chart';
import {
  airportByCode,
  airportDirectory,
  chartAirportByCode,
} from './directory';
import { FALLBACK_AIRPORTS, lookupPlace } from './places';
import { INITIAL_STATE, type AtcState } from './store';

function chartAirport(overrides: Partial<ChartAirport>): ChartAirport {
  return {
    code: 'KRDM',
    faa: 'RDM',
    name: 'ROBERTS FLD/REDMOND MUNI',
    city: 'REDMOND',
    state: 'OR',
    aliases: [],
    lat: 44.254,
    lon: -121.15,
    elevationFt: 3082,
    kind: 'airport',
    towered: true,
    towerPartTime: true,
    frequencies: {
      tower: '124.5',
      atis: '119.025',
      ctaf: '124.5',
      unicom: '122.95',
    },
    weather: null,
    lighting: 'limited',
    fuel: true,
    military: false,
    runways: [],
    rank: 0,
    ...overrides,
  };
}

const ready: AtcState = {
  ...INITIAL_STATE,
  chart: {
    status: 'ready',
    cycle: '2610',
    airports: [
      chartAirport({}),
      chartAirport({
        code: '6K5',
        faa: '6K5',
        name: 'SISTERS EAGLE AIR',
        city: 'SISTERS',
        lat: 44.288,
        lon: -121.54,
        towered: false,
        rank: 40,
      }),
      chartAirport({
        code: 'KSEA',
        faa: 'SEA',
        name: 'SEATTLE-TACOMA INTL',
        city: 'SEATTLE',
        lat: 47.45,
        lon: -122.31,
        rank: 1,
      }),
      chartAirport({
        code: 'KBFI',
        faa: 'BFI',
        name: 'BOEING FIELD/KING COUNTY INTL',
        city: 'SEATTLE',
        lat: 47.53,
        lon: -122.3,
        rank: 2,
      }),
    ],
  },
};

test('while the chart loads, the directory is the fallback table', () => {
  const directory = airportDirectory(INITIAL_STATE);

  expect(directory).toBe(FALLBACK_AIRPORTS);
});

test('a ready chart resolves airports without an ICAO code by FAA ident', () => {
  const directory = airportDirectory(ready);

  const found = lookupPlace('6K5', directory);

  expect(found?.code).toBe('6K5');
  expect(lookupPlace('Sisters', directory)?.code).toBe('6K5');
});

test('fallback aliases still resolve against the chart airports', () => {
  const directory = airportDirectory(ready);

  const found = lookupPlace('SeaTac', directory);

  expect(found?.code).toBe('KSEA');
});

test('a shared city keeps the fallback priority (Seattle is KSEA)', () => {
  const directory = airportDirectory(ready);

  const found = lookupPlace('Seattle', directory);

  expect(found?.code).toBe('KSEA');
});

test('airportByCode matches ICAO or FAA ident, ignoring case', () => {
  const byIcao = airportByCode(ready, 'krdm');
  const byFaa = airportByCode(ready, 'RDM');
  const missing = airportByCode(ready, 'KJFK');

  expect(byIcao?.code).toBe('KRDM');
  expect(byFaa?.code).toBe('KRDM');
  expect(missing).toBeNull();
});

test('chartAirportByCode is null while only the fallback is loaded', () => {
  const result = chartAirportByCode(INITIAL_STATE, 'KRDM');

  expect(result).toBeNull();
  expect(airportByCode(INITIAL_STATE, 'KRDM')?.code).toBe('KRDM');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --config examples/atc/shared/vitest.config.mts examples/atc/shared/src/directory.test.ts`
Expected: FAIL, because `./directory` doesn't exist.

- [ ] **Step 3: Implement**

1. `places.ts`:
   - Widen `Airport.code` to `string` and add `export type AirportCode = string;`.
   - Rename the internal `TABLE` to the exported `FALLBACK_AIRPORTS`; keep the
     `airport(...)` helper, but type its `code` parameter as `(typeof AIRPORT_CODES)[number]`.
   - Make `AIRPORTS` a `Record<string, Airport>`.
   - Change `lookupPlace(query, directory = FALLBACK_AIRPORTS)` so it searches
     `directory` instead of `TABLE`, with the same exact-then-prefix logic. The
     exact match must also compare `entry.code` and `entry.faa` (it already does).
   - Delete `isAirportCode` after grepping for callers.
2. `store.ts`:
   - Add `chart: ChartState` to `AtcState` and `INITIAL_STATE`.
   - Change `ShownArea.airport` to `string`.
   - In `allInside`, replace `AIRPORTS[area.airport]` with
     `airportByCode(state, area.airport)`; a null airport means "not inside".

   Avoid an import cycle: `directory.ts` imports `type { AtcState }` from
   `store.ts` as a type only, and `store.ts` imports `airportByCode` from
   `directory.ts`. That works because `directory.ts` uses only the type at runtime.

3. `directory.ts`:

```ts
import type { ChartAirport } from './chart';
import { AIRPORT_CODES, type Airport, FALLBACK_AIRPORTS } from './places';
import type { AtcState } from './store';

const cache = new WeakMap<readonly ChartAirport[], readonly ChartAirport[]>();
const PRIORITY = new Map<string, number>(
  AIRPORT_CODES.map((code, index) => [code, index]),
);
const ALIASES = new Map(FALLBACK_AIRPORTS.map((a) => [a.code, a.aliases]));

/** Chart airports with fallback aliases merged, in lookup priority order. */
function ordered(airports: readonly ChartAirport[]): readonly ChartAirport[] {
  const hit = cache.get(airports);
  if (hit) return hit;
  const result = airports
    .map((a) => ({
      ...a,
      aliases: [...a.aliases, ...(ALIASES.get(a.code) ?? [])],
    }))
    .sort(
      (a, b) =>
        (PRIORITY.get(a.code) ?? Infinity) -
          (PRIORITY.get(b.code) ?? Infinity) || a.rank - b.rank,
    );
  cache.set(airports, result);

  return result;
}

/**
 * The airports the assistant and map know: FAA chart airports once loaded,
 * else the 40-airport fallback table. Cached per airports array.
 */
export function airportDirectory(state: AtcState): readonly Airport[] {
  return state.chart.status === 'ready'
    ? ordered(state.chart.airports)
    : FALLBACK_AIRPORTS;
}

/** The airport with this ICAO code or FAA ident, ignoring case, or null. */
export function airportByCode(state: AtcState, code: string): Airport | null {
  const wanted = code.trim().toUpperCase();

  return (
    airportDirectory(state).find(
      (a) => a.code === wanted || a.faa === wanted,
    ) ?? null
  );
}

/** The FAA chart airport for a code, or null when the chart is not ready. */
export function chartAirportByCode(
  state: AtcState,
  code: string,
): ChartAirport | null {
  if (state.chart.status !== 'ready') return null;
  const wanted = code.trim().toUpperCase();

  return (
    ordered(state.chart.airports).find(
      (a) => a.code === wanted || a.faa === wanted,
    ) ?? null
  );
}
```

4. `find-aircraft.ts`:
   - Change `approaching` to
     `s.anyOf([s.string('Only aircraft on approach to this airport: ICAO code from lookupPlace'), s.nullish()])`.
   - Resolve `approaching` and `near.airport` with
     `lookupPlace(code, airportDirectory(state))`. An unknown `approaching` code
     returns `[]`, as an unknown `near` already does.
5. `views.ts`:
   - `arrivalsRows` and `boardShowsEta` take `airport: string` and resolve it
     with `airportByCode(state, airport)`.
   - When it is null, distance and ETA are `'n/a'` and `boardShowsEta` is false.
6. `contracts.ts`: change the ArrivalsBoard `airport` to
   `s.string('ICAO code from lookupPlace, such as KBDN')`. It stays non-streaming.
7. `tools.ts`:
   - Each `lookupPlace(...)` call becomes
     `lookupPlace(x, airportDirectory(store.getState()))`.
   - In `showArea`, replace `distanceNm(a, airport)` with the found airport.
   - `getSelectedAircraft` still uses `AREAS.pnw`.
8. `map/airspace-map.ts` `syncOutline` and `map/view-controller.ts` `fitArea`:
   use `airportByCode(store.getState(), shown.airport)` and skip when it is null.
9. Arrivals-board components in both apps: change the `AirportCode` import to
   `string`, or keep the alias. They compile either way.
10. Update the existing tests that assert the enum (`contracts.test.ts`,
    `tools.test.ts`) so they expect `s.string`, and add this test to
    `tools.test.ts`:

```ts
test('findAircraft with an unknown approaching airport finds nothing', async () => {
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [plane('a1')] });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const rows = await tools.findAircraft.handler({
    ...any,
    approaching: 'KJFK',
  });

  expect(rows).toEqual([]);
});
```

- [ ] **Step 4: Run all shared tests, then build**

Run: `npx nx test atc-shared && npx nx build atc-shared`
Expected: PASS. Then run `npx nx build atc-angular && npx nx build atc-react`,
which must compile.

- [ ] **Step 5: Commit**

```bash
git add examples/atc
git commit -m "refactor(atc): airport directory with runtime airport codes"
```

---

### Task 3: Store slices for chart, surfaces and layers, and airport view requests

**Files:**

- Modify: `examples/atc/shared/src/store.ts`
- Test: `examples/atc/shared/src/store.test.ts` (add tests)

**Interfaces:**

- Consumes: `ChartState`, `ChartAirports`, `Surfaces` and `Layers` (Task 1), and
  `airportByCode` (Task 2).
- Produces:
  - `AtcState.surfaces: ReadonlyMap<string, Surfaces | 'loading' | 'failed'>`
    (initially an empty map)
  - `AtcState.layers: Layers` (initially `{ airports: true }`)
  - A new `ViewRequest` variant:
    `{ readonly seq: number; readonly kind: 'airport'; readonly airport: string }`
  - Pure reducers:
    - `applyChart(state, payload: ChartAirports): AtcState` sets status `ready`.
    - `applyChartLimited(state): AtcState` sets status `limited` with no airports.
    - `applySurfaces(state, code: string, value: Surfaces | 'loading' | 'failed'): AtcState`
    - `applyLayers(state, patch: Partial<Layers>): AtcState` returns the same
      state when nothing changes.
    - `requestAirport(state, code: string): AtcState` turns the airports layer on
      and calls `requestView({ kind: 'airport', airport: code })`. It clears
      `shownArea`. While following, it drops the request, as the other
      requests do.
  - New `AtcStore` methods, each wrapping its reducer: `setChart(payload)`,
    `setChartLimited()`, `setSurfaces(code, value)`, `setLayers(patch)` and
    `showAirport(code)`.

- [ ] **Step 1: Write failing tests** (append to `store.test.ts`)

```ts
test('showing an airport turns the airports layer on and requests its view', () => {
  const hidden = applyLayers(INITIAL_STATE, { airports: false });

  const next = requestAirport(hidden, 'KRDM');

  expect(next.layers.airports).toBe(true);
  expect(next.viewRequest).toEqual({
    seq: 1,
    kind: 'airport',
    airport: 'KRDM',
  });
  expect(next.shownArea).toBeNull();
});

test('showing an airport while following drops the request', () => {
  const following = applyFollow(INITIAL_STATE, 'a1');

  const next = requestAirport(following, 'KRDM');

  expect(next.viewRequest).toBeNull();
  expect(next.layers.airports).toBe(true);
});

test('setting layers to their current values returns the same state', () => {
  const next = applyLayers(INITIAL_STATE, { airports: true });

  expect(next).toBe(INITIAL_STATE);
});

test('a chart payload makes the chart ready', () => {
  const next = applyChart(INITIAL_STATE, {
    cycle: '2610',
    effective: '2026-10-01',
    airports: [],
  });

  expect(next.chart).toEqual({ status: 'ready', cycle: '2610', airports: [] });
});

test('limited chart status keeps no airports', () => {
  const next = applyChartLimited(INITIAL_STATE);

  expect(next.chart.status).toBe('limited');
  expect(next.chart.airports).toEqual([]);
});

test('surfaces are stored per airport without touching others', () => {
  const loading = applySurfaces(INITIAL_STATE, 'KRDM', 'loading');

  const next = applySurfaces(loading, 'KBDN', 'failed');

  expect(next.surfaces.get('KRDM')).toBe('loading');
  expect(next.surfaces.get('KBDN')).toBe('failed');
  expect(loading.surfaces.has('KBDN')).toBe(false);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run --config examples/atc/shared/vitest.config.mts examples/atc/shared/src/store.test.ts`
Expected: FAIL, because the reducers are not exported.

- [ ] **Step 3: Implement** the reducers and store methods described in Interfaces.
  - Extend the `requestView` request union with
    `{ readonly kind: 'airport'; readonly airport: string }`.
  - Update the `ViewRequest` TSDoc so the 'airport' kind is listed among the
    other request kinds.
  - `applySurfaces` copies the map (`new Map(state.surfaces).set(...)`).

- [ ] **Step 4: Run the shared tests and build**

Run: `npx nx test atc-shared && npx nx build atc-shared`
Expected: PASS. TypeScript may report the view controller's `applyView` as
non-exhaustive. If so, add a temporary branch there that sets `appliedSeq` and
returns; Task 10 replaces it.

- [ ] **Step 5: Commit**

```bash
git add examples/atc/shared/src/store.ts examples/atc/shared/src/store.test.ts examples/atc/shared/src/map/view-controller.ts
git commit -m "feat(atc): chart, surfaces and layers in the store"
```

---

### Task 4: Server, zip and CSV readers plus NASR to chart airports

**Files:**

- Create: `examples/atc/server/src/chart/zip.ts`
- Create: `examples/atc/server/src/chart/csv.ts`
- Create: `examples/atc/server/src/chart/nasr.ts`
- Test: `examples/atc/server/src/chart/zip.test.ts`, `csv.test.ts`, `nasr.test.ts`

**Interfaces:**

- Consumes: `ChartAirport`, `Runway`, `runwayCorners`, `bearingDeg`, `distanceNm`
  and `AREAS` from `@atc/shared`.
- Produces:
  - `readZipEntries(zip: Uint8Array): Map<string, string>`, mapping each file
    name to its UTF-8 text. It supports stored (method 0) and deflate (method 8)
    entries, and throws `Error('Unsupported zip method N')` otherwise.
  - `parseCsv(text: string): Record<string, string>[]`. It handles quoted fields
    with commas and doubled quotes, trims trailing `\r`, and keys each record by
    the header row.
  - `requireColumns(records: Record<string, string>[], file: string, columns: string[]): void`
    throws `NasrFormatError` (exported) naming the file and the missing columns.
    An empty file counts as missing.
  - `buildChartAirports(files: { aptBase: string; aptRwy: string; aptRwyEnd: string; frq: string }, centre: LatLon, radiusNm: number): { airports: ChartAirport[]; dropped: number }`

**NASR rules** (columns verified against the 2026-10-01 CSVs):

- **Which rows count:** keep `APT_BASE` rows with `FACILITY_USE_CODE === 'PU'`,
  `ARPT_STATUS === 'O'` and `SITE_TYPE_CODE` in `A`, `H` or `C`, whose
  `LAT_DECIMAL`/`LONG_DECIMAL` lie within `radiusNm` of `centre`.
- **Codes:** `faa = ARPT_ID`, which must match `^[A-Z0-9]{2,4}$`.
  `code = ICAO_ID` when it matches `^[A-Z][A-Z0-9]{3}$`, else `faa`.
- **Kind:** `A` is airport, `H` is heliport, `C` is seaplane.
- **Name, city, state and elevation:** `name = ARPT_NAME`, `city = CITY`,
  `state = STATE_CODE`, and `elevationFt = Math.round(ELEV)`.
- **Tower:** `towered` when `TWR_TYPE_CODE` starts with `ATCT`.
- **Lighting:** `LGT_SKED === 'SS-SR'` is `full`, any other non-empty value is
  `limited`, and an empty value is `none`.
- **Fuel and military:** `fuel` when `FUEL_TYPES` is non-empty. `military` when
  `OWNERSHIP_TYPE_CODE` is in `MA`, `MN`, `MR` or `CG`.
- **Runways:** rows from `APT_RWY` joined on `SITE_NO`.
  - Skip `RWY_ID` values starting with `H` unless the facility is a heliport.
  - `lengthFt = RWY_LEN` and `widthFt = RWY_WIDTH`. Both must be positive
    numbers, or the runway is skipped.
  - `surface = SURFACE_TYPE_CODE || null`.
  - `hard` when the surface matches `/ASPH|CONC|PEM|BIT/`.
- **Runway ends:** `APT_RWY_END` rows matched on `SITE_NO` and `RWY_ID`, with
  `RWY_END_ID`, `LAT_DECIMAL` and `LONG_DECIMAL`. With exactly two finite ends,
  set `ends`, then `corners = runwayCorners(e1, e2, widthFt)` and
  `bearingDeg = bearingDeg(e1, e2)`. Otherwise all three are null.
- **Frequencies:** `FRQ` rows where `SERVICED_FACILITY === faa` and `FREQ`
  matches `^\d{3}\.\d{1,3}$`.
  - `tower` is the first row whose `FREQ_USE` starts with `LCL` and whose
    frequency is between 118 and 137.
  - `atis` is the first row with `FREQ_USE` equal to `ATIS` or `D-ATIS`.
  - `ctaf` is the first `CTAF` row, and `unicom` the first `UNICOM` row.
  - `towerPartTime` is true when a row with `FACILITY_TYPE === 'ATCT'` has a
    non-empty `TOWER_HRS` other than `24`.
  - `weather` comes from the first row with `FACILITY_TYPE === 'ASOS_AWOS'`:
    `kind` is `SERVICED_SITE_TYPE` (for example `AWOS-3` or `ASOS`) and
    `frequency` is `FREQ`.
- **Rank:** sort by towered first, then the longest hard runway descending, then
  `code`. `rank` is the index.
- **Bad rows:** rows failing validation increment `dropped` and are skipped.
- **Aliases:** `[]`, because the browser merges them.

- [ ] **Step 1: Write failing tests**

`zip.test.ts` builds a zip in the test, so no binary fixture is needed:

```ts
import { deflateRawSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { readZipEntries } from './zip';

/** A minimal zip archive with one entry per file (deflate unless `stored`). */
function makeZip(files: Record<string, string>, stored = false): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8');
    const data = stored ? raw : deflateRawSync(raw);
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);

  return new Uint8Array(Buffer.concat([...locals, centralDir, end]));
}

test('reads deflated entries by name', () => {
  const zip = makeZip({ 'APT_BASE.csv': 'a,b\n1,2\n', 'README.txt': 'hi' });

  const entries = readZipEntries(zip);

  expect(entries.get('APT_BASE.csv')).toBe('a,b\n1,2\n');
  expect(entries.get('README.txt')).toBe('hi');
});

test('reads stored entries', () => {
  const zip = makeZip({ 'FRQ.csv': 'x\n' }, true);

  const entries = readZipEntries(zip);

  expect(entries.get('FRQ.csv')).toBe('x\n');
});

test('rejects data that is not a zip', () => {
  const notZip = new Uint8Array([1, 2, 3, 4]);

  expect(() => readZipEntries(notZip)).toThrow(/zip/i);
});
```

`csv.test.ts`:

```ts
import { expect, test } from 'vitest';
import { NasrFormatError, parseCsv, requireColumns } from './csv';

test('parses quoted fields with commas and doubled quotes', () => {
  const text = '"A","B"\r\n"1,5","say ""hi"""\r\n"2",\r\n';

  const rows = parseCsv(text);

  expect(rows).toEqual([
    { A: '1,5', B: 'say "hi"' },
    { A: '2', B: '' },
  ]);
});

test('requireColumns names the file and the missing columns', () => {
  const rows = parseCsv('"A"\n"1"\n');

  const check = () =>
    requireColumns(rows, 'APT_BASE.csv', ['A', 'TWR_TYPE_CODE']);

  expect(check).toThrow(NasrFormatError);
  expect(check).toThrow(/APT_BASE\.csv.*TWR_TYPE_CODE/);
});
```

`nasr.test.ts` uses trimmed real rows. Copy these lines exactly, then fill in
the header rows from the column lists in "NASR rules", with only the columns the
parser reads plus `EFF_DATE`:

```ts
import { expect, test } from 'vitest';
import { AREAS } from '@atc/shared';
import { buildChartAirports } from './nasr';

const aptBase = [
  '"SITE_NO","SITE_TYPE_CODE","STATE_CODE","ARPT_ID","CITY","ARPT_NAME","OWNERSHIP_TYPE_CODE","FACILITY_USE_CODE","LAT_DECIMAL","LONG_DECIMAL","ELEV","ARPT_STATUS","FUEL_TYPES","LGT_SKED","TWR_TYPE_CODE","ICAO_ID"',
  '"19580.","A","OR","RDM","REDMOND","ROBERTS FLD/REDMOND MUNI","PU","PU",44.25406888,-121.14997138,3081.5,"O","100LL,A,MOGAS","SEE RMK","ATCT","KRDM"',
  '"19573.","A","OR","BDN","BEND","BEND MUNI","PU","PU",44.09456083,-121.20022111,3459.2,"O","100LL,A","SS-SR","NON-ATCT","KBDN"',
  '"19620.","A","OR","6K5","SISTERS","SISTERS EAGLE AIR","PU","PU",44.30458,-121.53925,3168,"O","","","NON-ATCT",""',
  '"99999.","A","OR","P01","NOWHERE","PRIVATE STRIP","PR","PR",44.1,-121.3,3000,"O","","","NON-ATCT",""',
  '"88888.","A","NY","JFK","NEW YORK","JOHN F KENNEDY INTL","PU","PU",40.64,-73.78,13,"O","A","SS-SR","ATCT","KJFK"',
  '"77777.","A","OR","bad!","X","BROKEN","PU","PU",44.2,-121.2,3000,"O","","","NON-ATCT",""',
].join('\n');
const aptRwy = [
  '"SITE_NO","ARPT_ID","RWY_ID","RWY_LEN","RWY_WIDTH","SURFACE_TYPE_CODE"',
  '"19580.","RDM","05/23",7038,150,"ASPH"',
  '"19580.","RDM","11/29",7006,100,"ASPH"',
  '"19580.","RDM","H1",48,48,"CONC"',
  '"19573.","BDN","17/35",5200,75,"ASPH"',
  '"19620.","6K5","02/20",3550,60,"ASPH"',
].join('\n');
const aptRwyEnd = [
  '"SITE_NO","ARPT_ID","RWY_ID","RWY_END_ID","LAT_DECIMAL","LONG_DECIMAL"',
  '"19580.","RDM","05/23","05",44.24950936,-121.16178461',
  '"19580.","RDM","05/23","23",44.25905422,-121.13844225',
  '"19573.","BDN","17/35","17",44.10172,-121.20186',
  '"19573.","BDN","17/35","35",44.08746,-121.19860',
].join('\n');
const frq = [
  '"FACILITY","FACILITY_TYPE","TOWER_HRS","SERVICED_FACILITY","SERVICED_SITE_TYPE","FREQ","FREQ_USE"',
  '"RDM","ATCT","0600-2200","RDM","AIRPORT","119.025","ATIS"',
  '"RDM","ATCT","0600-2200","RDM","AIRPORT","124.5","LCL/P"',
  '"RDM","ATCT","0600-2200","RDM","AIRPORT","256.8","LCL/P"',
  '"RDM","ATCT","","RDM","AIRPORT","122.95","UNICOM"',
  '"RDM","ATCT","","RDM","AIRPORT","124.5","CTAF"',
  '"BDN","NON-ATCT","","BDN","AIRPORT","123.0","CTAF"',
  '"BDN","ASOS_AWOS","","BDN","AWOS-3","134.425","BDN AWOS-3"',
].join('\n');

const built = buildChartAirports(
  { aptBase, aptRwy, aptRwyEnd, frq },
  AREAS.pnw,
  AREAS.pnw.radiusNm,
);
const byCode = new Map(built.airports.map((a) => [a.code, a]));

test('keeps public-use airports in the area and drops the rest', () => {
  const codes = built.airports.map((a) => a.code).sort();

  expect(codes).toEqual(['6K5', 'KBDN', 'KRDM']);
  expect(built.dropped).toBe(1);
});

test('Redmond is towered part-time with CT, ATIS and UNICOM', () => {
  const rdm = byCode.get('KRDM');

  expect(rdm).toMatchObject({
    faa: 'RDM',
    towered: true,
    towerPartTime: true,
    lighting: 'limited',
    fuel: true,
    elevationFt: 3082,
    frequencies: {
      tower: '124.5',
      atis: '119.025',
      ctaf: '124.5',
      unicom: '122.95',
    },
  });
});

test('Bend is non-towered with AWOS-3 and full lighting', () => {
  const bdn = byCode.get('KBDN');

  expect(bdn).toMatchObject({
    towered: false,
    towerPartTime: false,
    lighting: 'full',
    weather: { kind: 'AWOS-3', frequency: '134.425' },
    frequencies: { tower: null, atis: null, ctaf: '123.0', unicom: null },
  });
});

test('an airport without an ICAO code uses its FAA ident as code', () => {
  const sisters = byCode.get('6K5');

  expect(sisters?.faa).toBe('6K5');
  expect(sisters?.runways[0]).toMatchObject({
    id: '02/20',
    ends: null,
    corners: null,
    bearingDeg: null,
  });
});

test('helipads are skipped at airports and runways get true-size corners', () => {
  const rdm = byCode.get('KRDM');

  expect(rdm?.runways.map((r) => r.id)).toEqual(['05/23', '11/29']);
  expect(rdm?.runways[0]?.corners).toHaveLength(4);
  expect(rdm?.runways[0]?.bearingDeg).toBeCloseTo(60, 0);
  expect(rdm?.runways[1]?.corners).toBeNull();
});

test('towered airports rank first, then by longest hard runway', () => {
  const order = [...built.airports]
    .sort((a, b) => a.rank - b.rank)
    .map((a) => a.code);

  expect(order).toEqual(['KRDM', 'KBDN', '6K5']);
});

test('a missing column is a format error, not a silent empty result', () => {
  const broken = aptBase.replace('"TWR_TYPE_CODE",', '');

  const run = () =>
    buildChartAirports(
      { aptBase: broken, aptRwy, aptRwyEnd, frq },
      AREAS.pnw,
      250,
    );

  expect(run).toThrow(/TWR_TYPE_CODE/);
});
```

The fixture rows are trimmed to the columns the parser reads, so `requireColumns`
must check only those columns.

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run --config examples/atc/server/vitest.config.mts examples/atc/server/src/chart`
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement** `zip.ts`:

```ts
import { inflateRawSync } from 'node:zlib';

/**
 * Reads every file in a zip archive as UTF-8 text, keyed by name. Supports
 * stored and deflated entries (all NASR uses). Reads sizes from the central
 * directory, so data descriptors do not matter.
 */
export function readZipEntries(zip: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  for (
    let i = buffer.length - 22;
    i >= Math.max(0, buffer.length - 65_557);
    i--
  ) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Not a zip archive');
  const count = buffer.readUInt16LE(end + 10);
  let pointer = buffer.readUInt32LE(end + 16);
  const entries = new Map<string, string>();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50)
      throw new Error('Corrupt zip directory');
    const method = buffer.readUInt16LE(pointer + 10);
    const compressed = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString(
      'utf8',
      pointer + 46,
      pointer + 46 + nameLength,
    );
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressed);
    if (method !== 0 && method !== 8)
      throw new Error(`Unsupported zip method ${method}`);
    entries.set(
      name,
      (method === 0 ? data : inflateRawSync(data)).toString('utf8'),
    );
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
```

`csv.ts`:

- `parseCsv` uses a character-by-character state machine: fields are either
  quoted or unquoted, `""` inside quotes is a literal quote, and records split on
  `\n` outside quotes with `\r` stripped.
- Blank lines are skipped.
- `NasrFormatError extends Error`.
- `requireColumns` reads the header from `Object.keys(records[0] ?? {})`, so pass
  the header row separately when the file is empty. Simplest: have `parseCsv`
  return an array that also carries a `columns: string[]` property, typed as
  `CsvRows = Record<string, string>[] & { columns: readonly string[] }`, and have
  `requireColumns` check `rows.columns`.

`nasr.ts`:

- Implement the "NASR rules" above as small pure helpers: `airportRow`,
  `runwaysFor` and `frequenciesFor`, plus the exported `buildChartAirports`.
- Call `requireColumns` on each file first, with these columns:
  - `APT_BASE`: SITE_NO, SITE_TYPE_CODE, STATE_CODE, ARPT_ID, CITY, ARPT_NAME,
    OWNERSHIP_TYPE_CODE, FACILITY_USE_CODE, LAT_DECIMAL, LONG_DECIMAL, ELEV,
    ARPT_STATUS, FUEL_TYPES, LGT_SKED, TWR_TYPE_CODE, ICAO_ID
  - `APT_RWY`: SITE_NO, RWY_ID, RWY_LEN, RWY_WIDTH, SURFACE_TYPE_CODE
  - `APT_RWY_END`: SITE_NO, RWY_ID, RWY_END_ID, LAT_DECIMAL, LONG_DECIMAL
  - `FRQ`: FACILITY_TYPE, TOWER_HRS, SERVICED_FACILITY, SERVICED_SITE_TYPE, FREQ,
    FREQ_USE
- Group runways, ends and frequencies with `Map`s keyed by `SITE_NO` (or
  `SERVICED_FACILITY` for frequencies) before the airport loop, so the build is
  O(n).

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run --config examples/atc/server/vitest.config.mts examples/atc/server/src/chart && npx nx build atc-server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/atc/server/src/chart
git commit -m "feat(atc): read NASR airports, runways and frequencies"
```

---

### Task 5: Cached loader and the `/api/chart/airports` route

**Files:**

- Create: `examples/atc/server/src/chart/cached-loader.ts`
- Create: `examples/atc/server/src/chart/upstream.ts` (only `fetchNasr` in this task)
- Create: `examples/atc/server/src/chart-airports-handler.ts`
- Create: `examples/atc/server/src/vercel/chart-airports.ts`
- Modify: `examples/atc/server/src/app.ts`, `examples/atc/server/src/index.ts`
  (export the factory if `index.ts` exports the others)
- Modify: `examples/atc/tools/build-vercel-output.mts`
- Test: `examples/atc/server/src/chart/cached-loader.test.ts`,
  `examples/atc/server/src/chart-airports-handler.test.ts`

**Interfaces:**

- Consumes: `readZipEntries`, `buildChartAirports` (Task 4), `currentCycle`
  (Task 1) and `AREAS` (shared).
- Produces:
  - `createCachedLoader<V>(options: { load: (key: string) => Promise<V>; freshMs: number; staleLimitMs: number; now?: () => number }): (key: string) => Promise<{ value: V; stale: boolean } | null>`.
    Concurrent calls for a key share one load, and a fresh value is reused.
    When a load fails, the last value within `staleLimitMs` is returned with
    `stale: true`; otherwise the result is null. Failures are logged with
    `console.error('[atc] chart load failed', key, error)`.
  - `fetchNasr(fetchFn: typeof fetch, nasrDate: string, timeoutMs: number): Promise<{ aptBase: string; aptRwy: string; aptRwyEnd: string; frq: string }>`.
    It fetches
    `https://nfdc.faa.gov/webContent/28DaySub/extra/${nasrDate}_APT_CSV.zip` and
    `..._FRQ_CSV.zip` in parallel, with `AbortSignal.timeout(timeoutMs)` and the
    User-Agent `hashbrown-atc-example (https://hashbrown.dev)`. It throws on a
    non-ok response and pulls `APT_BASE.csv`, `APT_RWY.csv`, `APT_RWY_END.csv`
    and `FRQ.csv` out of the zips.
  - `createChartAirportsHandler(options?: { fetchFn?: typeof fetch; now?: () => number; timeoutMs?: number }): NodeHandler`.
    It answers `GET` only (405 otherwise) and keys the cache by
    `currentCycle(new Date(now())).ident`. Fresh means 24 h and the stale limit
    is 30 days. A 200 response carries a `ChartAirports` body and
    `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`, plus
    `X-Atc-Stale: 1` when stale. With nothing to serve it returns
    `502 { error: 'Chart data unavailable' }`. It logs
    `[atc] chart airports dropped N rows` when `dropped > 0`.
  - The default timeout is 25 s, because the APT zip is 8 MB.

- [ ] **Step 1: Write failing tests.**
  - `cached-loader.test.ts`: four tests mirroring `aircraft-handler.test.ts`:
    1. Concurrent calls share one load.
    2. A fresh value is reused without loading again.
    3. A failed reload serves the stale value with `stale: true`.
    4. With no value and a failed load the result is null.
       Use an injected `now`.
  - `chart-airports-handler.test.ts`:
    - Build two small zips with the `makeZip` helper, which you should move to
      `examples/atc/server/src/chart/test-zip.ts` and export so both tests share
      it. One holds the four NASR files, using the Task 4 fixture strings
      exported from a new `examples/atc/server/src/chart/nasr-fixture.ts`; the
      other holds `FRQ.csv`.
    - The stubbed `fetchFn` routes by URL suffix (`_APT_CSV.zip` or `_FRQ_CSV.zip`).
    - Tests:
      1. GET returns 200 with `cycle: '2610'`, three airports and the cache
         header.
      2. POST returns 405.
      3. With an upstream 500 and an empty cache it returns 502.
      4. After one success, an upstream failure past 24 h serves the stale copy
         with `X-Atc-Stale: 1`.
      5. The URL uses `01_Oct_2026` for `now = Date.UTC(2026, 9, 10)`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --config examples/atc/server/vitest.config.mts examples/atc/server/src/chart-airports-handler.test.ts examples/atc/server/src/chart/cached-loader.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Follow the structure and comment style of `aircraft-handler.ts`, with
    immutable cache records replaced in a `Map`.
  - In `app.ts`, add an `chart?: { fetchFn?: typeof fetch; now?: () => number }`
    option and mount
    `app.all('/api/chart/airports', (req, res) => void chartAirports(req, res).catch(() => res.destroy()))`.
  - Create `vercel/chart-airports.ts`, which exports
    `createChartAirportsHandler()` as default.
  - In `build-vercel-output.mts`, change `functions` to
    `{ route: string; entry: string; maxDuration: number }[]`:
    - `{ route: 'run', entry: 'run', maxDuration: 60 }`
    - `{ route: 'aircraft', entry: 'aircraft', maxDuration: 10 }`
    - `{ route: 'chart/airports', entry: 'chart-airports', maxDuration: 30 }`

    Then build `functions/api/${route}.func` from `server/src/vercel/${entry}.ts`.

- [ ] **Step 4: Run the tests and build**

Run: `npx nx test atc-server && npx nx build atc-server && npx nx lint atc-server`
Expected: PASS.

- [ ] **Step 5: Optional manual smoke test, not in CI**

Run `npx nx serve atc-server` and then
`curl -s localhost:4340/api/chart/airports | head -c 400`. Expected: JSON with
`"cycle":"2610"` and roughly 300 airports. Check the count with
`curl -s localhost:4340/api/chart/airports | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).airports.length))"`.
Record the count in the task report.

- [ ] **Step 6: Commit**

```bash
git add examples/atc/server examples/atc/tools/build-vercel-output.mts
git commit -m "feat(atc): /api/chart/airports from FAA NASR, cached per cycle"
```

---

### Task 6: The `/api/chart/surfaces` route (FAA airport mapping, else OSM)

**Files:**

- Create: `examples/atc/server/src/chart/surfaces.ts` (pure converters)
- Modify: `examples/atc/server/src/chart/upstream.ts` (add `fetchAddsAirport`,
  `fetchAmLayer` and `fetchOsmAeroways`)
- Create: `examples/atc/server/src/chart-surfaces-handler.ts`
- Create: `examples/atc/server/src/vercel/chart-surfaces.ts`
- Modify: `examples/atc/server/src/app.ts` and `examples/atc/tools/build-vercel-output.mts`
  (add `{ route: 'chart/surfaces', entry: 'chart-surfaces', maxDuration: 20 }`)
- Test: `examples/atc/server/src/chart/surfaces.test.ts` and
  `examples/atc/server/src/chart-surfaces-handler.test.ts`

**Interfaces:**

- Consumes: `Surfaces`, `SurfaceFeature` (Task 1) and `createCachedLoader` (Task 5).
- Produces:
  - `amToSurfaces(code: string, layers: { taxiways: unknown; aprons: unknown; hotspots: unknown }): Surfaces | null`
    - It reads the ArcGIS GeoJSON `features`, whose properties are `DESIGNATOR`
      or `HOT_ID`, with `Polygon` or `MultiPolygon` geometry.
    - A taxiway's `ref` is `DESIGNATOR` split on `_` and taking the first part.
      `UNK` and empty become null.
    - An apron's `ref` is `DESIGNATOR`.
    - A hot spot's `ref` is `HS ${HOT_ID}`.
    - A `MultiPolygon` becomes one feature per polygon.
    - It returns null when there are no taxiways.
  - `osmToSurfaces(code: string, overpass: unknown): Surfaces`
    - It reads Overpass `elements` of `type === 'way'` that have `geometry`
      (`{lat, lon}[]`) and `tags.aeroway`.
    - `apron` becomes a polygon when the way is closed (first point equals last).
    - `taxiway` and `taxilane` become `taxiway` lines with `ref = tags.ref ?? null`
      and `widthFt` from `tags.width`, which is in metres. Convert it to feet
      with `/ 0.3048`, or use null when it isn't finite.
    - `holding_position` becomes `hold` lines.
    - Coordinates are rounded to 6 decimals.
    - `source` is `osm`, or `runways-only` when no features were kept.
  - `fetchAddsAirport(fetchFn, code, timeoutMs): Promise<{ faa: string; lat: number; lon: number } | null>`
    - It queries
      `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/US_Airport/FeatureServer/0/query`
      with `where=(IDENT='X' OR ICAO_ID='X') AND PRIVATEUSE=0`, `outFields=IDENT,ICAO_ID`,
      `outSR=4326` and `f=geojson`.
    - X is the code, which has already been validated against
      `^[A-Z0-9]{2,4}$` before it reaches the URL.
    - It returns the first point, or null when there are none.
  - `fetchAmLayer(fetchFn, layer: 'AM_Taxiway' | 'AM_Apron' | 'AM_Hotspot', faa, timeoutMs): Promise<unknown>`
    queries `where=FAA_ID='${faa}'` with `outFields=DESIGNATOR,HOT_ID`,
    `outSR=4326`, `f=geojson` and `geometryPrecision=6`.
  - `fetchOsmAeroways(fetchFn, at: LatLon, timeoutMs): Promise<unknown>` POSTs
    to `https://overpass-api.de/api/interpreter` with this body:

    ```
    data=[out:json][timeout:20];way(around:3000,LAT,LON)["aeroway"~"^(taxiway|taxilane|apron|holding_position)$"];out geom tags;
    ```

    The body is URL-encoded, and the request sends the atc User-Agent.

  - `createChartSurfacesHandler(options?: { fetchFn?; now?; timeoutMs? }): NodeHandler`
    - `GET /api/chart/surfaces?airport=CODE`.
    - The code is upper-cased and must match `^[A-Z0-9]{2,4}$`; otherwise it
      returns `400 { error: 'Unknown airport' }`.
    - The cache key is the code, fresh for 24 h with a 30-day stale limit.
    - Each load calls `fetchAddsAirport`. When that returns null, the load
      resolves to the marker `UNKNOWN`, the response is 400, and the marker is
      cached too, so unknown codes don't hit upstream repeatedly.
    - It then fetches the three AM layers in parallel and runs `amToSurfaces`.
      When that is null it falls back to `fetchOsmAeroways` and `osmToSurfaces`.
    - Responses use the same cache header and stale logic as Task 5, and 502
      when there is nothing to serve.
    - The returned `code` is the requested code.

- [ ] **Step 1: Write failing tests.**
  - `surfaces.test.ts`, with inline JSON fixtures:
    - An `AM_Taxiway` feature collection with one polygon, `DESIGNATOR: 'D_B'`,
      plus one `UNK` → refs `['D', null]`, `source: 'faa'`.
    - `amToSurfaces` with zero taxiways → null.
    - An Overpass payload with a closed apron way, a taxiway `ref: 'A'`
      `width: '15.2'`, a taxilane, a holding_position and an unrelated `runway`
      way → kinds `['apron', 'taxiway', 'taxiway', 'hold']`, a taxiway `widthFt`
      of about 49.9, and the runway way ignored.
    - An empty Overpass payload → `source: 'runways-only'`.
  - `chart-surfaces-handler.test.ts`:
    - The stubbed fetch routes on `US_Airport`, `AM_Taxiway` / `AM_Apron` /
      `AM_Hotspot` and `overpass-api.de`.
    - Tests:
      1. KSEA with AM data → `source: 'faa'` and Overpass never called.
      2. KRDM with empty AM data → Overpass called once, `source: 'osm'`.
      3. `airport=K$X` → 400 and no upstream calls.
      4. An unknown but well-formed code (the US_Airport stub returns no
         features) → 400.
      5. Upstream down with an empty cache → 502.

- [ ] **Step 2: Run them and see them fail.**
      Run: `npx vitest run --config examples/atc/server/vitest.config.mts examples/atc/server/src/chart/surfaces.test.ts examples/atc/server/src/chart-surfaces-handler.test.ts`

- [ ] **Step 3: Implement**, then mount the route in `app.ts`, add the Vercel
      entry and add the build entry.

- [ ] **Step 4: Run** `npx nx test atc-server && npx nx build atc-server && npx nx lint atc-server`.
      Expected: PASS.

- [ ] **Step 5: Optional manual smoke test.** With the server running:
  - `curl -s 'localhost:4340/api/chart/surfaces?airport=KRDM' | head -c 300`
    should show `"source":"osm"`.
  - `?airport=KSEA` should show `"source":"faa"`.

  Record the byte sizes in the task report.

- [ ] **Step 6: Commit**

```bash
git add examples/atc/server examples/atc/tools/build-vercel-output.mts
git commit -m "feat(atc): /api/chart/surfaces from FAA airport mapping or OSM"
```

---

### Task 7: Browser chart feed and payload validation

**Files:**

- Create: `examples/atc/shared/src/chart/parse.ts`
- Create: `examples/atc/shared/src/chart/chart-feed.ts`
- Modify: `examples/atc/shared/src/chart/index.ts` and `examples/atc/shared/src/feed.ts`
  (`startAtcFeed` also calls `startChartFeed`)
- Test: `examples/atc/shared/src/chart/parse.test.ts`,
  `examples/atc/shared/src/chart/chart-feed.test.ts`

**Interfaces:**

- Consumes: the store methods from Task 3 and the types from Task 1.
- Produces:
  - `parseChartAirports(payload: unknown): ChartAirports`
    - It throws when `airports` is not an array or `cycle` is not a string.
    - It drops entries that fail validation:
      - `code` and `faa` must match `^[A-Z0-9]{2,4}$`.
      - `lat` and `lon` must be finite and within range.
      - `name` must be a string of at most 80 characters.
      - Frequencies must be null or match `^\d{3}\.\d{1,3}$`.
      - In a runway, `lengthFt` and `widthFt` must be finite and positive, and
        `corners` must be null or exactly four finite `LatLon`s.
    - It copies whitelisted fields only, never spreading the input.
  - `parseSurfaces(payload: unknown, code: string): Surfaces`, with the same
    whitelisting. Coordinates must be finite pairs, and `ref` must be null or
    match `^[A-Z0-9 ]{1,12}$`.
  - `CHART_RETRY_MS = [30_000, 120_000]` and `CHART_RETRY_EVERY_MS = 600_000`
  - `startChartFeed(options: { store: AtcStore; fetchFn?: typeof fetch; schedule?: (fn: () => void, ms: number) => () => void }): () => void`
    - It fetches `/api/chart/airports`; on success it calls
      `store.setChart(parseChartAirports(json))`.
    - On failure it calls `store.setChartLimited()` (only while the status is
      `loading`) and schedules retries at 30 s, then 2 min, then every 10 min,
      until one succeeds.
    - It returns a stop function. `schedule` defaults to a `setTimeout` wrapper
      and is injectable for tests.
  - `loadSurfaces(options: { store: AtcStore; code: string; fetchFn?: typeof fetch }): Promise<void>`
    - It returns at once when `store.getState().surfaces.has(code)`.
    - Otherwise it sets `'loading'`, fetches
      `/api/chart/surfaces?airport=${encodeURIComponent(code)}`, and sets the
      parsed result, or `'failed'` on any error.
  - `startAtcFeed` (in `feed.ts`) starts both feeds and returns one stop function
    that stops both. The apps don't change.

- [ ] **Step 1: Write failing tests.**
  - `parse.test.ts`:
    1. A valid minimal payload round-trips.
    2. An airport with `code: '<img>'` is dropped.
    3. An extra field `ownerPhone` isn't copied.
    4. A non-array `airports` throws.
    5. A `parseSurfaces` ref of `'A<'` becomes null.
  - `chart-feed.test.ts`, with `vi.fn` fetch and a fake `schedule` that records
    delays and lets the test run the callback:
    1. Success → status `ready`.
    2. Failure → status `limited`, then the recorded delays are
       `[30000, 120000, 600000, 600000]` across four failed retries.
    3. A retry that succeeds → status `ready`.
    4. `loadSurfaces` twice for the same code → fetch is called once.
    5. `loadSurfaces` with a 500 → `'failed'`.

- [ ] **Step 2: Run them and see them fail.**
      Run: `npx vitest run --config examples/atc/shared/vitest.config.mts examples/atc/shared/src/chart`

- [ ] **Step 3: Implement** as specified. Reuse `isRecord` from `../json`.

- [ ] **Step 4: Run** `npx nx test atc-shared && npx nx build atc-shared && npx nx lint atc-shared`.
      Expected: PASS. Existing `feed.test.ts` tests must still pass; if one asserts
      fetch call counts on `startAtcFeed`, update it to ignore `/api/chart/` URLs.

- [ ] **Step 5: Commit**

```bash
git add examples/atc/shared/src
git commit -m "feat(atc): load chart airports and diagrams in the browser"
```

---

### Task 8: Airport symbols, data blocks and decluttering (pure)

**Files:**

- Create: `examples/atc/shared/src/map/chart/airport-symbol.ts`
- Create: `examples/atc/shared/src/map/chart/data-block.ts`
- Create: `examples/atc/shared/src/map/chart/declutter.ts`
- Test: one `*.test.ts` next to each file

**Interfaces:**

- Consumes: `ChartAirport` and `Airport`.
- Produces:
  - `airportSymbol(airport: ChartAirport | Airport): { className: string; html: string; size: number }`
    - The class always includes `atc-apt`. A `ChartAirport` adds `is-towered`
      or `is-nontowered`. A fallback `Airport` (no `towered` field) adds
      `is-fallback`.
    - `html` is an SVG string built only from numbers and fixed literals, with
      `fill` and `stroke` set to `currentColor`:

      | Airport                                 | SVG                                                            |
      | --------------------------------------- | -------------------------------------------------------------- |
      | Fallback `Airport`                      | 10 px ring                                                     |
      | Heliport                                | 10 px ring with an "H" path (a path, not text)                 |
      | Seaplane base                           | Anchor path                                                    |
      | Military                                | Double ring, 12 and 6 px                                       |
      | No hard runway of 1,500 ft or more      | 10 px ring, 1.5 px stroke                                      |
      | Longest hard runway of 8,070 ft or more | 12 px disc (the zoom-11 outline is drawn by the diagram layer) |
      | Otherwise                               | 12 px disc                                                     |

    - In a disc, each hard runway with a `bearingDeg` is drawn as a white
      2 px-wide bar through the centre along that bearing. A runway without a
      bearing draws no bar. Bars use `stroke="#fff"`; white is allowed by the
      design rules.
    - `fuel` adds four 3 × 2 px ticks at N, E, S and W.
    - `size` is the icon box: 24, or 18 when there is no fuel tick and no disc.
  - `dataBlockLines(airport: ChartAirport, zoom: number): string[]`:
    - At zoom 12 and above, only `[`${name} (${faa})`]`.
    - Otherwise, line 1 is `${name} (${faa})`.
    - Line 2 is `CT ${tower}${towerPartTime ? '★' : ''}` plus ` ATIS ${atis}`
      when there is one. A non-towered field shows `${weather.kind} ${weather.frequency}`
      when it has weather, and the line is omitted when it has none.
    - Line 3 is `${elevationFt} ${L|*L}` (omitted when there is no lighting), then
      the longest-runway figure `Math.floor((maxLengthFt + 30) / 100)` (omitted
      when there are no runways), then the last frequency: for towered fields
      `unicom`, otherwise `ctaf ?? unicom` (omitted when null). Parts are joined
      with single spaces.
  - `renderDataBlock(doc: Document, lines: readonly string[], tone: 'towered' | 'nontowered' | 'fallback'): HTMLElement`
    returns a `div.atc-apt-block.is-${tone}` with one `span` per line, filled
    with `textContent` only.
  - `visibleAirports(airports: readonly ChartAirport[], zoom: number): ChartAirport[]`
    - At zoom 7 and below: towered, or a hard runway of 5,000 ft or more.
    - At zooms 8 and 9: also a hard runway of 3,000 ft or more.
    - At zoom 10 and above: all.
    - The result is sorted by `rank`.
  - `blockZoomRule(airport: ChartAirport, zoom: number): boolean`. Below zoom 8
    it is false; at zooms 8 and 9 it is `airport.towered`; at zoom 10 and above
    it is true.
  - `placeBlocks(items: readonly { code: string; x: number; y: number; lines: readonly string[] }[], symbolSize = 24): Map<string, { x: number; y: number }>`
    - Items arrive in rank order.
    - A block's box is `{ left: x + 14, top: y - 10, width: maxChars * 6.4 + 6, height: lines * 12 + 2 }`.
    - A block is placed only when its box overlaps no placed box and no other
      item's symbol box (`x ± 12`, `y ± 12`).
    - It returns the top-left of each placed block.

- [ ] **Step 1: Write failing tests**

`data-block.test.ts`:

```ts
import { expect, test } from 'vitest';
import type { ChartAirport } from '../../chart';
import { dataBlockLines, renderDataBlock } from './data-block';

const base: ChartAirport = {
  code: 'KRDM',
  faa: 'RDM',
  name: 'ROBERTS FLD/REDMOND MUNI',
  city: 'REDMOND',
  state: 'OR',
  aliases: [],
  lat: 44.25,
  lon: -121.15,
  elevationFt: 3082,
  kind: 'airport',
  towered: true,
  towerPartTime: true,
  frequencies: {
    tower: '124.5',
    atis: '119.025',
    ctaf: '124.5',
    unicom: '122.95',
  },
  weather: null,
  lighting: 'limited',
  fuel: true,
  military: false,
  rank: 0,
  runways: [
    {
      id: '05/23',
      lengthFt: 7038,
      widthFt: 150,
      surface: 'ASPH',
      hard: true,
      ends: null,
      corners: null,
      bearingDeg: 60,
    },
    {
      id: '11/29',
      lengthFt: 7006,
      widthFt: 100,
      surface: 'ASPH',
      hard: true,
      ends: null,
      corners: null,
      bearingDeg: 105,
    },
  ],
};

test('a part-time towered field reads like the sectional', () => {
  const lines = dataBlockLines(base, 10);

  expect(lines).toEqual([
    'ROBERTS FLD/REDMOND MUNI (RDM)',
    'CT 124.5★ ATIS 119.025',
    '3082 *L 70 122.95',
  ]);
});

test('a non-towered field shows its weather station and CTAF', () => {
  const bend: ChartAirport = {
    ...base,
    faa: 'BDN',
    name: 'BEND MUNI',
    towered: false,
    towerPartTime: false,
    frequencies: { tower: null, atis: null, ctaf: '123.0', unicom: null },
    weather: { kind: 'AWOS-3', frequency: '134.425' },
    elevationFt: 3459,
    runways: [{ ...base.runways[0]!, id: '17/35', lengthFt: 5200 }],
  };

  const lines = dataBlockLines(bend, 10);

  expect(lines).toEqual([
    'BEND MUNI (BDN)',
    'AWOS-3 134.425',
    '3459 *L 52 123.0',
  ]);
});

test('8,069 ft rounds to 80 and 8,070 ft to 81', () => {
  const short = { ...base, runways: [{ ...base.runways[0]!, lengthFt: 8069 }] };
  const long = { ...base, runways: [{ ...base.runways[0]!, lengthFt: 8070 }] };

  expect(dataBlockLines(short, 10)[2]).toBe('3082 *L 80 122.95');
  expect(dataBlockLines(long, 10)[2]).toBe('3082 *L 81 122.95');
});

test('at diagram zoom only the name line shows', () => {
  const lines = dataBlockLines(base, 12);

  expect(lines).toEqual(['ROBERTS FLD/REDMOND MUNI (RDM)']);
});

test('rendered blocks use text nodes, so markup in names stays text', () => {
  const lines = ['<b>X</b> (ABC)'];

  const block = renderDataBlock(document, lines, 'towered');

  expect(block.classList.contains('is-towered')).toBe(true);
  expect(block.querySelector('b')).toBeNull();
  expect(block.textContent).toBe('<b>X</b> (ABC)');
});
```

(If the shared vitest config isn't already jsdom or happy-dom, check
`examples/atc/shared/vitest.config.mts`. Map tests use the DOM, so it is.)

`airport-symbol.test.ts`:

1. `base` → className contains `is-towered`, html contains `<circle` with
   `r="6"` (a 12 px disc), two `<line` bars, four tick `<rect`s and no letters
   from the name.
2. A Bend-like airport → `is-nontowered`.
3. All runways turf → a ring (`fill="none"`).
4. A runway with `bearingDeg: null` → no bar for it.
5. A fallback `Airport` from `AIRPORTS.KBDN` → `is-fallback`, a ring and no ticks.
6. html never contains `ROBERTS` (only numbers and literals).

`declutter.test.ts`:

1. `visibleAirports` at zoom 6 keeps a towered 3,000 ft field and a non-towered
   5,500 ft field but drops a non-towered 4,000 ft one.
2. At zoom 9 it adds the 4,000 ft field.
3. At zoom 10 it keeps a turf field.
4. `placeBlocks` with two items at the same pixel places only the first.
5. Two items 300 px apart place both.
6. A block overlapping a third item's symbol is skipped.

- [ ] **Step 2: Run them and see them fail.**
      Run: `npx vitest run --config examples/atc/shared/vitest.config.mts examples/atc/shared/src/map/chart`

- [ ] **Step 3: Implement** as specified. In `airport-symbol.ts`, build bars from
      `bearingDeg` with `Math.sin` and `Math.cos`, rounding coordinates to 2 decimals,
      and centre the SVG in its `size` box.

- [ ] **Step 4: Run** `npx nx test atc-shared && npx nx build atc-shared`.
      Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/atc/shared/src/map/chart
git commit -m "feat(atc): sectional airport symbols, data blocks and decluttering"
```

---

### Task 9: Chart styles, design rule and the airport layer on the map

**Files:**

- Create: `examples/atc/shared/src/styles/chart.css`
- Modify: `examples/atc/shared/src/styles/atc.css` (`@import './chart.css';` after `markers.css`)
- Create: `examples/atc/shared/src/map/chart/chart-colours.ts`
- Create: `examples/atc/shared/src/map/chart/airport-layer.ts`
- Modify: `examples/atc/shared/src/map/airspace-map.ts` (panes and composition)
- Modify: `examples/atc/shared/src/map/tiles.ts` (attribution)
- Modify: `examples/atc/shared/src/design-rules.test.ts`
- Test: `examples/atc/shared/src/map/chart/airport-layer.test.ts`; the design-rules
  test file

**Interfaces:**

- Consumes: Tasks 3, 7 and 8.
- Produces:
  - `chartColours(element: HTMLElement): { blue: string; magenta: string; pavement: string; hotspot: string; ink: string }`
    reads `--atc-chart-blue`, `--atc-chart-magenta`, `--atc-diagram-pavement`,
    `--atc-diagram-hotspot` and `--atc-ink` through `getComputedStyle`. An empty
    value falls back to `currentColor`.
  - `createAirportLayer(options: { L: typeof Leaflet; map: LeafletMap; store: AtcStore; pane: string }): { sync(state: AtcState): void; redraw(): void; destroy(): void }`
    - `sync` acts only when `state.chart`, `state.layers` or `state.surfaces`
      changed by reference since the last sync. It never acts on aircraft
      changes.
    - `redraw` runs on `zoomend` and `moveend`.
    - It keeps one `L.marker` per airport with a `divIcon` of
      `airportSymbol(...).html`, `className: airportSymbol(...).className`,
      `interactive: false` and `keyboard: false`, created once per airports
      array. Markers are added to or removed from the map per `visibleAirports`.
    - When `layers.airports` is false, it removes everything.
    - At zoom 12 and above, an airport's symbol hides only when
      `state.surfaces.get(code)` is a loaded `Surfaces` object. While surfaces
      are loading or failed, the symbol stays, and Task 10 draws the runway
      rectangles.
    - Data blocks are a second set of markers whose `divIcon` `html` is empty;
      after adding each one, replace the icon element's children with
      `renderDataBlock`. The `iconAnchor` is computed from `placeBlocks`.
    - Fallback airports (status `limited` or `loading`) use `FALLBACK_AIRPORTS`
      with ink rings (`is-fallback`) and an ident-only text label, at all zooms.
  - Panes in `airspace-map.ts`:
    - `map.createPane('atc-airspace')` with z-index 410 (empty until part 2)
    - `atc-diagram` at 420
    - `atc-airports` at 430
    - `markerPane` is already 600, so planes stay above.
  - The attribution in `tiles.ts` gains
    `'Airport data <a href="https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/">FAA</a> · diagrams © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL) · Not for navigation'`.
    The cycle is shown in the Layers control (Task 10), not here.

**`chart.css`**:

```css
/*
 * Chart overlays: FAA sectional airport symbols and airport diagrams. The only
 * place chart colours are defined (design-rules.test.ts enforces this).
 * Values measured from the 3 Sep 2026 sectional GeoTIFFs and the FAA airport
 * diagram legend; see docs/superpowers/research/atc-overlays/.
 */
:root {
  --atc-chart-blue: #086ca8;
  --atc-chart-magenta: #76334f;
  --atc-diagram-pavement: #cfcfcf;
  --atc-diagram-hotspot: #955101;
}

.atc-map .atc-apt {
  color: var(--atc-ink);
}
.atc-map .atc-apt.is-towered {
  color: var(--atc-chart-blue);
}
.atc-map .atc-apt.is-nontowered {
  color: var(--atc-chart-magenta);
}
.atc-map .atc-apt svg {
  display: block;
  overflow: visible;
}

.atc-map .atc-apt-block {
  font-family: var(--atc-mono);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  line-height: 12px;
  white-space: nowrap;
  pointer-events: none;
}
.atc-map .atc-apt-block > span {
  display: block;
}
.atc-map .atc-apt-block > span:first-child {
  font-family: var(--atc-font);
  font-weight: 600;
  font-size: 11px;
}
.atc-map .atc-apt-block.is-towered {
  color: var(--atc-chart-blue);
}
.atc-map .atc-apt-block.is-nontowered {
  color: var(--atc-chart-magenta);
}
.atc-map .atc-apt-block.is-fallback {
  color: var(--atc-ink);
}

.atc-map .atc-diagram-label {
  font-family: var(--atc-mono);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
}
.atc-map .atc-diagram-label.is-runway {
  color: #fff;
}
.atc-map .atc-diagram-label.is-taxiway {
  color: var(--atc-ink);
  font-family: var(--atc-font);
}
.atc-map .atc-diagram-label.is-hotspot {
  color: var(--atc-diagram-hotspot);
  font-family: var(--atc-font);
}
```

The data-block element carries the airport's tone class (`is-towered`,
`is-nontowered` or `is-fallback`) from `renderDataBlock`'s `tone` parameter
(Task 8).

**The design-rules addition**, in the existing test file:

```ts
/** Chart colours and tokens, allowed only where chart features are drawn. */
const CHART_COLOUR =
  /#086ca8|#76334f|#cfcfcf|#955101|--atc-chart-|--atc-diagram-/gi;
const CHART_ALLOWED = [
  'shared/src/styles/chart.css',
  'shared/src/styles/cards.css',
  'shared/src/map/chart/',
];

test('chart colours stay on the map (and the AirportCard badge)', () => {
  const sources = [...files, ...sharedSources];

  const offenders = sources
    .filter(
      ({ file }) => !CHART_ALLOWED.some((allowed) => file.startsWith(allowed)),
    )
    .filter(({ source }) => CHART_COLOUR.test(source));

  expect(offenders.map(({ file }) => file)).toEqual([]);
});

test('chart hexes are defined only in chart.css', () => {
  const hex = /#086ca8|#76334f|#cfcfcf|#955101/gi;

  const offenders = [...files, ...sharedSources]
    .filter(({ file }) => file !== 'shared/src/styles/chart.css')
    .filter(({ source }) => hex.test(source));

  expect(offenders.map(({ file }) => file)).toEqual([]);
});
```

Reset `lastIndex` with `CHART_COLOUR.lastIndex = 0` before each `.test`, or
build the regexes without `g`. Prefer dropping the `g` flag.

- [ ] **Step 1: Write failing tests.**
  - Add the design-rules tests above. They should pass at once, which shows the
    rule works before `chart.css` exists. Then temporarily put `#086CA8` in
    `map.css`, check that the test fails, and remove it.
  - `airport-layer.test.ts` follows the setup of `map/airspace-map.fit.test.ts`
    (real Leaflet, jsdom, with the `getComputedStyle` stubs that file uses). Use
    a store with `applyChart` and three airports (KRDM towered with 7,038 ft,
    BDN non-towered with 5,200 ft, and a turf field `5S0` non-towered with
    2,000 ft):
    1. At zoom 6, `.atc-apt` count is 2 (RDM and BDN).
    2. After `map.setZoom(10)` and `redraw()`, the count is 3.
    3. `store.setLayers({ airports: false })` → count 0.
    4. Applying a new aircraft snapshot doesn't re-create markers (spy on
       `L.marker` call count).
    5. With chart status `limited`, `.atc-apt.is-fallback` count equals the
       visible fallback airports, and no element has class `is-towered`.

- [ ] **Step 2: Run them and see them fail.**
      Run: `npx vitest run --config examples/atc/shared/vitest.config.mts examples/atc/shared/src/map/chart/airport-layer.test.ts`

- [ ] **Step 3: Implement.**
  - Wire the layer into `createAirspaceMap`:
    - Create the panes after the map.
    - `const airports = createAirportLayer({ L, map, store, pane: 'atc-airports' });`
    - Call `airports.sync(state)` inside `render`, and `airports.redraw()` on
      `zoomend` and `moveend`.
    - Call `airports.destroy()` in `destroy`.
  - Update the module's TSDoc list of concerns with a line for `chart/`.

- [ ] **Step 4: Run** `npx nx test atc-shared && npx nx build atc-shared && npx nx lint atc-shared`.
      Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/atc/shared/src
git commit -m "feat(atc): sectional airport symbols and data blocks on the map"
```

---

### Task 10: Diagrams, the Layers control and airport view requests

**Files:**

- Create: `examples/atc/shared/src/map/chart/diagram-layer.ts`
- Create: `examples/atc/shared/src/map/chart/layers-control.ts`
- Modify: `examples/atc/shared/src/map/airspace-map.ts`
- Modify: `examples/atc/shared/src/map/view-controller.ts` (the `'airport'` request)
- Modify: `examples/atc/shared/src/styles/chart.css` (Layers control styles)
- Test: `examples/atc/shared/src/map/chart/diagram-layer.test.ts`,
  `layers-control.test.ts`, `examples/atc/shared/src/map/airspace-map.airport.test.ts`

**Interfaces:**

- Consumes: Tasks 3, 7, 8 and 9 (`chartColours`, `loadSurfaces`, the panes).
- Produces:
  - `DIAGRAM_ZOOM = 12` and `TAXIWAY_LABEL_ZOOM = 14`, exported from
    `diagram-layer.ts`.
  - `createDiagramLayer(options: { L; map; store; pane: string; element: HTMLElement; fetchFn?: typeof fetch }): { sync(state): void; redraw(): void; destroy(): void }`
    - Below `DIAGRAM_ZOOM`, it draws nothing.
    - At `DIAGRAM_ZOOM` and above, for each chart airport whose reference point
      is inside `map.getBounds().pad(0.2)`, it calls
      `loadSurfaces({ store, code, fetchFn })` (deduplicated by the store) and
      draws, on an `L.canvas({ pane })` renderer:
      - **Runways** from `airport.runways[].corners`: `L.polygon`, ink fill and
        stroke, `weight: 0`. When `widthFt * FT_TO_M / metresPerPixel(zoom, lat) < 3`,
        it adds an ink `L.polyline` between `ends` with `weight: 3`.
      - **Surfaces** (`Surfaces.features`):
        - Polygons (taxiway, apron) are pavement-filled with `weight: 0`.
        - Taxiway lines are pavement-coloured `L.polyline`s whose
          `weight = max(1.5, (widthFt ?? 50) * FT_TO_M / metresPerPixel)`, with
          `lineCap: 'butt'`.
        - Hold lines use `weight: 4` in ink with a pavement `weight: 1.5` line on
          top, which reads as a double bar.
        - Hot-spot polygons become an `L.circleMarker` at the vertex average,
          `radius: 9`, `color` hotspot, `fill: false`.
      - **Labels** are `L.marker` with `divIcon` and empty html; fill them with
        `textContent` after adding.
        - Runway end numbers sit 6% of the length in from each end, with class
          `atc-diagram-label is-runway`.
        - Taxiway refs appear only at `TAXIWAY_LABEL_ZOOM` and above, one per
          distinct ref per airport, at the midpoint of its longest segment, with
          class `is-taxiway`.
        - Hot-spot labels carry the `ref` text, with class `is-hotspot`.
      - Rebuild on `redraw` and on surfaces changes. Diagrams are small: tens to
        a few hundred features per airport, and only on-screen airports.
    - Colours come from `chartColours(element)` (canvas needs real colour
      strings).
    - It hides everything when `layers.airports` is false.
  - The airport layer must hide an airport's symbol at `DIAGRAM_ZOOM` and above
    only when its surfaces are loaded (the Task 9 rule).
  - At zoom 11, an airport whose longest hard runway is 8,070 ft or more is drawn
    by the diagram layer as runway outlines only (`L.polygon`, `fill: false`,
    colour blue or magenta by tower, `weight: 2`), and the airport layer hides its
    symbol at zoom 11. This is the sectional's large-airport pattern. Implement it
    as a `largeOutline` branch in both layers.
  - `createLayersControl(options: { L; map; store; position?: 'bottomright' }): { destroy(): void }`
    is an `L.Control` added before the zoom control, so it sits above it:
    - It contains a `button.atc-layers-toggle` labelled "Layers", with
      `aria-expanded` and `aria-controls`.
    - The button toggles a `div.atc-layers-panel` with
      `role="group" aria-label="Map layers"`, which contains
      `label > input[type=checkbox][name=airports] + span` reading "Airports".
      When `chart.status === 'limited'` the span reads `Airports · limited data`.
    - Under the checkbox is a muted line, `FAA cycle ${cycle}`, shown when there
      is a cycle.
    - Changing the checkbox calls `store.setLayers({ airports: checked })`.
    - Escape closes the panel and returns focus to the button.
    - Leaflet events stop inside the control: call
      `L.DomEvent.disableClickPropagation` and `disableScrollPropagation`.
    - The control subscribes to the store to keep the checkbox in sync, and
      `destroy` unsubscribes.
    - All text is set via `textContent`.
  - `view-controller.ts` handles `request.kind === 'airport'`:
    - Find the airport with `airportByCode(store.getState(), request.airport)`;
      when it is null, set `appliedSeq` and stop.
    - Bounds are the min and max of every runway corner when the airport is a
      `ChartAirport` with corners, else the point ±0.02°.
    - Compute
      `zoom = Math.min(15, Math.max(13, map.getBoundsZoom(bounds, false, L.point(2 * AREA_PADDING, 2 * AREA_PADDING + sheetInset()))))`.
    - Then make one move:
      `moveMap(() => map.setView(centreAbove(boundsCentre, zoom), zoom, { animate }))`.
      This keeps the diagram visible at zoom 13 or more and above a phone's sheet.
    - Replace the temporary branch from Task 3.
  - Styles in `chart.css` for `.atc-layers-toggle` and `.atc-layers-panel`:
    - White, a 1 px `var(--atc-border)` border, radius 999px for the toggle and
      `var(--atc-radius-row)` for the panel.
    - Hanken Grotesk 500 at 13px, a 34px minimum height (44px tap target under
      `@media (pointer: coarse)`), and the `:focus-visible` cobalt outline as the
      zoom buttons use.
    - No shadow.

- [ ] **Step 1: Write failing tests.**
  - `diagram-layer.test.ts`:
    1. At zoom 11, fetch is not called.
    2. At zoom 13 over KRDM, fetch is called once with
       `/api/chart/surfaces?airport=KRDM`.
    3. After the store holds surfaces with one taxiway line `ref: 'A'`, at zoom
       13 there are no `.is-taxiway` labels; at zoom 14 there is one.
    4. Runway number labels `05` and `23` exist at zoom 13.
    5. `setLayers({ airports: false })` removes all `.atc-diagram-label`s.
  - `layers-control.test.ts`:
    1. Clicking the toggle sets `aria-expanded="true"`.
    2. Unchecking Airports sets `store.getState().layers.airports` to false.
    3. Escape closes the panel and focuses the toggle.
    4. With status `limited`, the label reads `Airports · limited data`.
  - `airspace-map.airport.test.ts`, following `airspace-map.fit.test.ts`:
    1. `store.showAirport('KRDM')` with chart airports loaded ends with the map
       centred within 0.05° of KRDM and zoom at least 13.
    2. While following a plane, `showAirport` doesn't move the map.

- [ ] **Step 2: Run them and see them fail.**
      Run: `npx vitest run --config examples/atc/shared/vitest.config.mts examples/atc/shared/src/map`

- [ ] **Step 3: Implement**, and wire both into `createAirspaceMap` next to the
      airport layer (diagram on pane `atc-diagram`). Destroy them in `destroy`.

- [ ] **Step 4: Run** `npx nx test atc-shared && npx nx build atc-shared && npx nx lint atc-shared`.
      Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/atc/shared/src
git commit -m "feat(atc): airport diagrams, Layers control and airport views"
```

---

### Task 11: Assistant tools, AirportCard contract, prompt and chips

**Files:**

- Modify: `examples/atc/shared/src/tools.ts`
- Modify: `examples/atc/shared/src/contracts.ts`
- Modify: `examples/atc/shared/src/views.ts` (`airportCardView`)
- Modify: `examples/atc/shared/src/tool-chips.ts`
- Test: update `tools.test.ts`, `contracts.test.ts`, `views.test.ts` and
  `tool-chips.test.ts`

**Interfaces:**

- Consumes: the store methods (Task 3), the directory (Task 2) and
  `chartAirportByCode`.
- Produces:
  - `ATC_TOOL_DEFINITIONS.showAirport`:
    - name `'showAirport'`
    - description: "Show one airport on the map at diagram zoom, with its
      runways and taxiways, and turn the airports layer on. Returns its tower,
      frequencies, runways and elevation from FAA data."
    - schema: `s.object('Airport to show', { airport: s.string('ICAO code from lookupPlace, such as KRDM') })`
  - `ATC_TOOL_DEFINITIONS.setLayers`:
    - name `'setLayers'`
    - description: "Show or hide map overlays. Pass null to leave a layer as it is."
    - schema: `s.object('Layers', { airports: s.anyOf([s.boolean('Show airports'), s.nullish()]) })`
  - The `showAirport` handler:
    - Resolves the airport with `lookupPlace(airport, airportDirectory(state))`.
      When it is null, it returns `{ shown: false, reason }` from `unknownPlace`.
    - Otherwise it calls `store.showAirport(found.code)`, reads
      `chart = chartAirportByCode(state, found.code)`, and returns:

    ```ts
    {
      shown: true,
      code, name: chart?.name ?? found.name,
      towered: chart?.towered ?? null,
      towerPartTime: chart?.towerPartTime ?? null,
      frequencies: chart?.frequencies ?? null,
      elevationFt: chart?.elevationFt ?? null,
      runways: chart?.runways.map((r) => ({ id: r.id, lengthFt: r.lengthFt, widthFt: r.widthFt, surface: r.surface })) ?? [],
      diagram: surfaces?.source ?? 'runways-only',   // surfaces = loaded Surfaces for code, if any
      aircraftWithin3Nm: count of state.aircraft within 3 nm of found,
      moved: followed === null,
      ...(followed === null ? {} : { reason: followingReason(followed) }),
    }
    ```

  - The `setLayers` handler applies `{ airports }` when it isn't null, and
    returns `{ layers: store.getState().layers }`.
  - The `lookupPlace` result gains `towered: chartAirportByCode(...)?.towered ?? null`.
  - `airportCardContract`:
    - name `'AirportCard'`
    - description: "One airport: tower or CTAF, frequencies, elevation and runways, from FAA data."
    - props:
      - `note: s.streaming.string('One short sentence for the user about this airport')`
      - `airport: s.string('ICAO code from lookupPlace or showAirport, such as KRDM')`
  - `airportCardView(state: AtcState, code: string): AirportCardView`, where:

    ```ts
    export type AirportCardView =
      | { readonly status: 'unknown'; readonly code: string }
      | {
          readonly status: 'ready';
          readonly code: string;
          readonly title: string; // "ROBERTS FLD/REDMOND MUNI (RDM)"
          readonly badge: 'Towered' | 'Non-towered' | null; // null when limited
          readonly towered: boolean | null;
          readonly frequencies: readonly {
            readonly label: string;
            readonly value: string;
          }[];
          readonly elevation: string | null; // "3,082 ft"
          readonly runways: readonly string[]; // "05/23 · 7,038 × 150 ft · asphalt"
        };
    ```

    - Frequency labels, in order: `Tower` (value with `★` when part-time),
      `ATIS`, `CTAF`, `UNICOM`, then `weather.kind`. Null frequencies are skipped.
    - The surface word comes from a small map: ASPH asphalt, CONC concrete,
      TURF turf, GRVL gravel, DIRT dirt, WATER water, anything else in lower case.
    - With only a fallback airport, `status` is `ready` with `badge: null`, no
      frequencies, `elevation: null` and no runways.

  - SYSTEM_PROMPT additions, as exact lines inserted after the "When the user
    names a place..." rule:

    ```
    - For questions about an airport itself (its runways, tower, frequencies, or "show me Redmond airport"), call lookupPlace, then showAirport, then show one AirportCard. Do not repeat in prose what the card shows.
    - When the user asks to show or hide airports on the map, call setLayers.
    - Tower status, frequencies and runways come only from tool results: FAA data for the current cycle, not for navigation. Never give them from memory.
    ```

  - `STARTER_PROMPTS` gains `'Show me Redmond airport.'` as its last entry.
  - Tool chips:
    - RUNNING `showAirport`: `Showing ${code}` or 'Showing an airport'.
      `setLayers`: 'Changing map layers'.
    - DONE `showAirport`: `showed ${code}` or 'showed an airport'.
      `setLayers`: 'changed map layers'.

- [ ] **Step 1: Write failing tests**, appended to the existing files and using
      their helpers:
  - `tools.test.ts`:
    1. `ATC_TOOL_NAMES` contains `showAirport` and `setLayers` (the existing
       test covers this once the definitions are added).
    2. With a ready chart holding KRDM, `showAirport({ airport: 'Redmond' })`
       returns `shown: true`, `code: 'KRDM'`, `towered: true` and
       `runways[0].id: '05/23'`, and the store's `viewRequest.kind` is `'airport'`.
    3. While following, it returns `moved: false` with a reason, and
       `viewRequest` is null.
    4. An unknown airport returns `shown: false`.
    5. `setLayers({ airports: false })` returns `{ layers: { airports: false } }`.
    6. `setLayers({ airports: null })` leaves the layers unchanged.
  - `views.test.ts`:
    1. `airportCardView` for KRDM gives the title, `badge: 'Towered'`, a `Tower`
       frequency of `124.5★`, `elevation: '3,082 ft'` and the runway string
       `05/23 · 7,038 × 150 ft · asphalt`.
    2. An unknown code gives `status: 'unknown'`.
    3. Fallback only gives `badge: null`.
  - `contracts.test.ts`: AirportCard's `airport` is a non-streaming string, and
    the prompt mentions `showAirport` and `setLayers`.
  - `tool-chips.test.ts`: running and done labels for both tools.

- [ ] **Step 2: Run them and see them fail**, with
      `npx vitest run --config examples/atc/shared/vitest.config.mts examples/atc/shared/src`.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npx nx test atc-shared && npx nx build atc-shared && npx nx lint atc-shared && npx nx test atc-server`.
      Expected: PASS. The server pins `ATC_TOOL_DEFINITIONS`, so check that the
      server tests still pass.

- [ ] **Step 5: Commit**

```bash
git add examples/atc/shared/src
git commit -m "feat(atc): showAirport and setLayers tools, AirportCard contract"
```

---

### Task 12: AirportCard in Angular and React, registered in both core files

**Files:**

- Create: `examples/atc/angular/src/app/components/airport-card.ts`
- Create: `examples/atc/react/src/components/airport-card.tsx`
- Modify: `examples/atc/angular/src/app/assistant.ts`, `examples/atc/react/src/assistant.tsx`
- Modify: `examples/atc/shared/src/styles/cards.css` (AirportCard styles)
- Test: `examples/atc/angular/src/app/components.spec.ts`,
  `examples/atc/react/src/components.test.tsx` (add cases)

**Interfaces:**

- Consumes: `airportCardContract`, `airportCardView`, and the tools
  `showAirport` and `setLayers` from `createAtcTools`.
- Produces:
  - Angular `AirportCard` (inputs `note: input.required<string>()` and
    `airport: input.required<string>()`), plus `AirportCardFallback`.
  - React `AirportCard({ note, airport })`, plus `AirportCardFallback`.

**Markup** (the same in both frameworks; mirror `flight-card` for structure and
testids):

```html
<article
  class="atc-card atc-airport-card"
  data-testid="airport-card"
  [data-airport]="code"
  [data-status]="status"
>
  <button type="button" class="atc-pick atc-card-head">
    <!-- shows it on the map: store.showAirport(code) -->
    <span class="atc-card-title">{title}</span>
    <span class="atc-airport-badge is-towered|is-nontowered">{badge}</span>
    <!-- omitted when badge null -->
  </button>
  <p class="atc-card-note">{note}</p>
  <dl class="atc-airport-freqs atc-mono">
    <dt>{label}</dt>
    <dd>{value}</dd>
    ...
  </dl>
  <p class="atc-airport-elev atc-mono">Elevation {elevation}</p>
  <!-- when not null -->
  <ul class="atc-airport-runways atc-mono">
    <li>{runway}</li>
    ...
  </ul>
</article>
```

- The unknown status renders `<p class="atc-card-title">Unknown airport</p>`
  and the note.
- The fallback is `CardSkeleton` with the label "Identifying airport…". Mirror
  `FlightCardFallback`.

**Styles to append to `cards.css`:**

```css
.atc-airport-badge {
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 500;
}
.atc-airport-badge.is-towered {
  color: var(--atc-chart-blue);
}
.atc-airport-badge.is-nontowered {
  color: var(--atc-chart-magenta);
}
.atc-airport-freqs {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  margin: 8px 0 0;
  font-size: 13px;
}
.atc-airport-freqs dt {
  color: var(--atc-muted);
  font-family: var(--atc-font);
}
.atc-airport-freqs dd {
  margin: 0;
}
.atc-airport-elev {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--atc-muted);
}
.atc-airport-runways {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  font-size: 13px;
}
```

**Registration in both core files:**

- Import the contract and add an `exposeComponent(AirportCard, { name, description, input|props, fallback, children: false })`
  entry after AircraftCompare.
- Add `createTool(this.atc.showAirport)`, `createTool(this.atc.setLayers)`
  (Angular) and `useTool({ ...atc.showAirport, deps: [atc] })`,
  `useTool({ ...atc.setLayers, deps: [atc] })` (React) after `resetMap`.
- Keep the step 1 to 3 comments unchanged, and keep both core files at 150 lines
  or fewer.

- [ ] **Step 1: Write failing tests.** In both frameworks, with the existing test
      setup:
  1. With a store that has a ready chart with KRDM, rendering
     `AirportCard note="x" airport="KRDM"` shows the title, a `Towered` badge
     with class `is-towered`, a `Tower` row reading `124.5★`, and the runway
     `05/23 · 7,038 × 150 ft · asphalt`.
  2. Clicking the head button sets the store's `viewRequest.kind` to `'airport'`.
  3. `airport="KJFK"` shows "Unknown airport".

- [ ] **Step 2: Run them and see them fail.**
      Run: `npx nx test atc-angular && npx nx test atc-react`

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npx nx run-many -t build,test,lint -p atc-shared atc-angular atc-react`.
      Expected: PASS, including the design-rules test with the badge colour
      allowlisted via `cards.css`.

- [ ] **Step 5: Commit**

```bash
git add examples/atc
git commit -m "feat(atc): AirportCard in Angular and React"
```

---

### Task 13: End-to-end scenarios

**Files:**

- Modify: `examples/atc/e2e/src/fixtures.ts` (chart fixtures)
- Modify: `examples/atc/e2e/src/atc.spec.ts`

**Interfaces:**

- Consumes: everything above.
- Produces:
  - `CHART_AIRPORTS: ChartAirports` with cycle `'2610'`. It contains KRDM
    (towered, with the runway corners from `runwayCorners` on the Task 4 NASR
    ends and both runways), KBDN (non-towered, 17/35 with corners), KSEA
    (towered, one runway) and 6K5 (non-towered, no corners).
  - `chartSurfaces(code)`, which returns a `Surfaces` for KRDM with one taxiway
    line `ref: 'A'` running parallel to 05/23 and offset by 0.002° latitude, and
    `runways-only` otherwise.

**Scenarios.**

Routes, added in `open()`:

- `**/api/chart/airports` is fulfilled with `CHART_AIRPORTS`.
- `**/api/chart/surfaces**` is fulfilled with `chartSurfaces` of the `airport`
  query parameter.

Mock model:

- `'Show me Redmond airport.'` (the new starter) calls
  `{ id: 'airport-lookup', name: 'lookupPlace', arguments: { query: 'Redmond' } }`
  and then `{ id: 'airport-show', name: 'showAirport', arguments: { airport: 'KRDM' } }`.
  Both tool results answer with an `AirportCard` `{ note: 'Redmond has a part-time tower.', airport: 'KRDM' }`.
- `'Hide the airports.'` calls `setLayers({ airports: false })`, and its result
  answers with markdown `Airports are hidden.`. Answer with plain markdown the
  way the existing scenarios do.

Tests, run for both projects through `testInfo.project.name`:

```ts
test('shows Redmond airport as a diagram with its card', async ({
  page,
}, testInfo) => {
  await open(page, testInfo.project.name);

  await page.getByRole('button', { name: 'Show me Redmond airport.' }).click();

  const card = page.getByTestId('airport-card');
  await expect(card).toContainText('ROBERTS FLD/REDMOND MUNI (RDM)');
  await expect(card).toContainText('124.5★');
  await expect(card.locator('.atc-airport-badge')).toHaveText('Towered');
  await expect(
    page.locator('.atc-diagram-label.is-runway').first(),
  ).toBeVisible();
  await expect(page.getByText('Showed KRDM', { exact: false })).toBeVisible();
});

test('the airports layer can be hidden by the assistant', async ({
  page,
}, testInfo) => {
  await open(page, testInfo.project.name);
  await expect(page.locator('.atc-apt').first()).toBeAttached();

  await page
    .getByRole('textbox', { name: 'Message' })
    .fill('Hide the airports.');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.locator('.atc-apt')).toHaveCount(0);
});

test('the Layers control works from the keyboard', async ({
  page,
}, testInfo) => {
  await open(page, testInfo.project.name);
  const toggle = page.getByRole('button', { name: 'Layers' });

  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('checkbox', { name: 'Airports' }).press('Space');
  await page.keyboard.press('Escape');

  await expect(page.locator('.atc-apt')).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
```

Check the actual tool-chip summary text the transcript shows once the run
finishes. The existing tests use `folds tool calls into a summary`; match that
wording, which is lower case, for example `showed KRDM`.

- [ ] **Step 1: Add the fixtures and tests. Run them and see them fail** (`npx nx e2e atc-e2e`).
      The tests must fail for the right reason: before the fixture routes exist,
      `.atc-apt` is the fallback set, and after them it is the chart set.
- [ ] **Step 2: Fix anything the tests expose.**
  - Common causes: the starter count, if a test counts starters; the e2e
    `AIRPORTS` import (it still works); and existing scenarios whose chip
    summaries changed.
  - Existing tests that count `.atc-plane` or rely on map clicks must still pass,
    because airport markers are `interactive: false`.
- [ ] **Step 3: Run the whole suite**:
      `npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc && npx nx e2e atc-e2e`.
      Expected: all PASS.
- [ ] **Step 4: Commit**

```bash
git add examples/atc/e2e
git commit -m "test(atc): e2e for airport overlays, AirportCard and Layers"
```

---

### Task 14: Docs and spec alignment

**Files:**

- Modify: `examples/atc/README.md`
- Modify: `examples/atc/AGENTS.md`
- Modify: `docs/superpowers/specs/2026-10-10-atc-overlays-airports-design.md`

- [ ] **Step 1: README**
  - In "How this example is built", add these lines to the tree:
    - `src/chart/` (chart types, cycle, browser chart feed)
    - `src/map/chart/` (airport symbols, data blocks, diagrams, Layers control)
    - in `server/`: `/api/chart/airports and /api/chart/surfaces (cached FAA and OSM data)`
  - In "Data and attribution", add:
    - **Airports:** FAA NASR 28-day subscription (airports, runways,
      frequencies, tower hours) and FAA ADDS airport-mapping layers, both public
      domain. The server fetches them, caches them per AIRAC cycle and shares
      them through the CDN for a day.
    - **Airport diagrams:** at airports without FAA mapping, taxiways, aprons and
      hold lines come from OpenStreetMap through the Overpass API, under the
      ODbL. `/api/chart/surfaces` serves that derived data under the same
      licence. The query is in `server/src/chart/upstream.ts`.
    - **Not for navigation.**
  - Note that the two new routes and their Vercel functions exist, and that
    `/api/chart/*` needs no key.
- [ ] **Step 2: AGENTS.md**
  - Add rows to the file map for `shared/src/chart/`, `shared/src/map/chart/`,
    `server/src/chart/` and both handlers.
  - Add these invariants:
    - Chart colours are defined only in `styles/chart.css` and used only on
      the map and the AirportCard badge (`design-rules.test.ts`).
    - Chart layers redraw on zoom, move and chart, surfaces or layers changes,
      never on aircraft snapshots.
    - Chart symbols are never filled cobalt; selection stays on planes.
    - Airport codes are runtime strings validated by `lookupPlace` and
      `airportByCode`, never a Skillet enum.
- [ ] **Step 3: Spec alignment.** Edit the spec so it matches what was built:
  - Runway rectangles are computed from NASR runway ends (the same surveyed
    points the FAA `Runways` layer is built from), and the airports route needs
    no ADDS call.
  - `/api/chart/surfaces` returns taxiways, aprons, holds and hot spots only;
    runways come from the airports payload.
  - There is one AIRAC cycle ident (NASR's 28-day cycle) and no separate 56-day
    cycle.
  - The surfaces route validates the code against ADDS `US_Airport`.
- [ ] **Step 4: Run** `npx prettier --check examples/atc docs/superpowers` and fix
      any issues with `--write`.
- [ ] **Step 5: Commit**

```bash
git add examples/atc/README.md examples/atc/AGENTS.md docs/superpowers/specs/2026-10-10-atc-overlays-airports-design.md
git commit -m "docs(atc): chart overlay data, attribution and invariants"
```

---

## Final verification (after all tasks)

- `npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc`
- `npx nx e2e atc-e2e`
- Manual:
  - Run `atc-server` and `atc-angular`. At zoom 6, symbols for towered and large
    airports should show.
  - At zoom 10, RDM's data block should read `CT 124.5★ ATIS 119.025` in blue,
    and BDN's should show `AWOS-3 134.425` in magenta.
  - At zoom 14, KRDM's diagram should show taxiway letters.
  - Compare with `docs/superpowers/research/atc-overlays/sectional-KRDM.png`.
  - Check frame time while panning with live traffic, at 1440×900 and 375×812.
