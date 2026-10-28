# Canonical Threadplane Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for focused implementation and independent spec/quality reviews. Steps use checkbox syntax for tracking.

**Goal:** Finish canonical rollout with real Threadplane Angular/React chat, captured two-turn streaming and matching documentation videos.

**Architecture:** Separately installed consumer packages remain the source of actual chat components and runtime. An optional shared canonical shell observes real fetch/SSE traffic without rewriting it, preserving immutable playback and plain-text ownership. Existing server adapter supports fixture verification and real provider recordings.

**Tech Stack:** Existing Threadplane/Hashbrown installed packages, Angular/React, TypeScript, workbench shell, Playwright, ffmpeg, Next.js and Nx.

### Task 1: Shared capture and presentation
- [x] Write failing tests for actual request/response/event/text capture, source-terminal completion, abort/stale guards, missing terminal and read-only replay.
- [x] Add bounded shared observation and optional external chat shell integration; preserve standalone consumer controls and installed runtime ownership.
- [x] Add canonical plan prompts/system policy, appropriate inspector labels and plain-text UI/state facts. No invented plan JSON or acceptance.
- [x] Run targeted tests, review spec and code quality, commit.

### Task 2: Installed consumers and hosting
- [x] Verify current pinned package outputs, source and installed framework identities.
- [x] Add optional canonical shell entrypoints/assets without adding package dependencies or source aliases to isolated consumer compilation.
- [x] Keep default installation snippets exact and standalone mode verifiable. Serve the optional shell through checked isolated local consumer hosts. Do not add unverified public consumer links or force consumer installs into normal workbench CI.
- [x] Verify production builds, genuine UI send/stop, two-turn history, source error/truncation, replay and mobile layout.

### Task 3: Real recordings and docs
- [x] Extend existing recorder to run actual provider mode explicitly, require server credentials, retain labelled fixture mode for verification and preserve masters.
- [x] Record both real framework UIs with canonical shell, streaming text, requests/history, unchanged state and inert replay. Preserve actual content and disclose editorial timing.
- [x] Encode MP4/WebM, measured VTT, poster/result and transcripts. Decode and inspect both clips.
- [x] Rewrite recipe openings/walkthroughs in Brian's voice, preserve exact checked snippets/install instructions and runtime/cancellation distinctions; update migrations, overviews, registry and media inventory.

### Task 4: Verify and integrate
- [ ] Run affected build/test/lint, full browser matrix, production route/mobile checks and media hash/playback checks.
- [ ] Independent final review; fix findings and reverify relevant paths.
- [ ] Create/attach PR, merge only green current head, verify main deployment, public docs/media; retain real installed two-turn consumer evidence. Public interactive consumer verification is conditional on a separately deployed artifact. Leave release to user.

## Evidence

Real provider masters and reports: `dist/docs-threadplane/captures/2026-10-28T15-17-16.020Z`. React 29.07 seconds and Angular 30.00 seconds, actual speed, seven measured cues each. Per-turn deltas: React 26/24, Angular 26/25. Actual visible partial text was observed in both turns of both frameworks. Both second requests retain the completed first turn; the title and first step stay unchanged and the second step is shorter. Revision remains zero and replay makes no requests or writes. All four encodings decode at 1600×1000, all twelve local served hashes match, and native browser playback/caption loading passes. Ten installed-shell viewport checks pass without clipping or model requests. Full unit suite: 1,611 tests in 232 files; TypeScript and lint pass. Independent review approved after request-body and source lifecycle fixes.

The first full workbench matrix caught a shared historical Magic Text citation regression from applying native inert to every historical feed. Fixed by scoping the new lock to external composers and retaining existing managed historical callbacks. The regression tests, TypeScript and lint pass; full matrix and route/mobile rerun remain the delivery gate.
