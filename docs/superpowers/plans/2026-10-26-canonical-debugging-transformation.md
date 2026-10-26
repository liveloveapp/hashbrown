# Canonical debugging and transformation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two canonical UI-chat lessons and four real-framework/provider recordings.

**Architecture:** Reuse both UI clients with an isolated per-conversation demo-failure setting. Capture real HTTP evidence in the transport. Use one shared actual OpenAI adapter wrapper for server and live verification, emitting sanitized callback observations into captured CUSTOM events. Shared shell renders historical evidence and inspector views.

**Tech Stack:** Existing Hashbrown/OpenAI, React, Angular, Express, Vitest, Playwright, ffmpeg. No dependencies.

## 1. Runtime/server/clients
- [x] Add failing tests for allowlist, real HTTP denial before provider, transport status capture, stale/cancel guards and transform-preservation/disposal.
- [x] Extend workbench-lessons metadata with debugging (Requests) and request-transformation (Transform), both UI format. Add response event kind and optional typed transformation frame.
- [x] Extend createWorkbenchTransport with per-session debug-denied getter; use dedicated query gate on the debugging endpoint only. Record actual response status/url, source and known demo-failure reason before SDK processing; preserve request nonce and abort guards.
- [x] Add server denial gate before provider, with demo-failure provenance. Share route-selected lesson ID with stream callback; browser cannot select policy through forwarded fields.
- [x] Add pure async server/workbench-transform.ts and actual adapter wrapper capturing callback input/output, preserving all mapped fields and returning only sanitized summary. Yield namespaced CUSTOM trace when observed; dispose underlying stream on return/abort. Test against provider-native fixtures or actual adapter boundary with injected fetch.
- [x] Connect wrapper in workbench-server and live verifier (parent coordinates verifier). UI clients own session debug setting; mount commands setter for the shell; retry same failed resource safely. No SDK changes.
- [x] Focused tests and owned lint, then coordinated strict compile.

## 2. Shell and diagnostics
- [x] Add failing tests for HTTP evidence/current turn, historical source badge, debug controls, Transform view and inert replay.
- [x] Add visible labelled denial checkbox, default enabled for debugging. Callback setDebugDenied boolean; disabled while loading/replay.
- [x] Show failure response rows/milestones while keeping successful HTTP frames under Raw events. Add Transform tab with actual captured before/after and preserved-field evidence. Keep selection scoped to cursor/turn.
- [x] Existing views, read-only replay and eight-lesson navigation remain accessible/responsive.

## 3. Guides and recording
- [x] Replace debugger/transform guide primary examples and source snippets in both frameworks; retain useful advanced error/interrupt and provider settings guidance.
- [x] Add four media IDs, source-backed guide tests, overview/README/inventory updates. Clearly label local denial vs real successful provider output.
- [x] Extend fixture browser verifier for both lessons, with a dedicated same-conversation denial/recovery sequence and actual callback trace/preservation checks. All sixteen framework/lesson paths pass.
- [x] Record selected debugging/request-transformation through real provider with the normal shared adapter wrapper. Validate semantics, replay no calls and no provider during denial. Encode four videos/captions/posters/results/transcripts and review.

## 4. Integrate
- [x] Run npx nx test www, npx nx build www, npx nx e2e www and npx nx lint www sequentially; decode both media codecs and inspect phases. Review and fix blockers.
- [ ] Commit, push, create and attach PR. Wait required checks green, merge exact head, verify production guide/media hashes and browser playback. No release.
