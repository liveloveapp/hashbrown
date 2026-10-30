# Framework activity and delegation conformance

> **For agentic workers:** Use superpowers:subagent-driven-development for independent plan and implementation reviews. Keep Git mutations with the parent.

**Goal:** Extend #832 with real producer evidence for background activities and delegation, without treating missing native events as supported display.

**Architecture:** Keep the approved AG-UI-first evidence boundary: real pinned framework execution, unchanged published bridges, generated wire captures, prepared-store replay and both browser consumers. Reuse the approved isolated dependencies. No runtime adapter or inferred child ownership. File search stays deferred.

**Design basis:** The approved framework execution plan (2026-10-29), binding tool-step Rules and native subagent design (2026-10-27). The user authorized this continuation, PR and merge on green. Prefer real supported hooks over injected protocol events; record missing producer capabilities instead of repairing captures. A direct producer recipe would be a separate profile, not native bridge support.

## Tasks

- [x] Start from current main in the existing clean managed worktree; inspect installed and published bridge versions and public hooks.
- [x] Review plan independently. Require actual child execution separately from missing lifecycle/provenance assertions; verify activity snapshot/delta content and use public bounded shutdown.
- [x] Write failing real-host tests for Mastra native background-task activity using its existing InMemoryStore and a real memory scope (@mastra/memory 1.39.1 dependency approved 2026-10-30); implement only supported public configuration. Assert actual execution and supplied activity lifecycle, with bounded cleanup.
- [x] Exercise actual framework delegation/subgraphs with deterministic models. Assert whether lifecycle and provenance survive each bridge; record omissions as version-specific gaps. Never synthesize child identities.
- [x] Generate captures with exact version/source/hash evidence. Add prepared-store and browser assertions for supplied activities, ownership and restore. A gap test is not passed lifecycle conformance.
- [x] Update capabilities/README with observed results, remaining native restore/API-server/Python/OM gaps and file-search deferral.
- [x] Run build/test/lint for core and conformance, real bridge/check and browser targets, runtime host builds/lints if changed. Report warnings.
- [ ] Obtain independent implementation review, fix findings, open and attach PR, address CI/reviews, update during a quiet main window and merge when green. Keep other merges unrestricted.

## Current checkpoint

Native LangGraph subgraph and Mastra `agents` delegation execution are implemented
and independently reviewed. The published bridges omit native subagent lifecycle
and attribution; tests record that gap and verify preserved, unattributed output
through prepared store, commit/JSON restore and both UI consumers. No runtime
package dependencies or core production behavior changed.

Mastra background activity dependency `@mastra/memory` 1.39.1 was approved on
2026-10-30 and added only to the isolated test manifest/lock. Public runtime,
real Memory/InMemoryStore, eligible tools and bounded untilIdle produce actual
running/completed/failed activities; public shutdown bounds cleanup. The model
waits silently until native task settlement re-enters the loop. Host tests prove
execution, delivery before completion, readable failures and supplied timestamps.
Success/failure captures run through per-event prepared-store checks, canonical
commit/JSON restore, and both browser consumers. Restoring outgoing model input
was an incorrect harness assumption: activities are intentionally stripped there.
The corrected test restores the retained canonical checkpoint, checks absent
invented run links and independently verifies next-run stripping.

The LangGraph native progress probe forwards real dispatchCustomEvent values as
CUSTOM rather than ACTIVITY events. This is an explicit recipe-required producer
gap. No native activity display qualification or invented events are claimed.
Native lifecycle/provenance remains missing upstream in both delegation profiles.

Final build/test/lint, independent spec/quality review and remote green CI are
required before merge. No schedules or main-branch merge freeze. Existing Nx/Vite,
color environment and bundle-size warnings and expected native failure diagnostics
will be reported. File search remains deferred; release notes remain user-owned.

## Verification before integration

Passed locally: core build/lint and all 2,471 tests; conformance build/lint and
112 tests; 30 capture/evidence tests; 18 real-host tests; seven reproducible
capture profiles; all 30 Angular/React browser cases; both runtime-host builds
and lints. Independent spec and quality reviewers found no blocking issues.
Expected task-failure workflow diagnostics are retained as test evidence.
The earlier draft CI's .NET candidate passed, but its copied shared browser hosts
failed the pinned published SDK 0.8.3 consumer build: that API lacks subagents.
Reproduced the exact TS2339 locally, guarded the optional diagnostic in both
hosts and verified the actual published React/Angular consumer build. Current
SDK browser tests require a capability marker, so fallback output cannot satisfy
conformance. Pins and package acceptance fences remain unchanged. The additional
compatibility fix passed independent quality review. Final fresh CI is required
before merge; no main merge freeze or background schedule is used.

## CI follow-up

Fresh head b558fa51 passed the framework conformance checks and all other affected
projects, including the 520 .NET tests, but www's new main-branch diagram audit
startup test exceeded Vitest's default five-second deadline. Its real subprocess
already had a fifteen-second bound. Reproduced the failure with a temporary
preloader delaying only actual audit-child startup by six seconds. Kept that
process bound and all report/redaction assertions unchanged; the two process
tests now derive a twenty-second outer deadline, including cleanup reserve.
Both delayed-start cases pass and independent quality review found no issues.
Full www build, all 2,307 tests and lint passed. Existing Next filesystem-tracing
and API-reference/tooling warnings remain. Fresh required CI is the remaining
integration gate.
