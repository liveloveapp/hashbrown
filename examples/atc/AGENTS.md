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

## File map

| Path                                            | What it holds                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `shared/src/aircraft.ts`                        | adsb.lol to `Aircraft`: validation and the privacy whitelist         |
| `shared/src/store.ts`, `feed.ts`                | State, reducers, view requests; polling `/api/aircraft`              |
| `shared/src/tools.ts`, `find-aircraft.ts`       | Tool definitions; the pure aircraft query                            |
| `shared/src/contracts.ts`                       | Component contracts (Skillet) and `SYSTEM_PROMPT`                    |
| `shared/src/views.ts`, `detail-view.ts`         | Pure view models for cards and the map's detail card                 |
| `shared/src/tool-chips.ts`, `transcript.ts`     | Tool call labels and transcript rows                                 |
| `shared/src/map/airspace-map.ts`                | `createAirspaceMap`: composes the modules below                      |
| `shared/src/map/plane-marker.ts`                | Marker HTML, updated in place                                        |
| `shared/src/map/motion-loop.ts`, `tween.ts`     | Dead reckoning and turns between snapshots, at sub-pixel positions   |
| `shared/src/map/view-controller.ts`, `fit.ts`   | Applying view requests (fits, areas, reveals)                        |
| `shared/src/map/card-sync.ts`, `detail-card.ts` | The floating detail card                                             |
| `shared/src/map/follow.ts`, `follow-pill.ts`    | Follow mode and its pill                                             |
| `shared/src/map/tiles.ts`                       | Tile URL and attribution                                             |
| `shared/src/styles/atc.css`                     | Index of the stylesheet partials, in cascade order                   |
| `angular/src/app/`, `react/src/`                | Thin framework shells that mirror each other                         |
| `server/src/run-handler.ts`                     | `/api/run`: pins the system prompt and tool definitions, caps output |
| `server/src/aircraft-handler.ts`                | `/api/aircraft`: cached, stripped adsb.lol                           |
| `e2e/src/`                                      | Playwright for both apps with a mocked model and synthetic frames    |

## Add a component or a tool

- Component: README, "Add a component".
- Tool: the comment on `createAtcTools` in `shared/src/tools.ts`. Its name,
  description and schema go in `ATC_TOOL_DEFINITIONS`, which the server sends to the
  model; a tool missing there is dropped.

## Invariants not to break

- Only fields validated in `shared/src/aircraft.ts` (hex, label, kind, numbers) go into
  marker HTML. Everything else is rendered as text.
- `normalizeAdsbLol` copies whitelisted fields only; never spread adsb.lol entries.
- The system prompt, the tool definitions and the output cap are fixed on the server;
  clients cannot change them. (The UI response schema still comes from the client.)
- The map moves only through store view requests: the newest wins, follow mode wins over
  all, a user drag or zoom cancels.
- Markers update in place (`updatePlane`); never rebuild them on a snapshot.
- Moving planes are drawn by the motion loop at unrounded positions; Leaflet's
  `setLatLng` rounds to whole pixels, so call it only to sync markers before a zoom.
- Component IDs (`hex`, `airport`) never stream, so a card never resolves a partial ID.
- Shared code stays framework-free; the two apps stay thin and mirror each other.
- Stylesheet partials load in the order `atc.css` lists; later files override earlier
  ones.
- `shared/src/design-rules.test.ts` enforces the design rules it can check; keep it
  passing.

## Commands

```bash
npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc
npx nx e2e atc-e2e
```

Tests use top-level `test(...)` only, with arrange, act and assert separated by blank
lines.
