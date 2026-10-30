# Workbench compact inspector

Date: 2026-10-30
Status: approved in chat, pending review of this document

## Why

Docs pages now embed the workbench inline (`<hb-workbench>`, replay and live).
In the docs column the embed frame is about 790px wide, so the inspector pane is
about 400px. At that width the inspector is hard to use:

- Every inspector tab stacks two code boxes (for example "Trusted component"
  over "Resolved props") with a divider, plus a `{ }` raw-frame chip. Each box
  is about 120px tall and scrolls on its own.
- State is plain JSON, so readers scroll through the whole object to find one
  value.
- Requests duplicates the main timeline with its own overview strip, clips the
  table, wraps the detail tabs onto two rows, and the selected request's detail
  ignores the playhead (scrub into Turn 2 and the detail still shows the Turn 1
  request).
- In a replay, a chip row and the header say "Awaiting source" or "Live model"
  depending on the event. That reads as if the reader has gone live. "Return to
  live" appears even though a replay embed has no live session.

Brian chose to keep the **full inspector** in the embed, laid out compactly. A
slimmed teaching view was rejected.

## Goals

1. Each inspector tab is **one full-height panel** with a **mode toggle**
   (segmented control) in its header. The two stacked boxes, the divider and
   the `{ }` chip are removed.
2. **State is an expandable tree** by default.
3. **Requests is detail-first** at narrow widths: one request's detail fills
   the tab, the list is a drop-down picker in the header, and the detail
   follows the playhead.
4. **The replay embed is decluttered** (list below).
5. Playhead interactions are correct and verified in a real browser.

## Non-goals

- No slimmed-down "teaching" inspector. Every feature stays reachable.
- No request diffing (still ruled out, as in the Requests inspector design).
- No change to the docs page wrapper (`www/src/components/workbench/*`) beyond
  what verification needs.
- No new dependencies. Pretable stays deferred.

## Anti-goals

- Hiding information that the full workbench shows today. Compact means
  rearranged, not removed. The exceptions are the misleading or redundant
  items listed under "Declutter".
- Two different mental models for the full workbench and the embed. The
  toggles and the tree apply at every width. Only the Requests layout changes
  with width.

## Design

### 1. One panel per tab, with a mode toggle

Today `workbench-view.ts` renders a `captured` section, a `detail` section, and
the `{ }` raw-frame toggle. Replace them with one section:

- **Header:** a title on the left and a segmented control on the right.
- **Body:** a single code or tree view that fills the remaining height.
- **Caption:** one small line under the body with the provenance and position,
  for example `SDK parsed output · turn 1 · event 50/123`. This replaces both
  the section subtitles ("Captured from SDK parsed output.") and the
  selection chip row.

Modes for the tabs Brian named (agreed):

| Tab   | Modes                            | Default  |
| ----- | -------------------------------- | -------- |
| UI    | Schema · Raw · Parsed · Resolved | Resolved |
| JSON  | Raw · Parsed · Resolved          | Parsed   |
| State | Tree · JSON · Raw                | Tree     |

Meanings:

- **Raw:** for UI and JSON, the model's output text as it streamed. For State,
  the captured frame.
- **Parsed:** that text parsed as JSON, including partial values while it
  streams.
- **Resolved:** the props Hashbrown handed the component (today's "Resolved
  props" box).
- **Schema:** today's "Trusted component" box.

Before a mode has data (for example Resolved before the first parsed event),
it shows the same "waiting" text the boxes show today.

_My call:_ **Parsed** is a partial parse of the frame's streamed `json`
text with core's streaming JSON parser. `workbench-view.ts` already imports
`@hashbrownai/core`, so this adds no dependency. When the text is complete,
Parsed equals a plain `JSON.parse`.

_My call:_ the UI and JSON variants for other lesson formats (`decision`,
`structured`, `history`, `recipe`, `kit`, `workflow`) follow the same rule as
the other tabs below. Their current top box and bottom box become two modes,
named after today's headings and shortened (for example "Choice" and "Typed").
They also get **Raw**, which is the streamed `json` text when the frame has it
and the captured frame otherwise. Raw / Parsed / Resolved apply only where the
frame has streamed `json` and resolved `props`.

_My call:_ the other inspector tabs that lessons use (Text, Markdown, Kit,
Schema, Transform, Instructions, History, Saved text, Decision/structured
variants) get the same pattern: their current top view and bottom view become
two modes, plus **Raw** for the captured frame. Their mode names reuse their
current section headings, shortened.

_My call:_ the chosen mode is remembered **per tab** for the life of the page,
so switching JSON → State → JSON keeps JSON's mode. It is not persisted across
reloads.

### 2. State tree

- Objects and arrays render as rows you can expand or collapse (▸ / ▾). A
  closed branch shows its size (`{4}`, `[2]`).
- Top level and the first level of branches start open. Deeper levels start
  closed.
- What you open or close is kept by **path** as the playhead moves, so
  scrubbing does not reset the tree.
- Values that changed at the current event get a brief highlight. The diff is
  against the previous event's state, not a request diff.
- Today's "Selected moment" box becomes a `moment` branch of the same tree.
- Keyboard: the tree uses the ARIA `tree`/`treeitem` pattern (arrow keys
  move, Left/Right collapse/expand, Enter toggles).
- Long strings are truncated on one line, with the full value in a `title`.

### 3. Requests: detail first at narrow widths

This applies when the Requests container is under 560px, the existing
`@container wb-requests (max-width: 559px)` breakpoint. Wider layouts (the full
workbench) keep today's table + detail, apart from the shared fixes below.

- **The overview strip is removed at narrow widths only.** There, the main
  timeline under the inspector is the only scrubber. The full workbench keeps
  the strip, because the Requests inspector design asked for both timelines to
  be drag-scrubbable. Fix the strip's flag so it uses the same label as the
  main timeline for the same event.
- **Header picker:** a button showing the current request:
  `Continuation · Turn 1   200   1.58 s ▾`. Opening it shows the turn-grouped
  list as a drop-down over the detail. It uses the same rows as today's table
  (name, status, duration), with tool calls indented. The request under the
  playhead has a blue left edge, and future requests are greyed. Picking one
  closes the drop-down. Escape closes it. It is keyboard reachable as a
  listbox.
- **Detail tabs** become one segmented row that scrolls sideways if needed:
  Overview · Messages n · Tools n · State · Request · Response n. "Raw
  request" is renamed to "Request".
- **"Back to requests" is removed.** The picker replaces it.
- **Follow the playhead (every width):** while the reader scrubs or plays, the detail shows
  the request whose events contain the playhead. If the playhead is between
  requests, it shows the most recent one before it. If the reader picks a
  request by hand, following stops until they scrub or play again. Picking a
  request still seeks the timeline to it, as row clicks do today.
- Live mode keeps today's rule that an HTTP error is selected automatically.

### 4. Declutter (replay embed)

Remove:

- the "Inspector" pane title (the tabs say what the pane is);
- the selection chip row (`Prompt · Turn 1 · 0 ms · event 1/123 · Awaiting
source`); the timeline flag already names the event, and the turn and event
  number move to the panel caption;
- the "Awaiting source" / "Live model" source label whenever the store is a
  read-only recording (`snapshot.readOnly`), in the embed and in the full
  workbench, both in the header and in the chip row. Live sessions keep it,
  including while scrubbed back in history;
- "Return to live" when the workbench is a replay embed (`embed=replay`). The
  gate is the embed parameter, not the cursor;
- "Replay is read-only." and "SummaryCard · captured preview" inside the
  conversation pane;
- "Recorded at c29b05b" shortens to the commit.

_My call:_ the full (non-embed) workbench keeps "Return to live", because it
has a live session.

### 5. Playhead correctness

Reproduced on hashbrown.dev, 2026-10-30, generative-ui lesson:

- The Requests detail did not follow scrubbing (fixed by §3).
- The Requests overview and the main timeline used different flag labels for
  the same moment ("Model request" vs "Request"). Removing the strip resolves
  this.
- The playhead circle looked a few pixels right of its line in a zoomed
  screenshot. The CSS suggests they align. Re-check after the change at device
  pixel ratio 1 and 2, and fix it in this work if it's real.

The main timeline must keep today's behaviour: click to seek, drag to scrub,
tick press under 4px is a click, and keyboard on the slider.

## Constraints

- Code lives in `www/examples/quickstart/runtime` (framework-neutral; serves
  both `react.html` and `angular.html`). Main files:
  - `workbench-view.ts`
  - `workbench-requests-view.ts`
  - `workbench-requests-timeline.ts` (strip removal)
  - `workbench-scrub.ts`
  - `workbench.css`
- AGENTS.md:
  - tests first;
  - top-level `test()` only, with arrange/act/assert;
  - TSDoc on exports;
  - no new dependencies;
  - fix lint rather than suppress it.
- Canonical workbench media (lesson videos and screenshots) are recorded
  against the UI. Re-recording them is a **follow-up PR** after this merges,
  as #803 followed #801. It is not part of this work.

## Verification

- Unit tests for:
  - the mode model;
  - tree expansion by path;
  - the changed-value highlight;
  - "follow the playhead" request selection;
  - the picker list.
- In Chrome, on a docs page with the embed at docs width, and on the full
  workbench, check:
  - every mode of UI, JSON and State;
  - the tree survives scrubbing;
  - the Requests picker, follow and stop-following;
  - no overview strip;
  - the declutter items are gone in replay and kept in live;
  - the timeline scrub and click still work.
- `npx nx e2e www` layout report stays clean.

## Left to the builder

- Exact segmented-control styling, within the existing `--wb-*` tokens.
- How the Parsed view reaches its partial JSON (the parser output already
  captured in frames is expected to be enough).
- Splitting `workbench-view.ts` if the mode model grows it further.
