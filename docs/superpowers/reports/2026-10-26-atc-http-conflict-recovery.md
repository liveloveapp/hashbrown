# ATC browser recovery with core HTTP response retries

The approved opt-in core retry API and ATC integration pass deterministic and
hosted cancellation recovery checks. Production backend selection is unchanged.
This resolves the basic conflict-recovery gate identified by the
[0.15.5 validation](./2026-10-26-atc-b4run-0155-validation.md); owner-failure and
sustained-load gates remain.

## Source and deployment

The preview was built from `9f9f196c0eae38745f50af3b549621fb96c24cff`, using the
new Hashbrown core source and the coherent published b4.run 0.15.5 dependency
set. The core API is under review in [PR #780](https://github.com/liveloveapp/hashbrown/pull/780)
and has not been published as a Hashbrown package release.

[Preview](https://hashbrown-2gh31u3hf-blovedev.vercel.app/angular/):
`dpl_8MyGopGhvVgWAGofb24bD4vRacTu`. It uses the existing dedicated ATC preview
Postgres database and an explicit preview-only `ATC_CHAT_BACKEND=b4run` override.
Only synthetic conversations were written; no user-state pruning ran.

## Core and deterministic browser verification

The default transport behavior is unchanged unless a response retry policy is
configured. Its predicate receives a bounded error snapshot; repeated requests
retain the captured bytes, headers, IDs and signal. Count and elapsed budgets
bound decisions and waits, while accepted fetches and streams can outlive that
budget. Cancellation/disposal prevents another retry. Network/protocol failures
remain governed by the existing generation retry policy.

| Check | Result |
| --- | --- |
| Core build, lint, API generation | Pass |
| Core unit tests | 2233/2233 across 96 suites |
| Dedicated response-retry cases | 57/57 |
| ATC shared tests | 763/763 |
| Affected ATC build/test/lint tasks, including dependencies | 19/19 |
| ATC e2e type check | Pass |
| Full Angular/React browser suite | 86/86 |
| Native OpenAI/B4 backend browser cases after final cleanup fixes | 4/4 |
| Disposable Postgres integration tests | 8/8 |
| Default OpenAI and optional B4 artifact builds | Pass |
| Generated-artifact Postgres continuation, ownership, schema/cap and route denial | Pass |

Tests cover selected errors, date/integer/fallback Retry-After, malformed calendar
dates, count/time limits, body truncation/read failure, policy failure, immutable
replay, default/disabled behavior, hung cleanup, reader-lock release, late fetch
settlement, concurrent sends, and disposal while reading/deciding/waiting. A real
chat-runtime test stops an accepted stream, follows up through two 409s, and
commits one answer without stale output. Browser tests exercise admission
recovery, a server hint beyond the budget returning to the existing Retry UI,
and reload retiring a waiting conversation in both frameworks.

Existing tool-step lint warnings, Nx/Vite/Analog configuration/deprecation,
API-extractor, and color-environment warnings remain. An initial local packaging
attempt collided with another build writing the same output; the subsequent
sequential build with caching disabled and artifact verification passed. The
API report was generated but is ignored by the repository's existing convention.

## Hosted core-runtime cancellation: pass

The actual core runtime and shared ATC transport sent a real structured OpenAI
run, stopped it after `RUN_STARTED` and before text, then immediately sent a new
follow-up on the same anonymous thread. No probe-owned retry loop was used.

The follow-up encountered **25 real 409 responses**, each with `Retry-After: 1`,
then one HTTP-200 accepted run. Every physical follow-up request had identical
serialized bytes and the same run/thread IDs and FlightCard-only pinned schema.
Cancellation occurred 1948 ms after probe start; the accepted follow-up headers
arrived at 32685 ms and the completed response at 40648 ms. The latest checkpoint
contained one provider response with the 4096-token cap, and no admission lease
remained. Another 75 seconds later, no cancelled response had appeared.

## Hosted Angular connection interruption: pass

A browser-only probe interrupted the first `/api/run` connection immediately
after receiving `RUN_STARTED`, before any text. The application showed its
existing error UI. The probe clicked Retry once, immediately; the product's
HTTP policy then handled **25 real admission conflicts** automatically.

After admission cleared, the browser completed four successful model/tool runs,
rendered one flight card (`a70328`), and highlighted that aircraft on the live
map. No error banner or page error remained. All retried requests for the
admission-conflicted run had identical body hashes, run IDs and schemas.

Manual Retry starts a new logical run and, in this observed flow, expands the
cancelled run's narrowed kit to the full pinned kit. That recovered run retained
one stable schema across its HTTP retries and subsequent browser-tool turns.
The API guarantees physical HTTP replay identity; it does not change manual
Retry's existing kit-selection behavior. The browser probe captures hashes and
IDs rather than request bodies or authentication data.

Canonical Postgres inspection verifies one provider response per accepted run,
all client-tool rows answered or voided, and no remaining admission lease. The
sanitized evidence also records the post-browser 75-second quiescence check.

## Remaining rollout work

- Merge the 0.15.5 upgrade and this core/API integration after their required CI.
  The recovery work is stacked on #776 while its branch is kept current with main.
- Validate hosted owner termination/restart, lease expiry/renewal and stale-owner
  fencing, including conflicting callbacks and cancellation during an already
  accepted tool-result continuation. These bounded checks do not establish every
  crash or callback-cancellation interleaving.
- Agree on sustained browser-tool workload, duration, latency targets and
  provider-rate-limit behavior, then run that workload.
- Publish Hashbrown packages separately and make an explicit production rollout
  decision. This validation changes no production backend settings.

See the [sanitized evidence](./2026-10-26-atc-http-conflict-recovery-evidence.json)
for timing, stable request hashes, synthetic IDs and checkpoint checks.
