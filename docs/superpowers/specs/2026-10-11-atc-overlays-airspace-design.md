# atc: Chart Overlays, Part 2: Ink Airports and Class B/C/D/E Airspace

Date: 2026-10-11
Status: design approved in conversation (brainstorm with visual companion)
Builds on: `2026-10-10-atc-overlays-airports-design.md` (part 1, merged as #642)
Research: `docs/superpowers/research/atc-overlays/sectional-chart-symbology.md`

## Goal

Make two changes in two pull requests.

1. **PR A (ink airports).** Replace part 1's sectional airport symbols and
   coloured data blocks with ink vector airports drawn at true size at every
   zoom. The user wants an ink diagram that scales with the map rather than
   sectional colour for airports.
2. **PR B (airspace).** Draw Class B, C and D airspace and the Class E
   surface areas (E2, E3, E4) in their sectional chart colours and line
   styles. Give the assistant airspace questions such as "which planes are
   inside the Redmond Class D?", "show Portland's Class C" and "what airspace
   is N352LL in?".

Success:

- At any zoom, an airport's runways are as long and as wide as they are on
  the ground, in ink, never thinner than 2 px.
- A pilot reads airspace class at a glance: heavy blue B, heavy magenta C,
  dashed blue D with its ceiling box, and dashed magenta E surface areas.
- Answers about aircraft inside airspace are computed from the FAA shelves
  (lateral position plus floor and ceiling), never estimated.
- Live traffic stays smooth. Airspace and airports never redraw on aircraft
  snapshots.

## Decisions

| Topic          | Decision                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Airport style  | Ink, true size at every zoom with a 2 px minimum stroke; no sectional symbols, no chart colour on airports       |
| Airspace scope | Class B, C, D plus Class E surface areas (E2, E3, E4); E5 (700 and 1,200 ft floors) deferred                     |
| Airspace style | Sectional chart colours and line styles, as measured; labels in chart formats                                    |
| Data           | A cached server route, `/api/chart/airspace`, like `/api/chart/airports`                                         |
| Delivery       | PR A (ink airports) first, then PR B (airspace)                                                                  |
| Selection      | Cobalt stays reserved for selection and highlight, drawn as a casing or halo, never as a fill on a chart feature |

## PR A: ink airports at true size

This PR replaces part 1's airport symbols (`map/chart/airport-symbol.ts`) and
the sectional data blocks. The data routes, store slices, zoom 12 and 14
diagram features, the Layers control, the tools and the AirportCard
structure all stay.

- **Runways at every zoom.**
  - One canvas layer draws each visible airport's runways from the NASR
    runway corners in ink, at true length and width.
  - When the true width is under 2 px at the current zoom, the runway
    becomes a 2 px ink stroke between its two ends. Strokes use
    `lineCap: 'butt'` so the length stays true.
  - Taxiways, aprons, hold bars, hot spots and taxiway letters keep part 1's
    thresholds: surfaces from zoom 12, letters from zoom 14.
- **Airports without surveyed runway ends.**
  - Some airports have no surveyed ends, for example Sisters, `6K5`. Each of
    these gets a 6 px open ink ring at its reference point.
  - The 40-airport fallback table, used when the chart data is limited, draws
    the same ring.
- **Heliports and seaplane bases** get the 6 px ring with a small ink "H" or
  anchor glyph, drawn from fixed paths.
- **Which airports draw at each zoom.** Part 1's rank rules stay:

  | Zoom         | Airports drawn                                |
  | ------------ | --------------------------------------------- |
  | 7 and below  | Towered, or a hard runway of 5,000 ft or more |
  | 8 to 9       | Adds hard runways of 3,000 ft or more         |
  | 10 and above | All                                           |

- **Labels.** All labels are ink. They are placed by the existing greedy
  declutter (`placeBlocks`), towered fields first.

  | Zoom         | Label                                                                |
  | ------------ | -------------------------------------------------------------------- |
  | 9 and below  | The ident in JetBrains Mono, for example `RDM`                       |
  | 10 to 13     | The NASR name line (Hanken Grotesk 600), then a muted mono data line |
  | 14 and above | The name line only                                                   |

  The data line is built as follows:
  - Towered fields show `CT <tower>★` (★ for part-time) and then
    `· <elevation>`, for example `CT 124.5★ · 3082`.
  - Other fields show `CTAF <ctaf>` and then `· <elevation>`, for example
    `CTAF 123.0 · 3459`. When there is no CTAF, it is the elevation alone.

- **Colour.**
  - Airports use only `--atc-ink`, `--atc-muted` and
    `--atc-diagram-pavement`.
  - The AirportCard tower badge becomes an ink outline pill, reading
    "Towered" or "Non-towered".
  - The chart blue and magenta tokens stay in `chart.css` for airspace.
  - `design-rules.test.ts` stops allowing chart tokens in `cards.css`.
- **Performance.** The rules from part 1 still hold. The layer redraws only
  on `zoomend`, `moveend` and changes to the `chart`, `surfaces` or `layers`
  slices, never on aircraft snapshots. Markers are culled to the view padded
  by 50%.
- **Tests and docs.**
  - Unit tests cover true-size and minimum-width runways at zooms 6, 10 and
    14, the ring fallback, and the label lines for towered, non-towered and
    no-CTAF fields.
  - The e2e tests replace `.atc-apt` symbol assertions with runway and label
    assertions.
  - The part 1 spec, README and AGENTS.md text about sectional airport symbols
    is rewritten to describe ink airports.

## PR B: airspace

### Data and the server route

A live FAA query on 2026-10-11 found 154 shelves in the area:

| Class         | Shelves |
| ------------- | ------- |
| B             | 20      |
| C             | 18      |
| D             | 34      |
| E2            | 42      |
| E3            | 4       |
| E4            | 29      |
| No local type | 7       |

The 7 shelves with no local type are classed by `CLASS`. All are plain
polygons. Simplified to about 50 m, the set is 142 KB of JSON and 34 KB
gzipped.

**`GET /api/chart/airspace`**

- **Query.** The FAA ADDS `Class_Airspace` FeatureServer, filtered with
  `CLASS IN ('B','C','D') OR LOCAL_TYPE IN ('CLASS_E2','CLASS_E3','CLASS_E4')`.
  - The area's bounding box (`AREAS.pnw`), with `inSR=4326` and `outSR=4326`.
  - `maxAllowableOffset=0.0005` and `geometryPrecision=5`.
  - `outFields=NAME,IDENT,ICAO_ID,CLASS,LOCAL_TYPE,LOWER_VAL,LOWER_CODE,UPPER_VAL,UPPER_CODE,UPPER_DESC,WKHR_CODE`.
  - `f=geojson`, paged with `resultOffset` until a page returns fewer
    features than requested.
- **Area.** The server keeps shelves with at least one vertex within 250 nm
  of the area centre, matching the airports.
- **Caching.** The cache, stale handling and CDN behaviour match
  `/api/chart/airports`:
  - one cache entry per AIRAC cycle, with a shared in-flight call;
  - the last good copy, including a previous cycle's, is served with
    `X-Atc-Stale: 1` when an upstream fails, and a 502 is returned when there
    is nothing to serve;
  - `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`;
  - ArcGIS errors sent with HTTP 200 throw, using part 1's helper.
- **Vercel.** A new function `chart/airspace` (`maxDuration` 20).
  `server/src/app.ts` mounts it for development and e2e.

**`AirspaceShelf`** (in `shared/src/chart/types.ts`). Fields are copied by
whitelist, never spread.

- `id`: string, built as `${airport}-${type}-${index}`.
- `airport`: the ICAO code (`ICAO_ID`) when it is a 4-character code, else
  `IDENT`. It must match `^[A-Z0-9]{2,4}$`.
- `name`: the FAA name, for example `PORTLAND INTERNATIONAL AIRPORT CLASS C`,
  up to 80 characters.
- `class`: `'B' | 'C' | 'D' | 'E'`.
- `type`: `'B' | 'C' | 'D' | 'E2' | 'E3' | 'E4'`.
- `floor`: `{ ft: number; ref: 'SFC' | 'MSL' }`. `SFC` has `ft: 0`.
- `ceiling`: `{ ft: number; exclusive: boolean } | null`. The value is in
  feet MSL, and `exclusive` comes from `UPPER_DESC === 'TI'`. A ceiling of
  `null` means up to the overlying airspace (`UPPER_VAL` of `-9998`,
  `UPPER_DESC` of `AA`), which the Class E surface areas use.
- `partTime`: `WKHR_CODE === 'NOTAM'`. This applies to part-time Class D
  areas, for example Redmond, and to some E2 areas.
- `rings`: an array of `[lon, lat]` rings. The first ring is the outer
  boundary and any further rings are holes.
- `bbox`: `[west, south, east, north]`, computed on the server.

The server drops a shelf that fails validation and logs a count of drops,
like the NASR parser.

**Browser.**

- `startChartFeed` also loads `/api/chart/airspace`, in parallel with the
  airports, with the same retry schedule (30 s, 2 min, then every 10 min).
- The response is checked by `parseAirspace` and stored in a new store slice,
  `airspace: { status: 'loading' | 'ready' | 'failed'; cycle: string | null; shelves: readonly AirspaceShelf[] }`.
- `layers` gains `airspace: boolean`, on by default.
- The Layers control and the `setLayers` tool gain an Airspace row and key.
- If airspace can't load, the layer draws nothing, and the airspace tools
  return `{ <verb>: false, reason: 'Airspace data is unavailable right now.' }`.

### Rendering

All airspace code lives in a new `shared/src/map/chart/airspace-layer.ts`.
It uses the `atc-airspace` pane created in part 1, below airports and
planes.

- **Renderer.** Leaflet's SVG renderer on that pane. Each shelf is an
  `L.polygon` with `fill: false`, `interactive: false` and
  `className: 'atc-as is-<type>'`. Stroke colour, width and dashes come from
  CSS in `chart.css`, so no hex values appear in TypeScript.
- **Styles,** measured from the sectional:

  | Type       | Token                                | Width (zoom 9+ / zoom 8 and below) | Pattern                                      |
  | ---------- | ------------------------------------ | ---------------------------------- | -------------------------------------------- |
  | B          | `--atc-chart-blue-band` `#3288B5`    | 5 px / 3 px                        | solid                                        |
  | C          | `--atc-chart-magenta-band` `#A6768E` | 5 px / 3 px                        | solid                                        |
  | D          | `--atc-chart-blue` `#086CA8`         | 2 px / 1.5 px                      | dashed, `stroke-dasharray: 8 2.2` / `6 1.65` |
  | E2, E3, E4 | `--atc-chart-magenta` `#76334F`      | 2 px / 1.5 px                      | same dashes as D                             |
  - Every stroke uses `stroke-linecap: butt`.
  - Overview widths apply through a `data-zoom-overview` attribute on the map
    element, set when zoom is 8 or below. `airspace-map.ts` toggles it on
    `zoomend`, as it already does for `data-zoom-low`.
  - Shelves sharing an edge simply overlap.

- **Labels** (zoom 9 and above, placed by the same greedy declutter as the
  airport labels):
  - **Class B and C shelves** get a stacked label in mono bold in the shelf's
    colour: the ceiling in hundreds of feet, a 1 px rule, then the floor in
    hundreds or `SFC`. For example, `40` over `11` for Portland's 1,100 to
    4,000 ft shelf.
  - **Class D** gets one label per airport, at the label point of its largest
    D shelf: the ceiling in hundreds (`56`) inside the chart's corner-bracket
    box, in chart blue. The digits come from validated numbers only.
  - **Class E** has no labels, as on the chart.
  - **Label point:** the centre of the shelf's bounding box when it lies
    inside the shelf, else the average of its outer ring's vertices. This is
    computed once per shelf.
- **Highlight.**
  - The store gains `highlightedAirspace: string | null`, the airport code.
  - The highlighted airport's shelves get a cobalt casing: a second path
    underneath with `stroke: var(--atc-accent)`, stroke width equal to the
    shelf's width plus 4 px, and opacity 0.6.
  - Every other shelf dims to opacity 0.3.
  - `clearHighlight` and `resetMap` clear it.
  - A new `ViewRequest` kind `'airspace'` fits the map to the union of the
    airport's shelf bounding boxes, under the existing rules: follow mode
    wins, the newest request wins, and a drag cancels.
- **Performance.**
  - Polygons are built once per `airspace.shelves` array.
  - The layer re-syncs only when the `airspace`, `layers` or
    `highlightedAirspace` slices change by reference, never on aircraft
    snapshots.
  - Zoom changes only toggle the CSS attribute and re-place labels.
  - Shelves are culled to the view padded by 50%.

### Spatial queries (pure)

A new `shared/src/chart/airspace-query.ts` holds the pure query functions.

- `pointInShelf(shelf, point): boolean`. A bounding-box prefilter, then ray
  casting with even-odd holes.
- `altitudeMslFt(aircraft): number | null`. Rules, in order:
  1. `onGround` gives 0, so the aircraft is in surface areas.
  2. Otherwise use `geometricAltitudeFt` (GNSS, within about 100 ft of MSL in
     the area) when present.
  3. Otherwise use the barometric `altitudeFt`.
  4. Otherwise `null`.
- `shelvesAt(shelves, point, altitudeFt): AirspaceShelf[]`. A shelf contains
  the aircraft when all of these hold:
  - the point is laterally inside the shelf;
  - the altitude is at or above the floor;
  - the altitude is below the ceiling (or at it, when the ceiling is not
    exclusive);
  - a `null` ceiling counts as 18,000 ft, exclusive.

  An aircraft with no altitude is never inside a shelf whose floor is above
  the surface. It counts inside a surface shelf only when its altitude is
  known.

- `airspaceOf(shelves, airport): AirspaceShelf[]`, matched on the ICAO code or
  the FAA ident.

### Assistant: tools, components and prompt

**New tools**

All new tools are added to `ATC_TOOL_DEFINITIONS`, and the server pins them.

- **`showAirspace({ airport })`**
  - Resolves the place with `lookupPlace`.
  - Sets `highlightedAirspace`, turns the airspace layer on and requests the
    `'airspace'` view.
  - Returns `{ shown: true, code, classes, shelves, partTime, aircraftInside, moved }`:
    - `classes` is a list, for example `['D', 'E2']`.
    - `shelves` is a list of `{ type, floor, ceiling }` text, for example
      `{ type: 'C', floor: '1,100 MSL', ceiling: '4,000 MSL' }`.
    - `aircraftInside` counts aircraft in any of the airport's shelves.
  - While following a plane, it returns `moved: false` with the existing
    follow reason.
  - When the airport has no shelves, it returns
    `{ shown: false, reason: '<CODE> has no Class B, C, D or E surface airspace.' }`.
- **`airspaceAt({ hex })`**
  - Returns `{ found: true, label, altitudeFt, altitudeSource: 'gnss' | 'baro' | 'ground' | null, airspace }`.
  - `airspace` is a list of `{ airport, type, partTime }`, empty when the
    aircraft is in none.
  - For an unknown hex it returns
    `{ found: false, reason: 'No aircraft with hex <hex> is on the map.' }`.

**Changed tools**

- **`findAircraft`** gains `inAirspace: { airport: string; class: 'B' | 'C' | 'D' | 'E' | null } | null`.
  - It keeps aircraft inside any shelf of that airport, optionally of one
    class.
  - Like `near`, it also highlights that airport's airspace and requests the
    `'airspace'` view.
  - Rows are measured from that airport.
- **`setLayers`** gains `airspace: boolean | null`.
- **`clearHighlight`** and **`resetMap`** also clear `highlightedAirspace`.

**Components**

- No new component. Lists of aircraft reuse the ArrivalsBoard.
- The AirportCard gains one line, "Airspace: Class D (part-time), E2", read
  from the store. It is omitted when the airport has no shelves or the
  airspace data is not loaded.

**Prompt additions**

- For aircraft inside a place's airspace, call `lookupPlace`, then
  `findAircraft` with `inAirspace`, then `highlightAircraft`, then show one
  ArrivalsBoard.
- To show a place's airspace, call `showAirspace`.
- For which airspace one aircraft is in, call `airspaceAt`.
- Airspace answers come only from tool results. Altitudes from ADS-B can be
  off by a few hundred feet, so say "about" near a boundary. Part-time Class D
  airspace is shown as charted, and the tool reports when it is part-time.

**Supporting changes**

- Tool-chip RUNNING and DONE labels for `showAirspace` and `airspaceAt`.
- A starter prompt: "Which planes are inside the Portland Class C?"

## Error handling

| Failure                                      | Behaviour                                                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The airspace route fails with nothing cached | 502. The browser sets `airspace.status: 'failed'` and retries on the chart schedule. The layer draws nothing, and the Layers row reads "Airspace · unavailable"                                         |
| An upstream fails but the server has data    | The last good copy is served with `X-Atc-Stale: 1`                                                                                                                                                      |
| A shelf with bad values                      | Dropped on the server and again in the browser. Validation covers the ident pattern, finite in-range coordinates, at least 4 points per ring, finite floor and ceiling values, and known class and type |
| Airspace not loaded when a tool runs         | The tools wait up to 5 s, as part 1's tools do for the chart, then refuse with "Airspace data is unavailable right now."                                                                                |
| An aircraft with no altitude                 | It is never inside a shelf whose floor is above the surface, and `airspaceAt` reports `altitudeSource: null`                                                                                            |

## Testing

Tests use top-level `test(...)` with arrange, act and assert, written to fail
first.

- **Shared:**
  - `pointInShelf`, including holes and bounding-box edges.
  - `altitudeMslFt` precedence.
  - `shelvesAt` boundaries: the floor counts as inside, an exclusive ceiling
    as outside, and a `null` ceiling means 18,000 ft.
  - `parseAirspace` whitelisting.
  - The airspace layer: classes by type, the overview attribute, labels, and
    highlight casing and dimming.
  - No rebuild on an aircraft snapshot.
  - The `'airspace'` view request.
  - The tools, including refusals.
  - The AirportCard airspace line.
  - The design rules: the new band tokens are allowed in `chart.css` only.
- **Server:**
  - The route with stubbed fetch: paging, the area filter, normalisation of
    `-9998`/`AA` and `TI`, caching, stale data and 502s.
  - Fixtures are trimmed real FAA features for Portland C, Redmond D and E2,
    and Bend E2.
- **e2e:**
  - `/api/chart/airspace` is stubbed with fixtures.
  - Scenarios:
    - "Which planes are inside the Portland Class C?": a board, highlighted
      shelves and the chip.
    - "Show the Redmond airspace": the map fits and the `56` box is visible.
    - The Layers airspace toggle.
- **Manual:**
  - Compare against `docs/superpowers/research/atc-overlays/sectional-KRDM.png`
    and `sectional-KBDN.png`.
  - Measure frame time with about 400 planes.
- **After merge:** verify production at https://atc.hashbrown.dev/angular/:
  - Airports are ink.
  - Airspace draws.
  - `/api/chart/airspace` returns 200 from the CDN.
  - One airspace question gets an answer.

## Out of scope

- Class E5 (700 and 1,200 ft floors), special use airspace, TRSAs and Mode C
  veils.
- Navaids and airways (part 3) and weather (part 4).
- Live tower hours for part-time airspace.
- Altimeter correction of barometric altitudes.
