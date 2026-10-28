# Docs workbench integration

Status: draft for review (2026-10-27)

## Why

The canonical docs workbench now runs live at `https://workbench.hashbrown.dev`. It has React and Angular pages, and each lesson has its own URL (`/react.html?lesson=tools`). Today, docs pages show only a recorded video of each lesson through `<hb-docs-demo demo="canonical-workbench-…">`. The video is rendered by `www/src/components/elements/DocsDemoVideo.tsx` from the catalog in `docs-demo-media.ts`. The only link to the live workbench is on the two `start/workbench` pages.

Brian wants a reader on any docs page to do two things without leaving the page:

1. **See it run:** watch the concept the page teaches working in the real workbench.
2. **See the source:** see the workbench code behind that concept, with the relevant lines highlighted.

Code examples on the page should connect to the panel. Clicking a snippet jumps the run to the moment that code acts, and highlights the snippet's lines.

## Goals

- Add an inline **workbench panel** to every docs page that has a workbench lesson. It goes where the recorded video sits today (Brian chose inline over a side dock).
- The panel has three views:
  - **Replay** (default): a recorded run of the lesson in the real workbench UI. It shows the chat, inspector, scrubber and milestones. It starts instantly and makes no model or network requests beyond static files.
  - **Live**: the hosted workbench on that lesson and framework. It runs against the real model after one deliberate click. It also has an "Open full workbench ↗" link to `workbench.hashbrown.dev/<framework>.html?lesson=<id>`.
  - **Source**: the real files behind the lesson, with the lines for this page's concept highlighted. It links to GitHub at the deployed commit.
- **"See it run" on snippets:**
  - An `hb-code-example` taken from workbench source gets a "See it run" action.
  - Clicking it scrolls to the panel, switches to Replay and seeks to the moment that code acts.
  - It also highlights the snippet's lines on the page and in the Source view.
- **Pages without a lesson** get a compact launcher. It opens the panel on the closest related lesson, from an explicit per-page mapping. A page with no sensible lesson gets nothing.
- **The panel follows the framework:** React docs show React, and Angular docs show Angular.

## Non-goals

- A persistent dock across pages, or a pop-out. Brian chose inline. A dock may come later.
- Running arbitrary reader-edited code. Snippets are read-only links into the real source.
- Changing which lessons exist, or their content.
- Replacing the non-workbench demo videos (`ui-kits`, `agent-routing`, `local-models`, `threadplane-*` and the rest). They keep `DocsDemoVideo`.
- Making the loopback-only lessons work when hosted. These are `server-threads` and `public-endpoint`. Their Live view links to the docs' "run it locally" instructions instead.

## Anti-goals (failure even if it works)

- **Slower pages.** Docs pages must not get slower to load. Nothing loads until the panel scrolls near view or is clicked, as with today's `preload="none"` video.
- **Tokens without a click.** No model tokens are spent without an explicit reader click on Live and then Send.
- **Drift.** Source, highlighted lines and snippets must never show code that differs from what the deployed workbench runs. If a snippet or highlight can no longer be located in its file, the build or tests fail.
- **Captures are allowed to lag.** Each capture records the commit it came from, and Replay shows "Recorded at <short sha>". CI checks only that the capture format version is compatible. It does not check that lesson source is unchanged, because that would make every workbench edit wait on a paid live re-record. Claude's call.
- **A second UI.** A separate re-implementation of the workbench inside the docs site would drift from the real one. The panel embeds the real workbench.

## Decisions made

- **Inline placement.** Brian's decision.
- **All three views, snippet linking and the fallback launcher are in scope.** Brian's decision: "I like it all".
- **Replay captures are live re-records.** Add capturing to the recorder and re-record every lesson × framework pair against the real models (OpenAI and TypeSafe). Use the existing batched recipe (`WORKBENCH_LESSONS=<batch>`). Videos are refreshed in the same runs. Replay never uses fixture output. Brian's decision.
- **What a snippet's "context" means.** Seek the replay to the snippet's moment and highlight its lines. Nothing more. Brian's decision.

## Calls made by Claude (open to change)

1. **Embed the real workbench in an iframe for both Replay and Live.**
   - Add an **embed mode** to the workbench page (`?embed=1`). It hides the sidebar and keeps chat, inspector and player.
   - Replay (`?embed=replay`) waits for the docs page to post a recorded capture, which the page fetches from its own hashbrown.dev static files. It loads the capture into the existing replay and player machinery and disables sending. The workbench needs no CORS setup and no allowlist of capture URLs. Claude's call, made during planning.
   - Live is the same page without `capture`.
   - Reason: one UI, no drift, and the replay, scrubber and inspector already exist.
2. **Publish captures alongside the videos.**
   - Today the recorder (`record-workbench.ts` → `verify-workbench.ts`) writes only videos, `live-report.json` and a checkpoint report under `dist/docs-workbench/captures/<timestamp>/`. The store's events and application state are not saved.
   - So capturing must be added to the recording run. It writes a per-lesson, per-framework **capture file**: the captured events and app state the player needs. Publish it next to the video media (same Blob/static path convention) so Replay can fetch it.
   - Every lesson must then be recorded again to produce captures. That is about 44 lesson and framework pairs (Brian chose live re-records). After that, re-recording a lesson refreshes its video and its capture together.
3. **Parent ↔ iframe messages over `postMessage`.**
   - The docs page sends `seek(milestone)` and `highlight` requests.
   - The iframe reports ready and current state. It also reports which view is current, so Live is only marked "live" after the reader's click.
   - Both sides check origins: hashbrown.dev and preview origins on one side, the workbench origin on the other.
4. **Snippet anchors are author-declared.** The `hb-code-example` element gets an optional `run="<milestone>"` attribute naming a milestone in that lesson's capture, for example the `readContext` tool call. "See it run" appears only on snippets that have it. Today, milestones in `workbench-timeline.ts` are labels computed from each capture and have no stable IDs. The builder gives them stable, human-readable IDs that the capture records, for example `tool:readContext`.
5. **Line highlights are computed at build time.**
   - The existing test in `www/test/docs/workbench-guides.spec.ts` already proves each workbench snippet appears in its header file (after trimming).
   - Extend that idea into the docs build so it resolves each snippet to a line range in its file and emits it as data for the Source view.
   - An unresolvable snippet fails the build.
6. **Source view content.**
   - It shows the lesson's files: the framework component file, the server route or schema, and the shared runtime file, chosen per lesson in a manifest. Content is read from the repo at the deployed commit and bundled at build time, not fetched from GitHub.
   - Lines from the page's snippets are highlighted. Each lesson can also declare extra highlight ranges.
   - The GitHub link uses the deployed commit SHA.
7. **Lesson-to-page mapping lives in one manifest.**
   - Today the mapping is implicit in `hb-docs-demo demo="canonical-workbench-<lesson>-<framework>"`.
   - Replace those embeds with a panel element, for example `<hb-workbench lesson="tools">`, where the framework comes from the page route.
   - Add a manifest entry for pages with no lesson that names their closest lesson.
8. **The hosted workbench must allow framing by hashbrown.dev.**
   - Set `Content-Security-Policy: frame-ancestors` to `https://hashbrown.dev https://www.hashbrown.dev https://*.vercel.app http://localhost:*`.
   - Allowing `*.vercel.app` adds little risk: the workbench is already public and rate-limited per IP, and framing it lets nobody do more than visiting it directly. It lets docs previews work.
   - Docs previews and local docs frame the **production** workbench. So embed mode, capture hydration, the message protocol and the CSP header must land and deploy in the workbench first, as its own PR, before any docs PR depends on them.
   - Live requests from inside the iframe originate from the workbench origin, so the existing same-host check passes unchanged.
9. **Mobile.** Below roughly 800px the panel shows the existing recorded video, using `DocsDemoVideo` and its media, plus an "Open full workbench ↗" link. The workbench's own layout clips under 800px. So the videos stay, and the recorder keeps producing both video and capture. No responsive workbench work is in scope.

## Constraints

- **Stack.**
  - The docs site is Next.js (`www/`), with markdown in `www/content/docs`. Custom elements such as `hb-docs-demo` and `hb-code-example` are mapped in `www/src/components/docs-components.tsx`.
  - The workbench is the Vite build in `www/src/tools/build-workbench.ts`, deployed by the `workbench` Nx project (`tools/workbench`).
- **Two deploy targets.** The hosted workbench and the docs site deploy independently, so a docs page can briefly point at a different workbench version. A capture or replay contract mismatch must degrade to "Open full workbench ↗", never a broken panel. Version the capture format.
- **Vercel Hobby plan.**
  - The 5000 uploads/day limit applies. Captures are a few dozen small JSON files, which is fine.
  - The project allows one firewall rule, which is already used for the workbench API rate limit.
- **Repo rules** (`AGENTS.md`):
  - Top-level `test()` only, in arrange/act/assert style. Write the failing test first.
  - TSDoc on public or reusable code.
  - No new dependencies without asking.
- **Accessibility.**
  - The panel's views are tabs.
  - The iframe has a title.
  - "See it run" is a real button.
  - Highlights are not conveyed by color alone.
- **Loopback-only lessons.** These are `server-threads` and `public-endpoint`. They have Replay and Source, but not Live.

## Left to the builder

- The exact capture file schema and how the workbench hydrates it into its existing capture model.
- The panel's visual design within the www LLA styling and 4px spacing tokens.
- Iframe sizing and resize messaging.
- How the scroll and seek of "See it run" are animated.
- Phasing. Suggested order:
  1. workbench embed mode, capture hydration, the message protocol and the CSP header (workbench-only PR), then recording captures, then Replay replacing the videos
  2. Source view with build-time line resolution
  3. snippet "See it run" and highlights
  4. the fallback launcher across the remaining pages

## Done looks like

- Every page that embeds `canonical-workbench-*` today shows the panel instead of a video. Replay plays the recorded run in the real UI, with no model requests.
- Clicking Live and sending a message streams a real run inside the docs page, on hashbrown.dev in production.
- The Source view shows the lesson files with page-relevant lines highlighted. Changing a snippet's source without updating the doc fails CI.
- Clicking "See it run" on, for example, the React Tools page's `readContext` snippet does three things:
  - scrolls to the panel
  - seeks Replay to the tool call
  - highlights the snippet's lines in the page and in Source
- Pages without a lesson that have a mapped neighbour show the launcher.
- Lighthouse performance on a docs page with the panel is no worse than with today's video.
