# First Component Documentation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Complete the approved first-component reading journey in Brian's voice, with verified examples and a recording of the exact tutorial.

**Architecture:** Keep existing documentation URLs and navigation groups. Use complete React/Vite and Angular CLI examples with the same local Express endpoint; check the documented source files against runnable fixtures. Keep production media in the existing on-demand demo player.

**Tech Stack:** React, Angular, Skillet, AG-UI SSE, Express, TypeScript, Playwright, ffmpeg.

## Editorial direction

Source voice: Brian Love's 2020 Angular Transfer State, 2019 Lazy Load Angular Components, 2018 NgRx Basics, and 2024 Success in the Ordinary posts in `~/repos/brianflove`. Start with a practical goal, use an approachable "we" and occasional "Let's", name the files, and explain the meaningful decisions after the code. Use short sections and concrete results; avoid hype and exhaustive introductory API tables.

## Tasks

- [x] Verify the merged docs deployment and production reading mechanics/media.
- [x] Write failing regression checks for the first-component journey and complete runnable example files.
- [x] Implement and type-check React, Angular (including strict templates), and server examples using installed tooling; add no dependencies.
- [x] Rewrite both Quickstarts, Introductions, and API-choice openings. Move text-chat/debugging detail into Fundamentals and preserve its discoverability.
- [x] Improve Fundamentals prerequisites, vocabulary, and next steps against current APIs.
- [x] Record the real welcome-card app, edit with ffmpeg, include poster, screenshot, captions, transcript, and accurate provenance.
- [x] Inventory recording needs for the remaining learning/recipe pages and document concrete content gaps.
- [x] Run www lint, tests, production build, and route report; browser-check desktop/mobile and media. Review the final change.

## Verification

Compile the exact guide snippets as complete files. Check React and server types with TypeScript and Angular templates with ngc. Exercise success, loading, error, follow-up, and recovery using deterministic AG-UI events through the actual client runtime. A real-model key is optional, never a requirement for the recorder or ordinary tests. Production smoke checks are read-only.

## Results

- Production smoke checks passed for the previously deployed React/Angular scroll containers, collapsed migrations, media playback, and mobile sizing.
- New source-snippet regressions failed before the rewrite. The server-instruction test failed before its checked helper was added.
- `npx nx docs-demo www` passed with built static clients: React and Angular loading, welcome-card rendering, follow-up context, and error recovery. Angular strict templates and all example/server types passed through its typecheck dependency.
- `npx nx test www`: 93 files, 580 tests passed.
- `npx nx lint www`: passed, including example and recorder source.
- `npx nx build www` and `npx nx e2e www`: passed serially. All 24 docs-demo embeds render; 467/467 pages have OG images.
- Browser review passed for 14 updated desktop routes and eight mobile routes; both new videos play, images fit, and navigation/article wheel scrolling remains independent.
- MP4 and WebM versions of both new recordings fully decode with ffmpeg. Final screenshots/posters/captions/transcripts and source received independent review with no material findings.

The full recording rollout and deeper persistence/production guides remain explicitly prioritized in `docs/docs-media-inventory.md`. This increment completes the first-component journey and core Fundamentals editing, rather than claiming all future media is produced.

Existing API Extractor, Nx executor, and Next.js middleware/filesystem-tracing warnings remain. A search-overlay timeout under concurrent local load passed on sequential rerun; a preview/build race over generated package files passed once run separately. The final recorder uses a production build and a static server to eliminate development reloads.
