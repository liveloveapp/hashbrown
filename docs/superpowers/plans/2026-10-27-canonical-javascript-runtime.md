# Canonical JavaScript Runtime Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded implementation and review tasks. Steps track the approved rollout.

**Goal:** Teach real QuickJS execution in the canonical Angular and React workbench with accurate recordings and guides.

**Architecture:** Shared runtime contract, origin-guarded controller and immutable frame observations; native framework runtime factories execute all scripts. Existing shell handles timeline/navigation/layout. No model required for direct execution.

**Tech Stack:** TypeScript, React, Angular, Hashbrown QuickJS, Vitest, Playwright, ffmpeg, Next.js, Nx.

- [x] Contract/store/catalog: write failing tests for strict host validation, detached snapshots, captured observation bounds, frame persistence and 27-lesson resolution; run focused Vitest through `npx nx test www -- --...` or its configured executor arguments. Implement shared `runtime/workbench-javascript.ts`, frame capture and catalog entry. Preserve old standalone routes and sources.
- [x] Controller/frameworks: failing controller tests for explicit single-flight run, abort, stale host/result rejection and replay inertness. Implement shared controls/inspector and native React/Angular adapters, root dispatch, Code/Runtime tabs and honest source labels. Strict framework compile via `npx nx typecheck www`, focused client tests.
- [x] Browser/recording: extend `verify-workbench.mjs` with an isolated real-runtime verifier, bypass provider requirements only for this lesson, assert actual QuickJS computations/failures/fresh-context/deadline/recovery/state/replay in both frameworks. Add measured recording cues and recorder naming/provenance. Run selected browser checks before capture; ffmpeg actual recording into stable canonical assets.
- [x] Docs/media: reread pre-2025 voice samples; replace both runtime guides with video-first canonical task, source links, accurate execution/host/deadline caveats and optional model tool snippet. Add 2 media IDs, overview 27/54 and inventory. Test guide/source consistency, asset metadata/captions and playback.
- [ ] Review/delivery: independent spec/quality review; `npx nx build www`, `npx nx test www`, `npx nx lint www`, `npx nx e2e www`, plus workbench build/lint and full browser matrix. Commit, PR attach, monitor CI, integrate main as needed, merge on green. Verify deployed guide, runtime lesson, all 12 new media hashes and native playback; report outcome and existing warnings. Leave SDK release to user.

## Verification evidence

Actual Angular and React QuickJS baseline, errors, timeout/recovery, fresh contexts, pending Stop/navigation and zero replay WASM starts passed. Reviewed recordings are 39.90s (React) and 40.17s (Angular), each with seven measured captions. All four encodings decode at 1600×1000. Twelve local production media hashes match; both native players load seven caption cues without media errors. Production build passes with standard NODE_ENV=production; Nx e2e otherwise supplies a nonstandard build environment. Full matrix, route/mobile reports and CI are delivery gates.
