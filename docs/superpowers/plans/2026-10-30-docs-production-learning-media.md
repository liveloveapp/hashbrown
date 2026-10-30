# Production verification and learning quality implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute independent review work and integrate each result. The user approved all three follow-ups; preserve the existing LLA design and do not perform an SDK release.

**Goal:** Verify the deployed docs automatically, make the Angular and React learning paths easier to follow, and improve recorded demonstrations from a documented comprehension review.

**Architecture:** Reuse the existing real-font diagram browser audit against the production website after the www deployment succeeds. Bind reports to the deployed revision, retain failure artifacts, and block model/application requests. Review authored learning paths and recorded media independently; preserve generic application teaching before workbench details, existing bookmarks, native framework examples, capture provenance, and intentional local/production-reference boundaries. Add no dependencies.

**Tech Stack:** Next.js, TypeScript, Nx, existing Playwright Chromium, GitHub Actions, ffmpeg/ffprobe, Markdown and WebVTT.

## 1. Production verification

- [x] Read existing deployment conventions and write failing tests for production-only www verification, deployment failures, artifact retention, origin validation and provenance.
- [x] Run those tests through `npx nx test www` and verify failures.
- [x] Add bounded deployment verification using the existing diagram report, checking the immutable deployed URL and the production alias as appropriate; record expected and observed deployment identity. Do not send model requests or expose deployment credentials in browser code/artifacts.
- [x] Extend deployment reporting so a successful upload with failed verification is not reported as verified success. Retain diagnostic artifacts and existing preview/non-www behavior.
- [x] Verify new tests and audit the existing live production origin without redeploying or releasing.

## 2. Learning journeys

- [x] Review onboarding → conversation → generative UI/tools → shared state → production in both frameworks, plus how recipes and integrations enter these paths.
- [x] Read Brian Love's 2024/older technical posts; retain the practical, direct teaching voice.
- [x] Record findings with page references. Fix repetition, unexplained terms, weak prerequisites and abrupt handoffs, while preserving code, diagrams, stable headings/bookmarks and one lesson presentation per page.
- [x] Run existing teaching-order, route/link, code-example and guide checks; use meaningful new tests only for reusable structure/behavior.

## 3. Video comprehension

- [x] Audit all 58 current lesson recordings and their captions/transcripts/captures for integrity, timings, teaching steps and framework parity.
- [x] Inspect representative frames and sequences for every lesson; pay special attention to prompts, streamed JSON/UI, tool results, completion and accepted application state.
- [x] Fix evidence-backed caption/pacing/visibility problems with the established recorder/ffmpeg flow; keep real recordings authentic and fixture/live labels truthful. Do not replace live footage with simulated model behavior.
- [x] Add regression checks for reusable timing/media behavior, run them red then green, and document remaining intentional recording limitations.

## 4. Integrate and finish

- [x] Independently review the implementation and source semantics.
- [x] Run affected www build, test and lint, code-example compilation, full e2e and applicable tooling checks. 2,307 tests passed, all 67 application modules compiled, all 57 workbench fixtures and 118 diagram placements passed. Existing API Extractor export and OG filesystem-tracing warnings remain; no SDK source changed.
- [ ] Create and attach a PR, keep integrating main if it advances, merge only after required checks pass, and verify the production deployment's automatic audit.
- [ ] Leave the workspace clean and the user's existing 4370 server untouched. No SDK release.
