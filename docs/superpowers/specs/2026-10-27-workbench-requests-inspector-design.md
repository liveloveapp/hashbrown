# Workbench requests inspector

The canonical workbench (`www/examples/quickstart`) teaches Hashbrown from a chat,
an inspector and a bottom player. Its **Requests** tab is a flat column of buttons
("Model request · turn 1", "readContext · turn 1", "HTTP 403 · turn 1") beside a
JSON block. This design turns that tab into a request inspector modelled on browser
network panels and agent trace views, and makes both timelines draggable.

## Why

Brian opens the Requests tab to see what the app actually sent to the agent and
backend. He wants to analyze each request: the messages, the tools, the state and
context, the IDs, and the raw request exactly as sent. He also wants to see what
came back. He does not want a request-to-request diff. Separately, he should be
able to drag and scrub the timeline; today a press on the bottom scrubber often
lands on a milestone tick, which swallows the pointer, so dragging fails.

The workbench is the example the library docs teach from, and Brian expects this
panel to be "an excellent showcase". Prior art, from research
(`.superpowers` scratch, summarised here): LangSmith and Braintrust group work by
turn with nested steps; Chrome and Firefox show request rows with status, timing and
a waterfall, add detail tabs only when they apply (Chrome's EventStream tab for SSE),
and offer raw views; Sentry Replay highlights rows near the playhead and seeks on
click; rrweb-player and Media Chrome treat timeline markers as buttons that seek,
with a pointer-driven drag on the track.

## Goals

1. An **overview timeline** across the top of the Requests tab: the whole run, with
   turn bands and bars for requests, response streams, tool calls and errors, and a
   playhead that can be dragged or clicked to seek.
2. A **full table** of exchanges below it: grouped by turn, tool calls indented
   under the request whose response called them, with Name, Type, Status, Start,
   Duration, Events and a waterfall column.
3. **Detail beside the table** (Brian chose this over detail below): selecting a row
   narrows the table to its Name column and opens detail tabs beside it; ✕ or Escape
   returns to the full table.
4. **Detail tabs that apply to the row**: a model request gets Overview, Messages,
   Tools, State, Raw request and Response; a browser tool call gets Call, Result and
   Raw; an HTTP error gets Overview and Raw.
5. **Drag and scrub** on both the overview and the bottom player, with markers that
   still jump on click.

## Non-goals and anti-goals

- No change to `WorkbenchStore`, frames, transports, server routes, lesson prompts,
  SDK usage or acceptance rules. Exchanges are **derived** from the captured events.
  Replay stays inert: no network, tool or write effects. No resend or edit-and-replay.
- No request diffing (Brian: "I don't think I'm looking for how it differs").
- No Pretable for now (it renders only through React and the shell is framework
  neutral); a plain table in workbench styling. No new dependencies.
- No connection-phase timing (DNS, TTFB), zoom/range selection, filter query
  languages, cost or eval tabs. They would be overkill for a teaching tool.
- Anti-goal: hiding the raw request. The raw request, exactly as captured, must be
  one click away for every model request.
- Anti-goal: a scrubber that only works if you hit the thumb.

## Data: exchanges derived from events

A pure function in a new `runtime/workbench-requests.ts` turns
`snapshot.events` into exchanges. Events are already ordered, and within a turn a
client sends one request at a time, so ordering is enough:

- A `request` event starts an **exchange** of kind `request`. Its payload is
  `{ url?, requestId, attempt?, input }` (`input` is the AG-UI `RunAgentInput`, or a
  decision request for decision lessons).
- Until the next `request` event or the end of the turn, these attach to the current
  exchange: the `response` event (HTTP `status`, `url`, `source`, optional
  `problem`), `event` events (AG-UI events, or a whole decision response), `source`,
  `error` and `parsed`. A `response` whose status is 400 or more marks the exchange as
  an error (the debugging lesson's local 403 is the example).
- A `tool` event becomes a child exchange of kind `tool` under the current request
  exchange (its payload is `{ name, result }`). The tool row links back to the
  request that called it ("Caused by"). When the next request in the same turn
  follows a tool exchange, it is that tool's **continuation** and the tool row links
  forward to it ("Answered in").
- Each exchange records the event indices it spans, its first and last `elapsedMs`,
  its status and its event count. Duration is last minus first `elapsedMs`.
- **Names.** The first request in a turn is "Model request", or "Decision request"
  for decision and selection lessons. A later request in the same turn is named by
  what preceded it:
  - "Continuation" after a tool exchange;
  - "Resume" after a `resume` event (workflow lessons resume interrupts without
    starting a new turn);
  - "Retry" when its `requestId` matches the previous request or its `attempt` is
    greater than 1;
  - otherwise "Follow-up request".

  Only continuations get an "Answered in" link.
- **Decision and selection requests** carry no URL and no `response` event. Their
  Type shows the lesson's configured endpoint, marked as configured rather than
  captured. Their exchange counts as done when its decision `event` arrives, and as
  failed when the store settles to `error`.
- Events before the first request of a turn (for example `user`) belong to no
  exchange. Lessons with no request events show an empty state.

The function is exported with TSDoc and unit-tested in isolation, including the
decision lesson shape, a denied 403 in one turn followed by a recovered request in
the next turn (after a 403 the store settles to `error`, so recovery is always a new
turn), the Continuation, Resume, Retry and Follow-up names, multiple tool calls,
partial (still loading) exchanges and an empty run.

## Layout

The Requests tab replaces the paired captured/interpreted body for this tab only;
the selection strip under the tabs stays. Inside the tab, top to bottom:

### Overview timeline

- A strip about 64px tall spanning the full inspector width: a time axis, turn
  bands labelled "Turn n", and lanes for request bars (cobalt), response streams
  (light cobalt), tool calls (orange) and errors (red), using the existing token
  palette.
- **Axis:** active time. Within a turn, positions follow `elapsedMs`; the idle gap
  between one turn's last event and the next turn's first event is collapsed to a
  fixed small gap, so typing time does not dominate.
- **Playhead:** the global cursor. A filled region shows the played portion. A flag
  names the current exchange, as on the bottom player.
- **Seek:** a press anywhere on the strip seeks to the event nearest the pointer and
  then follows the pointer while dragging; release ends the drag. Bars are part of
  the track, not separate targets. Seeking pauses playback, as other seeks do.
- **Keyboard:** the strip is a `role="slider"` named "Seek request timeline", with
  `aria-valuetext` naming the event, stepping one event with the arrows and one turn
  with Shift+arrows, Home and End to the ends.

### Table

- A real `<table>` with a sticky header and one `<tbody>` group per turn, whose
  header row reads "Turn n · " plus the turn's user message, truncated.
- **Columns:** Name, Type, Status, Start, Duration, Events, Waterfall.
  - Name: "Model request", "Continuation", "Decision request" or the tool name;
    tool rows are indented under their request.
  - Type: a badge, the method and path (`POST /api/workbench/tools`) for requests, or
    "browser tool".
  - Status: the HTTP status in green, or red when 400 or more; "ok" for tool rows;
    "…" while still streaming.
  - Start and Duration in ms, right aligned and monospaced.
  - Events: the count of attached events.
  - Waterfall: a bar positioned on the same active-time axis as the overview.
- Rows whose exchange starts after the playhead are greyed. The row containing the
  playhead carries a cobalt left rule, the "current" marker. In live mode nothing is
  greyed.
- **Selecting a row** (click, or Enter/Space on its focused Name button) selects it,
  pauses and seeks to its first event. The Name cell holds the row's button;
  ↑/↓ move between row buttons (roving tabindex). The selected row has
  `aria-selected="true"` on its row and `aria-pressed="true"` on its button.
- **Automatic selection:** while live (cursor `null`), when an exchange's response
  status is 400 or more, that exchange becomes selected, so the failure and its
  `problem` text are visible at once. Otherwise nothing is selected until the user
  picks a row; the full table is the resting state. A user's selection is never
  replaced automatically.
- **Error alert:** the existing "The request failed…" `role="alert"` paragraph stays
  inside the Requests tab's `.wb-inspection` container.
- **Narrowing:** with a row selected, the table shows only the Name column, with a
  compact status, and the detail pane opens beside it. ✕ ("Close request detail")
  or Escape, while focus is inside the Requests tab, clears the selection and
  restores the full table. Do not gate the Escape handling on `defaultPrevented`.

### Detail pane

A tab row (its own, below the inspector's) and a body. Tabs show only when they
apply, and a count in the tab label when one is meaningful:

- **Model or decision request:**
  - **Overview:** endpoint (method and path), status and content type when known,
    attempt, thread and run IDs, the captured source label, and two summary lines:
    "Sent: n messages · n tools · state revision r" and
    "Received: n events · tool calls …".
  - **Messages (n):** each message in `input.messages` as a card with its role and
    content; tool messages show their tool call id.
  - **Tools (n):** each tool in `input.tools` with its name, description and
    parameters schema (highlighted JSON).
  - **State:** `input.state` and `input.context` as highlighted JSON.
  - **Raw request:** the captured request payload, exactly as recorded, highlighted,
    with a "Copy" button that copies the pretty-printed JSON.
  - **Response (n):** the assembled result at the top (HTTP status, finish
    reason when present, the concatenated text or JSON content, and any tool calls),
    then one row per attached event: relative time from the exchange start, a type
    badge (the AG-UI `type`, or the frame kind) and a one-line summary. Rows after
    the playhead are greyed; clicking a row seeks to that event. Selecting an event
    row shows its raw payload below the list.
- **Browser tool:** **Call** (name, "Runs in: Browser", call id when present, Caused
  by and Answered in as links that select those rows), **Result** (highlighted
  JSON), **Raw** (the tool event payload).
- **HTTP error:** **Overview** (status, URL, source, the `problem` text) and **Raw**.
- Tabs that do not apply to a selection are not rendered. Switching rows keeps the
  same detail tab when the new row has it; otherwise it falls back to the first.
- All JSON uses the existing highlighter (`renderWorkbenchCode`).

### Narrow inspector (under 560px container width)

The overview stays. The table hides Start, Events and Waterfall. Selecting a row
replaces the table with the detail pane, which gains a "Back to requests" button in
place of ✕.

## Scrubbing the bottom player

- A press anywhere on the scrubber track, including on a milestone tick, starts a
  scrub: the playhead jumps to the nearest event and follows the pointer, using
  pointer capture. Releasing without moving more than 4px on a tick activates that
  tick, as a click does today. Seeking pauses playback.
- Each tick keeps a visual mark but gets a hit area at least 24px tall, reaching
  above and below the track.
- Positions snap to the nearest event index, because events are the only positions
  there are. This applies to both scrubbers.
- The native range input stays the keyboard and assistive-technology control
  ("Seek captured event"), so the verifiers' `fill()` and keyboard steps keep
  working.
- During a live response, a scrub moves into replay and the LIVE pill becomes
  "Return to live", as seeking does today. Scrubbing never sends a request.

## Constraints

- **Code:** the shell stays framework neutral (`runtime/workbench-view.ts` and
  siblings), shared by the React and Angular clients. New reusable functions get
  TSDoc. Tests come first, with top-level `test()` and arrange/act/assert. No new
  dependencies. Fix lint rather than suppress it.
- **Re-renders:** `render()` rebuilds parts of the DOM on every store change.
  Selection, the open detail tab and in-progress drags must survive re-renders and
  must not re-trigger store work. Rebuilds keep focus on the same row or event
  button, using the existing `rebuildKeepingFocus` pattern.
- **Verifiers and tests:** they rely on the tab name "Requests",
  `.wb-inspector .wb-inspection` containing request text (the debugging check
  expects "403" after opening Requests), `[data-detail]`, the request list and the
  default-layout check.
  - Keep a `.wb-inspection` container around the Requests content.
  - The detail pane, when open, carries `data-detail`.
  - Replace `.wb-request-list` usages with the new table.
  - Teach `expectWorkbenchDefaultLayout` that a lesson whose default tab is Requests
    shows the overview and table instead of a captured/detail pair.
  - Where a verifier reads request detail (for example the debugging lesson's
    "Demo denial is enabled" text), it relies on the automatic error selection or
    selects the row first. Changing the verifiers this way is in scope.
- **Accessibility:**
  - the overview slider and the native range are the non-drag alternatives
    (WCAG 2.5.7);
  - targets are at least 24px (WCAG 2.5.8);
  - the table uses a real table with header cells, the Name button carries the
    accessible name, and row state is exposed through `aria-selected` and
    `aria-pressed`;
  - visible focus everywhere;
  - forced-colors and reduced motion are respected, as elsewhere in the shell.
- **Checks**, run one after another: `npx nx test www`, `npx nx lint www`,
  `npx nx typecheck www`, `npx nx workbench-build www` and `npx nx workbench-e2e www`
  (all lessons, both frameworks, including the 390px overflow check).

## Docs and media

- **Prose:** update the guides that describe the Requests tab or the request list
  (at least the workbench overview, tools/functions, debugging, and messages and
  turns, in both frameworks) in the same PR.
- **Media:** the recorded workbench media will show the old Requests tab until a
  follow-up re-record PR. That is accepted as temporary, as it was for the shell
  redesign.

## Calls made (builder's, for Brian to check)

- Response tab shows the assembled result first, then every streamed event as a row.
- The overview spans the whole run on an active-time axis, with idle gaps collapsed.
- A row click seeks to the exchange's first event. Scrubbing does not change the
  selected row; the "current" marker shows where the playhead is.
- Tool calls are children of the request whose response called them; the next
  request is labelled Continuation.
- Drags snap to events. A press on a tick that moves under 4px counts as a click.
- Copy on Raw request copies JSON; there is no copy-as-cURL.
- The Requests tab drops the captured/interpreted pair because the table is the
  captured view.

## Left to the builder

- Exact spacing on the 4px grid, lane heights, bar minimum widths, and how
  overlapping bars stack.
- The size of the collapsed inter-turn gap.
- How the assembled response text is extracted from the AG-UI events.
- How render state is split so drags and selection survive re-renders.
- Truncation lengths, and the empty and loading states.
