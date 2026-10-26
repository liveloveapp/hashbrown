# Canonical recipe workbench implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement the following scoped tasks with reviews.

**Goal:** Roll Magic Text, predictive suggestions and UI selection into the approved canonical workbench in Angular and React, with six real-provider recordings.

**Architecture:** Extend immutable capture with typed recipe observations and guarded explicit actions. Keep recipe contracts and presentation in focused modules. Use actual text-chat, structured-completion and UI-decision APIs. Server pins each lesson's protocol and contract. Framework-owned captured rendering supports real Magic Text parsing in replay without requests or writes.

**Tech Stack:** Existing Hashbrown/TypeSafe/OpenAI, Angular, React, Express, Vitest, Playwright and ffmpeg. No new dependencies or SDK release.

## Task 1: Contracts, capture and server boundary

Files: new `www/examples/quickstart/runtime/workbench-recipes.ts`; modify `runtime/workbench.ts`, `runtime/workbench-lessons.ts`, `runtime/workbench-decision-transport.ts`, `server/workbench-app.ts`, `server/workbench-server.ts`; corresponding `www/test/workbench-*.spec.ts`.

- [ ] Write failing tests for three allowlisted lessons, raw text capture, immutable recipe observations, current request/revision guards, prediction validation/accept/dismiss and single-view selection/manual replacement. Tests use top-level test calls and separated arrange/act/assert.
- [ ] Define fixed plan reuse, public Markdown instructions/source, bounded predictions schema/catalog, UI candidates and selection schema. New formats are `text`, `predictions`, `selection`; give lessons an explicit chat/decision protocol so selection cannot enter chat routes. Keep old eight formats/lessons working.
- [ ] Extend frames/messages with typed POJO recipe observations. New formats initialize the existing fixed application plan at revision zero. Store records reply observations only for the current user/request and loading run. New writes require live cursor, fresh completed success and unchanged captured application revision; repeat/stale/partial/error/cancelled results cannot write. Accepted predictions exclude duplicates; dismissed proposals do not increment application revision. Accepting one prediction invalidates siblings at the prior revision; show that state and request fresh suggestions.
- [ ] Provide narrow recipe operations (recordRecipe, acceptPrediction, dismissPrediction, applySelection, manualSelection, inspectCitation or equivalent typed API). Manual selection cancels/invalidate the pending run, is captured as an explicit interaction even before any model request, and cannot later be overwritten. Citation selection changes inspector context, not the application plan.
- [ ] Extend decision capture transport with a default-preserving endpoint parameter. Server dispatches trusted protocol/lesson, preserves old endpoints and pins selection questions/plan. Dispatch the actual TypeSafe schema by lesson in both normal server and verifier, not merely the endpoint. Generation pins text or prediction instructions/response schema and only tools actually registered by each client. Keep bounds, same-origin, cancellation, admission and provenance. Normal host and live verifier use the same provider boundaries.
- [ ] Run focused tests/lint; coordinate strict build with parent. Hand off exact types/methods. No parallel SDK builds.

## Task 2: Actual framework clients and shared presentation

Files: new React `MagicTextWorkbench.tsx`, `PredictionsWorkbench.tsx`, `SelectionWorkbench.tsx`; Angular matching `magic-text-workbench.ts`, `predictions-workbench.ts`, `selection-workbench.ts`; wire existing `Workbench.tsx`/`workbench.ts`. Parent owns shared `workbench-view.ts`, new `workbench-recipe-view.ts`, CSS and timeline.

- [ ] Add failing client/shell tests for managed captured chat, lesson-appropriate inspector/replay, citations and guards. Prefer behavioral pure/render tests over implementation mirrors.
- [ ] Shared shell optionally lets a framework render its own captured chat while historical: keep same live mount, hide native replay, disable composer and action handlers through cursor guards. Existing eight lessons keep their existing rendering. Return inert frame data to framework components; never serialize framework elements.
- [ ] Magic Text uses actual useChat/chatResource, readContext browser tool and Magic Text renderer. Capture Markdown text incrementally, finalize parser separately from success, use the same renderer for captured history, and prevent citation navigation while recording actual citation click metadata. Streaming milestones say text. Cancellation retains partial output; explicit retry works in the same conversation; source badge follows cursor/turn.
- [ ] Predictions uses actual structured-completion APIs with null initial input and explicit fresh context IDs. Each request is a context snapshot, with current accepted actions, rather than manufactured conversational history. Wait for complete successful valid output before accept/dismiss. Capture invalid/empty/stale/error/cancel outcomes; preserve state and explicit recovery.
- [ ] Selection uses actual UI-decision candidate bindings and actual SDK-selected UI in live mode. Candidate components/props remain application-owned. Whole response/IDs/confidence are inspectable. Only explicit Use view commits a current confident result. Manual choice works independently, aborts pending model work and invalidates late results. Historical UI reuses the trusted registry with no live handlers.
- [ ] Use current-error identity guards where a prior SDK error survives a send. Match active user/context IDs, not merely a loading boolean. Retain independent sessions and stop on navigation/deactivation.
- [ ] Coordinate strict compile and focused tests/lint; review spec compliance then quality before moving on.

## Task 3: Verification and real recordings

Files: new `www/src/tools/verify-recipe-workbench.ts` (focused helper); modify `verify-workbench.ts`, `record-workbench.ts`, `build-workbench.ts` if needed; add helper tests only for necessary reusable logic.

- [ ] Deterministic browser paths for all three new modes and both frameworks. Fixtures go through actual adapters where mapping matters and remain explicitly labelled.
- [ ] Magic Text: no initial request, partial Markdown before completion, heading/emphasis/list, actual citation details, same-conversation follow-up, terminal outcomes, cancellation/error/recovery, inert captured renderer and source replay.
- [ ] Predictions: no initial request; current-context output; no partial actions; accept advances revision once, dismiss leaves it unchanged; follow-up excludes accepted IDs; empty valid result; malformed/stale/error/length/cancel outcomes and replacement; no replay requests/writes.
- [ ] Selection: same candidate contract at actual TypeSafe boundary; first summary then ordered steps; explicit apply, low confidence/unknown/error/manual fallback, cancellation and late result isolation; whole responses; no replay requests/writes. Check mobile overflow and session navigation for each mode.
- [ ] Existing sixteen plus six new paths pass (22 total). Live helper uses actual shared server factories and OpenAI/TypeSafe, not fixture data. Preserve source/semantic reports and originals in unique captures directories.
- [ ] Record all six, then encode 1600×1000 MP4/WebM with ffmpeg and existing efficient codecs. Measure readable VTT phases and include screenshots/posters/transcripts. Disclose event pacing and speed changes, no narration. Validate all formats, captions and selected frames.

## Task 4: Guides and integration

Files: `www/content/docs/{react,angular}/recipes/{magic-text,predictive-actions,ui-selection}.md`, both `start/workbench.md`; `docs-demo-media.ts`, guide/media tests, quickstart README and `docs/docs-media-inventory.md`.

- [ ] Write source/media guide tests first. Read 2024-or-older posts in `~/repos/brianflove` for voice. Lead each guide with its own framework recording; teach one concrete operation at a time, short exact checked excerpts, setup and outcomes. Explain completion snapshots vs chat history, app-owned candidates/data, citation limits and explicit writes.
- [ ] Register `canonical-workbench-{magic-text,predictions,ui-selection}-{react,angular}` with truthful provenance and result images. Overview lists eleven lessons. Keep existing legacy assets for bookmarks, with no stale source claims in active new guides.
- [ ] Run `npx nx test www`, `npx nx build www`, `npx nx e2e www`, `npx nx lint www` sequentially, plus media decoding/bounds/visual review. Report existing warnings.
- [ ] Final review; commit/push/PR and attach. Wait required checks green, merge exact tested head without bypass, wait deployment and verify six production guides, 36 media hashes, both overview guides, actual browser playback/captions. No release.
