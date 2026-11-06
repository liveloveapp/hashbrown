# Local model release-candidate qualification

> **For agentic workers:** Execute this plan task by task; review findings before widening support claims.

**Goal:** Qualify the current candidate and application-owned WebLLM 0.2.87, fix regressions and publish accurate local-model guidance.

**Architecture:** Keep deterministic adapter contracts separate from fixed real-model qualification. Reuse the existing local-only conformance hosts, no CI inference and no SDK runtime dependency. Retain exact responses, canonical replay and cleanup evidence outside git; commit concise reproducible reports.

**Tech Stack:** Nx, Vitest, Playwright, Chrome, WebLLM 0.2.87, Angular and React.

## Scope and evidence

Candidate: b8c43894080a121bbb6c7c3dafe956b4e820964d. Published baseline: 0.8.3.
Use the previously authorized Phi-3.5 Vision model for generated images and text-only structured tool phases. No audio, cross-hardware tests, new model selection, public package release or relaxed model assertions. A cleared temporary profile may require re-fetching the previously authorized model.

## Tasks

- [x] Pin npm archive integrity and browser bundle SHA-256; capture machine/browser identity. Read representative 2024 and older Brian Love posts.
- [x] Run baseline core/conformance tests, then core/Angular/React/conformance build, test and lint. Fix any proven regression with a failing top-level test first.
- [x] Build both production smoke hosts. Run local text contracts, native tool/schema/UI-phase contracts and WebLLM image/tool contracts sequentially; no live audio. Preserve reports before each overwrite.
- [x] Qualify WebLLM 0.2.87 using local-webllm-vision-smoke and local-webllm-tools-live with explicit bundle/model/download flags, zero retries. Preserve full output and teardown evidence. Run installed-type consumers and packed candidate API checks.
- [x] Probe the existing Chrome model route and rerun the approved single-component phase subset if the exact model is available. Preserve failed nested research cases and upstream limitations.
- [x] Update both local-model recipes, conformance README and a dated research report with exact tested versions/results. Remove historical unreleased-image wording and unsupported new claims; keep short explanations followed by working examples in Brian's technical voice.
- [ ] Run www build/test/lint and affected package checks. Review the complete diff independently, address feedback, create PR, merge only after required CI passes at the reviewed head, verify main tree and public docs.

## Decision boundary

Ask only if a new model/hardware scope, dependency, changed conversation semantics, weakened gate or unavailable execution capability requires user action. Audio and cross-hardware remain deferred. Report real-model failures separately from adapter regressions; do not convert failures into successful capability claims.

## Review clarifications

- Requalify the final reviewed source after fixes; capture package tarball integrity and installed-consumer resolution. An unchanged source gate remains reusable after documentation-only edits; runtime or fixture changes require affected contracts/live gates again.
- Model selection is exactly `Phi-3.5-vision-instruct-q4f16_1-MLC`, temperature 0, seed 1, max_tokens 256 for tools. Capture catalog model/WASM URLs, available revisions and cache/download provenance; mutable catalog URLs are not immutable weight identities.
- Live image gates: two framework cases, four generated red/blue square requests, exact color/count JSON, stop/drain, resolver disposal, no hosted inference fallback, unloaded engine/terminated worker/revoked URL. Live tools: six cases, 14 requests/eight handlers/six exact outputs, lookup→schema, dependent receipt→schema and lookup→single Status component. Zero retries/repairs. Any unexpected failure blocks widening the supported configuration.
- Chrome bounded phase gate excludes named nested research cases; require all eight single-component framework cases, exact tokens/props, cancellation marker follow-up and cleanup. Missing model/API is reported unavailable, never a pass. No new Chrome model selection is authorized by this plan.
- Reports require command, time, source/package/bundle/model/browser/machine identities, pass/fail/skip counts, raw evidence locations and teardown. Retain unsuccessful runs.
- Discover actual project targets before execution; run build/test/lint for affected core/Angular/React/conformance/www and build/lint for both smoke hosts. Unavailable targets must be explicit.
- Merge documentation and verify deployment at hashbrown.dev; do not publish npm packages or label candidate APIs as published.
