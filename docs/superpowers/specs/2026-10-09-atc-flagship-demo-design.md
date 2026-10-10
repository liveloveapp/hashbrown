# atc: Hashbrown's Flagship Demo

Date: 2026-10-09
Status: design approved in conversation; awaiting written-spec review

## 1. Why

Users are not responding well to the invoicing example, Hashbrown's only public
example. It is about 30,500 lines (15,100 non-test), built on B4, Postgres and
Pretable. It needs an API key and two servers to run, and visitors wait 9 to 24
seconds for an answer. It never uses `useTool`, which the homepage hero teaches;
it renders answers from server tool-call arguments instead of `message.ui`; it
imports the private `ɵcreateUiKit`; and it has no Angular version, although the
docs site defaults to Angular.

Competitive research (2026-10-09) found that Hashbrown's founding ideas are now
common: trusted component catalogs, schema-validated props, streaming partial
props, and Angular support. The defensible differentiators are narrower, and the
demo exists to make them visible:

1. **The tool loop runs in the browser** behind a stateless adapter route, with
   no agent server and no vendor cloud.
2. **Skillet decides field by field what streams.** Fields that must not be
   seen half-written arrive whole while their neighbours stream.
3. **Angular is signals-native with React parity**, not a port.
4. **Trusted components are real app components.** They can read live app
   state, and the assistant can drive the page as well as the chat.

An aviation-specific concept ("Preflight", a VFR flight briefing derived from
B4's navlog example) was rejected as too technical for a broad audience of
Angular and React developers. atc keeps air travel, which everyone relates to,
and drops the cockpit vocabulary.

## 2. What atc is

A full-window live map of real aircraft around Chicago O'Hare, from public ADS-B
data, with a floating chat panel. Visitors ask about what they see. Answers
render as the app's own components inside the chat, the assistant can
highlight and follow aircraft on the map, and the cards it renders keep
updating after the answer finishes.

The same app is built in Angular and React. The hosted version opens on Angular
with a toggle to React.

### Success criteria

- A newcomer reads the framework's core file (≤150 lines) in a couple of
  minutes and recognises the three homepage steps: expose components, give the
  model tools, render the stream.
- The first answer to a starter prompt starts rendering within a few seconds on
  the hosted demo.
- After one run, a visitor can say what makes Hashbrown different: the
  assistant used browser tools on data already in the page, the aircraft ID
  never rendered half-written, and the card stayed live.
- The example uses only public Hashbrown APIs (no `ɵ` imports, no B4) and adds
  no dependencies beyond those approved in §9.

### Starter scenarios

1. **"What's that plane?"** after clicking an aircraft. `getSelectedAircraft`
   reads the selection, `lookupRoute` fetches its scheduled route, and the
   model renders a `FlightCard`.
2. **"Show me everything landing at O'Hare."** `findAircraft` filters the
   aircraft already in the browser, `highlightAircraft` dims the rest of the
   map, and the model composes an `ArrivalsBoard`.
3. **"What's the highest plane right now? And the fastest?"** The model chooses
   a `FlightCard` or an `AircraftCompare`, depending on the question.
4. **"Follow UAL1372."** `followAircraft` keeps the map centred on the plane
   while its card updates live.

## 3. Scope

**In v1:** the live map and overlay chat in Angular and React, the four starter
scenarios, live cards, the ID hold-back, replay mode, a provider swap shown in
code, the hosted deployment, and the docs and homepage changes in §10.

**Not in v1** (each gets its own spec later):

- Retiring invoicing and moving its conformance tests into standalone test
  infrastructure (decided: invoicing is retired once atc ships).
- A "plug into an agent" tab that renders a CopilotKit or B4 agent's stream
  with atc's components.
- An in-browser local model (the experimental transports cannot call tools).
- Use-my-location.
- An Angular CopilotKit recipe in the docs.

## 4. Architecture

```
examples/atc/
  shared/    framework-free TypeScript: feed client, aircraft store, tool
             handlers, Skillet component schemas, lookup tables, replay
  angular/   Angular 22 app: core file, components, Leaflet wrapper
  react/     Vite React app: core file, components, Leaflet wrapper
  server/    /run and /aircraft route handlers, Express for local dev
  e2e/       Playwright, replay mode, both frameworks
```

`shared/` is plain TypeScript so that readers can see what is framework-specific
and nothing is written twice. Both apps import it through a path alias.

### Data flow

1. The browser polls `GET /aircraft?area=ord` every 5 seconds.
2. `/aircraft` fetches `https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}` for
   the area, strips owner and operator fields, and responds with
   `Cache-Control: s-maxage=5, stale-while-revalidate=30`. On Vercel, the CDN
   cache means all visitors share one upstream call every 5 seconds.
3. The aircraft store keeps the latest state keyed by ICAO hex code, plus a
   route cache keyed by callsign. By default it keeps only airline callsigns
   (three-letter ICAO prefix followed by a digit).
4. The map, the tools and the live components all read from the store.
5. `/run` is the only route that talks to the model.

### Why a server route for aircraft data

Checked 2026-10-09: adsb.lol and adsb.fi send no CORS headers, and OpenSky only
allows its own origin, so browsers cannot call any of them directly. adsb.lol is
the chosen source because its data is ODbL 1.0 (attribution and share-alike).
adsb.fi is "personal, non-commercial use only" and OpenSky needs a licence for
commercial use. adsb.lol's route files
(`https://vrs-standing-data.adsb.lol/routes/{prefix}/{callsign}.json`) do send
`access-control-allow-origin: *`, so `lookupRoute` calls them from the browser.
Routes are crowd-sourced and can be stale, so the UI labels them "scheduled
route".

## 5. Components

Each component's contract is a Skillet schema in `shared/`. Each framework
implements the component and exposes it with that schema.

| Component | Props from the model | Read live from the store |
| --- | --- | --- |
| `FlightCard` | `hex`: `s.string` (held until complete); `note`: `s.streaming.string` | position, altitude, ground speed, heading, type, airline, cached route |
| `ArrivalsBoard` | `title`: `s.streaming.string`; `hexes`: `s.streaming.array(s.string)` (rows stream, each ID arrives whole) | one live row per aircraft: altitude, distance to the airport, ETA |
| `AircraftCompare` | `hexes`: `s.array(s.string)` of 2 to 3 IDs (held); `takeaway`: `s.streaming.string` | live stats side by side |

Prose answers use Magic Text.

### The ID hold-back

A partial aircraft ID points at the wrong plane: `a3e` matches dozens of
aircraft. So IDs are never streaming fields. While an ID is incomplete, the
component's fallback shows a skeleton and the streaming `note` beside it. When
the ID completes, the card snaps to the plane and the map pulses it.
`ArrivalsBoard` shows the other half of the rule: the list streams, but each row
arrives whole. This is the demo's clearest Skillet moment.

### Live cards

The model passes identities, not values. Components look up the aircraft by
`hex` in the store and re-render on every poll, so a card keeps updating its
altitude, speed and position after the model has finished. If the aircraft
leaves the area, the card freezes at its last values and shows
"Out of range · last seen HH:MM".

## 6. Tools

All tools are browser-side and run against the store. Handlers live in
`shared/`; each framework wraps them (`createTool` in Angular, `useTool` in
React). The model never does arithmetic: distances, ETAs and "approaching" are
computed in tool code.

| Tool | Input | Returns |
| --- | --- | --- |
| `findAircraft` | optional `airline`, `typeCode`, `minAltitudeFt`, `maxAltitudeFt`, `approaching` (airport code), `sortBy` (`altitude`, `speed` or `distance`), `limit` (max 20) | Compact rows: `hex`, callsign, airline, type, altitude, ground speed, track, distance. `approaching` means within 40 nm of the airport, descending, below 12,000 ft. |
| `getSelectedAircraft` | none | The clicked aircraft's row, or `null` |
| `lookupRoute` | `callsign` | `{ origin, destination }` labelled as a scheduled route, or `null`; cached in the store |
| `highlightAircraft` | `hexes` | Dims every other aircraft on the map |
| `clearHighlight` | none | Restores the map |
| `followAircraft` | `hex` | Keeps the map centred on that aircraft |
| `stopFollowing` | none | Releases the map |

Bundled tables in `shared/` turn codes into names: about 100 aircraft types
(`B39M` → "Boeing 737 MAX 9") and about 60 airlines.

The system prompt is about 15 lines and pinned on the server. It tells the model
to answer with components, to use tools for every fact and number, and never to
guess an aircraft ID.

## 7. The core file

Each framework has one core file of at most 150 lines. It is what the code tab
shows and what the homepage hero quotes. It is organised as the three homepage
steps:

1. **Expose components:** three `exposeComponent` calls using the shared
   schemas.
2. **Give the model tools:** wrappers around the shared tool handlers.
3. **Render the stream:** `uiChatResource` with `<hb-render-message>` in
   Angular, `useUiChat` with `message.ui` in React.

The map, the store wiring, polling and styles live in other files.

## 8. Server

Two route handlers, written once and mounted in Express for local development
and as Vercel functions in production.

- **`/run`:** about 30 lines around `HashbrownOpenAI.stream.text`, following the
  documented adapter. The model (`gpt-5-mini` by default) and the system prompt
  are set on the server. A one-line swap to `HashbrownAnthropic` or
  `HashbrownGoogle` is documented in the README.
- **`/aircraft`:** the adsb.lol proxy described in §4. `area` comes from a fixed
  allowlist (`ord` in v1) so the route cannot be used as an open proxy.

### Replay mode

`?replay=1`, and always in e2e, swaps the live feed for a recorded 10-minute
snapshot of ORD airspace and the model for aimock fixtures
(`@copilotkit/aimock` is already a root dependency). The recording script lives
in `shared/` and is run by hand to refresh the snapshot. Replay also backs the
"switch to replay" offer when the feed fails, and produces the demo video.

## 9. Hosting and dependencies

- **Vercel:** its own project (not part of `www`). It serves `/angular`,
  `/react` and the server routes; `/` opens Angular. Prebuilt deploys must use
  `--archive=tgz` to stay under Vercel Hobby's 5,000-file daily upload limit.
- **Key and abuse protection:** a dedicated OpenAI project key with a hard
  monthly spend cap, plus a Vercel firewall (WAF) rate-limit rule on `/run`. No
  rate-limiter library.
- **Map:** Leaflet, the same library as B4's navlog example, with a raster tile
  provider on a free tier (Stadia Maps or MapTiler, chosen in the
  implementation plan). OpenStreetMap's own tile servers are not used because
  their policy rules out heavy production traffic. The map shows the tile
  provider's attribution and adsb.lol's ODbL attribution.
- **New dependencies needing approval:** `leaflet` and `@types/leaflet`.
  Everything else (Express, Vite, `@angular/build`, Vitest, Playwright, aimock)
  is already in the repo.

## 10. Docs and homepage

- Point the site header's "demo" link at the hosted atc.
- Replace each framework's `start/sample.md` with its own page describing atc
  in that framework.
- Rewrite the homepage hero code and the README's three steps from atc's actual
  core files.
- Add the atc projects and their targets to AGENTS.md.

Rebuilding the Smart Home-based recipes around atc is left to the invoicing
retirement follow-up.

## 11. Failure handling

| Failure | Behaviour |
| --- | --- |
| Feed down or slow | Keep the last positions. Show "data delayed" after 15 s; offer "switch to replay" after 60 s. |
| Aircraft leaves the area | Its live card freezes with "Out of range · last seen HH:MM". |
| Route lookup misses | The card shows "Route unavailable"; the tool returns `null` and the prompt forbids guessing. |
| `/run` error or rate limit | Inline error in the chat with a retry button; the map keeps working. |
| Model returns an unknown ID | The component shows "Unknown aircraft"; nothing crashes. |

## 12. Testing

- **`shared/` unit tests (Vitest):** store updates and eviction, the
  airline-callsign filter, "approaching" geometry, distance and ETA maths,
  `findAircraft` filters and sorting, route caching, owner-field stripping.
- **Component tests per framework:** the fallback while an ID streams, live
  updates after a store change, the out-of-range state, unknown IDs.
- **Playwright e2e in replay mode, both frameworks:** the four starter
  scenarios. Assertions cover the hold-back (no card shows an aircraft before
  its ID is complete), highlighting, following, and live cards changing on the
  next replay tick.
- Tests use top-level `test(...)` in arrange/act/assert style, per AGENTS.md.
- Each project gets build, test, lint and (where relevant) e2e Nx targets.

## 13. Size budget

| Part | Budget (non-test lines) |
| --- | --- |
| Core file, per framework | ≤150 |
| Each framework app, including the core file | ≤1,000 |
| `shared/` (excluding lookup tables and the replay snapshot) | ≤600 |
| `server/` | ≤120 |

For comparison, invoicing is about 15,100 non-test lines and navlog about 9,000.

## 14. Risks

- **Live data varies.** Mitigated by replay mode for tests and video, and
  because the starter prompts work in any reasonably busy airspace.
- **Upstream feed availability or terms change.** The feed is behind one
  server route, so swapping to another ADS-B source touches one file.
- **Model quality varies by provider.** Only providers that pass the e2e
  scenarios are mentioned as swaps.
- **Scope creep from "an app".** The size budget in §13 is a hard limit; new
  scenarios go to follow-up specs.
