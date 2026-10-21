# atc: Decide, Filter, Generate

Date: 2026-10-20
Status: design agreed in conversation (brainstorm with the visual companion); awaiting written-spec review
Builds on: the atc audit and brainstorm (2026-10-12 to 2026-10-20), Hashbrown decisions (#656, #658, #660, #662, #664, #665, #666)
Research: `docs/superpowers/research/jev-decisions/`, `reports/AG UI decision transport design.md` (not committed)

## Intent

atc is Hashbrown's flagship example. It exists for **developers evaluating Hashbrown**.
Today it shows generative UI and browser-side tools very well, but says almost nothing
about structured output, and nothing about decisions, which shipped on 2026-10-19/20. The
aviation features also crowd out the Hashbrown story.

After this change, a developer who spends five minutes with atc should come away
understanding **when to decide, when to produce structured output, and when to generate**,
and how Hashbrown does each one in React and Angular:

| Moment | Hashbrown capability | What the visitor sees |
| --- | --- | --- |
| Typing in the input | Decision (TypeSafe Jev): a router | A badge says where Enter will go, in about 100 ms |
| Enter on a filter request | Structured output, streamed | Typed filter chips and the map filtering live |
| Enter on a question | UI selection plus generation with tools | The assistant answers with only the cards that fit |
| "Show the stream" on | All of the above, made visible | The decision, the typed JSON and the streamed UI |

## Goals

1. One shared input box routes each submission to **filter** or **chat**, decided by Jev
   while the user types.
2. A natural-language **map filter** built on structured completion, streaming into chips,
   with live JSON beside it.
3. The chat assistant narrows its cards with **UI selection** (`useUiDecision({ chat })`)
   before it generates with its tools.
4. The map filter is **app state**: the filter route, the pill, the router and the
   assistant all read and write it, and the UI always shows it.
5. A **"Show the stream"** switch that exposes each layer for developers.
6. The **spine**: a UI kit, core files that tell the steps in order, server pinning on every
   model route, and README/blog/video updates that lead with Hashbrown.

## Non-goals

- New aviation features (navaids and the like stay dropped).
- Few-shot examples (removed from Hashbrown in #662).
- An AG-UI decision transport (deferred; see the research).
- The candidates mode of UI selection in atc (chat mode covers the card choice).
- Hosting the React app (still local only).

## Anti-goals

- Hashbrown's API showing through as aviation code: the decision and filter code must read
  as Hashbrown patterns a developer can copy.
- Hidden behavior: every change to the map filter is visible in the UI.
- Decisions the user cannot see in "Show the stream": nothing is decided silently from a
  developer's point of view.
- Breaking atc's existing invariants (`examples/atc/AGENTS.md`), including the LLA design
  rules enforced by `shared/src/design-rules.test.ts`.

## The experience

### One input that routes

- The chat composer is the only input. There is no separate map search box.
- As the user types (debounced, about 150 ms), a decision runs with this schema, in shared
  code:

  ```ts
  export const routeSchema = s.object('Where to send what the user typed', {
    intent: s.enumeration('What the user wants', {
      filter: 'Change which aircraft the map shows, by kind, airline, type, altitude or place',
      chat: 'Ask a question, or ask about a specific aircraft or airport',
      other: 'Anything else',
    }),
    clear: s.boolean('The user wants to remove the current map filter'),
  });
  ```

- A badge in the composer shows the route and its confidence: `→ filter 0.97` or
  `→ chat 0.91`. Below 0.7 confidence, or for `other`, the badge is dashed and Enter goes
  to chat.
- `clear` at or above 0.5 with `intent: filter` clears the map filter on Enter, instantly,
  with no model call.
- On phones (the bottom sheet), the badge sits inside the composer the same way.
- If Enter is pressed before the router has answered for the current text (fast typing,
  paste then Enter), the submission waits for that decision, up to about 1 second, then goes
  to chat. The empty-state starter buttons skip the router. Each starter is labelled as a
  question (chat) or a filter, and is sent straight to its route.

### The filter route (structured output)

- Enter sends the text to a structured completion whose schema is `mapFilterSchema` (see
  "One schema, four uses"). The output streams field by field.
- The map filter pill shows chips derived from the non-null fields. A field still streaming
  shows a dashed chip. The pill has an ✕ that clears the filter.
- Airport codes in the filter (`approaching`, `near.airport`, `inAirspace.airport`) are
  checked with the existing `lookupPlace` before use. An unknown code becomes a dashed
  "unknown place" chip and that clause is ignored.
- Nothing is added to the chat transcript.
- A second filter request refines the current one. The request carries the current
  `mapFilter` along with the text, and the model returns the complete new filter. So "below
  10,000 ft" after "only jets" keeps the jet clause, and "show everything" clears it.
- A filter with `near` or `inAirspace` outlines that area and fits the map once, through
  the same view request `findAircraft` already uses (the newest view request wins).

### The chat route (UI selection plus generation)

- Enter calls `narrowed.sendMessage(text)` where
  `narrowed = useUiDecision({ chat, system: <card-choice context>, select: { max: 2 } })`
  (Angular: `uiDecisionResource`).
- The chat's components are two kits: `cards` (FlightCard, ArrivalsBoard,
  AircraftCompare, AirportCard) and `prose` (Markdown), created with `selectable: false`
  (see "Hashbrown API change"). Jev picks among the four cards from their names and
  descriptions. Markdown is never an option and is always sent, because every answer
  includes a sentence or two of prose. The assistant then runs with its normal
  system prompt, tools and transcript, rendering only the chosen cards. Below 0.7
  confidence, or on failure, it renders with all of them. Components are restored after
  each turn, so follow-ups work.
- The card decision is visible only in "Show the stream". The normal UI shows tool chips and
  cards as today.

### The map filter as state

- `AtcState.mapFilter: MapFilter | null` (a parsed, validated filter) is the single source
  of truth.
- Writers: the filter route, the pill's ✕, the router's `clear`, and the assistant through
  two new browser tools:
  - `setMapFilter`, whose arguments are `aircraftFilterFields` (validated the same way).
  - `clearMapFilter`.
- Readers:
  - The map dims aircraft that don't match.
  - `findAircraft` applies `mapFilter` together with its own arguments, and its result
    includes a one-line `mapFilter` summary (or null) so the model knows the filter is on.
  - The pill always shows the current filter, whoever set it.
- The assistant may change or clear the filter on its own when a question needs it
  ("what's the highest plane overall?") and says so in its answer. The transcript's tool
  chip records the change ("Filtered to jets below 10,000 ft", "Cleared the map filter").
- Other tools (`getSelectedAircraft`, `lookupRoute`, `airspaceAt`, airport tools) are not
  affected by the filter. A specific plane or airport is answered even if it is filtered out.
- Dimming with a filter, an assistant highlight, a selection or a follow:
  - Planes outside the filter are dimmed.
  - Within the filter, the highlight rule applies as today.
  - A plane the user or assistant points at is never dimmed, even when it is outside the
    filter. That covers the selected plane, highlighted planes and the followed plane. So
    "tell me about N123" shows N123 at full strength.
  - The builder picks the exact visual treatment within the design rules.

### "Show the stream"

- A switch in the chat panel header, on by default for a first visit, remembered in local
  storage (wrapped in try/catch).
- When on, a dark JSON panel (one visual language for all of them) appears:
  - On the map, under the filter pill: the router decision (answers, probabilities,
    milliseconds) and then the filter object streaming.
  - Under each assistant answer: the router decision, the card decision (picks with
    probabilities), then the streaming UI JSON. Tool chips show the real calls with typed
    arguments.
- When off, none of this shows. The normal UI is unchanged.

## One schema, four uses

`shared/src/find-aircraft.ts` defines the filter fields once:

```ts
export const aircraftFilterFields = { airline, typeCode, kind, minAltitudeFt, maxAltitudeFt, approaching, near, inAirspace };

export const findAircraftInput = s.object('Filters for aircraft currently on the map', {
  ...aircraftFilterFields,
  sortBy: s.enumeration('Sort order', ['altitude', 'speed', 'distance']),
  limit: s.integer('Maximum rows, 1 to 20'),
});

export const mapFilterSchema = s.streaming.object('A filter for the aircraft shown on the map', aircraftFilterFields);
```

The four uses:
1. The `findAircraft` tool's arguments.
2. The filter's streamed structured output (`mapFilterSchema`).
3. `setMapFilter`'s arguments.
4. The schemas the server pins.

The predicate that applies a filter to an aircraft is one pure function shared by the map
and `findAircraft`, so the map and the assistant always agree. This "one schema, four
uses" line goes into the core files and the README.

## Server

Every model route pins what the model sees, so the public endpoints can only run atc:

| Route | Model | Pinned |
| --- | --- | --- |
| `/api/run` (exists) | OpenAI | system prompt, tool definitions (adds `setMapFilter` and `clearMapFilter`), UI response schema (see below) |
| `/api/filter` (new) | OpenAI, structured output | its own system prompt, `mapFilterSchema` as the response schema, no tools, an output cap; the request carries the current filter for refinement |
| `/api/decide` (new) | TypeSafe Jev `jev-1.14.0` | serves two decisions selected by a small `kind` field: `route` (`routeSchema`) and `cards` (`createSelectionSchema` over the shared card and prose groups, `{ max: 2 }`). For each kind the server pins both the questions and the decision context (the `system` part of `state`). The client's questions and `system` are ignored, as `/api/run` already ignores the client's system prompt. |

- `/api/run` accepts a narrowed UI response schema. It compares the client's schema
  against an allowlist precomputed at startup: `createUiJsonSchema` over every subset of
  the four cards, always including Markdown, in pinned order. Anything else is replaced
  with the full pinned schema, as today. Narrowing therefore reaches the model, and the
  route still cannot render anything atc doesn't expose.
- The atc `SYSTEM_PROMPT` card rules are reworded to apply when that card is available
  ("If the FlightCard is available, …"), so a narrowed turn never instructs the model to use
  a card it doesn't have.
- `/api/decide` uses `HashbrownTypeSafe.decide` with `maxRequestChars` set to what atc needs
  (inputs are short) and maps `DecisionError` to HTTP as the TypeSafe docs show.
- The card-selection schema is built from shared, framework-free definitions (names,
  descriptions, children), so the server never imports React or Angular components. A test
  asserts the questions the browser sends equal the pinned ones.
- New environment variable: `TYPESAFE_API_KEY`. It is already set (encrypted) on the
  `hashbrown-atc` Vercel project for production, preview and development, using TypeSafe's
  API directly; the Vercel AI Gateway can replace it once the team has a card on file.
  Locally it comes from the root `.env`. Without it, `/api/decide` answers 503, and the
  client treats a failed decision as "go to chat with all cards", so atc still works.
- Vercel: two new functions (`/api/filter`, `/api/decide`) in `tools/build-vercel-output.mts`,
  and rate limits on both, like `/api/run`.

## Hashbrown API change: non-selectable kits

This is a prerequisite and ships as its own Hashbrown PR before the atc work.

- `createUiKit` (Angular, core) and `useUiKit` (React) take `selectable?: boolean`, which
  defaults to `true`. A kit created with `selectable: false` is always sent whole, and a
  decision never chooses among its members.
- One flag per kit. There is no per-component flag and no mixed `always` list.
- **Nesting:** a component is non-selectable if any kit containing it is non-selectable.
- **Chat mode** (`useUiDecision({ chat })` / `uiDecisionResource({ chat })`) decides only
  over selectable members. It always includes non-selectable members when narrowing, and
  still falls back to every component when unsure or on error.
- **Server pinning:** `createSelectionSchema(options, select)` skips non-selectable kits. It
  also accepts plain groups, `{ components, selectable? }`, so a server can mirror kits
  from framework-free definitions without importing component implementations.
- If every component is non-selectable, no decision runs and the chat sends with
  everything.
- Tests:
  - flag inheritance through nesting;
  - chat mode never asks about non-selectable members and always sends them;
  - `createSelectionSchema` parity with a kit and with a plain group;
  - the all-non-selectable case.
- Docs: the UI kits and UI selection recipes, for React and Angular.

## The spine

1. **UI kits.** In each app's core file, atc's components become two kits: `cards`
   (the four cards) and `prose` (Markdown, `selectable: false`). Both are passed to the
   chat, and therefore to narrowing. The shared contracts export the matching plain groups
   for the server.
2. **Core files tell the steps in order.** `assistant.ts` / `assistant.tsx` keep steps 1 to 3
   (expose, tools, render the stream) and add:
   - Step 4, "Decide": the router and the card selection.
   - Step 5, "Structured output": the filter. This may live in a sibling core file such as
     `filter.ts` / `filter.tsx`, pointed to from the assistant.

   Each step comment names the Hashbrown API it shows. The demo video storyboard's marked
   lines follow the moved code.
3. **Server pinning on every model route** (see Server).
4. **"Show the stream"** (see above).
5. **Docs lead with Hashbrown.**
   - README: "How this example is built" starts with the decide / filter / generate story
     and "one schema, four uses".
   - `examples/atc/AGENTS.md`: file map and invariants updated.
   - The building-atc blog post gets an update note or a follow-up section. A separate post
     is the maintainer's call, since the release blog is being written in another session.
   - The demo video (`npx nx demo atc-e2e`) gets beats for routing, filtering and narrowing.

## Testing

- **Shared (Vitest, top-level `test` only):**
  - the filter predicate;
  - `MapFilter` parsing and `lookupPlace` validation;
  - chip derivation;
  - `findAircraft` with `mapFilter`;
  - `setMapFilter` / `clearMapFilter`;
  - the router-decision-to-action mapping (threshold, `other`, `clear`).
- **Hashbrown (prerequisite PR):** as listed under "Hashbrown API change".
- **Server:**
  - `/api/run` accepts allowlisted narrowed schemas (always including Markdown) and
    replaces anything else;
  - `/api/filter` pins the system prompt and schema, drops client tools, and refines from the
    current filter;
  - `/api/decide` picks the schema and the decision context by `kind`, ignores the client's
    questions and `system`, caps size, and returns 503 without a key;
  - questions parity with the browser.
- **e2e (Playwright, both apps, keyless):**
  - aimock answers `/api/run` and `/api/filter`, and `/api/decide` is stubbed.
  - Cases:
    - typing shows the right badge;
    - Enter on a filter streams chips and dims the map;
    - Enter on a question narrows the cards;
    - the assistant clears the filter for "overall";
    - the ✕ clears it;
    - "Show the stream" shows and hides the panels;
    - a decide failure falls back to chat with all cards.
- **Prose eval:** `npx nx prose-eval atc-e2e` covers the new tools' answers ("says so" when it
  changes the filter).
- **Design rules:** `design-rules.test.ts` stays green. Any new colours follow its rules.

## Constraints

- No new npm dependencies without asking. `@hashbrownai/typesafe` and `@ag-ui/encoder` are
  already in the workspace; adding `@hashbrownai/typesafe` to atc-server's package graph is
  expected and needs no new third-party package.
- Shared code stays framework-free. The Angular and React apps stay thin and mirror each other.
- Repo AGENTS.md rules apply: failing tests first, top-level `test(...)`, TSDoc, and the
  React and Angular best practices.
- Another session may work on plane tags (`shared/src/map/tag-*.ts`). Coordinate before
  touching those files.

## Decisions made in conversation

- The decision model's moment is routing filter vs chat, instantly, in one shared input.
- The filter reuses `findAircraftInput`'s fields.
- Chat does not ignore the filter. The filter is app state the assistant can read and change
  freely, and every change shows in the UI.
- UI selection narrows the assistant via `useUiDecision({ chat })` (the API was reshaped in
  #666 for this).
- The card decision is visible only in "Show the stream".
- The spine ships in the same effort.

- Markdown is always included through a non-selectable kit; the flag lives on the kit
  ("one flag per kit").
- `TYPESAFE_API_KEY` is set on the hosted project, calling TypeSafe directly for now.

## Calls I made (check these)

- Router schema wording, the 0.7 confidence threshold, the 150 ms debounce, and `{ max: 2 }`
  for card selection.
- `clear` acts only when `intent` is `filter`.
- `/api/decide` serves both schemas, selected by a `kind` field, rather than two routes.
- "Show the stream" defaults to on for a first visit.
- Without `TYPESAFE_API_KEY`, decisions fail softly to chat.
- Dimming: planes outside the filter are dimmed, except a selected, highlighted or followed
  plane, which is never dimmed.
- `/api/run` accepts narrowed schemas from a precomputed allowlist, and the system prompt's
  card rules are conditional on the card being available.
- A second filter request refines the current filter, because the current filter is sent
  with the text.
- Enter waits up to about 1 second for the router, then goes to chat. Starter buttons skip
  the router.
- `/api/decide` pins the decision context (`system`) per kind, as well as the questions.
- A `near` or `inAirspace` filter outlines the area and fits the map once.

## Delivery

1. A Hashbrown PR adding non-selectable kits.
2. The atc work, in PRs the plan will define. Likely: the filter as state, `/api/filter`,
   and the shared schema; then the router, `/api/decide` and the badge; then narrowing with
   the `/api/run` allowlist and prompt changes; then "Show the stream"; then the docs and
   video.

## Left to the builder

- Visual details of the badge, chips and JSON panels within the LLA design rules.
- Exact file split between the assistant core file and a filter core file.
- Wording of the filter and card-choice prompts, tuned with the prose eval.
- How the demo video's new beats are staged.
