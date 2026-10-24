# Structured Learning Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with spec and quality review checkpoints.

**Goal:** Make typed responses, streaming and natural-language forms a coherent, recorded learning journey in both SDKs.

**Architecture:** Add checked shopping-list clients and shared pure validation beside the existing Quickstart examples. Record their real interactions against deterministic AG-UI fixtures. Rewrite existing pages and cross-links without moving URLs or changing package APIs.

**Tech Stack:** Existing TypeScript, React, Angular/ngc, Vitest, Express, Vite, Playwright, ffmpeg.

## Tasks

- [ ] Review this continuation against the approved docs direction and current APIs.
- [ ] Add failing tests for validated immutable list output (item count, name bounds, integer quantity bounds, malformed/incomplete data) and apply eligibility (loading/error/cancelled/stale result). Run the focused www tests red.
- [ ] Add `www/examples/quickstart/runtime/shopping-list.ts`, `react/src/StructuredList.tsx`, and `angular/src/app/structured-list.ts`. Prefer pure derived state and explicit send/apply events. Compile through the existing www typecheck target. Test and review before media integration.
- [ ] Add `www/src/tools/record-docs-structured.ts` plus deterministic fixture tests and `www:docs-structured-demo`. Build static clients from ngc output. Verify both SDKs: progressive complete items, disabled apply during generation, explicit apply, invalid values, failed/cancelled requests, recovery, no stale result applied. Record `structured-form` and `streaming-data` and ffmpeg encodes; inspect frames.
- [ ] Rewrite `concept/structured-output`, `concept/streaming`, and `recipes/natural-language-to-structured-data` for both SDKs. Explain prerequisites, schema, browser/server contract, draft versus application state, validation and recovery. Publish exact checked sources in closed disclosures and compare code blocks in docs tests. Add result screenshots and descriptive alternatives.
- [ ] Audit the main learning transitions and update specific next-step links. Update `docs/docs-media-inventory.md` and media README/catalog; explicitly retain remaining recording/content backlog.
- [ ] Run `NX_DAEMON=false npx nx typecheck www`, `npx nx test www`, `npx nx lint www`, `npx nx build www`, and `npx nx e2e www`. Review built desktop/mobile layout, media playback, independent scrolling and closed Migrations. Report existing warnings.
- [ ] Review the full diff, create and attach PR, merge after required CI passes, wait for production and verify the live changed pages. SDK release excluded.

## Execution notes

Use the existing isolated worktree and branch `blove/docs-structured-learning`, based on merged main. Do not set `NX_ISOLATE_PLUGINS=false`. Run generated-output operations sequentially. Keep ignored recording masters and captures. No new dependencies. Public/reusable helpers receive TSDoc; tests remain top-level `test(...)` with arrange/act/assert spacing.
