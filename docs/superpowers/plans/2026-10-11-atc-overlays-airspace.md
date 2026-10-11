# atc Chart Overlays Part 2 (Ink Airports, Airspace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two PRs. PR A (Tasks A1 and A2) redraws airports as true-size ink
vector diagrams at every zoom. PR B (Tasks B1 to B6) adds Class B, C and D
airspace and Class E surface-area airspace, in sectional chart colours, with
assistant tools that answer airspace questions.

**Architecture:**

- **PR A** removes the SVG sectional symbols. Every zoom then uses one canvas
  runway layer with a 2 px minimum stroke, plus ink labels from the existing
  declutter.
- **PR B, server:** a new cached route, `/api/chart/airspace`, normalises the
  FAA ADDS `Class_Airspace` shelves.
- **PR B, browser:** a pure query module answers point-in-shelf questions. An
  SVG airspace layer draws CSS-styled shelves on the existing `atc-airspace`
  pane. New tools read the store.

**Tech stack:** TypeScript, Leaflet 1.9, Express and Vercel functions,
Vitest, Playwright, Angular, React 19, Hashbrown Skillet (`s`).

**Spec:** `docs/superpowers/specs/2026-10-11-atc-overlays-airspace-design.md`.
Read it first. Part 1's spec is
`docs/superpowers/specs/2026-10-10-atc-overlays-airports-design.md`.

## Global constraints

**Dependencies and code style**

- No new npm dependencies.
- Tests use top-level `test(...)` only, with arrange, act and assert
  separated by blank lines. Never use `describe`, `it`, `beforeEach` or
  `afterEach`. To clean up Leaflet maps in tests, use `onTestFinished` or
  `try`/`finally`.
- Every new export gets a TSDoc block.
- Write pure, immutable reducers and helpers.
- Shared code stays framework-free. The two apps stay thin and mirror each
  other.

**LLA design rules**

- No `uppercase`.
- No positive letter-spacing.
- No gradients, shadows or glass.
- No dark-mode queries.
- Fonts are Hanken Grotesk and JetBrains Mono only.
- No em or en dashes in scanned source.

**Chart colour hexes live only in `shared/src/styles/chart.css`.**

| Token                                  | Value     |
| -------------------------------------- | --------- |
| `--atc-chart-blue`                     | `#086CA8` |
| `--atc-chart-magenta`                  | `#76334F` |
| `--atc-chart-blue-band` (new in B4)    | `#3288B5` |
| `--atc-chart-magenta-band` (new in B4) | `#A6768E` |
| `--atc-diagram-pavement`               | `#CFCFCF` |
| `--atc-diagram-hotspot`                | `#955101` |

**Colour use**

- After PR A, airports use ink, muted and pavement colours only. Chart blue
  and magenta are used only by airspace.
- Cobalt (`--atc-accent`) is never used to fill a chart feature. A
  highlighted airspace shelf gets a cobalt casing; nothing else uses cobalt.

**Upstream data in the DOM**

- Upstream text reaches the DOM through `textContent` or framework text
  bindings only.
- Marker HTML holds only numbers and fixed literals.

**Redraw rules**

- Chart and airspace layers never redraw on aircraft snapshots. They react
  to `zoomend`, `moveend` and changes, by reference, to their store slices.
- Every dashed path uses `lineCap: 'butt'` (or `stroke-linecap: butt` in
  CSS).

**Commands and commits**

- Commands take the form `npx nx <target> <project>`. Projects: `atc-shared`,
  `atc-server`, `atc-angular`, `atc-react`, `atc-e2e`, `atc`.
- Commits are conventional, scoped to `atc`, and end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review focus

Each line names the input most likely to bite, and the task whose tests must
pin it.

- **An airport whose runway is a stroke at one zoom and a polygon at the
  next.** For example, zoom 13 to 14 at Bend, where a 75 ft runway crosses
  2 px. The length must stay true in both cases, with no doubled drawing.
  Pinned in A1.
- **An aircraft exactly at a shelf floor.** It counts as inside. An aircraft
  at an exclusive ceiling, or at 18,000 ft under a `null` ceiling, counts as
  outside. Pinned in B1.
- **An aircraft on the ground at an airport with a Class D surface shelf.**
  It is inside. An aircraft with no altitude is never inside a shelf whose
  floor is above the surface. Pinned in B1.
- **Asking about Redmond's airspace while following a plane.** It must not
  move the map, and must still return the shelves. Pinned in B5.
- **FAA paging.** A page that returns exactly the page size must fetch the
  next page. A short page stops paging. Pinned in B2.

---

## PR A: ink airports (branch `blove/atc-ink-airports`)

### Task A1: true-size ink runways at every zoom

**Files:**

- Modify: `examples/atc/shared/src/map/chart/diagram-layer.ts`. Runways at all
  zooms; the 2 px minimum; remove the large-outline branch.
- Modify: `examples/atc/shared/src/map/chart/airport-layer.ts`. The symbol
  becomes a ring, used only for airports without runway corners, heliports,
  seaplane bases and the fallback table.
- Replace: `examples/atc/shared/src/map/chart/airport-symbol.ts`. Becomes
  `airportRing(airport): { className, html }`: a 6 px ink ring, with an
  optional "H" path for heliports and an anchor path for seaplane bases.
  Numbers and fixed literals only.
- Modify: `examples/atc/shared/src/styles/chart.css`. `.atc-apt` is ink only;
  delete the `is-towered` and `is-nontowered` colour rules.
- Test: update `diagram-layer.test.ts`, `airport-layer.test.ts` and
  `airport-symbol.test.ts` (renamed with its module).

**Interfaces:**

- **Consumes:** `ChartAirport.runways[].corners`, `ends`, `widthFt`, `hard`;
  `metresPerPixel` and `FT_TO_M`; `visibleAirports(airports, zoom)` (rank
  thresholds unchanged).
- **Produces:**
  - `RUNWAY_MIN_PX = 2`, exported from `diagram-layer.ts`.
  - `runwayDrawing(runway, zoom, lat): { kind: 'polygon'; corners } | { kind: 'stroke'; ends; weight: 2 } | null`.
    - `null` when the runway has no `corners`.
    - `'stroke'` when `widthFt * FT_TO_M / metresPerPixel(zoom, lat) < RUNWAY_MIN_PX`.
    - `'polygon'` otherwise.
    - Pure and exported.
  - The diagram layer draws runways for every visible chart airport at every
    zoom. Surfaces (taxiways, aprons, holds, hot spots) still start at
    `DIAGRAM_ZOOM` (12), and taxiway letters at `TAXIWAY_LABEL_ZOOM` (14).
    Runway end numbers show only when the runway is a polygon.
  - The airport layer:
    - Draws a ring only for chart airports where every runway has
      `corners === null`, or there are no runways.
    - Draws a ring for heliports, seaplane bases and all fallback airports.
    - Draws no ring for other airports; their runways are the symbol.
  - `drawsLargeOutline` is deleted, along with every caller.

- [ ] **Step 1: write failing tests.**
  - `runwayDrawing` for KRDM 05/23 (150 ft wide, at lat 44.25):
    - zoom 10 → `'stroke'`, weight 2, and the ends equal the NASR ends.
    - zoom 14 → `'polygon'`.
  - BDN 17/35 (75 ft wide):
    - zoom 13 → `'stroke'`.
    - zoom 15 → `'polygon'`.
  - A runway with no corners → `null`.
  - Diagram layer:
    - At zoom 6 with a ready chart, KRDM draws 2 runway paths (spy on
      `L.polyline` or `L.polygon`) and no fetch.
    - At zoom 14, runway polygons are present, and so are the end-number
      labels.
  - Airport layer:
    - At zoom 10, KRDM (with corners) has no `.atc-apt` ring.
    - An airport whose only runway has no corners has exactly one `.atc-apt`
      ring.
    - Fallback status gives a ring for every visible fallback airport, none
      carrying `is-towered`.
  - `airportRing`: a heliport's html contains the "H" path, and no html ever
    contains the airport name.
- [ ] **Step 2: run and see the tests fail.** Use
      `npx nx test atc-shared` (or vitest on the files).
- [ ] **Step 3: implement.**
  - Remove `is-towered` and `is-nontowered` from the ring class names. Keep
    `atc-apt` and `is-fallback`.
  - Keep `chartColours` for ink and pavement.
- [ ] **Step 4: verify.** Run
      `npx nx run-many -t build,test,lint -p atc-shared atc-angular atc-react`.
- [ ] **Step 5: commit.** Message: `feat(atc): airports as true-size ink runways at every zoom`.

### Task A2: ink labels, ink badge, design rules, e2e and docs

**Files:**

- Modify: `examples/atc/shared/src/map/chart/data-block.ts`, with new line
  rules.
- Modify: `examples/atc/shared/src/map/chart/airport-layer.ts`. Blocks use a
  single tone, ink.
- Modify: `examples/atc/shared/src/map/chart/declutter.ts` (`blockZoomRule`).
- Modify: `examples/atc/shared/src/styles/chart.css` and
  `examples/atc/shared/src/styles/cards.css`. Badge becomes an ink outline.
- Modify: `examples/atc/shared/src/design-rules.test.ts`. Remove `cards.css`
  from `CHART_ALLOWED`.
- Modify: `examples/atc/e2e/src/atc.spec.ts` (airport assertions).
- Modify: `examples/atc/README.md`, `examples/atc/AGENTS.md`, and the part 1
  spec's map-rendering section, which now points to part 2 for ink airports.

**Interfaces:**

- `dataBlockLines(airport: ChartAirport, zoom: number): string[]`:

  | Zoom         | Lines                            |
  | ------------ | -------------------------------- |
  | 9 and below  | `[faa]`, for example `['RDM']`   |
  | 10 to 13     | `[`${name} (${faa})`, dataLine]` |
  | 14 and above | `[`${name} (${faa})`]`           |

  The data line is built like this:
  - **Towered:** `CT ${tower}${towerPartTime ? '★' : ''} · ${elevationFt}`.
  - **Not towered, with CTAF:** `CTAF ${ctaf} · ${elevationFt}`.
  - **Neither:** `${elevationFt}`.
  - A towered field with no tower frequency falls back to CTAF, then to the
    elevation alone.

- `blockZoomRule(airport, zoom)`: true at every zoom for airports that
  `visibleAirports` returns.
- `renderDataBlock(doc, lines, tone: 'ink' | 'fallback')`:
  - The first span is the name line (Hanken Grotesk 600) at zoom 10 and above.
  - At zoom 9 and below, the single span is the ident (mono). Add class
    `is-ident` to it.
- CSS:
  - `.atc-apt-block` is `var(--atc-ink)`. The data line (second span) is
    `var(--atc-muted)`.
  - `.atc-airport-badge` uses `border: 1px solid var(--atc-ink)` and
    `color: var(--atc-ink)`, with no chart tokens.
  - Delete the `.is-towered` and `.is-nontowered` badge colour rules.

- [ ] **Step 1: write failing tests.**
  - `data-block.test.ts`:
    - KRDM at zoom 9 → `['RDM']`.
    - KRDM at zoom 11 → `['ROBERTS FLD/REDMOND MUNI (RDM)', 'CT 124.5★ · 3082']`.
    - BDN at zoom 11 → `['BEND MUNI (BDN)', 'CTAF 123.0 · 3459']`.
    - A field with neither frequency → `['X (X)', '3000']`.
    - Zoom 14 → name only.
  - Design rules: chart tokens in `cards.css` now fail. Prove it by planting
    one, then removing it.
  - App component tests: the badge has no `is-towered` colour class
    dependency. Keep the text assertions.
- [ ] **Step 2: run and see the tests fail.**
- [ ] **Step 3: implement.**
  - Update e2e: the airport scenarios assert `.atc-apt-block` text (`RDM`
    visible at the regional view) instead of `.atc-apt` symbols.
  - Update e2e: "hide airports" asserts that `.atc-apt-block` and runway
    canvas content are gone. The airports layer pane is empty: check
    `.leaflet-atc-airports-pane` has no children and `.atc-apt-block` has
    count 0.
- [ ] **Step 4: verify.** Run
      `npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc`
      and `npx nx e2e atc-e2e`.
- [ ] **Step 5: commit.** Message: `feat(atc): ink airport labels and badge`.
      Then commit the docs: `docs(atc): ink airports`.

**PR A then:** push, open the PR, auto-merge on green, verify production
(airports are ink), then start PR B on a branch from the merged `main`.

---

## PR B: airspace (branch `blove/atc-airspace`, from `main` after PR A)

### Task B1: airspace types, parsing and pure queries

**Files:**

- Modify: `examples/atc/shared/src/chart/types.ts`. Add `AirspaceShelf`,
  `AirspaceType`, `AirspaceClass` and `AirspacePayload`.
- Modify: `examples/atc/shared/src/chart/parse.ts`. Add `parseAirspace`.
- Create: `examples/atc/shared/src/chart/airspace-query.ts`.
- Modify: `examples/atc/shared/src/chart/index.ts`.
- Test: `parse.test.ts` and `airspace-query.test.ts`.

**Interfaces:**

- Types:

```ts
export type AirspaceClass = 'B' | 'C' | 'D' | 'E';
export type AirspaceType = 'B' | 'C' | 'D' | 'E2' | 'E3' | 'E4';
export interface AirspaceShelf {
  readonly id: string;
  readonly airport: string;
  readonly name: string;
  readonly class: AirspaceClass;
  readonly type: AirspaceType;
  readonly floor: { readonly ft: number; readonly ref: 'SFC' | 'MSL' };
  readonly ceiling: { readonly ft: number; readonly exclusive: boolean } | null;
  readonly partTime: boolean;
  readonly rings: readonly (readonly (readonly [number, number])[])[];
  readonly bbox: readonly [number, number, number, number];
}
export interface AirspacePayload {
  readonly cycle: string;
  readonly effective: string;
  readonly shelves: readonly AirspaceShelf[];
}
```

- `parseAirspace(payload: unknown): AirspacePayload`:
  - Throws when `shelves` isn't an array or `cycle` isn't a string.
  - Drops invalid shelves. A shelf is valid when:
    - `airport` matches `^[A-Z0-9]{2,4}$`;
    - `class` and `type` are known;
    - `floor.ft` is finite and at least 0;
    - `ceiling` is null, or has a finite `ft` greater than the floor;
    - it has at least one ring, and each ring has at least 4 finite in-range
      points;
    - `bbox` has 4 finite numbers.
  - Copies whitelisted fields only.
- `airspace-query.ts`:
  - `CLASS_A_FLOOR_FT = 18000`
  - `pointInShelf(shelf, point: LatLon): boolean`. Bounding-box prefilter,
    then even-odd ray casting over all rings (holes subtract).
  - `altitudeMslFt(aircraft: Pick<Aircraft, 'onGround' | 'altitudeFt' | 'geometricAltitudeFt'>): { ft: number; source: 'ground' | 'gnss' | 'baro' } | null`.
    Order: on the ground → `{ ft: 0, source: 'ground' }`, then
    `geometricAltitudeFt` (`'gnss'`), then `altitudeFt` (`'baro'`), else null.
  - `inShelfVertically(shelf, ft: number): boolean`:
    - True when `ft >= floor.ft`.
    - With a ceiling: `ft < ceiling.ft` when exclusive, else `ft <= ceiling.ft`.
    - With a null ceiling: `ft < CLASS_A_FLOOR_FT`.
  - `shelvesAt(shelves, aircraft): AirspaceShelf[]`. A null altitude matches
    nothing.
  - `airspaceOf(shelves, code): AirspaceShelf[]`. Matches `shelf.airport` on
    the ICAO code or the FAA ident. When the code has 4 characters starting
    with K, also compare its last 3 characters.

- [ ] **Step 1: write failing tests.** The tests are listed in the
      Interfaces section. Include every boundary from the Review Focus:
  - floor inclusive;
  - exclusive ceiling outside;
  - null ceiling at 18,000 outside;
  - an aircraft on the ground inside a surface shelf;
  - a null altitude matches nothing;
  - a donut-shaped ring with a hole: a point in the hole is outside;
  - a point outside the bbox is outside without a ring test (spy, or rely on
    coordinates);
  - `airspaceOf('KRDM')` matches airport `RDM`, and also `KRDM`.
- [ ] **Step 2: run and see the tests fail.**
- [ ] **Step 3: implement.**
- [ ] **Step 4:** `npx nx run-many -t build,test,lint -p atc-shared`.
- [ ] **Step 5: commit.** Message: `feat(atc): airspace shelves and point-in-airspace queries`.

### Task B2: the `/api/chart/airspace` route

**Files:**

- Create: `examples/atc/server/src/chart/airspace.ts`. Pure
  `normaliseAirspace(features: unknown, centre: LatLon, radiusNm: number): { shelves: AirspaceShelf[]; dropped: number }`.
- Modify: `examples/atc/server/src/chart/upstream.ts`. Add
  `fetchClassAirspace(fetchFn, signal): Promise<unknown[]>`, which pages.
- Create: `examples/atc/server/src/chart-airspace-handler.ts`.
- Create: `examples/atc/server/src/vercel/chart-airspace.ts`.
- Modify: `examples/atc/server/src/app.ts`.
- Modify: `examples/atc/tools/build-vercel-output.mts`. Add
  `{ route: 'chart/airspace', entry: 'chart-airspace', maxDuration: 20 }`.
- Test: `examples/atc/server/src/chart/airspace.test.ts` and
  `chart-airspace-handler.test.ts`.

**Interfaces:**

- **Query URL:**
  `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0/query`
- **Query parameters:**

  | Parameter            | Value                                                                                                |
  | -------------------- | ---------------------------------------------------------------------------------------------------- |
  | `where`              | `CLASS IN ('B','C','D') OR LOCAL_TYPE IN ('CLASS_E2','CLASS_E3','CLASS_E4')`                         |
  | `geometry`           | The bbox of `AREAS.pnw`, computed as centre ± radius in degrees, with longitude scaled by `cos(lat)` |
  | `geometryType`       | `esriGeometryEnvelope`                                                                               |
  | `inSR`, `outSR`      | `4326`                                                                                               |
  | `outFields`          | `NAME,IDENT,ICAO_ID,CLASS,LOCAL_TYPE,LOWER_VAL,LOWER_CODE,UPPER_VAL,UPPER_CODE,UPPER_DESC,WKHR_CODE` |
  | `maxAllowableOffset` | `0.0005`                                                                                             |
  | `geometryPrecision`  | `5`                                                                                                  |
  | `resultRecordCount`  | `1000`                                                                                               |
  | `resultOffset`       | Starts at 0 and steps by 1000 while a page returns exactly 1000 features                             |
  | `f`                  | `geojson`                                                                                            |

  The request reuses part 1's `getJson` helper, which throws on HTTP errors
  and on ArcGIS error bodies sent with HTTP 200, and sends the atc
  User-Agent.

- **Normalisation:**
  - `type` comes from `LOCAL_TYPE`: `CLASS_B` → B, `CLASS_C` → C, `CLASS_D` → D,
    `CLASS_E2|E3|E4` → E2, E3 or E4. When `LOCAL_TYPE` is null, use `CLASS`
    (B, C or D).
  - `floor`: `LOWER_VAL === 0` gives `{ ft: 0, ref: 'SFC' }`. A nonzero
    `LOWER_VAL` with `LOWER_CODE === 'SFC'` is an AGL floor, which a shelf cannot
    represent, so the feature is dropped. Otherwise `{ ft: LOWER_VAL, ref: 'MSL' }`.
  - `ceiling`: `UPPER_VAL` of `-9998` or below, or `UPPER_DESC === 'AA'`,
    gives `null`. Otherwise `{ ft: UPPER_VAL, exclusive: UPPER_DESC === 'TNI' }`:
    `TI` is "to and including" (inclusive), `TNI` is "to not including".
  - `partTime` is `WKHR_CODE === 'NOTAM'`.
  - `airport` is `ICAO_ID` when it matches `^[A-Z][A-Z0-9]{3}$`, else `IDENT`.
  - `id` is `${airport}-${type}-${n}`, where `n` counts per airport and type in
    input order.
  - Coordinates are rounded to 5 decimals.
  - `bbox` is computed from the rings.
  - A `MultiPolygon` becomes one shelf per polygon.
  - Keep a shelf when any vertex is within `radiusNm` of the centre.
  - Invalid features are counted in `dropped`.
- **Handler:**
  - Mirror `chart-airports-handler.ts`:
    - per-cycle key via `currentCycle(new Date(now())).ident`;
    - 24 h fresh, 30-day stale limit;
    - the previous-cycle fallback;
    - the same `Cache-Control` and `X-Atc-Stale` headers;
    - GET only, 405 otherwise;
    - a 502 body of `{ error: 'Airspace data unavailable' }`;
    - one deadline of 17 s across all pages.
  - The body is `AirspacePayload`.
  - Log `[atc] airspace dropped N shelves` when `dropped > 0`.

- [ ] **Step 1: write failing tests.**
  - Fixtures go in `airspace.test.ts`, trimmed from real responses:
    - Portland C: the SFC to 4000 TI shelf and one 1100 to 4000 shelf.
    - Redmond D: SFC to 5600 TI, NOTAM.
    - Redmond E2: SFC, -9998 AA.
    - Bend E2.
    - One feature with `LOCAL_TYPE` null and `CLASS` 'D'.
    - One invalid feature.
    - One feature far outside the area.
  - Expected:
    - the type mapping;
    - floors, ceilings, `exclusive` and `partTime`;
    - the outside feature filtered out;
    - `dropped` is 1.
  - Handler tests:
    - paging: the first page returns exactly 1000 features (generate them),
      the second returns 2, so fetch is called twice;
    - 200 with headers;
    - 405;
    - 502;
    - stale;
    - previous-cycle fallback.
- [ ] **Step 2: run and see the tests fail.**
- [ ] **Step 3: implement.**
- [ ] **Step 4: verify.**
  - Run `npx nx run-many -t build,test,lint -p atc-server atc-shared` and
    `npx nx build atc`.
  - Check that `.vercel/output/functions/api/chart/airspace.func` exists.
  - Optional live smoke test with `OPENAI_API_KEY=x PORT=<free> npx nx serve atc-server`:
    `curl /api/chart/airspace`. Expect a shelf count around 150 and about
    140 KB. Record both.
- [ ] **Step 5: commit.** Message: `feat(atc): /api/chart/airspace from FAA class airspace`.

### Task B3: the store and browser feed for airspace

**Files:**

- Modify: `examples/atc/shared/src/store.ts`.
- Modify: `examples/atc/shared/src/chart/chart-feed.ts`.
- Modify: `examples/atc/shared/src/map/view-controller.ts` (the `'airspace'`
  request).
- Test: `store.test.ts`, `chart-feed.test.ts`, and a new
  `map/airspace-map.airspace.test.ts` for the view.

**Interfaces:**

- **New state:**
  - `AtcState.airspace: { status: 'loading' | 'ready' | 'failed'; cycle: string | null; shelves: readonly AirspaceShelf[] }`,
    initially loading, with no cycle and no shelves.
  - `AtcState.highlightedAirspace: string | null`.
  - `Layers` gains `airspace: boolean`, default true.
  - The `ViewRequest` union gains `{ seq, kind: 'airspace', airport: string }`.
- **Reducers and store methods:**
  - `applyAirspace(state, payload)` sets the status to ready.
  - `applyAirspaceFailed(state)` sets the status to failed, but only while it
    is still loading.
  - `requestAirspace(state, code)`:
    - Sets `highlightedAirspace` to the code.
    - Turns on `layers.airspace`.
    - Clears `shownArea`.
    - Then `requestView({ kind: 'airspace', airport: code })`, whose
      following-a-plane rule drops the move.
  - The store's `clearHighlight`, `requestReset`, `requestArea` and
    `requestAirport` also clear `highlightedAirspace`. `applyHighlight` never
    touches it, so an empty set keeps the airspace a search highlighted.
  - Store methods: `setAirspace(payload)`, `setAirspaceFailed()` and
    `showAirspace(code)`.
- **Chart feed:**
  - `startChartFeed` fetches `/api/chart/airspace` in parallel with the
    airports, using its own retry chain on the same schedule.
  - Success → `store.setAirspace(parseAirspace(json))`.
  - Failure → `store.setAirspaceFailed()`.
- **View controller:**
  - On an `'airspace'` request, take the shelves of
    `airspaceOf(state.airspace.shelves, airport)` and fit to the union of their
    bboxes. Use `fitBounds` with `AREA_PADDING` plus the sheet inset, and
    `maxZoom: 12`.
  - With no shelves, mark the request applied and don't move.

- [ ] **Step 1: write failing tests.**
  - Each reducer, including:
    - `requestAirspace` while following → no view request, but the highlight
      and the layer are set;
    - `clearHighlight` clears it;
    - `resetView` clears it.
  - Feed:
    - airspace success → ready;
    - airspace 500 → failed, then a scheduled retry;
    - airports and airspace fail independently.
  - View: `store.showAirspace('KPDX')` with fixture shelves → the map bounds
    contain the shelves' bbox.
- [ ] **Step 2: run and see the tests fail.**
- [ ] **Step 3: implement.**
- [ ] **Step 4:** `npx nx run-many -t build,test,lint -p atc-shared atc-angular atc-react`.
- [ ] **Step 5: commit.** Message: `feat(atc): airspace in the store, feed and view requests`.

### Task B4: the airspace layer, styles and the Layers row

**Files:**

- Create: `examples/atc/shared/src/map/chart/airspace-layer.ts`.
- Create: `examples/atc/shared/src/map/chart/airspace-labels.ts`. Pure label
  text and label points.
- Modify: `examples/atc/shared/src/map/airspace-map.ts`. Compose the layer on
  pane `atc-airspace` and toggle `data-zoom-overview` (zoom 8 and below) on
  `zoomend`.
- Modify: `examples/atc/shared/src/map/chart/layers-control.ts`. Add the
  Airspace row, which shows "Airspace · unavailable" when the status is
  failed.
- Modify: `examples/atc/shared/src/styles/chart.css`.
- Modify: `examples/atc/shared/src/design-rules.test.ts`. Add the two band
  hexes to the hex rule, still allowed in `chart.css` only.
- Test: `airspace-layer.test.ts`, `airspace-labels.test.ts`, and additions to
  `layers-control.test.ts`.

**Interfaces:**

- **`airspace-labels.ts`:**
  - `shelfLabelPoint(shelf): LatLon`. The bbox centre when
    `pointInShelf`, else the average of the outer ring's vertices.
  - `shelfLabel(shelf): { kind: 'stack'; top: string; bottom: string } | { kind: 'box'; text: string } | null`:
    - **B and C:**
      - `top` is the ceiling in hundreds, as `String(Math.round(ft / 100))`,
        or `null` → none.
      - `bottom` is `'SFC'`, or the floor in hundreds.
    - **D:** a `box` whose text is the ceiling in hundreds. The label goes
      only on the largest D shelf per airport by bbox area; this function
      returns `box` for every D shelf, and the layer picks which one to use.
    - **E:** `null`.
- **`createAirspaceLayer(options: { L; map; store; pane: string }): { sync(state); redraw(); destroy() }`:**
  - Build one `L.polygon` per shelf (with holes), using
    `L.svg({ pane, padding: 0.5 })` as the renderer.
  - Polygon options: `fill: false`, `interactive: false`,
    `className: 'atc-as is-' + type.toLowerCase()`.
  - Build polygons once per `shelves` array.
  - `sync` acts only when `airspace`, `layers.airspace` or
    `highlightedAirspace` changes by reference.
  - **Highlight:**
    - Add `is-highlighted` to that airport's shelves, plus a casing polygon
      underneath with class `atc-as-casing`.
    - Add `is-dimmed` to all other shelves.
  - **Labels:**
    - `L.marker` with a `divIcon`, on the `atc-airspace` pane, shown at zoom
      9 and above, placed with `placeBlocks`.
    - A stack label is two spans with a rule between them. A box label is
      one span inside corner-bracket SVG made of fixed literals.
    - Text goes in via `textContent` only.
  - Cull shelves to the view padded by 50% on `redraw`.
- **CSS:**
  - `.atc-as` is `fill: none; stroke-linecap: butt`.
  - `.is-b` uses the blue band at 5 px, and `.is-c` the magenta band at 5 px.
  - `.is-d` uses chart blue at 2 px with `stroke-dasharray: 8 2.2`.
  - `.is-e2`, `.is-e3` and `.is-e4` use chart magenta with the same width and
    dash as D.
  - `[data-zoom-overview] .atc-as` widths are 3 and 1.5 px, with dash
    `6 1.65`.
  - `.atc-as.is-dimmed` is `opacity: 0.3`.
  - `.atc-as-casing` is `stroke: var(--atc-accent); stroke-opacity: 0.6`, with
    its width set per type to the shelf width plus 4.
  - Label classes `.atc-as-label` and `.is-b`, `.is-c`, `.is-d` use mono 700
    at 10 px in the shelf colour.

- [ ] **Step 1: write failing tests.**
  - Labels:
    - a PDX C shelf 1100 to 4000 → stack `40` over `11`;
    - SFC → `SFC`;
    - D 5600 → box `56`;
    - E2 → null;
    - for a donut-shaped shelf, the label point is not in the hole.
  - Layer:
    - correct class per type (`path.atc-as.is-c` and so on);
    - no labels at zoom 8, labels at zoom 10;
    - `showAirspace('KRDM')` → RDM shelves `is-highlighted`, others
      `is-dimmed`, and casing present;
    - an aircraft snapshot doesn't rebuild polygons (spy on `L.polygon`);
    - `setLayers({ airspace: false })` → no `.atc-as`;
    - `data-zoom-overview` toggles at zoom 8 and 9.
  - Layers control: an Airspace checkbox; unchecking it sets
    `layers.airspace` to false; the failed status reads
    `Airspace · unavailable`.
  - Design rules: plant `#3288B5` in `map.css` and expect a failure.
- [ ] **Step 2: run and see the tests fail.**
- [ ] **Step 3: implement.**
- [ ] **Step 4:** `npx nx run-many -t build,test,lint -p atc-shared atc-angular atc-react`.
      Optionally eyeball it in the running app at KPDX and KRDM.
- [ ] **Step 5: commit.** Message: `feat(atc): Class B, C, D and E surface airspace on the map`.

### Task B5: tools, prompt, chips and the AirportCard line

**Files:**

- Modify: `examples/atc/shared/src/tools.ts`, `find-aircraft.ts`,
  `contracts.ts`, `tool-chips.ts` and `views.ts`.
- Modify: the Angular and React `assistant.ts` / `assistant.tsx` (register
  tools) and `airport-card` (the airspace line).
- Test: `tools.test.ts`, `find-aircraft` tests (in `tools.test.ts`),
  `contracts.test.ts`, `tool-chips.test.ts`, `views.test.ts`, and both apps'
  component tests.

**Interfaces:**

- **`ATC_TOOL_DEFINITIONS.showAirspace`:**
  - Description: "Show a place's controlled airspace (Class B, C, D and the
    Class E surface area) on the map, highlighted, and return its shelves and
    how many aircraft are inside."
  - Schema: `{ airport: s.string('ICAO code from lookupPlace, such as KPDX') }`.
- **`ATC_TOOL_DEFINITIONS.airspaceAt`:**
  - Description: "Which controlled airspace one aircraft is in now, from its
    position and altitude."
  - Schema: `{ hex: s.string('Aircraft hex code from a tool result') }`.
- **`findAircraft` input** gains:

  ```ts
  inAirspace: s.anyOf([
    s.object("Only aircraft inside this airport's airspace", {
      airport: s.string('ICAO code from lookupPlace'),
      class: s.anyOf([
        s.enumeration('Airspace class', ['B', 'C', 'D', 'E']),
        s.nullish(),
      ]),
    }),
    s.nullish(),
  ]);
  ```

  It filters with `shelvesAt` against `airspaceOf(...)`, restricted to the
  class when given. It calls `store.showAirspace(code)`, the same pattern as
  `near`. Rows are measured from the airport.

- **`setLayers`** schema gains `airspace: s.anyOf([s.boolean('Show airspace'), s.nullish()])`.
- **Handlers:**
  - All of them await `whenChartSettled` (part 1) for airports and a matching
    `whenAirspaceSettled(store, 5000)` for airspace.
  - When the airspace status isn't `ready`, they refuse with
    `reason: 'Airspace data is unavailable right now.'`.
  - Shelf text uses `toLocaleString('en-US')` on feet, followed by ` MSL`.
    `SFC` stays `SFC`, and a null ceiling reads `up to overlying airspace`.
  - **`showAirspace`** returns
    `{ shown: true, code, classes, shelves: [{ type, floor, ceiling, partTime }], aircraftInside, moved, reason? }`.
    When the airport has no shelves, it returns
    `{ shown: false, reason: '<CODE> has no Class B, C, D or E surface airspace.' }`.
  - **`airspaceAt`** returns
    `{ found: true, label, altitudeFt, altitudeSource, airspace: [{ airport, type, partTime }] }`,
    or `{ found: false, reason }` for an unknown hex.
- **Prompt:** add these exact lines after the airport lines.

  ```
  - For aircraft inside a place's airspace, call lookupPlace, then findAircraft with inAirspace, then highlightAircraft, then show one ArrivalsBoard. To only show a place's airspace, call showAirspace.
  - For which airspace one aircraft is in, call airspaceAt.
  - Airspace answers come only from tool results. ADS-B altitudes can be off by a few hundred feet, so say "about" near a floor or ceiling. Airspace marked partTime is in effect only during hours set by NOTAM, which the tools don't know: when partTime is true, say the aircraft is inside the charted area and that it may not be active now.
  ```

- **`STARTER_PROMPTS`** gains `'Which planes are inside the Portland Class C?'`
  as the last entry.
- **Chips:**

  | Tool           | RUNNING                             | DONE                      |
  | -------------- | ----------------------------------- | ------------------------- |
  | `showAirspace` | `Showing ${code} airspace`          | `showed ${code} airspace` |
  | `airspaceAt`   | `Checking the airspace of ${label}` | `checked an airspace`     |

  `findSummary` adds `inside ${airport} airspace` when `inAirspace` is set.

- **`airportCardView`** gains `airspace: string | null`, for example
  `Class D (part-time), E2`. The parts are sorted B, C, D, E2, E3, E4 and
  de-duplicated, with `(part-time)` after a class whose shelves are all part
  time. It is null when there are no shelves or the airspace isn't ready.
  Both app cards render
  `<p class="atc-airport-airspace">Airspace: {{airspace}}</p>` when it isn't
  null.

- [ ] **Step 1: write failing tests.**
  - `showAirspace('Portland')` with fixture shelves and two aircraft (one
    inside at 3,000 ft, one at 5,000 ft) → `aircraftInside` 1, the classes,
    and the shelf text.
  - Following → `moved: false`.
  - No shelves → `shown: false`.
  - Airspace failed → the refusal.
  - `findAircraft` with `inAirspace: { airport: 'KRDM', class: 'D' }` → only
    aircraft inside the D.
  - `airspaceAt`:
    - on the ground at KRDM → D;
    - unknown hex → refusal.
  - Chips and the prompt contents.
  - The `airportCardView` airspace string.
  - App card tests show the airspace line.
- [ ] **Step 2: run and see the tests fail.**
- [ ] **Step 3: implement.**
- [ ] **Step 4:** `npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react`.
- [ ] **Step 5: commit.** Message: `feat(atc): airspace tools and the AirportCard airspace line`.

### Task B6: e2e, docs and spec alignment

**Files:**

- Modify: `examples/atc/e2e/src/fixtures.ts` and `examples/atc/e2e/src/atc.spec.ts`.
- Modify: `examples/atc/README.md`, `examples/atc/AGENTS.md`, and the part 2
  spec (align it with what was built).

**Fixtures and routes:**

- `CHART_AIRSPACE: AirspacePayload` contains:
  - a KPDX C shelf, SFC to 4000 TI, as a polygon of about 5 nm radius around
    KPDX built with a small circle helper;
  - a KRDM D shelf, SFC to 5600 TI, part time, about 4.3 nm;
  - a KRDM E2 shelf;
  - a KBDN E2 shelf.
- `open()` stubs `**/api/chart/airspace`.
- Mock-model scenarios:
  - **The new starter** "Which planes are inside the Portland Class C?" calls
    `lookupPlace` with Portland, then
    `findAircraft({ ...ANY, inAirspace: { airport: 'KPDX', class: 'C' }, sortBy: 'distance', limit: 20 })`,
    then `highlightAircraft`. The result is an ArrivalsBoard titled "Inside
    the Portland Class C".
    - Synthetic traffic needs at least one aircraft inside the KPDX shelf
      below 4,000 ft. Add one to `TRACKS` if none exists, and check the
      existing tests' counts.
  - **"Show the Redmond airspace."** calls `showAirspace({ airport: 'KRDM' })`,
    answering markdown "Redmond has a part-time Class D."

**Tests:**

- The Portland scenario: the board has at least one row, `.atc-as.is-highlighted`
  is present, and the chip summary reads `… · N steps`. Assert the actual text.
- The Redmond scenario: a `.atc-as-label` contains `56`.
- The Layers control: unchecking Airspace leaves `.atc-as` with count 0.

**Docs:**

- README "Data and attribution": the airspace line (FAA ADDS Class Airspace,
  public domain), and the route list.
- AGENTS.md:
  - File-map rows for `chart/airspace-query.ts`, `map/chart/airspace-layer.ts`,
    `airspace-labels.ts` and the airspace handler.
  - New invariants: airspace queries are pure, and altitude precedence is
    ground, then GNSS, then baro.

- [ ] **Step 1:** add the fixtures and tests, and see them fail.
- [ ] **Step 2:** make them pass.
- [ ] **Step 3:** run
      `npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc`
      and `npx nx e2e atc-e2e`.
- [ ] **Step 4:** commit. Messages: `test(atc): e2e for airspace` and
      `docs(atc): airspace data, tools and invariants`.

**PR B then:** push, open the PR, auto-merge on green, verify production:

- `curl -sI https://atc.hashbrown.dev/api/chart/airspace` returns 200 with a
  CDN header.
- In the browser, airspace draws at KPDX and KRDM, and airports are ink.
- One airspace question gets an answer.
