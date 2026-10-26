# ATC hosted Postgres validation

Hashbrown PR [#731](https://github.com/liveloveapp/hashbrown/pull/731) merged as
`e73c10a8b0c200a5d61a289ea0bdc56b4d7aeff5`. The optional agent uses the published
b4.run 0.15.4 packages. Production retains the direct Hashbrown OpenAI backend.

## Environment

Validation ran on October 26, 2026 UTC (October 25 Pacific), using two independent
Vercel preview deployments of the same prebuilt artifact in `hashbrown-atc`:

- [Replica A](https://hashbrown-lx484bvgp-blovedev.vercel.app), deployment
  `dpl_4uQr39MZxAyqxcYz86JeNGU4XGqi`.
- [Replica B](https://hashbrown-1j8rbwpzq-blovedev.vercel.app), deployment
  `dpl_8UH5QAnob6Mq2Q8QecZk22fp1F31`.

Both use source commit `67a737bacdffd8dc71b28fcc9d0a64fb0cce42ef`, which adds
cancellation metadata to the merged implementation. The deployed backend override
is `ATC_CHAT_BACKEND=b4run`.

A dedicated Neon resource, `atc-preview-target-01`, was created on the team's
existing Free plan and connected only to preview with the `ATC_B4RUN_` variable
prefix. Both deployments use that database and the same encrypted preview signing
secret. No growth or lifecycle database was used. The database had no public
tables before validation; hosted requests created the `atc` checkpoint, thread,
permission, client-tool-call, write, and migration tables.

Credentials, signed cookies, and raw provider payloads are excluded from this
report. Only synthetic validation conversations were written. Cleanup commands
were not run against this live database.

## Hosted boundary checks

The probe made HTTPS requests to the actual deployed `/api/run` functions with
the real OpenAI provider. It manually forwarded the signed cookie between preview
hostnames to simulate a shared ingress across independent instances. Browser tool
execution was simulated by submitting the emitted tool call's result; this is an
HTTP and storage boundary check, not a hosted browser UI test.

The following checks passed on both cancellation-enabled previews:

| Check | Evidence |
| --- | --- |
| Public ingress | `/angular/` serves successfully; GET `/api/run` is 405. Raw thread, AG-UI, health, and readiness paths return 404. |
| Anonymous identity | Initial response establishes a Secure, HttpOnly, SameSite=Lax signed visitor cookie. |
| Ownership across instances | A result sent to B without the cookie, including a forged visitor header, is rejected with 403. |
| Browser-tool continuation | A emits one `highlightAircraft` call; B accepts its result with the same cookie and completes the response using shared Postgres state. Replayed tool events retain the original call identity. |
| Pinned schema | The final structured UI validates against the original pinned response schema. Provider metadata preserves every constraint; OpenAI omits only the root `$schema` dialect annotation when echoing it. |
| Tool policy and cap | Provider metadata contains only the allowed `client_highlightAircraft` definition for this request and `max_output_tokens: 4096` on both turns. |
| Duplicate results | Repeated result submissions finish successfully and do not add another provider response ID to the latest persisted checkpoint. |

The final continuation run completed at `2026-10-26T01:35:06.964Z`, using thread
`hosted-4185d793-8418-41ed-8151-b14139c619f2`.

## Cancellation defect and fix

The initial deployment exposed a real failure. Aborting immediately after
`RUN_STARTED`, before any response text, left the model running. A short follow-up
on B completed, but 25 seconds later the older aborted run replaced its checkpoint.
The failure was reproduced on thread
`hosted-cancel-67d7b6f5-fe52-4b5e-beab-3099d68e221a`.

The generated function enabled response streaming but omitted
`supportsCancellation`. Vercel requires request cancellation to be explicitly
enabled for the function; the adapter already forwards the incoming request's
abort signal. See [Vercel's cancellation documentation](https://vercel.com/docs/functions/functions-api-reference#cancel-requests).
The packaging fix adds `supportsCancellation: true` to `.vc-config.json`,
preserving the generated runtime and existing streaming metadata.

A regression test first failed on the missing flag, then passed with the fix.
On the fixed previews, the same early-abort sequence left no assistant response,
the next request completed on B, and the completed follow-up checkpoint remained
unchanged after 25 seconds. A second run extended the observation to 75 seconds,
beyond the function's 60-second limit, and also passed with no late checkpoint
write. That run aborted at `2026-10-26T01:36:09.909Z`, before any response text,
and finished verification at `2026-10-26T01:37:30.405Z`, using thread
`hosted-cancel-31476620-1fc1-4401-a08d-1f448f39e744`. The duplicate-result check
also confirmed unchanged persisted provider response IDs on this run.

## Local verification

- `atc-server`: build, test, and lint pass; 163 tests pass and one opt-in Postgres
  test is skipped in the default suite.
- Both uncached ATC artifact builds pass: default direct OpenAI and optional
  b4.run. The optional artifact includes cancellation and streaming metadata and
  passes the isolated wrapper check.
- ESLint passes for the modified packaging script and its test; `git diff --check`
  passes. A read-only code review found no actionable issues.
- Tooling emits the existing `NO_COLOR`/`FORCE_COLOR` environment warning.

## Post-merge production verification

PR [#755](https://github.com/liveloveapp/hashbrown/pull/755) merged as
`6ee82f3f315e1938ee19f77f3d37593a32275594` after updating from main and passing
the fresh CI run. The [post-merge workflow](https://github.com/liveloveapp/hashbrown/actions/runs/40256131334)
passed, including production ATC, lifecycle, and website deployment jobs.

At `2026-10-26T02:00:46.061Z`, Vercel reported ATC production deployment
`dpl_3aEQ4c7jwcap1R9y2JBdEVSq5rTt` READY at that exact merge commit, with
`atc.hashbrown.dev` among its assigned aliases. Live HTTPS checks confirmed:

- `/` resolves to `/angular/`, which returns 200.
- GET `/api/run` returns 405.
- `/threads/probe` and `/healthz` return 404.
- The optional backend has no production environment override; the dedicated
  database and signing secret remain preview-only.

## Hosted Angular browser verification

A real Chromium browser exercised replica A's deployed Angular application.
The model and b4.run function remained live throughout. Initial traffic and
decision fixtures came from the existing browser-test helpers, followed by live
decision routing and then a final run with every fixture removed.

1. With 21 known aircraft, asking which plane was highest executed the browser
   traffic query and highlight tools. AAL2711 (`a1c005`) was correctly selected at
   41,000 ft. The model chose a valid prose response; an explicit follow-up asking
   for its flight card rendered that component with the same aircraft highlighted.
   Six agent requests shared one thread and the same narrowed schema, excluding
   `ArrivalsBoard`; every request returned 200.
2. Reload removed the prior transcript, card, and highlight. The anonymous cookie
   remained Secure, HttpOnly, and SameSite=Lax. With the decision stub removed,
   the next question reached both real hosted decision endpoints (200), used a
   new thread, and rendered/highlighted AAL2711 again across four successful agent
   requests with a stable narrowed schema.
3. With all network fixtures removed, the app loaded 162 aircraft initially and
   164 at the final assertion. Live aircraft, chart airports, chart airspace, and
   decision services returned 200. The question asking for the highest aircraft's
   card and highlight completed through four agent requests in one new thread,
   with the same narrowed schema on each continuation. At
   `2026-10-26T02:07:45.994Z`, LXJ282 (`a2d5fc`) rendered at 43,000 ft with the
   matching map marker highlighted. Subsequent polling updated its card to
   42,975 ft without another question, confirming the component remains live.
4. Desktop screenshots were visually inspected. At 390 × 844, the mobile chat
   sheet expanded, the live card remained visible, and the document had no
   horizontal overflow.

No browser page exceptions occurred. The only console errors were route-data
404s: the deliberate AAL2711 fixture and the real external lookup for LXJ282.
Both rendered the expected "Route unavailable" fallback without interrupting
the assistant, card, or map action. Browser-tool results were produced by the
actual Angular handlers rather than submitted by the HTTP probe.

These results cover the hosted shared-state boundary and the full Angular path
from user input through decisions, model calls, browser tools, components, and
live map updates. They do not switch production to b4.run or establish
load/concurrent-run guarantees.

The subsequent [load and concurrency validation](./2026-10-25-atc-load-concurrency-validation.md)
passed 30 independent conversations up to eight concurrent runs, but found
cross-replica same-thread execution races. Production rollout is blocked until
shared run admission and competing browser-tool continuations are made safe.
