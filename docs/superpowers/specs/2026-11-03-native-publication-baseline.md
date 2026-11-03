# Ready publication baselines for native source-browser checks

Status: Scoped implementation authored after two controlled original-assertion REDs were verified. Corrected controlled GREEN, local gates and new complete CI remain PENDING. Actual required PR source conformance is FAILED (660 passed / four failed); C6's complete green qualification remains separate.

## Problem and unchanged native contract

The four PR failures differ only in physical session.state Publishing→Ready and revision+1 after a baseline was captured. They affect cold-pending approve, the supplied server-time mixed guard, and opposing cancel/decline cases. Member, effect, identity and generation observations remain equal.

NativeSessionTerminalResult releases and flushes the genuine terminal before calling FinalizePublicationAsync. PostgreSQL finalization then commits Ready, clears the owner fields and advances revision. Public pending/final-answer/idle observations therefore do not imply durable finalization has finished. The fixture must not attribute that earlier legitimate transaction to a later inert read or local refusal.

No SDK, journal, PostgreSQL, endpoint, facade, ownership, timeout or retry contract changes.

## Narrow before-action baseline fence

Add one private TSDoc-documented readyState(fixture,page) helper to native-approvals.spec.ts. Under the existing configured assertion bound, poll the actual physical state until session.state is exactly Ready. Return the actual snapshot from that SAME successful poll iteration, without another post-poll read or synthetic defaults.

Use it only where a complete immutable baseline is captured BEFORE a later reload, read, local rejection or worker stop. Preserve all subsequent complete toEqual comparisons, request/effect/native decision assertions and original action counts. Never poll equality after the tested action or rebase the expected state.

The raw state() observation remains unchanged for diagnostics, held operations and assertions that intentionally inspect non-Ready authority.

## Exact eight captures

Line numbers identify the pre-change source; variable/use is authoritative after edits.

| Site | Capture and later invariant |
| --- | --- |
|600|completedMixed before reload/Completed refresh; full equality at 607.|
|811|before pending worker stop/cold read; full equality at 833.|
|842|completed after cold decision, before reload/read; full equality at 851.|
|895|before mixed pending worker stop/read; full equality at 915.|
|983|before adversarial mixed local approval/aborted outbound and supplied read; full equality at 1098.|
|1195|completed race winner before peer Completed read; full equality at 1214.|
|1251|before delayed pending lookup/reload; full equality at 1278.|
|1341|before stale-command refresh/replay; full equality at 1356/1373.|

Keep raw: evidence() observation at 111; effects-only warm observations at 415/450; decision-admitted held snapshot at 1176; publication barriers and held effects observations around 662/743. A global change to state() would hide or deadlock genuine Owned/Saved/Publishing/admitted scenarios.

## Alternatives rejected

- Polling later equality can conceal changes caused by the action.
- Ignoring state/revision weakens the exact no-work invariant.
- Waiting Ready inside every state read erases intentional authority barriers.
- Fixed sleeps, extra clicks, retries or timeout extensions do not establish the real boundary.

Selected Ready-before-capture observes the earlier transaction's completion while keeping every field strict afterward.

## Test-first causal verification

The four actual PR failures are meaningful behavioral RED. Root also verified two controlled original cases using the existing real before-publication-finalization gate; no intentionally incorrect new helper or mirrored polling unit test was added.

An observational wrapper may preserve a real Publishing state response, release the actual native gate and observe actual Ready before returning the preserved response to the original baseline reader. This deterministically exposes old code freezing an earlier physical epoch. The correction must instead consume a subsequent actual Ready snapshot before performing the original inert action. Do not forge response bytes or database states.

Record actual Publishing→Ready/revision+1, original session identity, gate release and unchanged members/effects/provider counts. Respect the native three-second finalization budget and source suite's existing 5s/30s assertion/case policy. Always release gates and restore instrumentation in finally.

Root verification placeholders:
- Controlled original-code two-case RED: VERIFIED. Both actual cases preserved genuine Publishing→Ready/revision+1 with no other field or provider delta and clean cleanup. The root diagnostic launcher exited 0 because it verified the two EXPECTED assertion failures; this was not a passing original test run.
- Controlled corrected two-case GREEN, with strict later equality and original guards: VERIFIED (two passed in 13.3 seconds). Each used one real release, unchanged actual response and no additional provider work; cleanup completed without errors.
- Affected build/test/lint: PASSED (238 harness, 385 runtime and 122 package results; Nx reused four of seven unchanged test tasks). All 64 declared uninstrumented focused source-browser cases passed once across eight framework/provider/API compositions, with no skipped, flaky or retried result. Every changed baseline family was represented.
- Fresh exact-head required PR source 664 and complete CI, artifact/provenance/final reviews: PENDING.

The current failed PR report remains failed evidence; no merge follows from historical C6 qualification or a focused pass. Public and source/package domains retain their existing independent identities. No release or registry publication is included.

## Authored change scope

The private documented readyState helper now polls the original physical state reader under the existing assertion bound, retains only an actual Ready object from the successful iteration and returns that same object. Exactly the eight listed baseline calls use it. Raw state, intentional held observations, all later full equalities, actions, request/effect assertions and test names/counts remain unchanged. No new dependency or product change is included. Corrected controlled GREEN and all later gates remain pending.
