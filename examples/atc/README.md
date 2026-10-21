# atc

A live map of air traffic over the Pacific Northwest with an assistant that
answers in your own components. Hashbrown's flagship example, in Angular and React.

Start with the core files, `angular/src/app/assistant.ts` and `react/src/assistant.tsx`.
Everything else is ordinary app code reading one store.

## Run locally

Needs Node 20.19+ or 22.12+ (Vite 8's range). Put `OPENAI_API_KEY=...` in the
repository's `.env`, then run each in its own terminal:

```bash
npx nx serve atc-server
```

```bash
npx nx serve atc-angular
```

```bash
npx nx serve atc-react
```

Open http://127.0.0.1:4341/angular/ or http://127.0.0.1:4342/react/. The API server runs
on http://127.0.0.1:4340, and both dev servers proxy `/api` to it. The two apps have no
switcher between them.

The server reads these variables (from `.env` or the environment):

| Variable                  | Default      | Notes                                                                                                                                      |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`          | none         | Required. The server will not start without it, even though the map alone needs none.                                                      |
| `OPENAI_MODEL`            | `gpt-5-mini` | Any OpenAI chat model.                                                                                                                     |
| `OPENAI_BASE_URL`         | OpenAI       | For an OpenAI-compatible endpoint.                                                                                                         |
| `OPENAI_REASONING_EFFORT` | `low`        | Sent to gpt-5 and o-series models only. Set it empty to send none. An unknown value stops the server.                                      |
| `TYPESAFE_API_KEY`        | none         | Optional. Enables `/api/decide` (TypeSafe Jev). Without it `/api/decide` answers 503, and atc sends every question to chat with all cards. |
| `PORT`                    | `4340`       | The dev servers' `/api` proxy expects 4340.                                                                                                |

## How this example is built

atc shows Hashbrown in three steps. Type in the one composer and a badge shows where
Enter will send the text.

1. **Decide.** A TypeSafe Jev decision reads what you typed and routes it: to the map
   filter, to clearing the filter, or to the chat. For a chat question, a second decision
   picks which of the four cards fit (at most two, at 0.7 confidence). Below that
   confidence, or if the decision fails, the chat gets every card. Text under three
   characters is not decided; Enter sends it to chat.
   See `angular/src/app/router.ts`, `react/src/router.ts` and the `uiDecisionResource` /
   `useUiDecision` call in each core file.
2. **Filter.** A filter request goes to a structured completion that streams a
   `MapFilter` field by field into a pill of chips. The filter is app state: the map dims
   the planes it hides, and a later request refines it. Planes you point at (selected,
   highlighted or followed) are never dimmed. If the request fails, the map goes back to
   the filter it refined and the pill says so. See `angular/src/app/filter.ts` and
   `react/src/filter.tsx`. The chat opens with eight starters in two groups. "Filter the
   map" has four filters that skip the router and add nothing to the transcript: "Only
   jets below 10,000 ft", "Alaska Airlines near Seattle", "Only helicopters" and
   "Arrivals into Portland". "Ask a question" has four chat questions (highest and
   fastest, follow the fastest airliner, flying near Bend, Redmond airport). Once a
   filter is applied, a "Refine:" row above the composer offers up to two ways to narrow
   it ("Below 5,000 ft", "Only <airline>", "Within 10 nm", "Only jets"), derived from
   the filter and the traffic by `shared/src/refinements.ts`. Each keeps some of the
   matches and drops some; they are worked out once the filter run settles and hold
   still while the planes move. A click refines the filter the same way, without
   touching the transcript.
3. **Generate.** A question goes to the chat, which calls browser-side tools and renders
   only the cards the decision picked, plus Markdown.

**One schema, four uses.** `shared/src/find-aircraft.ts` defines the filter fields once.
They are the `findAircraft` tool's arguments, the filter's streamed structured output,
the arguments of `setMapFilter`, and the schemas the server pins. One pure predicate
applies a filter to an aircraft for both the map and `findAircraft`, so the map and the
assistant always agree.

**Developer tools.** Dev mode is off on a first visit, so the map and the chat show
no technical panels. Press the `{ }` button on the rail (in the header on phones, where
the drawer opens as a sheet with a close button) to open the developer drawer under the
map; the choice is remembered. Its tabs are Router, Cards, Filter, UI stream and Tools,
and show each layer's JSON as it arrives for the newest send. The drawer only reports;
nothing in it changes the app.

```text
atc/
  shared/        Framework-free TypeScript used by both apps and the server
    src/aircraft.ts      adsb.lol to Aircraft (validation, privacy whitelist)
    src/store.ts         AtcState and pure reducers; the one source of truth
    src/tools.ts         The browser-side tools the model calls
    src/tool-definitions.ts  Tool names, descriptions and schemas, pinned by the server
    src/browser-tools.ts The tools wired to the app's data, used by both core files
    src/find-aircraft.ts The filter fields (one schema, four uses) and the findAircraft query
    src/route.ts, router-input.ts   Where Enter sends typed text; the router's input
    src/filter-view.ts, filter-sync.ts   Filter chips; the request `/api/filter` takes
    src/stream-view.ts, dev-tool.ts   The developer drawer's view model and the cards decision
    src/contracts.ts     Component contracts (Skillet schemas) and the system prompt
    src/views.ts, detail-view.ts, tool-chips.ts   Pure view models for the UI
    src/chart/           Chart types, cycle, browser chart feed
    src/map/             Leaflet map, detail card, follow pill (no framework)
    src/map/chart/       Ink airports (runways, rings, labels), airspace shelves, diagrams, Layers control
    src/styles/atc.css   One stylesheet for both apps, as ordered partials
  angular/  react/       Thin shells: components and the core file
  server/                /api/run, /api/filter and /api/decide (model, prompts and schemas pinned)
                         and /api/aircraft (cached adsb.lol)
                         /api/chart/airports, /api/chart/surfaces and /api/chart/airspace (cached FAA and OSM data)
  e2e/                   Playwright against both apps with a mocked model, the demo video recorder
                         and the live prose eval
  tools/                 Vercel build output
```

Data flow: `shared/src/feed.ts` polls `/api/aircraft`, `store.applySnapshot` takes the
snapshot, and the map and components re-render. The model's tools read the same store in
the browser, so the server never sees the plane list.

All three model routes are public, so the server pins what the model sees:

- `/api/run` replaces the system prompt, the tool definitions (with its own copies from
  `shared/src/tool-definitions.ts`) and the UI response schema, drops unknown tools, and
  caps the answer's length and each message's size. The one thing a client may change is
  to narrow the cards: a schema that equals a pinned subset is kept, anything else is
  replaced with the full one.
- `/api/filter` pins its own system prompt and `mapFilterSchema`, sends no tools, and
  caps the output at 512 tokens.
- `/api/decide?kind=route|cards` pins the questions and the decision context for each
  kind. The client's questions are ignored. Without `TYPESAFE_API_KEY` it answers 503.

The map is pointer-only (planes are not keyboard-focusable); every map action is also
available from the chat.

### Add a component

1. Add a contract (name, description, Skillet props) to `shared/src/contracts.ts`. Keep
   IDs as plain `s.string` so they are held back until complete.
2. Build its view model in `shared/src/views.ts` and test it.
3. Write the Angular and React components and a fallback for each, and add them to the
   `cards` kit in both core files (`cardsKit` in `angular/src/app/assistant.ts`, `cards`
   in `react/src/assistant.tsx`).
4. Add the contract to `CARD_DEFINITIONS` in `shared/src/response-schemas.ts`, in the
   same position as in the kits. Skip it and any schema with the new card in it matches
   no pinned one, so the server falls back to the full schema, which does not include
   the card: the model can never render it.
5. Add it to the cards group of `cardGroups` in `shared/src/contracts.ts`, in the same
   position. The server pins the cards decision's questions from it; skip it and the
   decision never picks the card, so it is never offered.
6. Tell the model when to use it in `SYSTEM_PROMPT`, as a direct rule like the others
   ("show one AirportCard"). One line already covers turns that do not offer it: the
   model shows a card a rule names whenever it is offered, and answers in prose only when
   it is not. Without the rule the model has no guidance on the turns the decision picks
   it.
7. Say when it fits in `CARDS_CONTEXT`, one sentence like the others. The cards
   decision reads it with the descriptions; check the pick with
   `npx nx decide-eval atc-e2e`.

### Add a tool

See the comment on `createAtcTools` in `shared/src/tools.ts`.

## For coding agents

Read [AGENTS.md](./AGENTS.md): the file map, the invariants not to break, and the
commands to run before finishing.

## Swap the model provider

`server/src/run-handler.ts` uses `HashbrownOpenAI`. To use another provider, install its
adapter (for example `@hashbrownai/anthropic`), replace `HashbrownOpenAI.stream.text` with
`HashbrownAnthropic.stream.text`, and set that provider's key and model. `limitRequest`
in the same file sets the OpenAI Responses request's `max_output_tokens` and
`reasoning.effort`; rewrite it for the new provider's request shape, keeping the output
cap. `pinTools`, `pinResponseSchema` and `pinSystemPrompt` work on the AG-UI input and
carry over unchanged, except that `pinResponseSchema` casts to the adapter's run input
type (`OpenAIHashbrownRunAgentInput`; for example `AnthropicHashbrownRunAgentInput`).

## Tests

```bash
npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc
```

```bash
npx nx e2e atc-e2e
```

`atc-e2e` has no `build` target; `run-many` skips it there. Its `typecheck` target runs
`tsc` over the e2e code, which Playwright and Vitest run without type checking.

## Demo video

`npx nx demo atc-e2e` records the demo video (about a minute of code and app, used on the
blog) and the home page loop into `dist/examples/atc/demo/`, with a contact sheet for
review. It is deterministic and keyless, like the e2e suite: aimock answers every
question, synthetic traffic stands in for adsb.lol, with extra aircraft from
`e2e/demo/traffic.ts`, and the chart fixtures stand in for the FAA data; map tiles stay
live. It needs ffmpeg and runs Chromium headed, off screen, because
headless screencasts ignore the 2x device scale that keeps text crisp.

The storyboard (headlines, code panes and their marked lines, camera framings) is in
`e2e/demo/storyboard.ts`; `npx nx test atc-e2e` checks that every marked line still
exists. After a recording, `npx nx demo-publish atc-e2e` copies the posters into
`www/public` and points `www/src/components/elements/atc-media.ts` at content-hashed
Vercel Blob URLs; add `-- --upload` with `BLOB_READ_WRITE_TOKEN` and `VERCEL_TOKEN`
set to upload the videos, or run the commands it prints.

## Data and attribution

- **Aircraft:** [adsb.lol](https://adsb.lol), under the
  [ODbL](https://opendatacommons.org/licenses/odbl/). The browser polls `/api/aircraft`
  every 3 s; the server shares one adsb.lol call per area across requests, reuses it for
  10 s, and serves the last good snapshot (marked `X-Atc-Stale: 1`) for up to 60 s when
  adsb.lol fails. Owner and operator fields are dropped on the server.
- **Routes:** scheduled routes come from
  [vrs-standing-data.adsb.lol](https://vrs-standing-data.adsb.lol). The browser fetches
  them directly, so adsb.lol sees the user's IP address for route lookups.
- **Map tiles:** [OpenStreetMap](https://www.openstreetmap.org/copyright) standard tiles,
  shown in grey. They are free for light use under the
  [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/); a
  deployment with heavy traffic should point `TILE_LAYER` in `shared/src/map/tiles.ts` at
  a commercial tile provider.
- **Airports:** FAA NASR 28-day subscription (airports, runways, frequencies, tower
  hours) and FAA ADDS airport-mapping layers, both public domain. The server fetches
  them, caches them per AIRAC cycle and shares them through the CDN for a day.
- **Airport diagrams:** at airports without FAA mapping, taxiways, aprons and hold
  lines come from [OpenStreetMap](https://www.openstreetmap.org/copyright) through
  the Overpass API, under the
  [ODbL](https://opendatacommons.org/licenses/odbl/). `/api/chart/surfaces` serves
  that derived data under the same licence. The query is in
  `server/src/chart/upstream.ts`.
- **Airspace:** FAA ADDS Class Airspace (Class B, C, D and E surface areas), public
  domain. The server fetches it, keeps shelves within 250 nm of the map, caches it per
  AIRAC cycle and shares it through the CDN for a day. `/api/chart/airspace` serves it.
- **Not for navigation.** The chart is drawn in the style of a VFR sectional, in ink,
  but it is not one. Do not use it to plan or fly a flight.

The `/api/chart/*` routes (airports, surfaces and airspace) need no key. Each has its own
Vercel function (see Hosting below).

The map credits all of these in its attribution line. The e2e tests stub
`/api/aircraft` and `/api/chart/*` with synthetic data and block tiles and routes.

## Hosting

Only the Angular app is hosted, at https://atc.hashbrown.dev/angular/ (the root redirects
there). The React app is built and tested in this repository but not hosted;
`HOSTED_APPS` in `tools/build-vercel-output.mts` is the one line to change to host it.

`npx nx build atc` writes `.vercel/output`, with functions for `/api/run`,
`/api/filter`, `/api/decide`, `/api/aircraft`, `/api/chart/airports`, `/api/chart/surfaces` and
`/api/chart/airspace`. The hosted project (`hashbrown-atc`) needs:

- `OPENAI_API_KEY`: a dedicated OpenAI project key with a hard monthly budget.
- `TYPESAFE_API_KEY`: set on the `hashbrown-atc` Vercel project. Optional: without it
  `/api/decide` answers 503 and atc routes everything to chat with all cards.
- A Vercel Firewall rate-limit rule on `POST /api/run`. `hashbrown-atc` allows 40 requests
  per minute per IP (fixed window, 429 above it). One question makes 3 to 5 requests, one
  per tool round trip, so that is about ten questions a minute.
- The same rule on `POST /api/filter` and `POST /api/decide`, which are not configured
  yet. Configure 40 requests per minute per IP on `/api/filter`: a filter is one request,
  capped at 512 output tokens. Configure 300 requests per minute per IP on `/api/decide`:
  the router asks once per typing pause (150 ms, for text of three characters or more) and
  the cards decision once per chat turn, so a fast typist makes far more decisions than
  questions. A decision is one small TypeSafe call, capped at 4,000 characters of request.
- A look at tile traffic: past light use, point `TILE_LAYER` at a commercial tile provider
  (see "Data and attribution").

What the server pins, and why: [Securing a public endpoint](https://hashbrown.dev/docs/angular/recipes/public-endpoint).
