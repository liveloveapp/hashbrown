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

These results validate the hosted shared-state boundary for the optional backend.
They do not switch production to b4.run, exercise a full hosted browser session,
or establish load/concurrent-run guarantees.
