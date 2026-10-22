# atc: dev tool drawer and filter starters (US-wide traffic deferred)

Date: 2026-10-21. Status: approved 2026-10-21 (parts 1 and 2; US-wide traffic deferred).

## Why

atc is Hashbrown's flagship example. After the "Decide, Filter, Generate" work merged
(#670, #672–#675), the maintainer tried it locally and found three problems:

1. The "Show the stream" panels cover the map, and planes are what people come to see.
   Technical detail should live in a developer tool you open and close, like browser
   devtools.
2. The empty state has seven question starters and only one filter starter. Filtering
   is a headline feature, so it needs more examples and a way to show refinement.
3. The map only shows planes over the Pacific Northwest: a fixed 250 nm circle around
   Bend. Visitors from anywhere else in the US see empty sky when they pan home.

These are independent pieces of work. Parts 1 and 2 ship as two PRs, in that order.
US-wide traffic (problem 3) is deferred, and its considerations are recorded at the end. Each PR is
tried locally by the maintainer before it is opened (see "Delivery").

## Goals

- Planes stay fully visible. The chat and the map show only the product; every decision,
  JSON stream and tool call lives in a dev tool.
- The empty state teaches the difference between filtering and asking, and shows that a
  filter can be refined.

## Non-goals

- Changing the traffic area: atc stays on the Pacific Northwest (see the deferred section).
- Changing what the assistant, router or filter can do.

## Anti-goals

- Anything that hides planes behind technical panels when dev mode is off.
- Filter and question starters that look alike (the maintainer found near-duplicates
  confusing).

---

## Part 1: the dev tool drawer

### Behaviour (decided with the maintainer)

- A thin rail runs down the far left edge of the app. It holds a dev-mode toggle (a `{ }`
  icon with an accessible name "Developer tools").
- Dev mode is off by default. The app remembers on/off in localStorage, wrapped in
  try/catch (as `readShowStream` does today).
- Off: no technical UI anywhere. No panels under answers or the filter pill. Tool chips
  show their normal labels.
- On: a dark drawer slides up from the bottom of the map area. The map shortens but stays
  fully visible. The drawer's top edge can be dragged to resize it.
- The drawer replaces "Show the stream". The header switch and every panel it added are
  removed.
- The drawer only reports; nothing in it changes app state.

### Content (builder's call within these lines; the guesses below were played back and accepted)

- Tabs: **Router**, **Cards**, **Filter**, **UI stream**, **Tools**.
  - Router: the live decision for the text being typed (answers, probabilities, ms, and
    the outcome line "→ filter", "→ chat (unsure)" and so on), then the decision that
    routed the selected send.
  - Cards: the selected chat send's card picks with probabilities, or the fallback reason.
  - Filter: the filter run's streaming structured output, and the applied filter.
  - UI stream: the selected answer's streaming UI JSON.
  - Tools: the selected answer's tool calls with their JSON arguments.
- By default the drawer follows the newest send. Clicking an earlier answer in the chat
  while the drawer is open selects that answer's send. A small "Latest" control returns
  to following.
- Reuse the existing view models in `shared/src/stream-view.ts` (`decisionView`,
  `routerBlock`, `cardsBlock`, `streamJson`, `alignTurns`, `filterPanelVisible`'s
  provenance rules). Their rendering moves into the drawer. JSON is text only (no
  innerHTML), and the drawer is `aria-live="off"`.

### Layout

- Desktop: rail, chat panel, then the map column. The map column stacks the map above the
  drawer. Default drawer height is about 35% of the map column, clamped to 160–60% on
  resize. The height is remembered.
- Phones (bottom-sheet layout): no rail, because there's no room. The dev-mode toggle
  is an icon button in the panel header, which has no menu today. The drawer opens as a full-width sheet over the map
  with its own close button. This is my call; the maintainer chose the desktop layout.
- Design rules hold (`shared/src/design-rules.test.ts`): no shadows, gradients,
  uppercase or dark-scheme blocks. The drawer is a dark element (`--atc-ink` background)
  in the mono font, like the current stream panel.

### What goes away

- `ShowStream` state and the header switch in both apps.
- `stream-panel` placements under answers, under the filter pill, and in tool chips.
- e2e cases for the switch, rewritten for the drawer.

---

## Part 2: filter starters and refinements

### Starters (decided)

Half filters, half questions, and clearly different from each other:

- **Filters** say what to show and never ask:
  - "Only jets below 10,000 ft"
  - "Alaska Airlines near Seattle"
  - "Only helicopters" (my call: replaces the agreed "Helicopters and small planes", because
    the filter's `kind` takes one value of jet, twin, single or rotor)
  - "Arrivals into Portland"
- **Questions** ask about particular aircraft or airports:
  - "What's the highest plane right now? And the fastest?"
  - "Follow the fastest airliner."
  - "What's flying near Bend?"
  - "Show me Redmond airport."

"Show me everything landing at Seattle." and "Which planes are inside the Portland
Class C?" are removed, because they straddle the line. Each starter keeps its route tag
and skips the router (as today). Filters and questions are visually grouped. The exact
visual treatment is the builder's call.

### Refinements (decided: in the chat panel)

- When a filter is applied (whoever applied it), one or two refinement suggestions appear
  in the chat panel, above the composer.
- They are chosen from the current filter by a pure, deterministic function in shared
  code; no model call. For example:
  - no altitude clause: "Below 5,000 ft"
  - no airline clause and an airline is common among the matches: "Only <airline>"
  - a `near` clause: "Within 10 nm"
  - no kind clause: "Only jets"
- Clicking one sends it through the filter route as a refinement. The existing chips stay
  and one more streams in. Nothing is added to the transcript.
- They disappear when the filter is cleared. They refresh when the filter changes.

### Ripple

- `STARTER_PROMPTS` changes order and text. The e2e scripted model (`e2e/src/model.ts`),
  the stubs (`scriptedCards` depends on the Seattle-arrivals starter), the demo storyboard,
  `e2e/decide/probes.ts` and the decide-eval probe sets must follow. The probe sets keep
  the removed phrasings as typed inputs.
- `FILTER_SYSTEM_PROMPT` maps "helicopters" to `kind: rotor` (check `shared/src/kinds.ts`).

---

## Delivery

- Two PRs in order (part 1, then part 2). Before each is opened, the maintainer tries it
  locally (servers started, URL given), then it's opened and merged when CI is green.
- Tests follow the repo rules: written failing first, top-level `test()` only, and the
  React and Angular apps mirrored.
- e2e cases cover:
  - the drawer: open, close, tabs, persistence, resize, and no panels when off;
  - starters, plus a refinement that keeps the existing chips;

## Left to the builder

- Drawer visuals, tab order details, the resize handle, the icon art.
- The refinement selection rules beyond the examples.

---

## Deferred: US-wide traffic (considerations for a future expansion)

Decided 2026-10-21: atc keeps the Pacific Northwest area for now. This section records what
expanding the demo would involve, so it isn't rediscovered. It is not part of this work.

Open questions to settle first, if this is picked up:
- adsb.lol's anonymous quota (headers say 60/min and 500/day per IP; a 429 said 10/min).
  Ask the adsb.lol maintainers for a demo key before anything else.
- Whether adsb.fi's "personal, non-commercial" terms allow the hashbrown.dev demo.
- Upstash Redis provisioning and plan (free tier vs $10/month fixed), and whether to add
  `@upstash/redis` or call the REST API with `fetch`.
- The budget arithmetic: at a 15 s refresh each tile costs about 4 upstream calls a minute,
  and a two-state view on a 2° grid is 12–20 tiles, so the zoom cap, refresh window and
  budget need choosing together.


### Behaviour (decided)

- Panning is never restricted.
- Planes are shown only over the US. ADS-B traffic outside the US is not fetched, and it
  is dropped if a tile returns it.
- Zoom cap: when the visible area is too large (rule below), no planes are drawn. An
  in-map notice says "Zoom in to see planes". The chart overlays follow the same cap.
- Over non-US areas at a normal zoom, an in-map notice says "Live traffic covers the US
  only".
- The home view stays over central Oregon.

### Data provider and limits (from research, 2026-10-21)

- adsb.lol `/v2/point/{lat}/{lon}/{radius}` (documented ≤ 250 nm). There is no bounding
  box endpoint. About 0.5 KB per aircraft. The anonymous rate-limit headers read
  `4/s, 60/min, 500/day` per IP, and a 429 body claimed `10 req/min`, so the real limit is
  unclear. The README says an API key, earned by feeding, "will be needed in the future".
  The data is ODbL; attribute "adsb.lol (ODbL)".
- adsb.fi `/api/v3/lat/{lat}/lon/{lon}/dist/{d}` (≤ 250 nm, 1 req/s). Terms: personal,
  non-commercial, cite with a link.
- These limits, not the cache, decide what's feasible.

### Tiles

- The US is covered by a fixed grid of 2° × 2° cells (about 120 nm × 90–100 nm). Only
  cells that intersect a coarse US outline are valid. The outline covers the contiguous
  US, Alaska, Hawaii and Puerto Rico, simplified to a few hundred points, and lives in
  shared code.
- Each cell is fetched as one `/v2/point` call at its centre with a radius covering the
  cell (100 nm). Aircraft are deduplicated by `hex` across cells, and dropped if outside
  the US outline.
- Zoom cap rule: planes load when the viewport touches at most 9 valid cells. Otherwise
  the "Zoom in" notice shows. The exact threshold is a constant; tune it so a two-state
  view at desktop size still loads.

### Server: `/api/traffic/tile/{cellId}`

- The URL is per cell, so the CDN shares it across viewers: `Cache-Control: public,
  s-maxage=10, stale-while-revalidate=50`.
- A shared Redis cache (Upstash via the Vercel Marketplace) sits behind it, one key per
  cell:
  - If the cached snapshot is fresh (under the refresh window), return it.
  - Otherwise take `SET NX EX 8` on a lock key. The winner fetches upstream and writes
    the snapshot with a 120 s TTL. Losers return the stale snapshot.
  - With no snapshot at all, losers wait briefly (≤ 1.5 s) for the winner's write, then
    answer 503 `{ code: 'warming' }`.
- Refresh window: 15 s by default (configurable by env). The current single-area handler
  uses 10 s.
- Provider chain per cell: adsb.lol first. On 429 or failure, put that provider in a
  cool-down (recorded in Redis, so it's shared) and try adsb.fi. If both are limited,
  serve stale data up to 120 s and mark it `X-Atc-Stale: 1`.
- Global budget: a Redis per-minute counter of upstream calls with a configurable ceiling
  (default 40/min). Over budget, serve stale data. This protects the providers whatever
  the traffic.
- Validation: `cellId` must be a valid US cell, otherwise 400. Nothing from the client
  reaches the upstream URL except through the cell's own centre.
- Without Redis configured (local dev, CI), fall back to the current per-instance
  in-memory cache with the same interface. Local dev and e2e need no Redis.
- New npm dependency: `@upstash/redis`. **Needs the maintainer's approval (AGENTS.md).**
  The alternative is calling Upstash's REST API with `fetch`, which is about 40 lines and
  needs no dependency. That's my default if the dependency is declined.

### Client feed and store

- The map reports its bounds on `moveend` into the store (new `viewport` state). The feed
  derives the set of visible valid cells, or "too wide" or "outside US".
- The feed polls each visible cell's URL every 3 s (the CDN absorbs repeats) and merges
  the results into one snapshot.
- Leaving cells: aircraft in cells no longer visible are dropped without being marked
  "departed". Departed stays meaningful only for a plane that vanishes from a visible
  cell. The assistant's tools only see planes in visible cells; tool descriptions say so.
- Feed status: today's statuses (`live`, delayed, stalled) plus `too-wide` and
  `outside-us`, which drive the in-map notice. The notice reuses the filter-pill overlay
  pattern (text nodes only).

### Chart data across the US

- Airports: build the whole-US public airport set once per NASR cycle (dropping the
  250 nm radius test) and serve slices per cell at `/api/chart/airports/{cellId}`. The
  slices are cached in Redis per cycle, with a 24 h CDN cache. The 8 MB NASR download
  happens at most once per cycle per cache miss. The build needs to fit the 30 s function
  limit; if it doesn't, precompute the slices at build time (builder's call, with a test
  of the slicing either way).
- Airspace: query ADDS per cell bounding box (the query already takes an envelope) at
  `/api/chart/airspace/{cellId}`, cached per cycle.
- Surfaces: unchanged (already per airport).
- The client chart feed merges per-cell slices into `state.chart` and `state.airspace`
  instead of replacing them.

### Place lookups and the assistant

- A compact US airport index: code, FAA id, name, city, state, lat, lon, rank. It holds
  about 5,000 public airports. It is built per cycle and served once at
  `/api/chart/index` with a long CDN cache. `airportDirectory` uses it, so "near Dallas"
  works anywhere. The 40-airport PNW table stays as the offline fallback and as alias
  priority.
- Distances without a named place are measured from the map centre, not Bend
  (`find-aircraft.ts` default `area`, `tools.ts` `getSelectedAircraft`).
- Prompt text: "a live map of air traffic over the US". An unknown place says "atc covers
  US airports only". Tool descriptions drop "Pacific Northwest". `ROUTE_CONTEXT` examples
  can keep PNW names.
- `FILTER_SYSTEM_PROMPT`'s airport example stays.

### Product copy

- Page title and description become "ATC · live US air traffic". The empty-state heading
  becomes "Ask about the planes overhead." The builder writes the README and AGENTS.md
  updates.

### Hosting and cost

- Upstash Redis free tier: 500K commands/month. It fits light use, about 10 viewers over
  6 cells for 3 h/day. The $10/month fixed plan has unmetered commands. Example: 50
  viewers over 20 cells for 8 h/day comes to about 10M commands/month (about $21
  pay-as-you-go, or $10 fixed). Add the database to `hashbrown-atc` through the Vercel
  Marketplace, in the functions' region.
- The upstream ceiling (default 40/min) bounds provider load, whatever the cost.
- Rate limit `/api/traffic/tile/*` at the Vercel Firewall (documented, not configured,
  like the other routes).
- Ask the adsb.lol maintainers for a key for a public demo. This is the long-term fix
  for the quota.

---

