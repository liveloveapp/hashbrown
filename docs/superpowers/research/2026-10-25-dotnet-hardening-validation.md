# .NET Hardening Validation — 2026-10-25

## Changes and trust boundary

Cold structured/UI restoration has an explicit `preserve-diagnostics` policy.
It preserves exact native assistant text for later model requests, excludes
schema-invalid plain text from typed/component projection, and exposes immutable
plain-text diagnostics. It establishes no cancellation ownership or permission
to run work. Strict restoration remains the default. The policy and diagnostic
DTO are source SDK additions and are **not published in 0.8.1**.

The PostgreSQL recipe now registers independent bounded maintenance with host
lifecycle cancellation. Both stores retain `EffectStarted` and `FailedAfterEffect`
until explicit reconciliation, while private snapshots and audits follow their
own deadlines. No dependencies or release safeguards were added.

## Local verification

All affected package builds, tests and lints passed. The first combined run
caught a timing-test import ordering error and three new non-null assertions;
these were corrected, conformance lint passed cleanly, and all five timing tests
passed again. Existing unrelated warnings remain: three core unused variables,
ten React lint warnings, API Extractor release-tag/compiler-version warnings,
and existing bundle/deprecated-executor/color-environment warnings.

| Check                                 | Result                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Core unit tests                       | 1,841 passed, 14 snapshots                                               |
| React unit tests                      | 213 passed                                                               |
| Angular unit tests                    | 281 passed                                                               |
| Conformance unit tests                | 45 passed                                                                |
| .NET unit/integration tests           | 137 passed, including 10 real PostgreSQL retention scenarios             |
| Docs unit tests                       | 890 passed                                                               |
| Core/React/Angular API reports        | Passed                                                                   |
| Exact C# recipe combinations          | 8 compiled, zero C# warnings/errors                                      |
| .NET browser matrix                   | 172/172 passed, one worker, zero retries                                 |
| New cold recovery cases               | 12/12 across React/Angular and OpenAI/Azure                              |
| Original worker-restart case repeated | 20/20, five per framework/provider, zero retries                         |
| Docs route parity                     | Passed: 102 docs, 264 API routes, 14 blog posts, remaining public routes |
| Rendered .NET highlighting            | Both routes: four C# blocks with 5–7 token colors, XML with 4            |

The browser regressions first failed at strict cold restoration of a genuine
metadata-free runtime cancellation marker. Passing cases use real .NET provider
clients with aimock only at the model API, verify actual upstream cancellation,
restore pending history without work, explicitly resume the exact original
native messages/tools/schema, and reload completed history without another
effect. Native malformed model text containing HTML renders as escaped visible
diagnostics without creating an image/script or executing application actions.

Retention tests cover idle bounded passes, independent deadlines, valid leases,
locked-row skipping/rechecking, cancellation rollback, full-capacity admission
rollback, reconciliation, deleted-selector replay rejection, late capture,
terminal-only memory snapshots and scheduler stop/failure privacy.

## Timeout evidence and limits

The historical five-second assistant timeout did not reproduce. The original
assertion, model/effect counts and zero-retry policy remain unchanged. No
synthetic provider/effect warm-up or runtime timing fix was added.

All 20 repeats retained a timeline attachment. Each used one Node monotonic
clock, fixed fields and opaque fixture IDs; no timeline overflow occurred.
Observed request-to-header ranges in this local run were:

| Framework/provider | Resume browser headers (ms) | Model proxy headers (ms) |
| ------------------ | --------------------------: | -----------------------: |
| React/OpenAI       |                 298.9–325.7 |                  7.5–9.8 |
| React/Azure        |                 276.3–308.7 |                  7.9–9.4 |
| Angular/OpenAI     |                 268.0–330.0 |                  7.9–9.8 |
| Angular/Azure      |                 299.0–335.8 |                  8.2–9.1 |

These measurements describe this run, not a production latency guarantee or a
controlled comparison with the historical failure. They do not establish its
cause. Process liveness is distinct from provider readiness, and upstream
headers are distinct from first body bytes and browser-visible response events.
A browser request-failed or downstream-close event can also reflect intentional
reader cancellation after a terminal event; it does not alone prove a failed
conversation. Failed future original-case runs attach the same bounded evidence
automatically. `DOTNET_RECOVERY_TIMINGS=1` retains successful repeat evidence.

Independent spec and quality reviews approved highlighting, SDK changes,
browser hosts/tests, retention, timing evidence, and docs. Final integration
review approved the combined change. Remote PR checks, merge and deployment
verification are recorded on the PR.
