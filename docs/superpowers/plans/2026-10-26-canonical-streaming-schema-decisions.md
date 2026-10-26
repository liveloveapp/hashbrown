# Canonical streaming, schemas and decisions implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the existing canonical workbench to three further concepts in Angular and React with real SDK/provider recordings.

**Architecture:** Add allowlisted lesson metadata, a shared streaming schema, and a distinct closed-decision capture format/runtime. Keep the common shell and recorded frame model; generation and decisions use their actual separate SDK APIs and pinned server endpoints.

**Tech Stack:** Existing Hashbrown, TypeSafe/OpenAI adapters, React, Angular, Express, Vitest, Playwright and ffmpeg. No new dependencies.

## 1. Shared runtime, server and clients
- [x] Write failing runtime/server tests for streaming/schemas metadata, exact schema policy, decision capture/confidence, completed-only current-turn application and replay isolation.
- [x] Extend runtime/workbench-lessons.ts with streaming, schemas and decisions; streaming/schemas format structured, decisions separate format. Add Schema inspector type. Use allowlisted endpoints and a lesson-specific shared structured schema.
- [x] Extend runtime/workbench.ts (or focused decision helper) with app-owned seed plan, decision schema/options, validated outcome and confidence, fresh-request capture and explicit Use suggestion state update. Existing UI/structured acceptance must not weaken.
- [x] Extend transport/server for complete JSON decisions with original request/response capture, current nonce, cancellation, timeout and fixed schema/system. Server TypeSafe key/model optional at startup; only decision endpoint requires them. Pin model in env for live verification.
- [x] Update existing structured clients to choose streaming schema by lesson. Add dedicated DecisionWorkbench clients using actual useDecision/decisionResource and request-keyed resource lifetimes; render captured typed choices, confidence and manual fallback. Retain independent sessions and cancellation on inactive/unmount.
- [x] Run focused tests, coordinate one strict build with parent; no concurrent Nx SDK builds.

## 2. Shared shell
- [x] Add failing shell/timeline tests for Schema view, captured decision cards, confidence, explicit choice and read-only replay.
- [x] Derive left lesson links from catalog; add Schema view with exact contract and parsed preview validation. Render decision replay cards from immutable frames; decisions must not appear as streaming JSON or SummaryCard generation.
- [x] Preserve original layout, accessible selection, current-turn context, all raw frames, and six existing paths.

## 3. Six concept guides and media catalog
- [x] Update docs tests to expect framework-specific canonical streaming/schemas/decisions IDs, source-backed excerpts and coherent plan links.
- [x] Rewrite www/content/docs/{react,angular}/concept/{streaming,schema,decisions}.md in author voice. Keep advanced schema constructs and decision metadata/limits/provider setup accurate. Explain decisions do not stream; threshold is app policy, confidence not calibrated correctness.
- [x] Update workbench overview, README/media inventory and register six media IDs. Preserve old IDs used elsewhere.

## 4. Verify and record
- [x] Extend www/src/tools/verify-workbench.ts to cover all six lesson IDs/both frameworks, branching decision scenario with genuine hook/resource and endpoint. Fixture decision responses include low-confidence, failure, delayed cancellation/stale cases; live runs use TypeSafe.
- [x] Extend record-workbench.ts names/captions/provenance for the three new topics; decision scenes show complete response/confidence, explicit Use suggestion, next turn and synchronized read-only replay. Existing six recordings need not be regenerated.
- [x] Run all deterministic browser paths, then record selected streaming,schemas,decisions against real providers. Require exact plan follow-up semantics in generation and exact closed options + confidence gates in decisions.
- [x] Review resulting frames, decode both formats and validate measured captions and reports.

## 5. Integrate
- [x] Run npx nx test www; npx nx e2e www (production build, browser paths and route report); npx nx lint www sequentially. Review and resolve all blockers.
- [ ] Commit, push, PR and attach; wait for all required CI green, merge exact checked head. Verify merged revision, production pages/media/playback. Keep release separate.
