# Growth Lifecycle Hardening (before PR 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the lifecycle service's known failure modes before PR 7 turns production on: one bad job can no longer stall a tick, a configuration mistake degrades to an operator alert instead of a dead tick, a stuck Message-ID match raises an alert, b4run threads stop piling up, contact deletion scrubs reply records, and a permanent form conflict stops inviting retries. No new behaviour for recipients; nothing is switched on.

**Architecture:** All changes sit in code PR 5 and PR 6 built: `tools/lifecycle/src/dispatcher.ts` and `campaign/send.ts` (tick and handlers), `tools/growth/src/lib/{jobs,replies,contacts,forms}.ts` (queries and deletion), `www/src/lib/growth/lifecycle-client.ts`, `www/src/app/%5F/cron/lifecycle/route.ts` and `www/src/app/%5F/forms/unstuck/route.ts`. The operator-alert set grows by two values, which the dispatch state schema, the lifecycle client's response check and the cron log all accept. Sources: the lifecycle runbook's "Follow-ups" section and PR 5's final-review rulings (the budget-path lease conflict, the unbound Message-ID stall).

**Tech Stack:** Existing only. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md` §2 anti-goals (no double sends, no sends after a stop), §8.6, §10, §11, §14 item 7; `docs/superpowers/runbooks/2026-10-21-growth-lifecycle-service.md` "Follow-ups".

## Global Constraints

- Nothing in this PR may cause a send that would not have happened before, or remove a check that blocks one. Every new path defers, quarantines, alerts or deletes metadata; none submits mail.
- Operator alerts are exactly `mailbox_recovery_required | observation_projection_failed | action_origin_invalid | message_id_unbound`, in `tools/lifecycle/src/app/dispatch/state.ts`, `www/src/lib/growth/lifecycle-client.ts` (`LifecycleOperatorAlert`) and the runbook's alert table. The cron route logs each as `[lifecycle-operator-alert]`.
- Retry policy for a non-deterministic handler error: defer `min(60 × 2^(attempts − 1), 3600)` seconds with `last_error_code = 'handler_error'`; after the job's 5th attempt, `failLeasedJob` with `handler_error_exhausted`. Lease conflicts keep their current handling (drop the job). `DeterministicLifecycleJobError` keeps its immediate quarantine. Error messages are never written to the database or logs; only the error `name`.
- The Message-ID stall threshold is 6 hours: a completed `fulfill` or `send_step` with a `provider_email_id`, no `rfc_message_id`, `updated_at` older than 6 hours, and a contact that is not deleted.
- b4run threads created by the cron and the nudge are deleted by the caller right after the run returns (`DELETE /threads/<threadId>` with the bearer, best effort, never failing the caller).
- Tests: top-level `test(...)` only, arrange/act/assert, TSDoc on exports, `npx nx <target> <project>`. Before the PR: build, test and lint for growth, lifecycle and www, `npx nx e2e www`, and the growth and lifecycle integration suites against the test store (leave it clean; if the store holds tables from another branch, report it and do not delete them).

## Review Focus

1. A handler that throws on every attempt must not delay the jobs behind it in the same tick, and must stop being retried after 5 attempts (Task 1 test "a failing job defers with backoff, the rest of the batch runs, and the 5th failure quarantines").
2. A bad `GROWTH_PUBLIC_ACTION_ORIGIN` must leave reconciliation, projection, enrollment and `reply_reconcile` running, lease no job that needs the origin, and raise `action_origin_invalid` (Task 2 test).
3. Deleting a contact must leave no reply metadata pointing at them, including in `reply_reconcile` jobs created before the reply was matched (Task 4 integration test).
4. The cron must report success and still delete its b4run thread when the delete call fails or times out (Task 3 test).
5. A browser that resubmits a changed message with the same id must get a non-retryable answer, while a byte-identical retry still gets 200 (Task 5 tests).

---

### Task 1: One bad job no longer stalls the tick

**Files:** `tools/lifecycle/src/dispatcher.ts` (+ spec), `tools/lifecycle/src/dispatcher.integration.spec.ts`

**Interfaces:** the per-job `try` catches any non-`JobLeaseConflictError`, non-`DeterministicLifecycleJobError` error: stop the job's heartbeat, `deferLeasedJob` with the backoff above (or `failLeasedJob` with `handler_error_exhausted` on the 5th attempt), log `[lifecycle-job-failed] { kind, name }`, and continue. The budget-path `deferJob` (PR 5 Ruling 20) and the `recovery_paused` defer each catch `JobLeaseConflictError` and continue. An abort signal still stops the loop.

- [ ] **Step 1: Failing tests**

```ts
test('a failing job defers with backoff, the rest of the batch runs, and the 5th failure quarantines', ...); // Review Focus 1
test('backoff is 60, 120, 240, 480 seconds and caps at 3600', ...);
test('a lease conflict on the budget-path defer drops that job and the tick continues', ...);
test('the logged failure carries only kind and error name', ...);
test('an abort still stops the loop after the current job', ...);
```

- [ ] **Step 2–4:** fail, implement, `npx nx test lifecycle && npx nx lint lifecycle && npx nx build lifecycle` and the lifecycle integration suite.
- [ ] **Step 5: Commit** `fix(lifecycle): isolate failing jobs with backoff and quarantine`

---

### Task 2: Configuration mistakes become alerts, plus the Message-ID stall alert

**Files:** `tools/lifecycle/src/campaign/send.ts`, `tools/lifecycle/src/dispatcher.ts`, `tools/lifecycle/src/app/dispatch/state.ts` (+ specs), `tools/growth/src/lib/jobs.ts` (`countUnboundProviderMessages(executor, { now, olderThanMs })`, + spec and integration test), `www/src/lib/growth/lifecycle-client.ts` (+ spec), `docs/superpowers/runbooks/2026-10-21-growth-lifecycle-service.md`

**Interfaces:** at tick start, `normalizeGrowthPublicActionOrigin(env.GROWTH_PUBLIC_ACTION_ORIGIN)` is attempted once. If it throws, the tick still runs reconciliation, projection, hello and enrollment, leases only `reply_reconcile`, and adds `action_origin_invalid`. After leasing, if `countUnboundProviderMessages(...) > 0`, add `message_id_unbound`. The www client accepts both new alert values; the runbook's alert table and enable checklist ("the origin is a bare HTTPS origin") are updated.

- [ ] **Step 1: Failing tests**

```ts
test('an invalid action origin leases only reply_reconcile, keeps enrollment running and alerts action_origin_invalid', ...); // Review Focus 2
test('an unbound provider message older than 6 hours alerts message_id_unbound; a newer one or a deleted contact does not', ...); // integration for the query
test('the dispatch state and the lifecycle client accept exactly the four alerts', ...);
```

- [ ] **Step 2–4:** fail, implement, lifecycle + growth + www test/lint/build, integration suites.
- [ ] **Step 5: Commit** `fix(lifecycle): degrade a bad action origin to an alert and alert on unbound Message-IDs`

---

### Task 3: Delete each run's b4run thread

**Files:** `www/src/lib/growth/lifecycle-client.ts` (`deleteLifecycleThread({ baseUrl, serviceSecret, threadId, timeoutMs })`, + spec), `www/src/app/%5F/cron/lifecycle/route.ts` (+ spec), `nudgeLifecycle`

**Interfaces:** after `invokeLifecycle` returns (success or failure), the cron and the nudge call `deleteLifecycleThread` with the same thread id, `DELETE ${origin}/threads/${threadId}`, bearer, `redirect: 'error'`, 5 s timeout, 204/404 treated as done, every error swallowed and logged as `[lifecycle-thread-delete-failed]` with the status only. `invokeLifecycle` already returns `threadId`; make it available on failure too (throw an error carrying the thread id, or return it) so a timed-out run's thread is also deleted.

- [ ] **Step 1: Failing tests**

```ts
test('the cron deletes its thread after a successful run', ...);
test('the cron still answers 200 when the delete fails or times out', ...); // Review Focus 4
test('a failed run still deletes its thread', ...);
test('the nudge deletes its thread', ...);
```

- [ ] **Step 2–4:** fail, implement, `npx nx test www && npx nx lint www && npx nx build www`.
- [ ] **Step 5: Commit** `fix(www): delete each lifecycle run's b4run thread`

---

### Task 4: Contact deletion scrubs reply records

**Files:** `tools/growth/src/lib/replies.ts` (set `contact_id` on a `reply_reconcile` job when settlement resolves its contact), `tools/growth/src/lib/contacts.ts` (`deleteContact`: also clear the payload of `reply_reconcile` jobs whose `in_reply_to`, `references` or `rfc_message_id` matches any `rfc_message_id` or `gmail_seed_message_id` of the contact's jobs), `tools/growth/test/*.integration.spec.ts`

- [ ] **Step 1: Failing tests**

```ts
test('settling a reply_reconcile job records the resolved contact', ...); // integration
test('deleting a contact clears unmatched reply_reconcile payloads that reference its messages', ...); // Review Focus 3, integration
test('deleting a contact leaves other contacts\' reply_reconcile payloads intact', ...); // integration
```

- [ ] **Step 2–4:** fail, implement, growth build/test/lint and integration.
- [ ] **Step 5: Commit** `fix(growth): contact deletion scrubs reply reconciliation records`

---

### Task 5: A permanent form conflict answers 422

**Files:** `tools/growth/src/lib/forms.ts` and `form-admission.ts` (throw an exported `FormSubmissionConflictError` for a changed payload on a reused id and for jobs owned by another contact), `www/src/app/%5F/forms/unstuck/route.ts` (+ spec), `docs/superpowers/runbooks/2026-10-21-growth-lifecycle-service.md` (remove the two items this PR closes from "Follow-ups"; keep the rest)

**Interfaces:** the route maps `FormSubmissionConflictError` to 422 `{ error: 'This submission changed. Please send it again.' }` without `retryable`. The client keeps treating any other non-2xx as `api_error`; a 422 is an `api_error` too.

- [ ] **Step 1: Failing tests**

```ts
test('a changed payload on a reused submission id answers 422 without retryable', ...); // Review Focus 5
test('a byte-identical retry still answers 200', ...);
test('a jobs-ownership conflict is a FormSubmissionConflictError', ...); // growth unit
```

- [ ] **Step 2–4:** fail, implement, growth + www test/lint/build, `npx nx e2e www`.
- [ ] **Step 5: Commit** `fix(growth): a permanent unstuck submission conflict answers 422`

---

## Not in this PR

Turning anything on (PR 7), the reply poller (waits for the mailbox), and the minor items PR 6 left for Brian (page voice, blur validation on every field).
