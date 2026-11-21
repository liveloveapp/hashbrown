# Workbench focus: output becoming UI

Date: 2026-11-19
Status: draft, awaiting approval

## Intent

The workbench (workbench.hashbrown.dev, and the same code embedded in docs
pages through `WorkbenchPanelClient`) is crowded. A reader can't tell where to
look. Brian wants the one thing a lesson teaches to be obvious, with
everything else either gone or one click away.

The most important thing to see is **the model's output turning into UI**.
For a generative UI lesson that means the streaming JSON and the rendered
component, side by side, with the part that just arrived visibly linked in
both.

## Goals

- Each lesson opens on the view it teaches, beside the chat, with no other
  chrome competing for attention.
- In generative lessons, the newest streamed text is highlighted in both the
  inspector and the rendered component.
- Remove every eyebrow, caption, subheading and status label that the reader
  doesn't need to follow the lesson.
- One spacing rhythm: equal gaps between panels, equal inner padding in every
  panel, equal spacing between items inside a panel.
- The same design works in the full workbench (about 1440px) and in the docs
  embed (about 790px, no sidebar).

## Non-goals

- No new lessons, no change to what any lesson captures or records.
- No change to the player's capture or replay model, the Requests data, or the
  embed's message protocol with the docs page.
- No visual rebrand: keep the existing `--wb-*` colour and type tokens.

## Anti-goals

- Hiding something a docs page tells the reader to look at. Every view a page
  names by name must still be reachable, and the one it says "opens first"
  must still open first.
- A cleaner layout that makes the generative lesson look less like a real
  chat app.
- Two scrubbers on screen at once.

## Constraints

- Docs pages refer to inspector views by their current names (**JSON**,
  **State**, **Schema**, **Transform**, **Server**, **History**, **Agent**,
  **Access**, the Requests tab). Keep the existing tab names; don't rename them.
- Verifiers and tests rely on accessible names and hooks listed in
  [[workbench-shell-redesign]]: Play, Return to live, the "Seek captured event"
  slider, `.wb-inspector .wb-inspection`, `[data-captured]`, `[data-detail]`,
  `.wb-lessons a`, `data-mode` ids, the "Inspector views" tablist. Keep them or
  update the verifiers in the same change.
- Spacing stays on the `--wb-space-*` 4px grid, enforced by
  `www/test/workbench-spacing-grid.spec.ts`.
- Every captured video and poster in the docs shows the old layout. Re-recording
  all workbench media is part of finishing this work, as it was after #789 and
  #851.

## Approaches considered

1. **A. Linked pair (chosen).** Keep chat and inspector side by side. The
   lesson list collapses to a rail. The inspector opens on the lesson's own
   view, and generative lessons link the newest streamed text in both panels.
   Requests and State stay as tabs; other views go into a More menu. The player
   is the only scrubber. It keeps a real chat on screen, and it has the same
   shape in the full workbench and in the embed.
2. **B. Stage.** The chat shrinks to a prompt bar, and the middle becomes one
   wide JSON → component view. It reads like a teaching diagram, but the chat
   stops looking like an app, and that's what most docs pages are about.
   Rejected.
3. **C. Same layout, quieter.** Only the text cuts and spacing. It's the lowest
   risk, but it doesn't say where to look. Rejected as the whole answer; its
   cuts and spacing are folded into A.

## Design

### Layout

Full workbench: three columns (rail, chat, inspector) above the player bar.

- **Rail**: icon strip, about 40px. Clicking the menu icon opens the full
  lesson list as an overlay over the chat. Only the current lesson's section is
  expanded, and there are no section eyebrows in the rail. "New conversation"
  and the conversation list move into that overlay.
  *(My call: rail by default instead of today's open sidebar, because the list
  is the loudest column and the least useful while working through a lesson.
  Reuse the existing rail in `workbench-sidebar.ts` and the `rail` preference
  in `workbench-layout.ts`. Flip its default to `true`, and keep honouring a
  reader's saved choice. The expand toggle opens the overlay instead of
  widening the column.)*
- **Header**: a slim row with the Hashbrown logo and the framework switch only.
  Drop the lesson title, the "React" label as a separate chip, and the
  "Live model / Awaiting source" status.
- **Chat panel**: its title is the lesson name. No status chip. The composer
  uses a placeholder instead of a "Your message" label. Stop appears only while
  a run is going. Keep the First prompt and Follow-up chips with their current
  names. Fourteen docs pages tell readers to click them, and the
  predictive-actions recipe goes back to First prompt after Follow-up. Restyle
  them as quiet text buttons in the composer's bottom row, not bordered pills.
- **Generated components**: drop the "SummaryCard · trusted component" eyebrow
  inside the card.
- **Inspector**: tab bar, then the content. No component-name row and no footer
  caption. Mode toggles, where a tab has them, sit at the right end of the tab
  bar instead of on their own row.
- **Player bar**: transport, one scrubber with milestone ticks, time, speed,
  Live. Turn and milestone labels show as tooltips on hover and focus, not as
  permanent text under the bar. The Requests tab's own mini-timeline is
  removed; it follows the player instead (it already follows the playhead, per
  #851).

Docs embed: the same structure without the rail or header. The frame shows no
Hashbrown header, lesson name, framework or commit hash, because the docs page
already says all of that. The docs page's Replay / Live / Source tabs and its
"Open full workbench" link stay as they are.

### Tab rule

Each lesson's tab bar shows, in order:

1. its **lead** view: the lesson's existing `inspector` default;
2. at most one **companion** view, when the lesson's docs teach two views
   together;
3. **Requests** and **State**, unless one of them is the lead or companion;
4. **More ▾**, a menu holding every other tab the lesson has today.

That's at most four tabs plus More. I checked this against all lessons:

| Lessons | Lead | Companion | In More |
|---|---|---|---|
| Generative UI, First plan, UI selection | UI | — | JSON (and Schema for UI selection) |
| UI Kits, UI chatbot | UI | Kit | JSON, Schema |
| Tools, Debugging, Messages and turns | Requests | — | JSON/Text, UI |
| Structured output, Streaming, Predictions | JSON | — | Schema, UI |
| Decisions | JSON | — | UI |
| Schemas | Schema | — | JSON, UI |
| Local models | Model | — | JSON, Schema, UI |
| JavaScript runtime | Runtime | Code | Text, UI |
| Request transformation | Transform | — | JSON, UI |
| Prose | Markdown | — | UI |
| System instructions | Instructions | — | Text, UI |
| Activities / Interrupt and resume | Activities / Interrupts | the other one | Text, UI |
| Shared agent state, Production recovery | State | — | Text, UI, Activities, Interrupts |
| Server threads | Server | History | Text, UI, Access |
| Public endpoints | Access | — | Text, UI, History, Server |
| Message history, Save text conversations | History / Saved text | the other one | Text, UI |
| Decisions in agents | Agent | — | Text, History, UI |
| JSON parser | Parser | — | JSON, History, Schema, UI |
| Natural language forms | Form | — | JSON, History, Parser, Schema, UI |

Only five lesson groups need a companion, and each is a pair their docs pages
describe together. The table was checked against the tab list built in
`workbench-view.ts` (around line 754). The builder should still confirm each
lead and companion against that lesson's docs page.

The tab is labelled **UI**, not "Output" as in the mockup, because all tab
names stay as they are.

### Generative lesson inspector (UI tab)

This applies where `workbenchInspectorModes` gives generative modes today:
format `ui` lessons without a recipe override. There, the UI tab has four
modes (Schema / Raw / Parsed / Resolved), and the JSON tab repeats three of
them. Lessons with their own recipe or kit inspections (UI selection, UI Kits,
UI chatbot) keep their own modes.

- The UI tab gets two modes: **Streaming** (default) and **Schema**.
- **Streaming** shows the parsed partial JSON (today's Parsed), pretty-printed,
  with the newest-arrived text highlighted.
- Raw and Resolved move to the JSON tab, which goes into More for generative
  lessons. They're still reachable for readers who want them. The UI tab's
  default changes from Resolved to Streaming (Parsed).
  *(My call, and it reverses part of the #851 decision. Brian should confirm
  it before the tab work starts.)*

### Linked highlight

- "Newest" means the text that arrived within the last few captured events
  before the playhead. The builder picks the window; it should read as a soft
  trailing highlight while playing, and settle on the last delta when paused.
- The same span is highlighted in the Streaming view and in the rendered
  component. In the component, highlight the element whose prop received that
  text (for example the second list item), not the whole card.
- When the run completes, the highlight fades out.
- Use `--wb-cobalt-soft` as the highlight background in both places. Nothing
  else in the frame uses it while the highlight shows.
- **Required scope:** the format `ui` lessons that lead with the UI tab and use
  the generic modes, which are Generative UI and First plan.
- **Stretch, as a later PR if it fits cleanly:** JSON-led structured and
  predictions lessons, where the JSON tab would get the same Streaming view
  and the highlight would link to whatever the chat renders from those props.
  Recipe and kit lessons are out of scope.
- Lessons that lead with Requests or Transform (Tools, Debugging, Request
  transformation) get no highlight, even though they're format `ui`.

### Spacing

- One rhythm per surface, from the existing tokens:
  - Full workbench: gutter, gaps between panels and inner panel padding are all
    `--wb-space-4` (16px). Spacing between items inside a panel is
    `--wb-space-4`, and tight groups (a tab bar, a row of controls) use
    `--wb-space-2`.
  - Embed: the same rules one step down, with `--wb-space-3` (12px) where the
    full workbench uses `--wb-space-4`.
- Set this with a small set of semantic tokens (for example `--wb-gap`,
  `--wb-pad`, `--wb-stack`, `--wb-tight`) that the embed redefines, instead of
  per-rule overrides.
- The spacing-grid spec gains a check that panel padding and inter-panel gaps
  equal the semantic tokens.

## What the builder decides

- Exact highlight window and fade timing.
- How the rendered component's highlighted element is found. A data attribute
  per prop path, set by the workbench's component wrappers, is one way.
- Rail icons and the overlay's open/close behaviour, including keyboard and
  focus handling.
- Whether the prefilled composer text needs a visible "next prompt" hint, if
  testing shows readers miss the second turn.
- How to split the work into PRs. Suggested order: spacing tokens and text
  cuts; then tab rule and More menu; then rail; then linked highlight; then
  media re-record.

## Done looks like

- Full workbench and docs embed follow the mockups in
  `.superpowers/brainstorm/` (`design-a.html`). Where they differ, this
  document wins: a slim header row, a More menu, the UI tab label, and the
  First prompt and Follow-up buttons. Every lesson opens on its lead view, with
  at most four tabs plus More.
- `nx test www`, `nx lint www`, `nx build www`, `nx workbench-e2e www` and
  `nx e2e www` pass, with verifiers updated for removed elements.
- Every docs page's named views are still reachable, and "opens first" claims
  are still true.
- Workbench media re-recorded.
