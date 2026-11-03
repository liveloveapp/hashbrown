# Native after-save abort cleanup ordering

Status: deterministic RED and focused GREEN verified; full runtime/browser CI pending. Production journal behavior is unchanged.

## Actual failure and race

CI run41551817623 retained native runtime384 passed and1 failed: protected abort at after-save-before-publication expected400 but returned409. The existing test awaited only the local aborted fetch, then expired the lease while the owner's genuine FailureCleanupAsync could still be running.

PostgresNativeSessionOperations.FailureCleanupAsync127–144 requires current ownership, maps Saved to Blocked, clears token/lease/admitted request and advances generation/revision once. If the fixture forces expiry first, cleanup loses ownership and leaves the expired Saved row; that distinct physical state can take the old400 stale-callback path. These outcomes must not be accepted with a400-or409 oracle.

## RED-only fixture change

Scope is only failure=abort and boundary=after-save-before-publication. At the genuine held gate capture owner native-stage counters and actual Saved physical session identity/revision/generation. The existing authenticated native-recovery-state endpoint supplies token/lease facts; retain only derived tokenPresent/tokenNull/leasePresent/leaseNull/admittedRequestNull, never token values, opaque payload or admitted request text. The existing compact state() supplies safe decision/dispatch/effect rows.

After actual cancel and client done, poll the owner's existing native-stage endpoint using the same bounded300×20ms convention already used by this test file. Require cleanupCompleted exactly+1 and all three Before plus all four After/Disposed counters exactly one, proving this fresh owner's actual one context completed. No sleep substitutes for the observed predicate, no timeout/retry configuration changes and no additional model request.

Before forced expiry require actual Blocked session, null ownership fields and exact generation/revision+1 relative to the held Saved row. Require unchanged batches, consumed approval decision/admission, native dispatch identity and effects. Store safe real observations through the existing explicitly configured evidence directory.

Root observed the original testcase fail exactly400-versus409 after every new cleanup/state assertion passed (semantic RED40461, retained task8-ordered-abort-red-proof.json). Actual Saved generation2/revision11 with token+lease present became Blocked generation3/revision12 with null ownership, cleanupCompleted1 and all four terminal counters1 before expiry. The authorized GREEN changes only the exact HTTP expectation: after-save death remains400; after-save abort requires409. Do not accept a set of statuses or change production behavior.

## Unchanged death branch and qualification

Death still stops/awaits the owner, then expires the retained Saved lease before retry and requires exact400. All other boundaries, case IDs, irreversible decision/effect assertions, retry/no-extra-model checks and operator controls remain unchanged. No Program endpoint, SDK, public API or dependency changes.

Root will verify both exact after-save branches and all eighteen boundary cases, then build/lint/precommit and independent frozen review. No GREEN execution is claimed in this authored slice.

## Executed focused verification

The original after-save abort case failed only its stale exact400 assertion after the new real cleanup/state assertions passed. With the narrow expectation correction, all18 irreversible-boundary death/abort cases passed;60 other cases in that spec were unselected. The affected .NET build and lint passed. This is focused evidence, not a full385-runtime or664/372-browser qualification. The published recipe source/evidence references remain unchanged by this .NET-only test edit.
