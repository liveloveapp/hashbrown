# Assisted Recipes Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development and superpowers:dispatching-parallel-agents for the independent example files, then review and integrate sequentially.

**Goal:** Publish three reproducible recipes with clear prose, checked framework examples, and real recorded demos.

**Architecture:** Keep independent examples beside the Quickstart clients. Pure shared helpers enforce suggestion/context rules and define app-owned selection candidates. A single new recorder builds static clients and exercises all three modes using deterministic protocol fixtures. Preserve all existing routes and package APIs.

**Tech Stack:** Existing React/Angular/TypeSafe/core packages, Express, TypeScript/ngc, Vitest, Vite, Playwright and ffmpeg. No new dependencies.

## Tasks

- [ ] Review the continuation spec and plan against current APIs and approved docs direction.
- [ ] Magic Text: add failing renderer/interaction checks, then checked `react/src/MagicTextDemo.tsx`, `angular/src/app/magic-text-demo.ts` and only necessary shared helpers/tests. Explicit requests, streaming Markdown, citation details, stopped/error states and recovery. No request effects.
- [ ] Predictive suggestions: add failing pure validation/acceptance tests; implement `runtime/predictions.ts`, `react/src/PredictiveSuggestions.tsx`, `angular/src/app/predictive-suggestions.ts`. Input-driven completion from explicit context snapshots; bounded catalog/reasons, current-context IDs, deduplication, explicit Accept/Dismiss, stale/error/cancel protection and no AI feedback loop.
- [ ] UI selection: add checked `runtime/selection.ts`, `react/src/UiSelection.tsx`, `angular/src/app/ui-selection.ts`, `server/selection-server.ts`. Exercise candidates mode with app-owned props and manual fallback. Pin identical server questions; keep keys server-only. Parent adds existing TypeSafe build/path mapping to the strict example target if required.
- [ ] Review each example for spec compliance and quality; run strict compilation with no concurrent generated-package operations. Tests use top-level test(...) and arrange/act/assert; shared/public helpers have TSDoc.
- [ ] Add tested AG-UI/decision fixtures and `www/src/tools/record-docs-recipes.ts`, plus `www:docs-recipes-demo`. Support DOCS_SKIP_RECORDING and DOCS_DEMO_MODES. Verify all modes and adverse/late responses in both actual frameworks before recording.
- [ ] Record and inspect three short demos and screenshots. Add catalog entries, captions and walkthroughs; measure actual screenshot dimensions. Preserve raw footage/masters and verification reports in ignored dist/docs-recipes.
- [ ] Rewrite the six existing recipe pages with exact checked sources, explicit setup/result/recovery, deeper API links and appropriate next steps. Add guide/source/media contract tests. Update inventory and example/media READMEs.
- [ ] Run `NX_DAEMON=false npx nx typecheck www`, `npx nx test www`, `npx nx lint www`, `npx nx build www`, `npx nx e2e www`. Inspect built desktop/mobile pages, media playback, disclosure defaults, scrolling and Migrations.
- [ ] Review complete diff; create and attach PR, merge exact reviewed head after CI passes; wait for deployment and check live pages/assets. SDK release excluded.

## Execution constraints

Reuse this isolated worktree on `blove/docs-assisted-recipes`, based on current main. Topic agents own separate source/test files; parent owns shared config, recorder, guide prose and integration. No simultaneous Nx builds/recorders; parent runs generated-output checks. Do not set NX_ISOLATE_PLUGINS=false. Reuse existing dependencies and preserve masters. Standing user approval makes additional scope/merge permission questions unnecessary.
