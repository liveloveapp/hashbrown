# Canonical UI Kits Implementation Plan

> Use superpowers:subagent-driven-development to implement tasks with spec then quality reviews. Use existing managed worktree; user approved this next batch.

**Goal:** Roll UI Kits and generative UI chatbot into the Angular/React canonical workbench and publish four truthful recordings.
**Architecture:** Dedicated framework clients use the real kit/UI chat APIs; narrow shared store mode captures selected component and actual safe registry/schema, enforces acceptance, and reuses existing shell/transport/replay. Server pins the two trusted wrappers per lesson.
**Tech Stack:** Hashbrown, Skillet, React, Angular, TypeScript, Vitest, Playwright, ffmpeg, Next.js.

## Task 1: Shared UI lesson contract, store and server

Files: create `www/examples/quickstart/runtime/workbench-ui-kits.ts`; modify `workbench.ts`, `workbench-lessons.ts`, `workbench-sidebar-data.ts` (actual sidebar grouping file), `workbench-icons.ts`, `server/workbench-app.ts`; add `www/test/workbench-ui-kits.spec.ts` and server tests.
- [ ] Write top-level failing tests for closed component schemas, exact original JSON validation, immutable identity, read-only PlanReading, cancelled/error/truncated/unknown/multiple/stale/replay and once-only acceptance. Exercise server pinning and original older SummaryCard behavior.
- [ ] Run `npx nx test www --excludeTaskDependencies --args=<focused test path>` with standard NX flags; verify intended failures.
- [ ] Implement helpers, narrow optional `uiLesson` store mode, actual kit metadata registration, component identity on frames/messages, safe acceptance boundaries, catalog/sidebar and server schemas/system/tool pinning. Keep new reusable APIs TSDoc documented and old modes unchanged.
- [ ] Run focused tests; spec review then quality review; commit reviewed shared contract.

## Task 2: Actual Angular and React kit clients

Files: create `react/src/UiKitWorkbench.tsx` and `angular/src/app/ui-kit-workbench.ts`; modify root dispatch in respective Workbench files. Add framework regression tests. Reuse existing PlanCard/styles; narrowly add StepsCard/fallback/read-only appearance where needed.
- [ ] Write failing tests for actual kit composition/normalized registry, trusted variants and fallback, immutable origins/once-only acceptance, inactive/disposed roots and StrictMode, read-only response and safe cancellation.
- [ ] Implement dedicated UI chat clients, real readContext from store, actual `useUiKit`/`createUiKit`, real renderer/fallbacks and explicit current-source acceptance. Capture safe actual kit values once and SDK UI values/lifecycle with current origins; no synthetic parsed values.
- [ ] Hook shell registration, disposal, navigation and replay using existing patterns. Avoid render side effects, classes for pure data, circular imports or public SDK changes.
- [ ] Focused tests and `npx nx workbench-build www`; spec review then quality review; commit.

## Task 3: Inspector, verification, media tools and guides

Files: root owns `workbench-view.ts`, CSS, new inspector helper if needed; `www/src/tools/verify-workbench.ts`, new UI lesson verifier/fixture/cue helpers, `record-workbench.ts`; four guides at `{angular,react}/recipes/{ui-kits,ui-chatbot}.md`, start/workbench overviews, READMEs, media inventory/registry and related tests.
- [ ] Failing tests for actual captured registry/schema/selected identity, truthful replay labels and caption phases. Implement projection/replay over immutable frames. Do not label a captured placeholder as a real SDK fallback.
- [ ] Add provider-native fixtures exercising actual OpenAI mapping; verify both two-turn flows, actual tools, kit/component transitions, source completion, acceptance, read-only reading, replay, errors/truncation/unknown source, retry/cancel/navigation, responsive layout. Fixtures explicitly labelled and never published as live.
- [ ] Rewrite guides in user voice and source-link examples. Consolidate inventory/current counts:26/52; keep old assets for bookmarks. Add four stable `canonical-workbench-{ui-kits,ui-chatbot}-{angular,react}` media IDs.
- [ ] Verify four deterministic paths before spending on model captures. Record four genuine OpenAI flows using existing quiet server env helper and unique masters; use ffmpeg, measured readable captions, posters/results/transcripts. Inspect all outputs and decode both codecs.
- [ ] Independent docs/tooling and final reviews; commit sources and verified media.

## Task 4: Verification and integration

- [ ] Sequential builds (avoid concurrent dist cleanup): `npx nx build workbench`, `npx nx build www`; then www test/lint and workbench lint. Preserve NODE_ENV=production for Next builds; use normal localhost/IPC permission for server tools. No new dependencies.
- [ ] `npx nx workbench-e2e www --excludeTaskDependencies` for full52 paths; `npx nx e2e www --excludeTaskDependencies` route report. Run tests at low worker count if build/encode CPU contention threatens existing5s render timeouts; never relax tests.
- [ ] Start local production after all media exists; verify four native videos/captions and24 asset hashes; current inventory/26-lesson overviews and hosted-like server factory checks.
- [ ] Fetch/integrate any newer main; rerun affected verification. Push, create PR with exact evidence and attach it; enable squash auto-merge, continue until required current-head checks green and merged.
- [ ] Verify exact main docs/workbench deployments, four public videos/24 media hashes, hosted lesson pages/API validation. Add evidence to PR description, stop owned temporary production preview, keep useful local workbench, report clean status and existing warnings. No SDK release.
