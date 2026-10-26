# ATC validation with b4.run 0.15.5

The previously reproduced shared-thread and duplicate-callback failures did not
recur in this bounded hosted validation. Production remains on direct Hashbrown
OpenAI; this report does not authorize switching it.

## Release and artifact

[b4.run PR #1109](https://github.com/cacheplane/b4run/pull/1109) merged, followed
by the 0.15.5 version PR and the release-controller repair in
[PR #1111](https://github.com/cacheplane/b4run/pull/1111). The repair updates the
GitHub API version used to read historical workflow jobs; it changes no package
version. The released candidate is `877ce4899406cebabc150e80309cb5dbf2299bee`.

[Release workflow 40370125207](https://github.com/cacheplane/b4run/actions/runs/40370125207)
and [independent audit 40376822663](https://github.com/cacheplane/b4run/actions/runs/40376822663)
passed. [v0.15.5](https://github.com/cacheplane/b4run/releases/tag/v0.15.5) is
published and immutable. All 21 public npm packages match the escrowed manifest's
integrity, size, SHA-256 and SHA-512. The independently run published metadata
verifier also passed all 21 packages. The immutable release's manifest matches
escrow byte for byte.

Hashbrown commit `525ffa3a9ce5350ba52d762bd28f5c02e2eeff10` pins CLI, core,
Postgres storage and SDK to 0.15.5; all 11 B4 packages in its installed dependency
closure and lockfile agree. No source overlay was used. Two previews deploy the
same verified artifact against the existing dedicated ATC preview Neon database:

- [Preview A](https://hashbrown-dr990ixpq-blovedev.vercel.app/angular/),
  `dpl_2wARzzkvaCg3dhVYd3iryGM5gaws`.
- [Preview B](https://hashbrown-o2wkeg6ac-blovedev.vercel.app/angular/),
  `dpl_CUyufJtYTY29bWgYjUixcsCQTiBe`.

Both are preview deployments with an explicit `ATC_CHAT_BACKEND=b4run` override.
Only synthetic conversations were written; no user-state pruning ran.

## Hosted results

| Check | Result |
| --- | --- |
| Cross-preview continuation, signed visitor ownership, duplicate replay | Pass |
| Pinned response schema, browser-tool definitions, 4096-token cap | Pass |
| Raw agent/thread routes denied | Pass |
| Same-thread overlap and subsequent retry | 3/3 pass |
| Callback races with distinct run IDs | 3/3 pass |
| Callback races with identical run IDs | 3/3 pass |
| Independent conversations, two waves at 1/2/4/8 concurrency | 30/30 pass |
| Active cancellation, second-preview follow-up, 75-second settle check | Pass |

Each overlap begins B after A emits `RUN_STARTED`, while A remains active. B
receives HTTP 409 with `Retry-After: 1`; A completes, then B's complete-history
retry succeeds. The latest checkpoint retains both humans and both provider
responses. Successful terminal completion is followed by inspection confirming
no admission lease remains for that thread.

Each callback race parks a real browser tool, then delivers the same logical
answer to both previews. Every pair returned 200/409 and generated exactly one
new provider response. Its client-tool row was answered once and not voided.
A delayed fresh-run-ID retry returned an empty successful terminal response,
created no further tool/model work, and left canonical provider IDs unchanged.
Client rows settle through `answered_at`; `settled_at` is a server-tool field.

All 30 independent runs returned schema-valid output, matching thread/run IDs
and unique reference markers, isolated human/assistant checkpoints, and 30
unique provider responses. Validated-run duration includes checkpoint inspection:
median **5120 ms**, p95 **8295 ms**, maximum **11001 ms**.

Cancellation occurred after `RUN_STARTED`, before text. No cancelled assistant
response was committed. The second-preview follow-up received 24 retryable
conflicts over about 30 seconds before succeeding; after another 75 seconds,
only that completed follow-up remained. The probe explicitly honored
`Retry-After`; it does not establish automatic browser retry behavior.

## Angular browser

Real OpenAI tool turns rendered the expected highest-aircraft card and map
highlight with a FlightCard-only schema stable across all requests. Reload
cleared cards/highlights, retained the secure HttpOnly SameSite=Lax anonymous
cookie, and started a new thread. Live route/card decisions returned 200.

With all fixtures removed, the page displayed 266 live aircraft, rendered
PXT656 (`a8a4a0`) and highlighted it through four HTTP-200 agent requests with
one stable narrowed schema. Aircraft, airport, airspace and decision endpoints
returned 200. No page errors were recorded. Initial airspace loading had one
502 that recovered; missing upstream route records returned expected 404s.
Chromium could not expose streaming response bodies through its debugging
protocol, so browser assertions use request schemas, HTTP status and rendered
UI; separate Node probes validate streamed output and terminal events.

## Local verification

- All 21 affected build/test/lint tasks passed across core, OpenAI, TypeSafe,
  ATC shared/server and lifecycle, including dependencies.
- Lifecycle check passed; all eight disposable Postgres integration tests passed.
- Both default OpenAI and optional b4.run ATC builds passed.
- The isolated generated artifact passed Postgres continuation, ownership,
  duplicate-result handling, schema/cap enforcement and bypass denial.
- Existing Nx/Vite deprecation/configuration warnings, the Analog root spec
  tsconfig warning, and color-environment warnings remain. No new dependency
  was added.

## Remaining production gates

1. Address and browser-test immediate follow-up behavior after cancellation or
   another 409. The current HTTP transport marks non-2xx responses nonretryable
   and does not honor `Retry-After` automatically. The safe server conflict can
   remain visible to a user for roughly 30 seconds in the observed cancellation
   case; the successful retry loop here belongs to the probe.
2. Exercise forced owner termination/restart, lease expiry/renewal and stale-owner
   fencing in the hosted topology, including conflicting callback payloads.
   These nine successful races do not cover every failure interleaving.
3. Agree on sustained browser-tool traffic, duration, latency targets and
   provider-rate-limit behavior, then run that workload before production enablement.
4. Review and merge the Hashbrown upgrade separately; keep production's backend
   selection unchanged until the remaining gates and rollout decision are complete.

The [sanitized evidence](./2026-10-26-atc-b4run-0155-validation-evidence.json)
records deployments, synthetic IDs, canonical responses, timings and checks.
The [0.15.4 report](./2026-10-25-atc-load-concurrency-validation.md) remains the
historical reproduction of the original failures.
