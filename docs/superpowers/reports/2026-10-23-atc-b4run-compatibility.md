# ATC b4.run compatibility investigation

Date: 2026-10-23. Design: `../specs/2026-10-23-atc-b4run-backend-design.md`.
Plan: `../plans/2026-10-23-atc-b4run-backend.md`.

## Decision

**Source compatibility gate now passes against the patched local b4.run branch.**

The user authorized continuing source implementation and will handle releases
separately. See the source-fix follow-up and the 2026-10-24 released-package
validation below. Released 0.15.2 artifacts still fail the output-cap gate; the
initial findings in this report describe the earlier 0.14.0 investigation.

The installed b4.run 0.14.0 runtime embeds through a public fetch API and can
park/resume browser tools while binding ATC's schemas. However:

1. Its replayed tool calls change parent message identity across requests. The
   current Hashbrown runtime rejects the first continuation before executing
   the next browser tool.
2. Its `agent()` descriptor has no supported output-token limit, and captured
   provider calls have no token cap. This cannot preserve ATC's 4096-token cap.

The schema contract is also version-specific: 0.14.0 reads the older top-level
`hashbrown.responseSchema`, whereas inspected published 0.15.0 reads
`forwardedProps.responseSchema`. Simply applying the design's modern mapping
to 0.14.0 silently loses structured output.

No application source, package manifests, lockfiles, installed dependencies,
or b4.run working checkouts were changed. The probe used deterministic fake
provider responses; it made no live model calls.

## Provenance and environment

The active Hashbrown worktree was clean at `acdc3cab` before this investigation.
Node was `v24.20.0`. This worktree has no `node_modules`.

The existing main Hashbrown checkout at `/Users/blove/repos/hashbrown` supplies
an installed package tree. Its Git HEAD was
`c48f5355481909c9f602031853b44fc401b34ec0`; its package contents are a separate
observation from this worktree's declarations and lockfile.

| Evidence | CLI/core/storage | SDK |
| --- | --- | --- |
| Active worktree manifest/lockfile | 0.14.0 | Root dev dependency 0.15.0; runtime packages require nested 0.14.0 |
| Existing main-checkout installed packages used by probe | 0.14.0 | 0.14.0 |
| Public registry CLI 0.14.0 metadata | All b4.run dependencies exactly 0.14.0 | 0.14.0 |
| Public registry CLI 0.15.0 metadata | All b4.run dependencies exactly 0.15.0 | 0.15.0 |

Probe dependencies also included `@ag-ui/core` 1.0.2,
`@langchain/openai` 1.7.0, `@langchain/langgraph` 1.5.2, and `langchain` 1.5.19.
Package declarations do not establish that these same artifacts would resolve
from a fresh install of the active worktree.

The local b4.run checkout remains on an older Dawn branch. Its local `main`
was inspected at `1915fe2100ec8c2751d39b92de2c7bd905913a8f` without checkout changes.
That source is not identical to installed 0.14.0, despite package version
labels in the source tree. Published artifacts take precedence in this report.

Public metadata was read using `npm view` for CLI 0.14.0, CLI 0.15.0, and SDK
0.15.0. CLI, SDK, LangChain, and AG-UI 0.15.0 tarballs were downloaded with
`npm pack --ignore-scripts` and extracted under `/private/tmp` for source/API
inspection only. A coherent 0.15.0 runtime was **not executed**.

CLI 0.14.0 registry integrity matched the active lockfile:
`sha512-V4k+INbkKziFOlMlH9dtmKMY5b91sdJxM1NVCuwHZsiZz4HUXe/KhDVJejcb8XRcTF0COKUh9pncQqAd2WNYig==`.
CLI 0.15.0 registry integrity:
`sha512-hy+JlZYhcLsEKxZECYyS5Bx70cDXrSjyPYRHgjhKohX5NWMXU/0TDDtcsAjamGl9Vc6cIwuuNveaw5GXMTKNow==`.

## Executed probe

Temporary evidence is in `/private/tmp/atc-b4run-compatibility/`:

- `probe.mjs`: executable Node test script using public package exports.
- `hashbrown-entry.ts` / `.mjs`: temporary bundle of this worktree's actual
  Hashbrown runtime, Skillet, ATC tool definitions, and response schemas.
- `probe.log`: final test output.
- `hashbrown-events-1.json`, `hashbrown-events-2.json`: actual b4.run events.
- `hashbrown-failure.json`: actual Hashbrown error and browser executions.
- `result.json`: redacted provider payload summaries.

The script imports `createRuntimeFetchHandler` and `buildStaticRouteModule`
from `@b4run/cli/fetch`, `agent`, `defineAuth`, `ownedThreads`, and
`createMemoryClientToolCallStore` from `@b4run/sdk`, plus real LangGraph
checkpointing and a temporary SQLite thread store. It uses a static route
manifest, so runtime discovery needs no repository files. Model imports use
the exported `seedModelImporter` with the real installed OpenAI integration.

The provider HTTP fetch is replaced inside the disposable probe process. It
asserts that requests target `probe.invalid`, captures their bodies, and
returns scripted OpenAI Chat Completions SSE. It also observes abort signals.
No provider credential is loaded; the process sets a dummy key.

Run: `node /private/tmp/atc-b4run-compatibility/probe.mjs`.
Final exit code: **1**, with **9 tests, 8 passing, 1 failing**. Two passing
tests characterize missing features; they are not compatibility successes.

| Check | Result |
| --- | --- |
| Server-side browser query → map action → final structured text, with stable thread and distinct run IDs | Passed using the legacy 0.14 schema carrier |
| Parallel tool calls; partial results wait; repeated answered result does not call model again | Passed |
| Tool failure text supplied as result | Passed within parallel-result scenario; not a real throwing Hashbrown handler |
| New user message abandons unanswered browser call | Passed |
| Another visitor cannot execute/read an owned thread | Passed; execution returned 403, state read 404 |
| Aborting the outer request reaches the provider fetch | Passed |
| Actual current Hashbrown runtime executes query then map action and receives narrowed UI | **Failed: parent identity changes on replay** |
| All 15 actual ATC allowlisted schemas bind at provider boundary; all 16 actual ATC tools are offered | Passed |
| Modern forwarded schema on 0.14 is ignored | Confirmed incompatibility |
| Descriptor-generated provider payloads omit all output-token cap fields | Confirmed missing safeguard |

The actual Hashbrown test uses the Markdown + FlightCard kit and verifies its
schema equals ATC's first allowlist entry. It records each outgoing schema,
counts browser handler execution, and expects query → highlight → final UI.
It fails after two requests: only the query handler ran. The isolated
server-side test succeeds because its simple simulated client correlates
completed calls by ID without enforcing immutable parent identity. That
difference is why a server-only protocol probe is insufficient.

The final probe SHA-256 is
`6f61090968b255b5bda9cc50e3334d7b08da5beb83bba0bbc19e445f0eb50246`.
Temporary evidence may be removed by system cleanup; preserve the probe and
fixtures in upstream regression tests before attempting a fix.

## Blocker 1: parent identity on continuation

The captured first request contains:

```json
{"type":"TOOL_CALL_START","toolCallId":"hb-find","toolCallName":"findAircraft","parentMessageId":"msg-55800f6a-f359-4bf3-861f-a96cdb928f32"}
```

The next request replays the same answered call:

```json
{"type":"TOOL_CALL_START","toolCallId":"hb-find","toolCallName":"findAircraft","parentMessageId":"msg-20f9ac6b-8d76-42b0-9059-12ba47414b8d"}
```

Hashbrown reports `PROTOCOL_ERROR`:
`AG-UI tool call hb-find cannot change parent`.

Hashbrown's `packages/core/src/reducers/ag-ui-messages.reducer.ts` checks this
invariant at lines 902 and 1002 in the investigated revision. Do not remove
the invariant to make the integration appear compatible.

The inspected b4.run AG-UI `outbound.js` maps source message identities to
fresh generated IDs inside its stream-local `modelMessages` map. The runtime
replays the completed tool on resume, but the new stream supplies a new
parent. Published 0.15.0 retains the same mapping pattern by source inspection;
that observation is not an executed 0.15 reproduction.

Required resolution: stable logical assistant/tool-parent identity across
continuation streams, with a regression test through the actual Hashbrown
runtime. Preserve text/tool correlation as well as tool-call IDs. Do not
blindly discard replay events or add an application-side mutable ID cache.

## Blocker 2: output token cap

Both installed 0.14.0 and inspected published 0.15.0 `AgentConfig` expose model,
provider, reasoning, retries, recursion, delegation, tools, and prompt, but no
output-token limit. The adapter constructs the chat model from those supported
fields. Captured requests have none of `max_tokens`, `max_completion_tokens`,
or `max_output_tokens`.

The existing ATC provider caps every model request at 4096 output tokens,
including reasoning. A recursion limit bounds graph execution, not generated
tokens. A raw graph/workflow workaround is unsuitable: b4.run's client-tool
opt-in requires a supported `agent()` descriptor.

Required resolution: a supported descriptor/provider configuration that
preserves a server-owned output cap. Verify both the configured API path and
all browser tool continuations. A global fetch patch or a custom model-class
replacement was used neither as an application solution nor as evidence of
supported cap configuration.

## Version-specific schema and tool configuration

| Contract | Installed 0.14.0 | Inspected published 0.15.0 |
| --- | --- | --- |
| Read schema from | Top-level `hashbrown.responseSchema` | `forwardedProps.responseSchema` |
| Provider schema name | `hashbrown_response` | `b4_response` |
| Forwarded-property admission | Route list only | Per-key route map available |

The target design's modern mapping belongs with a coherent runtime version
that supports it. Continue pinning tools/schemas outside the runtime, before
envelope validation; route middleware still cannot establish that boundary.

For the static-manifest fetch probe, no workspace or marker capabilities
contribute tools. `delegation: { default: 'deny' }` is set, and the provider
receives only the offered client tools. Blindly denying every built-in name
does not work: `task` is reserved for delegation policy, and denying other
unavailable tools fails route preparation as unknown-tool references.

The 16 actual ATC tools pass the runtime's bounds: at most 32 tools, 1024
description characters per tool, 8192 parameter-schema bytes per tool, depth
8, and 32 KiB total tool block. Conversion can change the provider-facing
schema representation; this probe verifies acceptance and tool names, not
full semantic equivalence of every generated argument validator.

## Embedding, ownership, storage, and cleanup

**Embedding passed in-process.** The documented `@b4run/cli/fetch` API can be
called after an outer adapter constructs a new normalized `Request`. Static
modules and supplied stores avoid discovery/filesystem fallbacks. It exposes
`fetch(request)` and `close()`. Shutdown/cancellation was exercised. A separate
private service is not required by the embedding interface findings.

**Ownership passed at runtime.** `defineAuth` resolving an internal probe
principal plus `ownedThreads()` denies another visitor. The probe header is a
test seam, not a public authentication proposal. Real implementation still
needs a server-issued cookie whose authenticity is verified, and must strip
caller-provided identity headers. Cookie handling itself was not tested.

**Shared storage API exists; deployment remains unverified.** Published storage
exports include `postgresCheckpointer`, `createPostgresThreadsStore`,
`createPostgresPermissionsStore`, and `createPostgresClientToolCallStore`.
The fetch runtime takes checkpoint/thread/permission instances; client call
storage is `server.agui.clientToolStore`. No real Postgres or multi-instance
test ran, and no generated Vercel artifact was executed.

Recommended starting policy for later review:

- `clientToolTtlMs: 600000` (10 minutes).
- `clientToolRetentionMs: 86400000` (24 hours).
- Anonymous conversation admission expires 24 hours after creation; reload
  still starts a new thread immediately. This requires application policy,
  not an assumed built-in TTL.

The runtime opportunistically prunes settled/expired tool records, at most
hourly per store. Operators can run
`b4 client-tools prune --retention 86400000 --cwd <app-root>` with the matching
store configuration. This does not delete thread rows/checkpoint histories.

Thread deletion has supported APIs (`DELETE /threads/:thread_id`, thread
store deletion, and saver `deleteThread`), but there is no demonstrated
automatic thread TTL. Deletion is sequential and not transactional. It must
quiesce active work first and retry partial cleanup. Multi-instance cleanup
requires coordination; checking a process-local idle flag is insufficient.
An operational retention mechanism remains unresolved and is a deployment
gate; no scheduler was created by this investigation.

## Commands and limits of verification

- Repository/package inspection and public export import checks: exit 0.
- `npm view @b4run/cli@0.14.0 version dist.integrity dependencies --json`: exit 0 after network escalation; initial sandbox request failed DNS.
- Equivalent metadata reads for CLI/SDK 0.15.0: exit 0.
- `npm pack @b4run/cli@0.15.0 @b4run/sdk@0.15.0 @b4run/langchain@0.15.0 @b4run/ag-ui@0.15.0 --ignore-scripts`: exit 0; tarballs only, no install.
- Temporary esbuild bundle of active Hashbrown source: exit 0.
- Final probe: exit 1, 8 passing and 1 failing, as detailed above.

No React/Angular browser test, HTTP backpressure test, generated deployment
test, real-provider schema acceptance check, live eval, Postgres test, or
upstream regression suite ran. No application code changed, so package
build/test/lint commands were not run for this documentation-only result.

## Next work

Resolve the replay-parent identity and output-token configuration gaps in
b4.run first. Then select and explicitly approve any required dependency
changes, rerun the actual-runtime probe against that coherent package set,
and finalize anonymous retention and artifact packaging. Only after those
checks pass should Tasks 2–7 become executable application implementation work.

## Source-fix follow-up

The local b4.run branch `blove/atc-agent-compatibility` now contains commits
`3a05ec73a` and `ef984f37c`. Its complete source-built Hashbrown probe at
`/private/tmp/b4run-atc-probe/probe.mjs` exits 0 with 9 checks passing. The
actual Hashbrown runtime executes the browser actions once and retains its
narrowed schema; all 15 schemas and all 16 tool definitions reach the provider.
The new supported output cap reaches every provider continuation.

The b4.run fixes preserve parents and arguments during checkpoint replay,
including parallel dynamic subagents, and introduce validated
`agent({ maxOutputTokens })`. SDK, LangChain, and AG-UI suites pass 1609 tests;
102 focused CLI runtime tests pass. Build/typecheck/lint succeed with existing
lint warnings. Full CLI testing still has three macOS temporary-path assertion
failures and a watcher timing failure that passes in isolation. Website tests
pass 1090 with one skipped. The default inspector Turbopack build was restricted
by local port binding; its webpack build passed. This is source verification,
not a published-release or hosted Postgres/artifact verification.

The user will handle releases separately. Continue source implementation using
the coherent local packages, leave dependency manifests unchanged, and retain
the production package/storage/artifact gates described in the amended plan.


## ATC source implementation follow-up

The optional backend is implemented on Hashbrown branch
`blove/atc-b4run-backend`, using the local b4.run package overlay above.
`package.json` and `package-lock.json` are unchanged. OpenAI remains the default
and still calls `HashbrownOpenAI.stream.text` directly. Both frameworks use
Hashbrown's browser tools and components; the optional agent resumes their
results with the pinned schema and 4096-token cap.

Executed Nx checks (exit 0 unless qualified):

- `npx nx test atc-server`: 162 tests, 26 files, including real SQLite runtime
  continuation, parallel/partial/duplicate results, ownership and expiration.
- `npx nx build atc-server` and `npx nx lint atc-server`.
- `npx nx e2e atc-e2e`: 86 tests, including all four backend/framework pairs
  through real HTTP adapters, narrowed schemas and fresh threads after reload.
- `npx nx test atc-e2e`: 38 recorder tests; e2e lint and typecheck also pass.
- `npx nx build atc` with the default and `ATC_CHAT_BACKEND=b4run` selection:
  both package successfully. Isolated output smoke checks verify default
  startup without agent settings, runtime route denial and configuration
  mismatch. The b4.run build uses a private ESM staging app and the public CLI;
  its native function files are preserved by the outer adapter.
- Core build/lint and 1443 tests in 77 suites pass with
  `--testPathIgnorePatterns=tool-step.conformance.spec.ts`. The full test run
  fails because the local SDK 0.14 overlay lacks B4ToolStep/mergeToolStep APIs
  required by that existing conformance suite. This is not reported as a full
  core-suite pass. The minimal loading-selector change has focused regression
  coverage and passes the existing Stop tests.
- `git diff --check` and read-only code review complete without blocking findings.

Tooling emits existing color-environment and Rollup/Nx warnings; Node SQLite
also reports its experimental API warning. Generated staging files are ignored
by Git and ESLint. No application prompt changes required live model evals.

Remaining verification: compatible released packages, real shared Postgres
stores, generated-artifact ownership with those stores, and deployed-host smoke
tests. No live model, release, deployment, state cleanup, or scheduler ran.
The new real-backend browser cases do not independently exercise Stop/retry;
HTTP cancellation tests and the source compatibility probe cover that boundary.
Anonymous admission expires after 24 hours; physical deletion requires the
explicit offline operator cleanup documented in the ATC README.


## Released-package validation: 2026-10-24

The registry's latest coherent set is `0.15.1` (SDK published
2026-10-24 07:13:29 UTC). Direct CLI, core, Postgres storage and SDK pins and the
lockfile now use it. A clean `npm ci --ignore-scripts` installation under
`/private/tmp/atc-released-deps` replaced the source overlay for every check in
this section. No b4.run source package symlinks remain in the active installation.

**The release gate still fails.** The published SDK's `dist/agent.js` and
`dist/agent.d.ts` lack `maxOutputTokens`; `agent()` drops it. ATC's startup guard
correctly rejects this descriptor. The compatibility commits `3a05ec73a` and
`ef984f37c` are still on the local `blove/atc-agent-compatibility` branch, with no
tracking branch or upstream PR found. Do not bypass the cap guard or infer that
this release includes the locally validated replay fixes.

Executed with published packages:

- Full `npx nx test core`: **1515 tests in 76 suites pass**, including SDK
  tool-step conformance. No suite exclusion or local SDK overlay is needed.
- Core and ATC server build/lint pass. Core lint retains three existing unused
  variable warnings in `models/tool-step.ts`.
- Lifecycle build, 98 tests, lint, and isolated generated adapter checks pass.
- Default `npx nx build atc` passes, including isolated OpenAI artifact startup.
- ATC server tests: **156 pass, 6 fail**. All failures are agent construction
  through the expected output-cap compatibility guard.
- `ATC_CHAT_BACKEND=b4run npx nx build atc`: fails loading the authored agent
  through the same guard. This does not validate a released agent artifact.
- Recorder's 38 tests, e2e lint and typecheck pass.
- Full browser suite: **84 pass / 2 fail**. The optional b4.run cases fail at
  startup; the initial Angular failure timed out because its provider fixture
  remained open. The fixture now stops its mock and removes the temporary app
  directory when startup fails; a focused rerun reports the cap error promptly
  in both frameworks. The OpenAI backend and existing browser cases pass.

A disposable Docker Postgres 17 database was used for the new uncached
`ATC_TEST_DATABASE_URL=... npx nx test-integration atc-server` target: **3 tests
pass**. They prove separate pools see the same threads and checkpoints; partial
results stay pending; concurrent duplicate answers accept one result; failed
browser-result content persists; and offline checkpoint/thread cleanup remains
retryable and prunes expired call records. Tests use generated thread IDs and
require a disposable database because pending-record pruning is database-wide.
These are real shared-store tests, not complete agent continuation or HTTP
ownership tests. The disposable container was removed after validation.

Next: merge/release the local compatibility fixes, update pins again, rerun
agent/server/browser/build checks, then validate complete cross-instance agent
execution and generated-artifact ownership against Postgres. Finally configure
the intended hosted database/signing secret and run deployed-host smoke tests.
No upstream release, deployment, or existing user-state cleanup was performed.


## Registry 0.15.2 continuation: 2026-10-24

The user requested continuation after release 0.15.2. CLI, core, SDK and Postgres
storage pins/lockfile now use that coherent set, tested with a fresh
`npm ci --ignore-scripts` install at `/private/tmp/atc-0152-deps`.

The published SDK still lacks `maxOutputTokens` in both the descriptor builder
and its declarations. A direct registry-artifact probe reports
`{"releasedVersion":"0.15.2","capRetained":false}`. Server tests reproduce
156 passes / 6 failures at the unchanged compatibility guard. No cap bypass was
introduced. Complete browser and optional artifact runs were not repeated after
this decisive startup failure; the earlier matrix failures remain explained by
the same guard.

Checks with 0.15.2: the 3 real Postgres store tests pass; lifecycle build, 98
tests and lint pass; server build/lint and the default ATC artifact build pass
(including isolated OpenAI startup). The full core suite passes 1515
tests in 76 suites with `--runInBand`; its earlier concurrent run had one
5-second timeout in the existing 25-tool-round test. The temporary Postgres
container was removed after validation.

To remove the missing upstream prerequisite, the local compatibility branch was
rebased onto b4.run main at `014918499` and opened as **draft PR
https://github.com/cacheplane/b4run/pull/1101**, head `527bee1a1`. This includes
output-limit propagation and parent/argument replay fixes. Conflict resolution
preserves the newer tool-step metadata and reopens cancelled parallel tools
without clearing their replayed arguments. Its combined regression was observed
failing and then passing; read-only review has no remaining significant finding.

Upstream validation: CLI dependency graph builds; affected SDK/LangChain/AG-UI/
CLI typecheck and lint pass with existing warnings. SDK has 264 passing tests;
AG-UI broad run has 702 passes plus a TypeScript compiler timeout that passes
on focused rerun (6 tests); Angular has 185 passes. Model-adapter broad run has
579 passes plus a Mistral-import timeout that passes on focused rerun (17
tests). CLI expanded focused run has 57 passes and 3 unchanged macOS `/tmp`
versus `/private/tmp` artifact-boundary failures. The broad CLI run was stopped
after overload-related timeouts; full repository CI and production boundaries
are not claimed as locally passing. The draft records these limits.

Next prerequisite is review/merge/release of that upstream PR, followed by pins
and complete agent/Postgres/generated-artifact checks. No release or deployment
was performed; the user's original b4.run working checkout remains untouched.


## Release and generated-artifact continuation: 2026-10-25

Upstream PR [#1101](https://github.com/cacheplane/b4run/pull/1101) merged as
`dec5fefb2e59c020784e1f39e1a78528ed05c81f` after the complete CI run passed,
including source validation, the release controller, generated harnesses,
CopilotKit examples, and the native Vercel boundary.

The `v0.15.3` tag exists, but its release preparation failed and npm still reports
0.15.2. The failed candidate also predates the output-cap fixes. Reproducing its
immutable package preparation found an optional LangGraph peer pinned to
`1.4.17`, conflicting with the compatible `1.5.2` resolution elsewhere. Main
already includes the compatible peer-range correction; a complete local
preparation smoke on the compatibility branch passes clean install, TypeScript,
and scaffolding using only a disposable loopback registry. No existing release
tag was changed and no public package was published by this validation.

The new opt-in Postgres suite passes **8 tests** with compatible source packages,
including an agent parked by one runtime and resumed by another independent
pool, denied visitor ownership, and unchanged response schema/output cap.

The generated Vercel artifact initially returned `503 client_tool_store_unavailable`.
The generated factory omitted the client-tool store, and the runtime did not
accept one through its request-owned stores. Upstream follow-up
[PR #1106](https://github.com/cacheplane/b4run/pull/1106) adds that override and a
Postgres client-tool store sharing the request pool, migrations, and namespace.
Both regressions were observed failing before the fix; **143 affected tests**,
CLI build/typecheck, and lint pass (38 existing lint warnings). Review found no
significant issues. Full upstream CI is pending.

With that source fix, `npx nx test-artifact atc-server` passes against disposable
Postgres. It executes two isolated copies of the actual built Vercel function:
a browser call parks on the first and resumes on the second using a signed
visitor cookie. A different visitor is denied, duplicate results do not restart
the provider, raw runtime endpoints remain hidden, and both provider requests
retain the pinned schema and 4096-token cap. The generated model uses OpenAI
Responses, so this HTTP fixture emits Responses streaming events and asserts
`text.format.schema` and `max_output_tokens`; the source runtime fixture exercises
Chat Completions. No live model request or hosted deployment is involved.

ATC server build and lint pass; its normal suite passes **162 tests with 1
Postgres-only test skipped**. The complete Angular/React browser suite passes
**86 tests**, covering both backends. Review tightened both continuation tests
to assert that the exact browser result reaches the provider and the final
structured answer reaches the AG-UI stream; both Postgres checks still pass.
Lifecycle source-overlay validation stops at its explicit version guard
(expected pinned CLI 0.15.2, source CLI reports 0.15.3); this is not a lifecycle
build pass and will be repeated after the registry pin update. The optional ATC artifact build passes with the
known staging dependency advisory and environment color warnings. These are
source-package results, not validation of the incompatible 0.15.2 pins.

Next: merge the follow-up after required CI, refresh and validate the version PR,
release through the supported controller, install the new registry package set,
and repeat server/browser/build/Postgres checks. Hosted smoke validation still
requires deployment configuration and remains separate from local evidence.


### Upstream merges and release arbitration

PR #1106 merged as `b8024a6f9dd7ec48895b34ee61d6f3b8fa092c56` after complete
CI passed on corrected head `eafdcba0167e89ab754e40a6244e2a7941bc19f2`.
The first full run had 12,642 passes and one stale expectation in the real
Hono/Postgres roundtrip: the new fourth store acquires four migration locks,
while that test separately expected three. The exact-count assertion was updated;
the actual emitted Hono app passed locally against disposable Postgres and its
WebSocket proxy, then the corrected full CI passed, including native Vercel.

The refreshed Version Packages PR #1105 targets 0.15.4 and includes both merged
compatibility fixes plus the peer-range correction. Its initial normal CI passed;
it must refresh after recovery merges and pass on its final head before merging.
It has not been merged or published.

The release controller's arbitration selects older unfinished tagged candidates
before a newer version candidate. The preserved observation for failed run
`40195141825` identifies 0.15.3 at
`2ef24c2453b031e068e99ced4cc57355f49e63d6` as `CANDIDATE_TAGGED`, with the next
transition `prepare-artifacts`, no Release or assets, and no registry mutation.
Its prepare job failed and its npm publishing job skipped. The annotated tag
object is `8221db88b2936394254847bcf220bcacb474cff7`. A fresh registry sweep
at `2026-10-25T15:44:38.456Z` returned 404 for all 21 exact 0.15.3 package versions.
A second sweep at `2026-10-25T15:45:57.664Z` again returned 21 exact-version
404s, more than sixty seconds after the first. These are diagnostic observations,
not a synthetic terminal record. A full scheduled read-only controller observation
was stopped after six minutes without a report; the arbitration conclusion comes
from the controller source and the preserved failed-run observation above.

The live release workflow exposes reconciliation only. Its documented terminal
recovery command and committed-record schema cover an older escrowed-draft
case, not this tag-only preparation failure. No tag was deleted or moved, no
terminal evidence was invented, and no release-control rule was bypassed.
The narrow recovery design is approved and implemented in
[b4.run PR #1107](https://github.com/cacheplane/b4run/pull/1107). It adds a Git-only
terminal record restricted to this exact incident, a read-only evidence collector,
and a nonterminal hold preventing the new controller from retrying the old tag
before a separately reviewed production record is merged. Local validation
passes all 4,057 release-controller tests. No production terminal record has
been committed yet.

CI exposed an unrelated Docker test assumption twice: independent cached builds
were required to have equal OCI index IDs despite changing provenance
attestations. The test correction compares validated recipe inputs and runtime
contents, verifies both immutable image bindings, and preserves production
identity and provenance behavior. Both affected Docker tests and all 1,412
example unit tests pass locally, as do build, typecheck and lint. Final-head CI
is running at `a5decb4b160910d75029f098f58c31c5135741df`.

After the code merges, all release-owner attempts must settle before fresh
evidence is captured from that exact reviewed SHA. The separate record-only PR
must pass CI and receive an independent evidence recheck immediately before
merge. Then refresh and merge the 0.15.4 version PR and use the ordinary release
workflow. Keep Hashbrown's registry pins unchanged until that release is
published and independently audited.

A fresh clean registry-only install also passes all 1,515 core tests, core
build/lint, lifecycle build/98 tests/lint, and the default OpenAI ATC build.
The workspace uses that registry install again; source-package evidence remains
separate from released-package validation.
