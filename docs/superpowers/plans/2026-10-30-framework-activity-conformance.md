# Framework activity and delegation conformance

> **For agentic workers:** Use superpowers:subagent-driven-development for independent plan and implementation reviews. Keep Git mutations with the parent.

**Goal:** Extend #832 with real producer evidence for background activities and delegation, without treating missing native events as supported display.

**Architecture:** Keep the approved AG-UI-first evidence boundary: real pinned framework execution, unchanged published bridges, generated wire captures, prepared-store replay and both browser consumers. Reuse the approved isolated dependencies. No runtime adapter or inferred child ownership. File search stays deferred.

**Design basis:** The approved framework execution plan (2026-10-29), binding tool-step Rules and native subagent design (2026-10-27). The user authorized this continuation, PR and merge on green. Prefer real supported hooks over injected protocol events; record missing producer capabilities instead of repairing captures. A direct producer recipe would be a separate profile, not native bridge support.

## Tasks

- [x] Start from current main in the existing clean managed worktree; inspect installed and published bridge versions and public hooks.
- [x] Review plan independently. Require actual child execution separately from missing lifecycle/provenance assertions; verify activity snapshot/delta content and use public bounded shutdown.
- [ ] Write failing real-host tests for Mastra native background-task activity using its existing InMemoryStore and a real memory scope (additional @mastra/memory dependency approval requested); implement only supported public configuration. Assert actual execution and supplied activity lifecycle, with bounded cleanup.
- [x] Exercise actual framework delegation/subgraphs with deterministic models. Assert whether lifecycle and provenance survive each bridge; record omissions as version-specific gaps. Never synthesize child identities.
- [ ] Generate captures with exact version/source/hash evidence. Add prepared-store and browser assertions for supplied activities, ownership and restore. A gap test is not passed lifecycle conformance.
- [ ] Update capabilities/README with observed results, remaining native restore/API-server/Python/OM gaps and file-search deferral.
- [ ] Run build/test/lint for core and conformance, real bridge/check and browser targets, runtime host builds/lints if changed. Report warnings.
- [ ] Obtain independent implementation review, fix findings, open and attach PR, address CI/reviews, update during a quiet main window and merge when green. Keep other merges unrestricted.

## Current checkpoint

Native LangGraph subgraph and Mastra `agents` delegation execution are implemented
and independently reviewed. The published bridges omit native subagent lifecycle
and attribution; tests record that gap and verify preserved, unattributed output
through prepared store, commit/JSON restore and both UI consumers. No runtime
package dependencies or core production behavior changed.

Mastra background activity work is pending approval for isolated test dependency
`@mastra/memory` 1.39.1, whose peer range matches core 1.80.0. The public bridge's
`untilIdle` path requires configured memory; storage alone does not keep the
stream open for task execution. The exploratory failing activity test and public
background configuration are saved locally outside the PR until that approval;
the PR must not be treated as completing the activity acceptance criteria.

Independent review found no actionable delegation issues. Local verification so
far: 2,469 core tests, 22 browser cases, affected builds/lints passed. Final full
conformance verification passed: 112 existing consumer tests, 23 capture/evidence
helper tests, 15 real-host tests and all five capture reproduction profiles. Existing Nx/Vite,
color environment and bundle-size warnings remain. File search stays deferred.
