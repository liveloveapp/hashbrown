# atc for coding agents

atc is Hashbrown's flagship example: a live air traffic map with an assistant that
answers in the app's own components, built twice (Angular and React) on one shared
core. The repository's root `AGENTS.md` still applies (tests, TSDoc, no new
dependencies); this file covers atc.

## Where to start

- `angular/src/app/assistant.ts` and `react/src/assistant.tsx`: the core files. Steps
  1 to 3 (expose components, give the model tools, render the stream) are marked in
  both.
- `shared/src/store.ts`: `AtcState` and its pure reducers. The map, the tools and the
  components all read this one store.
- `shared/src/tools.ts`: the tools the model calls. They run in the browser.
- `shared/src/find-aircraft.ts`: the filter fields, defined once and used four ways
  (the `findAircraft` tool, the streamed filter, `setMapFilter`, the pinned schemas).
- `angular/src/app/router.ts`, `filter.ts` and `react/src/router.ts`, `filter.tsx`: the
  decide and filter steps.

## File map

| Path                                                   | What it holds                                                                                                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/src/aircraft.ts`                               | adsb.lol to `Aircraft`: validation and the privacy whitelist                                                                                                                  |
| `shared/src/store.ts`, `feed.ts`                       | State, reducers, view requests; polling `/api/aircraft`                                                                                                                       |
| `shared/src/tools.ts`, `find-aircraft.ts`              | Tool handlers; the pure aircraft query                                                                                                                                        |
| `shared/src/tool-definitions.ts`                       | Tool names, descriptions and schemas, pinned by the server                                                                                                                    |
| `shared/src/browser-tools.ts`                          | The tools wired to routes and surfaces, for both apps                                                                                                                         |
| `shared/src/contracts.ts`                              | Component contracts (Skillet), `SYSTEM_PROMPT`, `FILTER_SYSTEM_PROMPT`, `ROUTE_CONTEXT`, and `STARTER_PROMPTS`: four filter starters, then four questions                     |
| `shared/src/places.ts`, `directory.ts`                 | Built-in airports and areas (`lookupPlace`, `AREAS`); the chart airport directory (`airportByCode`)                                                                           |
| `shared/src/views.ts`, `detail-view.ts`                | Pure view models for cards and the map's detail card                                                                                                                          |
| `shared/src/route.ts`, `router-input.ts`               | `routeSchema` decoding: where Enter sends typed text, and the router's debounced input                                                                                        |
| `shared/src/filter-view.ts`, `filter-sync.ts`          | The filter pill's chips (a streaming field is dashed); the request `/api/filter` takes                                                                                        |
| `shared/src/refinements.ts`                            | The "Refine:" row: up to two suggestions that narrow the applied filter without emptying it, held per filter (`stableRefinements`)                                            |
| `shared/src/stream-view.ts`                            | The drawer's text blocks: router and cards decisions, `CARDS_SELECT_MAX`, `CARDS_MIN_CONFIDENCE`                                                                              |
| `angular/src/app/filter.ts`, `react/src/filter.tsx`    | The filter pill: structured completion against `/api/filter`                                                                                                                  |
| `shared/src/dev-tool.ts`                               | The developer drawer's view model: dev mode and height storage, tabs, the shown send (`rowTurns`, `sendActivity`)                                                             |
| `angular/src/app/dev-*.ts`, `rail.ts`                  | Angular's dev mode (remembered), the drawer under the map, the rail toggle                                                                                                    |
| `react/src/dev-mode.tsx`, `dev-drawer.tsx`, `rail.tsx` | Dev mode (remembered), the drawer under the map, the rail toggle                                                                                                              |
| `shared/src/tool-chips.ts`, `transcript.ts`            | Tool call labels and transcript rows                                                                                                                                          |
| `shared/src/sheet.ts`, `dom.ts`                        | The phone sheet's snaps; the `/` shortcut and keyboard inset                                                                                                                  |
| `shared/src/testing.ts`                                | Test fixtures, imported as `@atc/shared/testing`                                                                                                                              |
| `shared/src/chart/`                                    | Chart types, AIRAC cycle, parsing, runway geometry, browser feed                                                                                                              |
| `shared/src/chart/airspace-query.ts`                   | Pure airspace queries: `shelvesAt`, `altitudeMslFt`, `airspaceTypes`                                                                                                          |
| `shared/src/map/airspace-map.ts`                       | `createAirspaceMap`: composes the modules below                                                                                                                               |
| `shared/src/map/plane-marker.ts`                       | Marker HTML, updated in place                                                                                                                                                 |
| `shared/src/map/motion-loop.ts`, `tween.ts`            | Dead reckoning and turns between snapshots, at sub-pixel positions                                                                                                            |
| `shared/src/map/pixels.ts`                             | Pixel points and rects: overlap and containment tests                                                                                                                         |
| `shared/src/map/tag-*.ts`                              | Data tags that never overlap: layout, obstacle grid, widths, sync                                                                                                             |
| `shared/src/map/view-controller.ts`, `fit.ts`          | Applying view requests (fits, areas, reveals)                                                                                                                                 |
| `shared/src/map/area-outline.ts`                       | The faint circle around the shown area                                                                                                                                        |
| `shared/src/map/card-sync.ts`, `detail-card.ts`        | The floating detail card                                                                                                                                                      |
| `shared/src/map/follow.ts`, `follow-pill.ts`           | Follow mode and its pill                                                                                                                                                      |
| `shared/src/map/testing.ts`                            | Map test helpers: Leaflet, canvas, media and frame stubs                                                                                                                      |
| `shared/src/map/chart/`                                | Ink airports, the shared label placer, diagrams, Layers control                                                                                                               |
| `shared/src/map/chart/chart-layers.ts`                 | The chart panes and layers `createAirspaceMap` adds                                                                                                                           |
| `shared/src/map/chart/airspace-layer.ts`               | Class B, C, D and E shelves on the map, with highlight and labels                                                                                                             |
| `shared/src/map/chart/airspace-labels.ts`              | Shelf altitude labels and their anchors                                                                                                                                       |
| `shared/src/map/tiles.ts`                              | Tile URL and attribution                                                                                                                                                      |
| `shared/src/styles/atc.css`                            | Index of the stylesheet partials, in cascade order                                                                                                                            |
| `angular/src/app/`, `react/src/`                       | Thin framework shells that mirror each other                                                                                                                                  |
| `server/src/run-handler.ts`                            | `/api/run`: pins the system prompt, tool definitions and UI response schema, caps output                                                                                      |
| `server/src/filter-handler.ts`                         | `/api/filter`: pins the filter prompt and schema, no tools, 512-token cap                                                                                                     |
| `server/src/decide-handler.ts`                         | `/api/decide?kind=route\|cards`: TypeSafe Jev with the questions and context pinned per kind; 503 without a key                                                               |
| `server/src/aircraft-handler.ts`                       | `/api/aircraft`: cached, stripped adsb.lol                                                                                                                                    |
| `server/src/chart-airports-handler.ts`                 | `/api/chart/airports`: NASR airports, cached per cycle                                                                                                                        |
| `server/src/chart-surfaces-handler.ts`                 | `/api/chart/surfaces`: FAA and OSM taxiways, aprons, holds                                                                                                                    |
| `server/src/chart-airspace-handler.ts`                 | `/api/chart/airspace`: FAA class airspace, cached per cycle                                                                                                                   |
| `server/src/chart/`                                    | NASR zip and CSV readers, upstream fetches, surfaces merge, cache                                                                                                             |
| `e2e/src/`                                             | Playwright for both apps (including the dev drawer): `atc.spec.ts`, the scripted model turns in `model.ts`, the traffic and chart fixtures, and `stubs.ts`, which serves them |
| `e2e/demo/`                                            | The demo video: storyboard, director page, recorder, ffmpeg encoding                                                                                                          |
| `e2e/prose/`                                           | Live prose eval: real model answers checked for leaked rules, extra cards and the highlight they leave on the map                                                             |
| `e2e/decide/`                                          | Live decide eval: labelled router and cards probes sent to TypeSafe Jev, scored the way the apps act                                                                          |

## Add a component or a tool

- Component: README, "Add a component". A new card goes in four places, in the same
  position in each: the `cards` kit in both core files (`angular/src/app/assistant.ts`,
  `react/src/assistant.tsx`), `CARD_DEFINITIONS` in `shared/src/response-schemas.ts` and
  `cardGroups` in `shared/src/contracts.ts`. It also needs a direct rule in
  `SYSTEM_PROMPT` ("show one X") and a sentence in `CARDS_CONTEXT` saying when it fits.
  Missing from `CARD_DEFINITIONS`, any schema with the card falls back to the full one,
  which lacks it; missing from `cardGroups`, the cards decision never picks it and it is
  never offered.
- Tool: the comment on `createAtcTools` in `shared/src/tools.ts`. Its name,
  description and schema go in `ATC_TOOL_DEFINITIONS` (`shared/src/tool-definitions.ts`),
  which the server sends to the model; a tool missing there is dropped.

## Invariants not to break

- Only fields validated in `shared/src/aircraft.ts` (hex, label, kind, numbers) go into
  marker HTML. Everything else is rendered as text.
- `normalizeAdsbLol` copies whitelisted fields only; never spread adsb.lol entries.
- The server pins all three model routes: `/api/run`, `/api/filter` and `/api/decide` each
  fix their prompt or questions, schemas and output cap, and ignore what a client sends
  for them. A new model route pins the same things.
- The map filter is state (`AtcState.mapFilter`), not a chat message: the filter route
  adds nothing to the transcript, the map and `findAircraft` share one predicate, and
  planes the user points at (selected, highlighted, followed) are never dimmed.
- Without `TYPESAFE_API_KEY`, `/api/decide` answers 503 and everything routes to chat with
  all cards; a failed or unsure decision must never block a send.
- The system prompt, the tool definitions, the UI response schema and the output cap are
  fixed on the server; clients cannot change them. The one exception: the assistant narrows
  its cards per turn, so the server keeps a response schema that equals an entry of
  `PINNED_RESPONSE_SCHEMAS` (Markdown plus any non-empty subset of the cards, in pinned
  order) and replaces anything else with the full schema. A request that omits the response
  schema gets free-form text, still under the pinned prompt, tools and cap.
- The map moves only through store view requests: the newest wins, follow mode wins over
  all, a user drag or zoom cancels.
- Markers update in place (`updatePlane`); never rebuild them on a snapshot.
- Data tags never overlap: `tag-layout.ts` places them, and its `tagRect` must match
  the `data-tag` offsets in `styles/markers.css`. Layouts read no DOM geometry.
- Moving planes are drawn by the motion loop at unrounded positions; Leaflet's
  `setLatLng` rounds to whole pixels, so call it only to sync markers before a zoom.
- Component IDs (`hex`, `airport`) never stream, so a card never resolves a partial ID.
- Shared code stays framework-free; the two apps stay thin and mirror each other.
- Chart colours are defined only in `styles/chart.css` and used only on the map
  (`design-rules.test.ts`). Airports are ink: true-size runways, a ring only where
  runways cannot be drawn, and ink data blocks; the AirportCard badge is an ink
  outline.
- Chart layers redraw on zoom, move and chart, surfaces or layers changes, never on
  aircraft snapshots.
- Airspace queries (`chart/airspace-query.ts`) are pure functions of shelves and an
  aircraft; they never read the store or the map.
- Altitude precedence for airspace is ground, then GNSS, then baro. An aircraft on the
  ground is inside surface shelves.
- Chart features are never filled cobalt; selection stays on planes.
- Airport codes are runtime strings validated by `lookupPlace` and `airportByCode`,
  never a Skillet enum.
- Stylesheet partials load in the order `atc.css` lists; later files override earlier
  ones.
- `shared/src/design-rules.test.ts` enforces the design rules it can check; keep it
  passing.
- The demo video's code panes mark lines by pattern (`e2e/demo/storyboard.ts`). If you
  change a marked line, update its pattern; `npx nx test atc-e2e` fails until you do.
- After changing `SYSTEM_PROMPT` or a component description, restart `atc-server` and run
  `npx nx prose-eval atc-e2e` (real model, needs `OPENAI_API_KEY` and the dev servers).
  It flags prose that echoes a rule, names a component or tool, stops on a colon,
  promises a tap the app doesn't have or opens with a lead-in; answers with more cards
  than the prompt asks for; and answers that show aircraft but leave none highlighted.
- After changing `ROUTE_CONTEXT`, `CARDS_CONTEXT`, `routeSchema` or a card description, run
  `npx nx decide-eval atc-e2e` (live decisions, needs `TYPESAFE_API_KEY`, no servers). It
  fails when the router gets fewer than 28 of its 34 labelled probes (or 16 of 17 held-out
  ones) right, or fewer than 7 of 8 cards probes narrow confidently to the expected card.
- Builds stay free of warnings. Leaflet 1.x ships only CommonJS, so the Angular build
  lists it in `allowedCommonJsDependencies` (`angular/project.json`); the React build
  splits React and Hashbrown into their own chunks (`react/vite.config.mts`) so no chunk
  passes Vite's 500 kB warning. A new library goes in one of those groups or stays small.

## Commands

```bash
npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc
npx nx e2e atc-e2e
npx nx typecheck atc-e2e
# Live, opt-in, cost a little per run:
npx nx decide-eval atc-e2e   # needs TYPESAFE_API_KEY
npx nx prose-eval atc-e2e    # needs OPENAI_API_KEY and the dev servers
```

Tests use top-level `test(...)` only, with arrange, act and assert separated by blank
lines.
