# atc

A live map of air traffic over the Pacific Northwest with an assistant that
answers in your own components. Hashbrown's flagship example, in Angular and React.

Start with the core files, `angular/src/app/assistant.ts` and `react/src/assistant.tsx`.
They show Hashbrown's three steps: expose your components, give the model tools, render
the stream. Everything else is ordinary app code reading one store.

## Run locally

Needs Node 20.12 or later. Put `OPENAI_API_KEY=...` in the repository's `.env`, then run
each in its own terminal:

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

| Variable                  | Default      | Notes                                                                                 |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`          | none         | Required. The server will not start without it, even though the map alone needs none. |
| `OPENAI_MODEL`            | `gpt-5-mini` | Any OpenAI chat model.                                                                |
| `OPENAI_BASE_URL`         | OpenAI       | For an OpenAI-compatible endpoint.                                                    |
| `OPENAI_REASONING_EFFORT` | `low`        | Sent to gpt-5 and o-series models only. Set it empty to send none.                    |
| `PORT`                    | `4340`       | The dev servers' `/api` proxy expects 4340.                                           |

## How this example is built

```text
atc/
  shared/        Framework-free TypeScript used by both apps and the server
    src/aircraft.ts      adsb.lol to Aircraft (validation, privacy whitelist)
    src/store.ts         AtcState and pure reducers; the one source of truth
    src/tools.ts         The browser-side tools the model calls
    src/find-aircraft.ts The query behind the findAircraft tool
    src/contracts.ts     Component contracts (Skillet schemas) and the system prompt
    src/views.ts, detail-view.ts, tool-chips.ts   Pure view models for the UI
    src/map/             Leaflet map, detail card, follow pill (no framework)
    src/styles/atc.css   One stylesheet for both apps, as ordered partials
  angular/  react/       Thin shells: components and the core file
  server/                /api/run (model and system prompt pinned) and /api/aircraft (cached adsb.lol)
  e2e/                   Playwright against both apps with a mocked model
  tools/                 Vercel build output
```

Data flow: `shared/src/feed.ts` polls `/api/aircraft`, `store.applySnapshot` takes the
snapshot, and the map and components re-render. The model's tools read the same store in
the browser, so the server never sees the plane list.

`/api/run` is public, so the server fixes everything but the conversation: it replaces
the system prompt, forwards only the atc tools, and caps the answer's length.

The map is pointer-only (planes are not keyboard-focusable); every map action is also
available from the chat.

### Add a component

1. Add a contract (name, description, Skillet props) to `shared/src/contracts.ts`. Keep
   IDs as plain `s.string` so they are held back until complete.
2. Build its view model in `shared/src/views.ts` and test it.
3. Write the Angular and React components and a fallback for each, and add them to
   `components` in both core files.
4. Tell the model when to use it in `SYSTEM_PROMPT`.

### Add a tool

See the comment on `createAtcTools` in `shared/src/tools.ts`.

## For coding agents

Read [AGENTS.md](./AGENTS.md): the file map, the invariants not to break, and the
commands to run before finishing.

## Swap the model provider

`server/src/run-handler.ts` uses `HashbrownOpenAI`. To use another provider, install its
adapter (for example `@hashbrownai/anthropic`), replace `HashbrownOpenAI.stream.text` with
`HashbrownAnthropic.stream.text`, and set that provider's key and model. `limitRequest`
in the same file edits the OpenAI request (`tools`, `max_completion_tokens`,
`reasoning_effort`); rewrite it for the new provider's request shape, keeping the tool
allowlist and the output cap.

## Tests

```bash
npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc
```

```bash
npx nx e2e atc-e2e
```

`atc-e2e` has only `lint` and `e2e` targets; `run-many` skips the rest.

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

The map credits all three in its attribution line. The e2e tests stub `/api/aircraft`
with synthetic frames and block tiles and routes.

## Hosting

Only the Angular app is hosted, at https://atc.hashbrown.dev/angular/ (the root redirects
there). The React app is built and tested in this repository but runs locally for now;
`HOSTED_APPS` in `tools/build-vercel-output.mts` is the one line to change to host it.

`npx nx build atc` writes `.vercel/output`. The hosted project (`hashbrown-atc`) needs:

- `OPENAI_API_KEY`: a dedicated OpenAI project key with a hard monthly budget.
- A Vercel Firewall rate-limit rule on `/api/run` (for example 20 requests per minute per IP).
- A look at tile traffic: past light use, point `TILE_LAYER` at a commercial tile provider
  (see "Data and attribution").
