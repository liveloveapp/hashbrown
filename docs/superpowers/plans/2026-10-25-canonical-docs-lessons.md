# Canonical workbench lessons implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Teach generative UI, tools and structured output through one cleaner, real streaming workbench in React and Angular.

**Architecture:** Keep all four LLA columns. A shared lesson configuration selects capture format, URL, initial inspector and fixed server policy. Both UI and structured framework runtimes feed one immutable trace and playback shell.

**Tech Stack:** Existing Hashbrown SDKs, React, Angular signals, Express, Vite, Vitest, Playwright, ffmpeg. No added dependencies.

## 1. Capture format and structured clients
- [x] Add failing tests to www/test/workbench.spec.ts and workbench-server.spec.ts for plain structured plan frames, completed-only acceptance, invalid format/lesson, fixed server schema.
- [x] Add runtime/workbench-lessons.ts with allowlisted lesson metadata and plan schema. createWorkbenchStore accepts explicit UI/structured format (default UI). Keep UI extraction strict; structured data only uses its configured format.
- [x] Extend server/workbench-app.ts with fixed lesson endpoints, preserving existing /api/workbench/chat for compatibility. Keep request limits/provenance/cancellation.
- [x] Add real structured framework clients in react/src/StructuredWorkbench.tsx and angular/src/app/structured-workbench.ts. Share the shell and validation, use actual structured SDK APIs, render plan values in app-owned components.
- [x] Export lesson-selecting root wrappers that mount the correct runtime without conditional hooks. Existing UI clients receive lesson metadata. Do not lose origin/freshness or cancellation guards.
- [x] Run focused Vitest tests; coordinate strict types and Nx builds sequentially.

## 2. Quieter shared shell and timeline
- [x] Add failing behavioral tests to workbench-clients.spec.tsx for initial lesson tab, milestone grouping, raw-event toggle, exact cursor selection, visible contextual drawer and inert playback.
- [x] Modify runtime/workbench-view.ts and workbench.css: light code surfaces, tighter headers/spacing, subtle controls, meaningful milestone rows, raw toggle. Preserve every frame and continuous scrub/playback.
- [x] Use real selected request/tool details in the contextual drawer; avoid duplicate blocks. Add lesson navigation links without auto-send. Keep all panels visible and responsive.
- [x] Run focused tests, then visually review browser at desktop and narrow sizes.

## 3. Six guide updates
- [x] Update docs tests first for canonical-workbench-{ui,tools,structured}-{react,angular} recording IDs and matching checked source excerpts.
- [x] Rewrite primary examples in content/docs/{react,angular}/concept/{components,functions,structured-output}.md with the same plan context and source-backed snippets; preserve advanced useful material and links.
- [x] Update start/workbench guides, examples README and docs-media inventory to explain the three lessons and UI/structured distinction.
- [x] Register six accessible framework-specific media entries; keep older media while other guides still use them.

## 4. Verification and recordings
- [x] Extend src/tools/verify-workbench.ts to verify three lessons in both frameworks, real SDK/tool continuation, revision, replay no new requests, error/cancellation, navigation and narrow layout.
- [x] Support allowlisted WORKBENCH_LESSONS and WORKBENCH_RECORD, preserve capture reports and unique output names. Fixture UI vs plain structured output must match server policy.
- [x] Run npx nx workbench-e2e www against fixtures, then real provider via server-only credentials. Record six focused real runs, preserving JSON streaming and application acceptance.
- [x] Encode with ffmpeg, preserve measured duration/captions, poster/result screenshots and honest transcripts. Refresh workbench overview media with the quieter shell.

## 5. Review and integration
- [x] Run npx nx test www, npx nx e2e www (production build and route report), npx nx lint www sequentially; run ffmpeg decode checks, diff-check and review.
- [ ] Fix review findings and rerun relevant checks. Commit, push, create PR and attach it to chat.
- [ ] Wait for green CI; merge guarded by exact head SHA. Verify merged revision, production deployment, six guides and media hashes/playback. Do not publish SDKs.
