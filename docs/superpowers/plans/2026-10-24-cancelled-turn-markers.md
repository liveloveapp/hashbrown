# Cancelled turn marker implementation plan

User decision: preserve cancelled requests with an explicit cancellation marker. Follow the [reviewed design](../specs/2026-10-24-cancelled-turn-markers-design.md). Use the existing plan-first, TDD and two-stage technical review workflow. No dependency additions or further policy approval is needed for routine mechanics.

- [x] Review the minimal design and exact owner/insertion boundary before source changes.
- [x] Write failing core tests for a versioned internal marker, canonical preparation/ownership/deduplication, projection exclusion (including structured/UI schemas) and outgoing metadata removal. Include metadata-free MESSAGES_SNAPSHOT exact echoes, authoritative omission and changed-ID/content/role and added-toolCalls counterexamples; restore only existing owned provenance before projection. Implement the minimal immutable shared helpers/transaction with TSDoc.
- [x] Write failing effect tests for explicit Stop and superseding input: preserve exact users/committed tool history, discard current draft, place marker before replacement, respect accepted completion and stale/idle/repeated/dispose/retire cases. Implement without success/result/state publication.
- [x] Review core spec compliance, then code quality; fix valid findings with regression tests.
- [ ] Extend actual React/Angular local aimock and standard browser cancellation assertions to inspect the next authoritative model input. Run red then green. Keep transport cleanup assertions independent of model quality.
- [ ] Run the real native Stop/fresh-lookup cases using the already downloaded v4 profile, sequentially. Record actual input/response/reader/session evidence and retain any strict semantic failures.
- [ ] Run affected build/test/lint/API and standard/local browser regressions. Document marker semantics and measured limitations.
- [ ] Complete independent reviews, create and attach a separate PR, integrate current main, merge on final-head green CI, and verify merge/tree/origin/main. Continue until a genuine new user decision is needed.
