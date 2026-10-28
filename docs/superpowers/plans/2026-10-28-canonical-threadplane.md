# Canonical Threadplane Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for focused implementation and independent spec/quality reviews. Steps use checkbox syntax for tracking.

**Goal:** Finish canonical rollout with real Threadplane Angular/React chat, captured two-turn streaming and matching documentation videos.

**Architecture:** Separately installed consumer packages remain the source of actual chat components and runtime. An optional shared canonical shell observes real fetch/SSE traffic without rewriting it, preserving immutable playback and plain-text ownership. Existing server adapter supports fixture verification and real provider recordings.

**Tech Stack:** Existing Threadplane/Hashbrown installed packages, Angular/React, TypeScript, workbench shell, Playwright, ffmpeg, Next.js and Nx.

### Task 1: Shared capture and presentation
- [ ] Write failing tests for actual request/response/event/text capture, source-terminal completion, abort/stale guards, missing terminal and read-only replay.
- [ ] Add bounded shared observation and optional external chat shell integration; preserve standalone consumer controls and installed runtime ownership.
- [ ] Add canonical plan prompts/system policy, appropriate inspector labels and plain-text UI/state facts. No invented plan JSON or acceptance.
- [ ] Run targeted tests, review spec and code quality, commit.

### Task 2: Installed consumers and hosting
- [ ] Verify current pinned package outputs, source and installed framework identities.
- [ ] Add optional canonical shell entrypoints/assets without adding package dependencies or source aliases to isolated consumer compilation.
- [ ] Keep default installation snippets exact and standalone mode verifiable. Expose separate canonical Threadplane paths/navigation in workbench deployment.
- [ ] Verify production builds, genuine UI send/stop, two-turn history, source error/truncation, replay and mobile layout.

### Task 3: Real recordings and docs
- [ ] Extend existing recorder to run actual provider mode explicitly, require server credentials, retain labelled fixture mode for verification and preserve masters.
- [ ] Record both real framework UIs with canonical shell, streaming text, requests/history, unchanged state and inert replay. Preserve actual content and disclose editorial timing.
- [ ] Encode MP4/WebM, measured VTT, poster/result and transcripts. Decode and inspect both clips.
- [ ] Rewrite recipe openings/walkthroughs in Brian's voice, preserve exact checked snippets/install instructions and runtime/cancellation distinctions; update migrations, overviews, registry and media inventory.

### Task 4: Verify and integrate
- [ ] Run affected build/test/lint, full browser matrix, production route/mobile checks and media hash/playback checks.
- [ ] Independent final review; fix findings and reverify relevant paths.
- [ ] Create/attach PR, merge only green current head, verify main deployment, public routes/media and real public two-turn paths. Leave release to user.
