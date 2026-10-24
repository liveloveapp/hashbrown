# Structured Learning Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with spec and quality review checkpoints.

**Goal:** Make typed responses, streaming and natural-language forms a coherent, recorded learning journey in both SDKs.

**Architecture:** Add checked shopping-list clients and shared pure validation beside the existing Quickstart examples. Record their real interactions against deterministic AG-UI fixtures. Rewrite existing pages and cross-links without moving URLs or changing package APIs.

**Tech Stack:** Existing TypeScript, React, Angular/ngc, Vitest, Express, Vite, Playwright, ffmpeg.

## Tasks

- [x] Review this continuation against the approved docs direction and current APIs.
- [x] Add failing tests for validated immutable list output (item count, name bounds, integer quantity bounds, malformed/incomplete data) and apply eligibility (loading/error/cancelled/stale result). Run the focused www tests red.
- [x] Add `www/examples/quickstart/runtime/shopping-list.ts`, `react/src/StructuredList.tsx`, and `angular/src/app/structured-list.ts`. Prefer pure derived state and explicit send/apply events. Compile through the existing www typecheck target. Test and review before media integration.
- [x] Add `www/src/tools/record-docs-structured.ts` plus deterministic fixture tests and `www:docs-structured-demo`. Build static clients from ngc output. Verify both SDKs: progressive complete items, disabled apply during generation, explicit apply, invalid values, failed/cancelled requests, recovery, no stale result applied. Record `structured-form` and `streaming-data` and ffmpeg encodes; inspect frames.
- [x] Rewrite `concept/structured-output`, `concept/streaming`, and `recipes/natural-language-to-structured-data` for both SDKs. Explain prerequisites, schema, browser/server contract, draft versus application state, validation and recovery. Publish exact checked sources in closed disclosures and compare code blocks in docs tests. Add result screenshots and descriptive alternatives.
- [x] Audit the main learning transitions and update specific next-step links. Update `docs/docs-media-inventory.md` and media README/catalog; explicitly retain remaining recording/content backlog.
- [x] Run `NX_DAEMON=false npx nx typecheck www`, `npx nx test www`, `npx nx lint www`, `npx nx build www`, and `npx nx e2e www`. Review built desktop/mobile layout, media playback, independent scrolling and closed Migrations. Report existing warnings.
- [ ] Review the full diff, create and attach PR, merge after required CI passes, wait for production and verify the live changed pages. SDK release excluded.

## Execution notes

Use the existing isolated worktree and branch `blove/docs-structured-learning`, based on merged main. Do not set `NX_ISOLATE_PLUGINS=false`. Run generated-output operations sequentially. Keep ignored recording masters and captures. No new dependencies. Public/reusable helpers receive TSDoc; tests remain top-level `test(...)` with arrange/act/assert spacing.

## Local evidence

- 698 tests in 104 files passed; lint clean; strict client/template compilation passed through the recording target; production build and full route report passed (99 docs, 240 API pages, 14 blog posts, all custom elements and 471 social-image pages). Existing API Extractor, Nx executor, and Next.js warnings remain.
- Both SDKs passed progressive item rendering, explicit Apply, business-invalid output, failure after partial/complete JSON, empty replacement, truncated/malformed output, cancellation after valid JSON and recovery. The recorder now observes request start before terminal idle, preventing its fixture sequence from racing Angular DOM updates. A regression test verifies provider finish metadata.
- Both videos have accessible assets and reviewed final/partial frames. The Streaming capture uses lifecycle callouts and a longer completion pause. Source review approved. Masters and full browser reports remain in ignored dist/docs-structured.
- Built-site checks passed for all 12 changed guide/overview variants: video playback, closed source disclosures, independent scroll areas, closed Migrations, screenshot dimensions, and 390px mobile layout without horizontal overflow.
- Remaining delivery gate: PR checks, merge on green and live verification. SDK release remains outside this increment.
