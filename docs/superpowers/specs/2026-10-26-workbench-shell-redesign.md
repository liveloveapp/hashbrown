# Canonical workbench shell redesign

The canonical workbench (`www/examples/quickstart`) is the example app the
library docs teach from: 11 lessons, React and Angular clients, recorded videos
and screenshots in 24 guides. Earlier specs deliberately froze its visuals. This
is the first visual and interaction pass. It changes the shared shell only. SDK
usage, the capture model, server boundaries and lesson behaviour stay as they are.

## Why

Brian watched it in use and found two problems. First, the far-right Context
panel is confusing: its Details tab silently changes with the Inspector tab, so
there are two tab rows and one secretly drives the other. Raw duplicates the
selected frame and Console duplicates the timeline. Second, the playback bar is
a row of text buttons, two selects and chip rows that reads like a form rather
than a player. Because the workbench is filmed for the docs, the shell must read
well in a 1600×1000 recording with no mouse hovering.

## Goals

- Three columns: collapsible sidebar · chat · inspector. The Context panel goes away.
- One inspector with one tab row. Each tab pairs captured content with what the
  SDK or application made of it.
- A player-style timeline with icon transport.
- A user-resizable split between chat and inspector.
- A collapsible, sectioned sidebar that collapses to an icon rail.

## Non-goals and anti-goals

- No change to SDK calls, `WorkbenchStore`, frames, capture, transports, server
  routes, lesson prompts or acceptance rules. Replay stays inert: no network,
  tool or write effects.
- No new dependencies. Icons are inline SVG.
- No dark mode, no rebrand. Keep the LLA light canvas, Hanken Grotesk, JetBrains
  Mono, ink actions and cobalt selection, plus the 4px spacing rhythm used on www.
- It must not lose information. Every captured frame, raw payload and detail
  string reachable today stays reachable. Anti-goal: a cleaner shell that hides
  the paired "captured vs interpreted" view that the lessons teach.
- It must not make recordings depend on viewer state. Persisted sizes or
  collapsed sections must never leak into verification or recording runs.

## Layout

`header` (Hashbrown · lesson title · framework · provenance) stays as it is.
Below it, the main grid is `sidebar | chat | handle | inspector`, with the player
bar full width underneath. Panels scroll on their own vertically, and the
document never scrolls sideways.

### Sidebar

- **Top:** a primary **New conversation** button (ink, plus icon, full width)
  and a sidebar toggle (panel icon) beside it. ⌘B / Ctrl+B also toggles.
- **Sections**, in this order, each with a heading button (chevron,
  `aria-expanded`) that folds and unfolds with a short height animation:
  - **Conversations**: one row per retained session (chat icon, label). The
    current one is highlighted cobalt. No turn count (builder's call:
    `WorkbenchNavigation` carries only `{ id, label }`, and a count would mean
    changing every client).
  - **Concepts**: Generative UI, Tools, Structured output, Streaming, Schemas, Decisions.
  - **Production**: Debugging, Request transformation.
  - **Recipes**: Magic Text, Predictive suggestions, UI selection.
- The grouping and the per-lesson icons are the builder's call (see "Calls made").
  Lessons stay `<a href="?lesson=">` links with `aria-current="page"`. That
  keeps today's "opens a fresh page, no request" behaviour.
- **Collapsed rail** (48px): icons only, centred. Section headings become thin
  dividers and every item stays visible. Each item has an accessible name and a
  hover/focus tooltip. New conversation becomes a single plus button. Expanded
  is 216px. The grid column animates between widths (200ms, off under reduced motion).
- The sidebar scrolls vertically when taller than the viewport.

### Chat and inspector split

- The handle between chat and inspector is a `role="separator"` with
  `aria-orientation="vertical"`, `aria-valuenow/min/max` and a tab stop. A visible
  pill grip in the middle shows ‹ › chevrons. On hover, focus or drag the grip
  and a 2px line turn cobalt.
- Pointer drag uses pointer capture. ←/→ moves it in 4% steps. Double-click or
  Home resets it. The chat share is clamped to 25–75%, with minimums of 280px
  for chat and 320px for the inspector.
- Default split: chat 44%, inspector 56%.

### Inspector

- One tab row, with tabs per lesson as today (JSON/Markdown · Requests ·
  [Schema] · [Transform] · UI · State). Today's default tab per lesson is kept.
- **Selection strip** under the tabs: event label chip (cobalt) · turn ·
  elapsed ms · `event n/total` · provenance chip (`live model`, `test fixture`,
  `local demo failure`). It shows the live head when not replaying. It replaces
  Context's `Turn · live · tab` scope line.
- **Paired body.** Two sections, "captured" first and "interpreted" second. Each
  has a heading and a quiet sub-label. The **captured** section alone has a small
  `{ } raw` toggle (`aria-pressed`). It swaps that body for today's Raw view: a
  `kind · source` heading and `frame.payload`, or the full transformation on
  Transform. The interpreted section has no raw toggle, so the same payload
  never appears twice (builder's call).
  - **Side by side** when the inspector is at least 560px wide, **stacked** when
    narrower. This is a CSS container query on the inspector, not a media query.
  - The pairs carry over today's Details content per tab:
    - JSON/Markdown: Model output (streaming) | Resolved props / Typed plan /
      Typed choice and confidence / the recipe's `detailHeading`.
    - Requests: request and tool list | selected request payload / browser tool result.
    - Schema: response contract | preview validation.
    - Transform: before/after evidence | preserved mapped fields.
    - UI: trusted component contract | resolved props / selected candidate.
    - State: application snapshot | selected moment.
  - When a tab has no meaningful second half, it shows one full-width section.
    The builder decides which tabs, but must justify it against "no lost information".
- **Console is removed.** The player's raw-events mode is the full event log.
- Errors (`role="alert"`) keep showing at the top of the inspector body.

### Player bar

- **Left:** icon transport buttons with accessible names that match today's
  labels where they exist: **Previous turn**, **Previous event**, **Play** /
  **Pause** (filled circular ink button), **Next event**, **Next turn**. Previous
  and next turn replace the `Conversation turn` select.
- **Middle:** a scrubber. Each turn is a track segment labelled "Turn n" below
  it, and played portions are filled cobalt. Milestones are ticks at
  their event-index position. Each tick is a real focusable button with today's
  milestone `aria-label` (`label. Turn n, event i: kind, ms`). A dark flag above
  the playhead always names the current milestone, so the video stays
  readable without hover. Dragging the playhead or clicking the track seeks.
  Keyboard: the scrubber is a `role="slider"` that steps by event.
- **Right:**
  - a monospace time readout (`2.14 s / 7.33 s`);
  - a speed control cycling ½× · 1× · 2×, named `Playback speed <value>` (for example `Playback speed 1×`) so the current speed is announced;
  - a **Raw events** toggle (list icon, `aria-pressed`). When on, ticks show every
    frame, not just milestones.
  - a live pill. At the head it shows a red dot and **LIVE**. In replay it is a grey
    button named **Return to live**, keeping today's accessible name.
- **Keyboard shortcuts** apply when focus is not in a text field: Space
  play/pause, ←/→ event, Shift+←/→ turn, L return to live.
- Controls are disabled while generation is active, as today (`busy`).

### Icons

Inline SVG, Lucide-style (24 viewBox, 2px stroke, round caps). Defined once per
shell, `aria-hidden`, with the accessible name on the button. No emoji.

### Narrow layout (under 800px)

Single column: the sidebar becomes a compact top strip, then chat, inspector
(stacked pairs) and player. There is no resize handle, and the document never
scrolls sideways at 390px. The builder decides how the narrow sidebar looks.

### Persistence

Per browser, in `localStorage` wrapped in try/catch: sidebar rail state,
collapsed sections and the split ratio. Shared across retained conversation
instances on the page. Verification and recording run in fresh browser
contexts, so they always start at the defaults (expanded, all sections open,
44/56). Tests assert those defaults.

## Constraints

- The shell lives in `runtime/workbench-view.ts` and `runtime/workbench.css`,
  shared by both frameworks. React and Angular clients mount it and keep SDK
  rendering. Any client-facing extension points (recipe chat rendering) keep working.
- `render()` rebuilds parts of the DOM on every store change. Resizing,
  collapsing and pending scrubber drags must survive re-renders and must not
  re-trigger store work.
- Existing selectors and names used by verifiers and tests:
  - `getByRole('button', { name })`: Play, Previous event, Next event, Return to
    live, New conversation, First prompt, Follow-up.
  - `textContent === 'Play'`, `'Raw events'`.
  - `.wb-nav [aria-pressed=true]`.
  - `.wb-detail .wb-inspection`.

  Keep accessible names. Update tests and verifiers that rely on text content or
  on `.wb-detail` to the new structure. Do not keep a hidden `.wb-detail` just
  for them. Give the interpreted section a stable hook (for example
  `data-detail`) for verifiers.
- AGENTS.md rules apply: tests first, top-level `test()` with arrange/act/assert,
  TSDoc on new reusable functions, no new dependencies, fix lint rather than
  suppress it.
- Run `npx nx test www`, `npx nx lint www`, `npx nx typecheck www`,
  `npx nx workbench-build www` and `npx nx workbench-e2e www` (deterministic
  fixtures, both frameworks, all 22 paths, including the 390px check). Run them
  one after another, never in parallel.

## Docs and media

Guides that describe the old shell ("far-right panel", "Details, Raw, and
Console", "Return to live", "Raw events") need their prose updated to the new
shell. That is 14 files across React and Angular. The guide code-block
comparisons are unaffected. Brian's decision: two PRs.

1. **This change:** the shell, its tests and verifiers, and the prose updates in
   those 14 guides. Published videos, posters and result screenshots are left
   unchanged. Until PR 2 lands, guides may show the old Context panel while the
   prose describes the new shell. That is accepted as temporary.
2. **Follow-up PR:** re-record every canonical workbench video, poster, result
   screenshot, caption and transcript against the new shell. Use real providers
   and the existing `workbench-demo` / `demo-publish` flow, and check the
   recording cues (`workbench-recording-cues`) against the new layout.

## Calls made (builder's, for Brian to check)

- Lesson grouping into Concepts / Production / Recipes, with Conversations first.
- The icon for each lesson.
- Console is removed rather than moved.
- There is one raw toggle, on the captured section. No turn counts in the sidebar.
- Size and collapse state are remembered per browser. Recordings use defaults.
- 560px container threshold, 25–75% clamp, 280/320px minimums, 216/48px sidebar.
- Speed becomes a cycling pill instead of a select. Turn select becomes
  previous/next turn buttons.

## Left to the builder

Exact spacing within the 4px grid, animation curves, tooltip implementation,
how the narrow sidebar looks, how render state is split so drag/collapse survive
re-renders, and which tabs use one section.

## Reference

Mockups from the brainstorm: `.superpowers/brainstorm/30258-1793046962/content/`
(`inspector-player.html`, `layout-v2.html`, `layout-v3.html`). This folder is
gitignored and local only. Layout v3 is the agreed composition.
