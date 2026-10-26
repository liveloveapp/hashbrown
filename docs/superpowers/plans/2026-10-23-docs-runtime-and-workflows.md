# Runtime and Workflow Documentation Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent tasks, then review and integrate them.

**Goal:** Explain the runtime boundaries, demonstrate the remaining core workflows, and make persistence guidance reproducible in Brian's practical tutorial voice.

**Architecture:** Preserve existing URLs and the typed demo catalog. Add one "How Hashbrown works" page per SDK and expand existing Debugging/Message history guides. Extend the checked example clients and static recorder with real client interactions backed by deterministic AG-UI fixtures. Keep browser persistence explicitly limited to completed text conversations, with versioned validation and no claim of canonical checkpoint restoration.

**Tech Stack:** Existing React/Angular packages, TypeScript/ngc, Vitest, Playwright, Vite static builds, ffmpeg. No added dependencies.

## Tasks

- [x] Verify the latest production release and live reading mechanics/media.
- [x] Add a concise browser/endpoint/provider/event/rendering walkthrough and practical troubleshooting for schema failures, cancellation, and interrupted runs.
- [x] Add checked React/Angular workflow examples and deterministic fixtures for interrupt/resume, shared state, activities, and UI kits; verify their guarantees against current package source.
- [x] Write failing tests for versioned text-history validation, immutable serialization, and failure handling. Implement completed-text persistence and two independent thread selections in both frameworks.
- [x] Replace stale Message history examples with checked complete files; explain refresh, runtime lifetime, thread identity, canonical history limits, and application-owned storage. Correct claims about deltas.
- [x] Record actual workflow and persistence interactions; include accessible media, useful screenshots, and accurate fixture provenance. Verify both frameworks and failure/recovery cases.
- [x] Produce a typography comparison at desktop/mobile widths without silently changing brand typography.
- [ ] Update the media inventory, run www test/lint/typecheck/build/route-report, review source and media, and carry through PR/merge-on-green.

## Editorial direction

Use the 2024-and-older posts in `~/repos/brianflove` as the voice reference: a concrete goal, complete named files, short explanations of meaningful decisions, approachable "we" and occasional "Let's", and practical limits near the example. Avoid broad AI marketing and exhaustive API lists in the learning path.

## Verification

Tests remain top-level `test(...)` with arrange/act/assert spacing. New reusable functions/types have TSDoc. Compile exact guide examples including Angular strict templates. Use deterministic AG-UI output, no required provider key. Record built static clients to avoid HMR during capture. Run generated-package operations sequentially to avoid shared output races. Preserve captures/masters in ignored dist and publish only finished assets. Live production checks are read-only.

## Evidence and remaining gate

- Production release 40023322661 succeeded. A fresh read-only browser check verified both SDKs have two scroll regions, initially collapsed Migrations, working media playback, and no mobile horizontal overflow.
- The complete five-mode verification passed for React and Angular, including malformed storage, quota failures, and failed-run state rollback. Angular error templates now avoid reading a failed resource value.
- Reviewed actual 1440×810 capture frames. The recorder keeps the full interaction after a two-second result preview, then holds the result. It crops screenshots from full viewport captures so clipping does not alter the screencast.
- Desktop/mobile typography comparison is saved as a local HTML artifact in the task visualizations directory. Current website typography remains in place pending the user's preference.
- Local gate passed: 624 tests in 96 files, lint, strict example types, production build, 99/99 docs routes, all custom elements and 471/471 OG pages. Browser checks passed for 14 built guide pages, video playback, both scroll regions, collapsed Migrations, and mobile layout. Source review approved after removing a leftover clipped screenshot call. Existing API Extractor, Nx executor, and Next.js middleware/filesystem-tracing warnings remain.
- Remaining gate: PR checks before merge.
