# atc: Chart Overlays, Part 1: Foundation and Airports

Date: 2026-10-10
Status: design approved in conversation (brainstorm with visual companion)
Builds on: `2026-10-09-atc-flagship-demo-design.md`,
`2026-10-10-atc-lla-redesign-design.md`, `2026-10-10-atc-all-traffic-map-tools-design.md`
Research: `docs/superpowers/research/atc-overlays/vector-airport-overlays.md`,
`docs/superpowers/research/atc-overlays/sectional-chart-symbology.md`

## Goal

Give atc's map the aviation picture pilots expect, drawn the way a VFR sectional
draws it, and let the assistant use it. Part 1 adds the overlay foundation and
airports: about 265 public-use airports as sectional chart symbols with data
blocks, accurately sized airport diagrams when zoomed in, a layers control, and
tools such as "show me Redmond airport".

Success:

- A pilot reads the airports with no translation: towered fields are blue,
  non-towered fields are magenta, symbol shapes and data blocks follow the
  sectional, and diagrams follow the FAA airport-diagram legend.
- Runways are true to size: within a few metres of the FAA's surveyed runway ends.
- Live traffic stays smooth. Chart layers never redraw on the 3 s aircraft
  snapshot.
- Everything not coloured by the chart stays LLA ink, and cobalt stays reserved
  for selection and highlight.

## The overlay programme

The request (airports, airspace, navaids, airways, weather) is four sub-projects
on one foundation. Each gets its own spec, plan and PR. This spec is part 1.

| #   | Sub-project                         | Adds                                                                                                                                                |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Foundation and airports (this spec) | Chart data routes, the `chart` and `layers` store slices, the layers control, airport symbols and diagrams, `showAirport`, `setLayers`, AirportCard |
| 2   | Class B/C/D airspace                | Airspace shelves with floor and ceiling labels, point-in-shelf test, `showAirspace`, `findAircraft` `inAirspace`                                    |
| 3   | Navaids, fixes, airways             | VOR family and NDB symbols with compass roses, fixes, Victor airway bands, `lookupFix`                                                              |
| 4   | Weather                             | A cached `/api/metars` route, flight-category dots, a METAR tool and card                                                                           |

A sectional raster basemap (the FAA `VFR_Sectional` tile service, zoom 8 to 12) is
a possible later toggle, outside all four.

Decisions in part 1 that bind the later parts:

- **Symbology is chart-true.** Lines, symbols and label formats follow the current
  FAA sectional, as measured in the symbology research. Text in data blocks takes
  the symbol's colour, as on the chart. Ink is used for everything the chart
  itself does not colour.
- **Selection is a change of form.** Cobalt (`#002fa7`) is too close to chart blue
  (1.9:1) and to the weather service's MVFR blue (1.1:1), so a selected chart
  feature gets a cobalt halo and everything else dims. A chart symbol is never
  filled cobalt.
- **Data comes through cached server routes** (`/api/chart/*`), not bundled
  snapshots and not direct browser calls.
- **Layer visibility lives in the store**, and the map draws only what it says.

## Facts the design depends on

From the research, checked against live FAA data on 2026-10-10:

- **Airport classes:** Redmond (KRDM) is Class D with a part-time tower
  (`CT 124.5★`), not Class C. Bend (KBDN) is non-towered in a Class E surface
  area, and its runway is 17/35; OSM still says 16/34. Symbols and classes
  therefore come from data, never from hand-written tables.
- **Airport count:** about 1,150 airports sit inside the 250 nm area. About 265
  are public-use, including heliports and seaplane bases, and about 840 are
  private.
- **FAA runways:** the FAA `Runways` layer builds every runway from the NASR
  runway ends, which are surveyed to about ±1 ft. Lengths match within 1 to 2 ft
  and widths within about 0.3 ft. The server therefore computes each runway
  rectangle from the NASR runway ends, the same surveyed points, and needs no
  ADDS call for runways.
- **FAA airport surfaces:** full surface geometry exists for only 190 airports
  nationally, in the FAA `AM_*` airport-mapping layers. In the area those are
  KSEA, KRNT, KPSC, KYKM, KALW, KAWO and KPUW. Bend, Redmond, Portland and
  Eugene have none.
- **OSM airport surfaces:** OSM has taxiways, aprons and hold lines at every test
  airport, but only 309 of 1,645 taxiway segments carry a letter. OSM data is
  ODbL.
- **FAA airport diagram PDFs:** these are vector and to scale but not
  georeferenced, and Bend has none. They are not used.

## Architecture and data flow

### Server routes

Both routes are built like `/api/aircraft`: a per-instance cache, a shared
in-flight upstream call, the last good copy served with `X-Atc-Stale: 1` when an
upstream fails, and 502 when there is nothing to serve.

**`GET /api/chart/airports`** returns about 265 public-use airports (`PRIVATEUSE = 0`,
including heliports and seaplane bases) inside `AREAS.pnw`. Each entry has:

- ICAO code and FAA ident, name, city, state, position and elevation
- `towered`, from NASR `TWR_TYPE_CODE` starting `ATCT`, and `towerPartTime`
- frequencies: CT, ATIS, CTAF and UNICOM (NASR `FRQ`)
- `lighting`, `fuel` and `military`
- runways, each with end numbers, length × width, surface and the four corners,
  computed from the NASR runway ends
- `rank` for decluttering: towered first, then longest hard runway

The estimate is about 120 KB of JSON, about 25 KB gzipped. The response also
carries `cycle` (for example `2610`) and `effective` dates. When a new cycle's
fetch fails, the route serves the previous cycle's last good copy.

**`GET /api/chart/surfaces?airport=KRDM`** returns one airport's diagram surfaces:
taxiway polygons or lines, aprons, hold-short lines, taxiway labels and hot spots,
and `source: 'faa' | 'osm' | 'runways-only'`. It returns no runways, which come
from the airports payload. The route validates the `airport` value against ADDS
`US_Airport`.

Sources are merged in this order:

1. **Taxiways, aprons and hot spots** come from the FAA `AM_*` layers where they
   exist.
2. **Elsewhere,** OSM via Overpass supplies `aeroway=taxiway|taxilane|apron|holding_position`
   inside the aerodrome area, with `ref` labels. OSM runways are ignored.

Runways are not part of this payload. The browser draws them from the airports
payload.

### Upstreams and caching

- **NASR:** the 28-day CSV zips `APT` (`APT_BASE`, `APT_RWY`, `APT_RWY_END`) and
  `FRQ` from `nfdc.faa.gov/webContent/28DaySub/extra/`. A small zip reader on
  `node:zlib` (`inflateRawSync` over the central directory) extracts them, with no
  new dependency. The parser checks each CSV header and throws a named error when
  a needed column is missing.
- **FAA ADDS:** the FeatureServers under
  `services6.arcgis.com/ssFJjBXIUyZDrSYZ` (`US_Airport`, `Runways`, `AM_*`),
  queried with `f=geojson`, a bounding box or `where`, `outSR=4326` and per-layer
  `outFields`. ArcGIS can answer HTTP 200 with an error body, so the fetch helpers
  throw on one.
- **Overpass:** one query per airport with a descriptive User-Agent, like the one
  sent to adsb.lol.
- **Cycles:** a pure `currentCycle(date)` returns the AIRAC cycle ident and
  effective date. NASR's 28-day cycle is the only cycle, and there is no separate
  56-day cycle. Server cache keys and the attribution use it.
- **Cache lifetimes:** per-instance memory per cycle, and
  `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800` on
  responses. Upstreams see about one call per airport per day.
- **Timeouts:** each upstream call has its own timeout. A timeout counts as an
  ordinary failure.
- **Vercel:** two new functions in `tools/build-vercel-output.mts`, `chart-airports`
  (`maxDuration` 30, for a cold NASR parse) and `chart-surfaces` (`maxDuration` 20).
  `server/src/app.ts` mounts both for local development and e2e.

### Browser

- **`shared/src/chart/chart-feed.ts`:** loads `/api/chart/airports` once at
  startup. If that fails it retries after 30 s and 2 min, then every 10 min.
- **New store slices:**
  - `chart: { status: 'loading' | 'ready' | 'limited', airports, cycle }`, where
    `limited` means the 40-airport fallback is in use
  - `surfaces: ReadonlyMap<code, Surfaces | 'loading' | 'failed'>`
  - `layers: { airports: boolean }`, with airports on by default
- **The 40-airport table:** today's table in `places.ts` becomes the fallback and
  the alias source (SeaTac, Coos Bay and so on). It is not deleted.
- **Fetching diagrams:** `surfaces` are fetched when an airport is on screen at
  zoom 12 or more, and cached for the session. The browser culls airport markers
  to the view padded by 50%.
- **Airport codes:** `AirportCode` becomes `string`. The `AIRPORT_CODES` enums in
  `contracts.ts` (ArrivalsBoard `airport`) and `find-aircraft.ts` (`approaching`)
  become `s.string` checked at runtime. An enum of about 300 codes would add about
  1.5k tokens to every request.
- **Store helpers:** `AIRPORTS[...]` lookups in `store.ts`, `views.ts`,
  `airspace-map.ts` and `view-controller.ts` go through one `airportByCode(state, code)`.

## Map rendering

New code goes in `shared/src/map/chart/`, framework-free, and `airspace-map.ts`
composes it the way it composes `follow` and `card-sync`.

| File                | Role                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| `airport-symbol.ts` | A pure function from an airport to symbol SVG and kind                    |
| `data-block.ts`     | Builds data-block DOM with text nodes only                                |
| `declutter.ts`      | Pure. Which symbols and blocks show at a zoom, and greedy block placement |
| `diagram-layer.ts`  | Diagrams at zoom 12 and above, `L.geoJSON` on a canvas renderer           |
| `layers-control.ts` | The Layers pill and checklist                                             |

### Airport symbols (zoom 11 and below)

These follow the sectional (Chart Users' Guide 9 July 2026, pp. 14–15 and 23; IAC 2
§3.9.2.3). The pixel sizes are estimates, because the FAA gives none.

| Airport                                    | Symbol                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Hard runway 1,500–8,069 ft                 | 12 px filled disc with the runways knocked out in white, 2 px bars along the true NASR bearings             |
| Soft runway, or hard runway under 1,500 ft | 10 px open ring, 1.5 px stroke                                                                              |
| Longest hard runway 8,070 ft or more       | The 12 px disc at zoom 10 and below; at zoom 11, the true runway rectangles outlined at 2 px with no circle |
| Fuel available                             | Four 3 × 2 px square ticks at N, E, S and W, outside the disc or ring                                       |
| Military or joint                          | Double ring (12 and 6 px); joint fields also get ticks                                                      |
| Heliport or seaplane base                  | Ring with "H", or an anchor; glyph from zoom 10                                                             |
| Colour                                     | `--atc-chart-blue` when towered, `--atc-chart-magenta` otherwise                                            |

Data blocks keep the sectional's line order and colour, with NASR's own capitals
in the text (CSS `uppercase` stays banned). The first line is the name and ident,
for example `ROBERTS FLD (RDM)`. The second is `CT 124.5★ ATIS 119.025`, where ★
marks a part-time tower. The third is `3082 *L 70 122.95`: elevation, lighting,
longest runway in hundreds of feet, then CTAF or UNICOM. Names are set in Hanken
Grotesk 600 at about 11 px and figures in JetBrains Mono at about 10 px.

What shows at each zoom (starting values, to be tuned by eye during the build):

| Zoom  | Symbols                                        | Data blocks                                                                                                   |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| ≤ 7   | Towered, or a hard runway of 5,000 ft or more  | none                                                                                                          |
| 8–9   | Plus hard runways of 3,000 ft or more          | towered fields only                                                                                           |
| 10–11 | All                                            | all that fit                                                                                                  |
| ≥ 12  | Diagram replaces the symbol once surfaces load | name and ident only; a name block stays once the chart has loaded, even after the diagram replaces the symbol |

Blocks are placed greedily by `rank`. A block that would overlap a higher-ranked
block or symbol is skipped, and its symbol still shows.

### Airport diagrams (zoom 12 and above)

These follow the FAA airport-diagram legend (Chart Users' Guide pp. 123–132).

| Feature          | Drawing                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Runways          | Ink polygons. Where true width is under 3 px, an ink centreline at least 3 px wide is drawn too                                 |
| Taxiways         | FAA polygons, or OSM centrelines stroked at true width (50 ft unless tagged) with a 1.5 px minimum, in `--atc-diagram-pavement` |
| Aprons           | Polygons in `--atc-diagram-pavement`                                                                                            |
| Runway numbers   | White JetBrains Mono at each threshold, on a small ink tab so the text stays legible                                            |
| Hold-short lines | Double ink bars                                                                                                                 |
| Hot spots        | `--atc-diagram-hotspot` ring with an `HS n` label                                                                               |
| Taxiway letters  | From zoom 14, ink Hanken Grotesk 700                                                                                            |

Until an airport's surfaces load, or if they fail, its chart symbol stays visible
and the FAA runway rectangles from the airports payload are drawn as a minimal
diagram.

### Panes, performance and styles

- **Panes:** custom Leaflet panes keep a fixed order: tiles, then an empty
  airspace pane for part 2, then airports and diagrams, then planes, then the
  detail card. Planes always draw above chart features.
- **Redraws:** chart layers redraw only on `zoomend`, on `moveend` (which also
  fetches surfaces for visible airports), and on changes to the `chart`,
  `surfaces` or `layers` slices. They never redraw on aircraft snapshots. Symbols
  are built once and toggled by declutter.
- **Dashed lines:** every dashed or ticked path sets `lineCap: 'butt'`, since
  Leaflet's default round caps close dash gaps. Part 1 has few dashes; parts 2
  and 3 rely on this.
- **Styles:** a new partial `styles/chart.css`, listed in `atc.css` after
  `markers.css`, defines:
  - `--atc-chart-blue: #086CA8`
  - `--atc-chart-magenta: #76334F`
  - `--atc-diagram-pavement: #CFCFCF`
  - `--atc-diagram-hotspot: #955101`

  The values are measured from the 3 Sep 2026 sectional GeoTIFFs and the
  airport-diagram legend.

- **Design rules:** `design-rules.test.ts` gains a rule that these tokens and
  hexes may appear only in `styles/chart.css`, `shared/src/map/chart/` and the
  AirportCard's tower badge. The existing rules (no gradients, shadows,
  `uppercase` or extra fonts) still apply.

### Layers control

A white, bordered pill labelled "Layers" sits above the zoom control and opens a
checklist (Airports in part 1). It is a real control, so it is focusable, works
with the keyboard and closes with Escape. When `chart.status` is `limited` its
row reads "Airports · limited data".

The attribution line adds: `Airport data FAA (cycle 2610) · diagrams © OpenStreetMap contributors, ODbL · Not for navigation`.

## Assistant: tools, component and prompt

### Changed tools

- **`lookupPlace`** searches the chart airports by ICAO code, FAA ident, name or
  city, plus the alias table, keeping the existing exact-then-prefix matching. It
  returns `{ found, code, faa, name, city, towered }`. While `chart.status` is
  `loading` it waits up to 5 s. It then uses whatever is loaded, which may be the
  fallback table.
- **`findAircraft`** (`near.airport` and `approaching`), **`showArea`** and the
  **ArrivalsBoard** `airport` prop accept any chart airport code. An unknown code
  returns `unknownPlace`.

### New tools

Both are added to `ATC_TOOL_DEFINITIONS`, so the server pins them.

**`showAirport({ airport })`**

- Turns the airports layer on and requests a view of the airport's runway bounds
  at diagram zoom, using a new `ViewRequest` kind `'airport'` under the existing
  rules: follow mode wins, the newest request wins, and a drag or zoom cancels it.
- Returns `{ shown, code, name, towered, towerPartTime, frequencies, elevationFt, runways, diagram: 'faa' | 'osm' | 'runways-only', aircraftWithin3Nm, moved }`.
  `runways` holds end numbers, length × width and surface.
- While following a plane it returns `moved: false` with `followingReason`, like
  `showArea`.

**`setLayers({ airports })`**

- Each layer is `boolean | null`, where null leaves it unchanged. Later parts add
  their keys here.
- Returns `{ layers }`.

Each new tool gets RUNNING and DONE labels in `tool-chips.ts` (for example
`showAirport · KRDM`) and a scripted e2e scenario.

### New component: AirportCard

- **Contract:** `airport: s.string`. The string is held back until complete, like
  `hex`.
- **Content:** name and ident; a towered or non-towered badge in chart blue or
  magenta; frequencies in mono, with ★ for part-time; elevation; and runways
  listed as `17/35 · 7,040 × 100 · asphalt`.
- **Click:** shows the airport on the map.
- **Fallback:** an "Identifying airport…" skeleton.
- **Implementation:** the view model goes in `views.ts`, and the component is
  built once in each of Angular and React.

### Prompt additions (`SYSTEM_PROMPT`)

- For questions about an airport itself (runways, tower, frequencies, "show me
  Redmond"), call `lookupPlace`, then `showAirport`, then show one AirportCard.
  Do not repeat in prose what the card shows.
- When the user asks to show or hide airports, call `setLayers`.
- Frequencies, runways and tower status come only from tool results. They are FAA
  data for the current cycle and not for navigation.

Add the starter prompt "Show me Redmond airport."

## Error handling

| Failure                                    | Behaviour                                                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Airports route fails with nothing cached   | 502. The browser uses the 40-airport fallback, `chart.status` is `limited`, and it retries on the schedule above. The fallback has no tower or runway data, so it draws open ink rings with ink idents: no chart colour, data blocks or diagrams |
| An upstream fails but the server has data  | The last good copy, with `X-Atc-Stale: 1`; no visible change                                                                                                                                                                                     |
| Surfaces for one airport fail or are empty | The symbol stays; the runway rectangles are drawn as a minimal diagram; `showAirport` reports `diagram: 'runways-only'`                                                                                                                          |
| A NASR CSV is missing a needed column      | A named error and a log line; the server keeps serving its stale copy; no partly parsed airport ships                                                                                                                                            |
| Bad upstream values                        | Idents must match `^[A-Z0-9]{2,4}$`, coordinates and frequencies must be finite numbers in range, and text goes into text nodes only. Rows that fail are dropped and the count is logged                                                         |
| `airport` parameter not in the list        | 400                                                                                                                                                                                                                                              |

## Testing

Tests use top-level `test(...)` with arrange, act and assert, and are written to
fail first.

- **Shared:**
  - `currentCycle` across cycle boundaries
  - the zip reader, against a small committed fixture zip
  - NASR row parsing and the header checks
  - symbol kind and colour (open ring, disc or outline; fuel ticks; military)
  - data-block text, including ★, lighting and the rounding to hundreds
  - declutter thresholds and greedy placement
  - the surfaces merge order
  - `lookupPlace` over chart airports, aliases and the fallback
  - every new or changed tool handler, including refusals while following and
    unknown codes
  - the `'airport'` view request
  - the `layers` reducer
  - the chart-token allowlist in the design rules
- **Server:** both handlers with stubbed `fetchFn`: caching per cycle, shared
  in-flight calls, stale fallback, 502, and `airport` validation. The fixtures are
  trimmed real NASR, ADDS and Overpass responses under `server/src/fixtures/`.
- **Angular and React:** AirportCard and its fallback, and the Layers pill
  toggling the store, kept the same in both.
- **e2e:** `/api/chart/*` is stubbed with fixtures, like `/api/aircraft`.
  Scenarios:
  - "Show me Redmond airport": the tool chip, the map at diagram zoom, and the
    AirportCard
  - "Hide airports"
  - the Layers control by keyboard
- **Manual:**
  - frame time with about 400 planes, all symbols and one loaded diagram, at
    1440×900 and 375×812
  - KRDM, KBDN and KPDX compared side by side with the sectional reference crops
    in `docs/superpowers/research/atc-overlays/`

Run `npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc`
and `npx nx e2e atc-e2e`.

## Documentation

- **README:** "Data and attribution" gains FAA NASR and ADDS (public domain), and
  OSM airport surfaces (ODbL, served as a derivative database by
  `/api/chart/surfaces`, with the source query documented). The server's table of
  environment variables is unchanged.
- **AGENTS.md:** the file map gains `shared/src/chart/`, `shared/src/map/chart/`
  and the two handlers. Invariants added:
  - chart colours stay inside the allowlist
  - chart layers never redraw on aircraft snapshots
  - chart symbols are never filled cobalt
  - airport codes are validated at runtime, not by enum

## Out of scope

Airspace (part 2), navaids and airways (part 3), weather (part 4), the sectional
raster basemap, private airports, extracting geometry from FAA PDFs, dark mode, and
any change to which apps are hosted.
