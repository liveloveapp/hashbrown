# Canonical workflow workbench implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or
> superpowers:executing-plans task by task. The user authorized implementation,
> recorded demos, PR and merge on green. Continue in this session.

**Goal:** Teach runtime state, activities and interruption in the same plan
conversation, using real Angular/React SDKs and a real local agent.

**Architecture:** Add closed workflow contracts and an OpenAI-backed agent
orchestrator. Capture actual runtime observations in immutable frames, then render
them in framework-owned chat controls with shared inspector/timeline support.
Preserve prior lessons and use the same server factory for live and fixture checks.

**Tech Stack:** Existing TypeScript, Nx, Hashbrown, React, Angular, Express,
Vitest, Playwright and ffmpeg. No new dependencies or SDK release.

## Task 1: Contracts, agent and capture

Files: new runtime/workbench-workflows.ts, server/workbench-workflows.ts;
runtime/workbench-lessons.ts, workbench.ts, workbench-transport.ts,
workbench-view.ts, workbench-timeline.ts; server/workbench-app.ts,
workbench-server.ts; new www/test/workbench-workflows*.spec.ts.

- [ ] Write failing tests for the three modes, closed state/progress/batch
      normalization, immutable capture and meaningful workflow milestones.
- [ ] Add shared initial plan/state, prompts, progress validation and normalized
      SDK observation types. Keep accepted-plan revision separate from SDK state.
- [ ] Add capture operations for actual state/activity/batch/flags and guarded
      pause/resume lifecycle. Resume must capture its actual request without a
      fabricated user message, premature terminal state or lost synchronous send.
      A synchronous SDK validation error must preserve the pending form.
- [ ] Write failing agent tests around a controlled delegate: correct lifecycle,
      explicit state-to-context mapping, state events/progress tied to actual work,
      no ready/approval on failure or cancellation, iterator disposal.
- [ ] Implement bounded expiring server-owned approval records and full response
      validation; never trust browser approval state or reconstruct authority from
      history. Claim atomically before provider awaits, retain expiring consumed
      decision tombstones, and reject identical/conflicting duplicates without
      another provider call. Only a matching successful `stop` delegation can
      finish work; other/missing terminals emit an error preserving the public
      reason and forcing runtime draft rollback.
- [ ] Wire the same factory into the normal host; make inspector headings and
      timeline labels accurate for workflows. Test old lesson preservation.
- [ ] Run focused tests and scoped lint; obtain spec and quality review.

## Task 2: Angular and React clients

Files: new React WorkflowWorkbench.tsx and Angular workflow-workbench.ts;
existing Workbench entry dispatch and session helpers as needed; focused tests.

- [ ] Write failing behavior tests before implementation. Use actual useChat /
      chatResource state, activity and resume APIs; no handcrafted replacement
      conversation messages.
- [ ] Mount the existing shell with actual framework-rendered state editor,
      progress cards and two-answer approval form. Preserve all visible panels.
      Values follow the selected immutable frame; every replay control is inert.
- [ ] Capture current SDK messages/state/activities/pending and flags without
      stale/error getters leaking into new requests. Use signals in Angular and
      normal pure React rendering. Do not change old lesson behavior.
- [ ] Test no automatic request, local edit without generation, synchronous write
      locks, two turns, true progress, pause/claim/resume and complete batch
      submission, duplicate/stale forms, errors/stop/recovery/navigation.
- [ ] Run focused tests/lint, coordinate one parent build for strict compilation,
      and obtain spec/quality review. Avoid concurrent package builds.

## Task 3: Browser verification and recordings

Files: new verify-workflow-workbench.ts and fixture helper;
verify-workbench.ts, record-workbench.ts; measured-caption helper and tests.

- [ ] Add failing fixture/caption tests and six browser paths. Exercise the
      actual shared agent with deterministic provider events; fixture labels must
      remain visible. Preserve all 28 earlier paths (34 total).
- [ ] Verify state input/patch/rollback and no edit request; actual activity IDs,
      links and updates; actual pause/resume entries, server validation and no
      duplicate protected work. Cover failed/short replies, cancellation,
      conversation isolation, stale callbacks and mobile overflow.
- [ ] Verify historical chat/requests/state/progress/batches move together with
      zero network, writes or resume decisions during playback.
- [ ] After strict build and all deterministic paths pass, record six actual
      provider interactions. No paid model calls by subagents. The parent runs
      the existing recording pipeline sequentially and retains unique masters.
- [ ] Encode with ffmpeg and measured readable captions; decode both codecs and
      visually review partial, paused, resumed and final frames. Source notes must
      distinguish real model output from agent-authored protocol events.

## Task 4: Guides and publication

Files: www/content/docs/{react,angular}/concept/{shared-agent-state,activities,
interrupt-and-resume}.md; media registry; start/workbench.md, example README,
docs/docs-media-inventory.md and matching docs/media tests.

- [ ] Read older voice samples; write failing source/media guide checks. Rewrite
      the six pages around the same plan and framework-specific recordings.
      Keep exact interruption/recovery boundaries, state locking/rollback and
      activity semantics; do not imply production durability or authorization.
- [ ] Register six media IDs with honest provenance and result screenshots.
      Update seventeen-lesson/34-path overviews and inventory; retain legacy assets.
- [ ] Run `npx nx test www`, `npx nx build www`, `npx nx lint www`, and
      `npx nx e2e www`, plus media decoding/readability. Review before publication.
- [ ] Commit/push, create and attach PR; require green checks for the current
      tested head, merge without bypass, follow production and verify six guides,
      36 new media hashes, overviews and browser playback/captions. No SDK release.

## Shell integration follow-up

Integrate the concurrently merged canonical shell redesign rather than restoring
the earlier Context drawer. Preserve workflow metadata, grouped navigation for
all seventeen lessons, and inert replay in the paired inspector. Adapt browser
selectors, rerun strict builds and all 34 paths, and rerecord this batch's six
provider demos against the integrated shell. Revalidate media, guides, production
build and route report before pushing the resolved PR head.
