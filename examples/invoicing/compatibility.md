# Invoicing compatibility checkpoint

## Generated ledger and session overlay — September 19, 2026

The sample ledger is now generated from a fixed seed instead of a hand-written
fixture. It covers twelve clients across USD, EUR and GBP, each with a payment
profile that shapes how its invoices are settled. The five scenario rows and
their ids are unchanged and remain the only unapplied cash ($13,900), so the
seeded browser and live e2e flows still target the same payments. Record
counts are no longer fixed; tests assert relative to the generated baseline
rather than against literal totals.

Sessions store an overlay over a shared base ledger rather than a full ledger
copy. A row written under the old shape is treated as a reset and normalizes
to an empty overlay one generation later, so existing session rows need no
migration. The assistant's `readLedger` tool withholds the raw payment and
invoice rows, returning only the derived sections and the `customerId` filter,
until query-shaped tools land in a later PR.

## Lost approval response recovery — September 15, 2026

The deterministic browser suite now includes a fourth scenario. Its test-only
scripted transport prepares a real session-owned proposal and applies it through
the real coordinator/store after the browser approves. Playwright waits for the
server response, then discards it with a connection-reset error. The first
operation-result read also returns 503.

The browser must hold chat and new reviews while the outcome is unconfirmed.
The test verifies exactly one committed allocation/activity, then restores
operation reads and clicks “Check allocation result.” The existing client
recovers the recorded snapshot, updates displayed balances, and unlocks chat.
It sends no second approval and leaves the committed snapshot unchanged.

This is application-level recovery coverage, not a verification of B4 interrupt
authorization or B4 transport recovery. The scripted approval mode exists only
in the separate browser-fixture process. Production code is unchanged.
Independent review found no blockers. All four browser tests pass (12.6 seconds),
as do e2e build/lint and server build/lint/93 tests. Only existing terminal
color warnings were emitted.

## Deterministic browser edge cases — September 15, 2026

`npx nx example-e2e invoicing-e2e` runs three model-free browser scenarios against a
separate process on ports 4329/4330. The process uses the real seeded session
store and HTTP reads; its agent route deliberately returns HTTP 503. It does
not instantiate B4, load credentials, or contact a model.

Coverage checks explicit ambiguous invoice selection, clearing that choice
when switching to a combined payment, preventing advance-payment reviews when
no invoice is outstanding, and retiring an initial failed review so chat and
a fresh review thread become available. Retry requests preserve both selected
payment and invoice IDs. Each case compares the complete authoritative ledger
snapshot before and after. These tests complement the published B4 live test;
they do not certify successful approvals or post-approval disconnect recovery.

All three browser checks pass (15.2 seconds), alongside e2e build/lint and
server build/lint/93 tests. Independent review found no blockers. Existing
terminal color warnings remain.

## Published B4 and Zod 4 integration — September 15, 2026

The server now pins npm-published `@b4run/sdk`, `@b4run/langchain`, and
`@b4run/cli` at 0.8.34 in a private workspace. The lockfile records registry
artifacts and integrity hashes. Temporary agent workspaces resolve the installed
packages individually, supporting npm's nested or hoisted layout. The obsolete
local B4 linker was removed. Historical source-build checkpoints below remain
as records of earlier verification.

The root dependency is now Zod `^4.6.5` (locked to 4.6.5), satisfying B4's Zod 4
peer. The redundant `zod-v4` alias and unused direct `zod-to-json-schema`
dependency were removed. AG-UI retains its own transitive Zod 3 dependencies;
its canonical input and Hashbrown's Zod 4 extension are validated separately.
Explicit internal action payload types keep declaration generation portable;
the core API report has no public changes.

Verification passes: core build/lint/API report and 1,031 tests; runtime smoke
42 tests/typecheck/lint; invoicing server, React, and contracts build/test/lint
(133 tests); e2e build/lint; Spotify server build; smart-home production build
and lint. The smart-home dialogs load on demand, reducing its initial bundle
from 1,207.33 to 1,073.51 kB and preserving its existing error budget. Both
dialogs were opened successfully in the production browser.

The published-package live-model test passes in 1 minute 38 seconds with real
gpt-5-mini interactions: initial ledger question, approval, cancellation,
subsequent approval, updated ledger question, and session isolation. Both
preview processes were restarted after installing the published packages.
Earlier attempts failed: one overlapped hot reloads during the migration; a
second received an assistant error before allocation, whose cause was not
captured. An isolated diagnostic then completed successfully, followed by the
full passing run with failure tracing enabled. These results verify the flow,
but do not establish absence of intermittent model/runtime failures.

Remaining warnings include the invoicing Vite chunk-size warning (approximately
1,001 kB), smart-home's 500 kB warning and existing recurrence utility lint
warning, existing API release-tag and terminal color warnings. Dependency
installation reports 58 audit findings (22 moderate, 36 high); this migration
does not remediate the full repository audit. Dependency resolution and a
lockfile-only `npm ci --dry-run --ignore-scripts` check pass; this is not a full
clean-install verification.

## Seeded application and usable conversation — September 15, 2026

The application now uses a deterministic October 2024–September 2026 ledger
(as of September 15, 2026): 150 invoices, 149 payments, and 144 historical
allocations for six consulting clients. Five unapplied scenarios total $13,900:
exact, partial, combined, ambiguous, and advance payments. Production sessions
use this seed; the original tiny ledger remains a focused regression fixture.

Selection is now context-only. Read-only conversation is available immediately,
and an explicit matching action creates a fresh, separately authorized review.
Multiple outstanding invoices require a user choice. Combined payments are
applied sequentially with separate approvals. The canonical design records
these current scope adjustments. Shared ownership guards prevent B4 thread
reuse across session, route, or reset generation.

The assistant reads server-computed totals and monthly figures. Trusted response
components render plain text and validated payment-review suggestions; that
route exposes no financial mutation tools. Completed reviews are inert, failed
initial runs retire safely, and unknown approved-operation results keep new
matching blocked until reconciliation. Independent review approved these
boundaries after lifecycle regression fixes.

Build/test/lint pass for server (93 tests), React (37), and contracts (3):
133 tests total. The new live-model Nx target has build/lint checks and rejects
missing credentials. Vite reports an approximately 944 kB minified chunk and
terminal color warnings remain. See the later verification entry for final
real-model browser results. The app still uses the fixed local B4 source build;
this does not certify published 0.8.34 artifacts.

## Final seeded browser verification — September 15, 2026

`INVOICING_ENV_FILE=/path/to/.env npx nx live-model invoicing-e2e` passes
with actual gpt-5-mini interactions (final run: 1 minute 39 seconds). The test
asserts 150 invoices/149 payments/144 historical allocations; asks about the
$13,900 unapplied total before selection; approves Northstar's $2,400 payment;
declines Cedar's partial payment without mutation; retries Cedar in a new review
and approves $2,000, leaving its invoice at exactly $3,000; then requires a new
assistant answer reporting three remaining unapplied payments. A separate
browser session retains 144 historical allocations and receives 404 for the
other session's operation. No real money moves.

The first browser attempts revealed test synchronization assumptions about old
disabled approval buttons and intermediate streamed text components. Assertions
now wait for the new review and completed semantic output. Final source passes
all 133 unit/integration tests, application build/lint targets, and e2e
build/lint/live-model targets. Missing credentials were separately verified to
fail explicitly. Independent review approved the final code and test assertions.

## Working local application — September 15, 2026

The user approved proceeding with the fixed local B4 build while published
artifact integration remains pending. The React app now mounts real Hashbrown
chat and the trusted proposal component. Explicit Pretable selection starts the
review; approval applies the server-owned proposal and refreshes the snapshot.
The runtime uses public B4 APIs and a fresh temporary workspace per server
process, keeping thread history and ledger lifetimes aligned.

`link-local-b4.mjs` reproducibly prepares built SDK, LangChain, and CLI packages
without changing manifests or lockfiles. Tested source includes the #663 fix
at `45084977`; its package metadata remains 0.8.33. This does not verify the
published 0.8.34 distribution. See README for startup and credential setup.

Live gpt-5-mini browser approval produced exactly one allocation, reduced both
remaining balances from $2,400 to $0, and preserved selection across navigation.
The flow made two agent HTTP requests: initial review and approval resume.
A separate fresh browser declined successfully, leaving zero allocations and
both balances at $2,400. That session could not read the approved session’s
operation (404), and its ledger stayed unchanged. These checks use actual
models, not recorded responses.

Build/test/lint pass: server 81 tests, React 30, shared contracts 3 (114 total).
Independent code review found no blockers; the shutdown sequencing follow-up
was addressed. Vite reports an approximately 936 kB minified chunk; terminal
color warnings remain. Automated Nx browser targets and broader live failure
scenarios remain outstanding, as do published-package verification, the full
seed dataset, and retirement of old examples. Earlier sections below are dated
historical checkpoints and do not describe the current mounted application.

## Chat and route composition — September 15, 2026

Version PR #664 merged as `82fc1fa69ec4a568a5f1734cc83750a3090654c6`.
The registry now exposes 0.8.33, but its release recovery is still running and
0.8.34 has not been installed. The queued controller must finish the preceding
release before advancing the new version.

The HTTP listener accepts an optional guarded B4 listener and forwards only
POST `/agui/%2Freview%23agent`. Alternate agent routes and general thread APIs
return 404; GET on the canonical route returns 405. All 76 server tests pass,
with build/lint passing and independent review approving the boundary. A probe
using the composed listener and fixed built runtime still creates exactly one
approved allocation (`work/probes/invoicing-composed-listener.mts`).

`ReviewChat` uses real Hashbrown hooks and the shared proposal component. Its
imperative `startReview(paymentId)` method is intended for the grid selection
event, preserving select-then-approve without a third click or a render-triggered
request. This proof runtime binds one payment to one thread and refuses another
payment; switching threads for a larger seeded dataset remains future work.
The component is not yet mounted in `App`.

The chat verifies proposals by session-owned thread lookup, holds new messages
while approval is pending, captures the original interrupt batch, and submits
identity-only state before once/cancel resume. It updates balances only after
reading the matching approved operation result. Failed cancellation remains
unconfirmed; an approval whose stream errors still checks the recorded result.
Client tests use a controlled transport through actual Hashbrown parsing and
rendering. They are not a substitute for the pending live B4 browser check.

React build/test/lint pass with 29 tests (12 new chat cases). Combined with
76 server tests and 3 unchanged shared-contract tests, coverage totals 108.
The existing Vite chunk-size and terminal-color warnings remain.

## Published integration preparation — September 15, 2026

B4 PR #663 merged as `58436723ac0857cb6a8985a33c1b8cc322ef972a`.
[Version PR #664](https://github.com/cacheplane/b4run/pull/664), head
`ba8c0d19fefe307d2ffeb8d14bf598296b05c426`, contains the expected 0.8.34 release
metadata and this fix. Its bot-created workflows required GitHub approval;
those runs are now approved and auto-merge is enabled, pending required CI.
The 0.8.33 recovery publisher is still active, and npm does not yet expose
`@b4run/cli@0.8.34`. No unpublished dependency has been installed into this app.

The application now shares `allocationProposalConfig` and
`invoicingUiResponseSchema`. A regression compares the real React
`exposeComponent` / `useUiKit` output with the server schema. The model can
supply only `proposalId`; amounts and decision controls are not model props.

`createReviewMiddleware` supplies request-bound server tools after validating
the session cookie and coordinator input. It reads the selected payment and
related invoices from the ledger, prepares by invoice ID using the smaller of
the current unapplied and outstanding balances, and applies by stored proposal
identity. Browser/model-supplied amount fields never determine the allocation.
Missing/ambiguous sessions are rejected, and reset invalidates tool reads.

All affected projects pass build/test/lint: 75 server, 17 React, and 3 shared
tests. Independent review approved this integration preparation. The new tool
bridge also passes the real HTTP approval probe against the fixed built B4
worktree (`work/probes/invoicing-middleware.mts`): one approved allocation,
forged interrupt 409, and `always` 422. This remains source-build evidence.

Next gates are installing and inspecting published 0.8.34 artifacts; composing
the B4 listener with the session HTTP listener; mounting the shared component
and owned interrupt batch in chat; refreshing from the recorded operation
result; and running deterministic plus live-model browser approval/cancellation,
stale-state, retry, and session-isolation checks. The local preview still has
chat disabled until this wiring and verification are complete.

## Middleware context checkpoint — September 15, 2026

The HTTP listener now supports coordinator-backed `GET /api/reviews/:threadId`
reads. This ties the displayed proposal to the owned conversation as well as
the cookie session. A real HTTP regression covers successful reads, foreign or
missing threads, reset generations, and rejected writes. Server build/test/lint
pass with 71 tests; independent review found no issues. The running snapshot-only
bootstrap does not supply a coordinator yet.

A deterministic probe using the previously built B4 worktree reached a real
approval interrupt with no ledger write. A forged interrupt was rejected with
409, and `always` was rejected with 422. Valid resume exposed another upstream
issue: the compiled graph reused the initial middleware context and the
application guard rejected execution with `approval_required`. The agent then
finished successfully, which reinforces why completion must be verified from
the operation result and ledger rather than the stream outcome alone.

The B4 cache is keyed by agent descriptor and checkpointer while tool callbacks
capture middleware context. A generalized upstream fix is in progress to skip
that cache when middleware context is supplied. Evidence is in
`work/probes/invoicing-runtime-guard.mts` and its event/log files. B4 0.8.33 has
reached npm publication but does not include this newly identified correction.

The correction is now [B4 PR #663](https://github.com/cacheplane/b4run/pull/663),
commit `45084977` on `blove/middleware-context-cache`. Five new regressions failed
before the fix and pass afterward, including a real LangGraph/MemorySaver resume
with fresh JSON context and retained conversation history. All 231 langchain
tests, full workspace build, package typecheck, and changed-file lint pass.
Independent review approved the fix; package lint retains ten existing warnings.

The HTTP ledger probe also passes against that built worktree: valid approval
applies exactly one allocation and clears the $2,400 payment/invoice balances;
cancellation leaves both balances unchanged; forged and `always` requests stay
rejected. Fixed-probe evidence is in `work/probes/invoicing-runtime-guard-fixed.mts`
and the corresponding approval/cancellation logs. This is built-source evidence,
not published-package or live-model browser verification. The canonical app's
chat remains disconnected until the required fixes are published and integrated.

## Review guard — September 15, 2026

The application now has a dependency-free server review coordinator. It binds
an opaque B4 thread to one session, payment, and session generation; validates
the exact nested `hashbrown.responseSchema`; and stores one immutable proposal
per thread. Tools will receive server-only capability tokens, never authority
from browser-supplied financial values. Reset invalidates existing capabilities.
The HTTP API now exposes session-owned `GET /api/proposals/:proposalId` reads.

Resume validation accepts one `once` resolution or cancellation and requires
the stored proposal ID/version, operation ID, and generation. It rejects
`always`, foreign sessions, changed selections, client tools, and forwarded
configuration. The coordinator is not yet wired to B4: B4 must validate the
actual pending interrupt before invoking its `apply` method. A requested `once`
payload alone is not proof of approval. Cancellation prevents application but
does not currently record a domain decline through this coordinator.

B4 0.8.32 has completed publication and release verification. The 0.8.33
release was resumed for commit `dd1c4c7c9e1aacaf079c18aef71bcdc81f5d5ebe` in
[run 35011826236](https://github.com/cacheplane/b4run/actions/runs/35011826236),
which completed tagging and dispatched
[the tagged publication run](https://github.com/cacheplane/b4run/actions/runs/35012545387).
Registry installation of 0.8.33 remains pending.

The React allocation proposal card is implemented independently of chat. Its
only model-facing prop is `proposalId`; displayed financial values come from
application-owned, server-verified context. Missing or mismatched proposals
expose no actions. Decisions are disabled unless the parent identifies the
matching pending review, and callbacks carry no model-controlled arguments.
The card is not yet mounted in the application or connected to an interrupt.

Build, test, and lint pass for both affected projects: 70 server tests and
16 React tests. Independent specification and code-quality reviews approved
both pieces without findings. Existing Vite chunk-size and terminal-color
warnings remain. The tagged B4 release has passed detection and tagging and
is preparing its package payload; publication is not yet verified.

## React and HTTP scaffold — September 15, 2026

The real Pretable 0.19.0 React and UI packages are declared directly; the
matching core package is installed transitively. UI supplies public CSS imports. Dashboard and Payments now read the live local
snapshot endpoint, preserve payment selection across navigation, and show
related invoices beneath the grid. The open Assistant sidebar explicitly keeps
messaging disabled until B4 is connected. Browser checks verify select,
navigation, preserved selection, clear, unchanged ledger balances, and exactly
one bootstrap snapshot request under React StrictMode. Eight React tests include
multi-row checkbox selection and per-bootstrap request sharing. The shared
contracts project has a type-checked identity-only approval contract test.

HTTP reads assign/reuse an opaque HTTP-only SameSite session cookie and scope
operation results to that session. Four HTTP tests cover cookie reuse, session
isolation, malformed paths, and rejected writes, bringing server coverage to
33 tests. Shared DTOs moved to an actual `invoicing-contracts` Nx library so
client imports respect module boundaries. No Hashbrown library APIs changed. Final build/test/lint passed for all three
projects: 33 server tests, 8 React tests, and 1 shared-contract test. The final
browser check independently observed one snapshot request and preserved
selection. Evidence is in `work/probes/invoicing-shell/final-browser.log` and
`payments.png`. The browser's only console error was a missing favicon; request
listener instrumentation closed two CLI sessions, so the final successful check
used the browser's Resource Timing entries instead. Local UI/API servers remain
running for review at http://127.0.0.1:4326.

B4 0.8.32 publication twice exceeded the publisher's overall verification
deadline while npm gradually exposed accepted packages. The queued 0.8.33 run
reported `ATTEMPT_COVERAGE_INCOMPLETE` / `PUBLISHER_JOB_HISTORY_INVALID` while
observing the preceding release. A separate recovery run is active; this task
has not bypassed release checks or started a competing publisher. Registry
latest CLI is now 0.8.32; 0.8.33 remains unverified and is still required.

## Registry release checkpoint — September 15, 2026

The published `@b4run/cli`, `@b4run/ag-ui`, and `@b4run/langchain` 0.8.31
artifacts predate the merged request-body and message-framing fixes. Do not use
that version for the application proof. Release PR [#661](https://github.com/cacheplane/b4run/pull/661)
was reviewed and merged as `dd1c4c7c9e1aacaf079c18aef71bcdc81f5d5ebe`, preparing
0.8.33. All release-PR CI checks passed; the advisory Claude review could not
run because the Anthropic account had insufficient credits. Independent review
found only the expected version, changelog, changeset, and chart metadata edits.
Publication has not yet been verified. The connected proof below still uses
the built isolated B4 worktree. No registry installation is claimed.

Pretable 0.19.0 passed strict TypeScript and SSR checks against its published
React/core/ui artifacts with React 19.2.8. Public imports are `PretableSurface`
and `PretableColumn` from `@pretable/react`. Its controlled checkbox API is
`state.rowSelection = { kind: "explicit", rowIds }` with
`onRowSelectionChange`; cell-range `state.selection` is a separate mechanism.
`ariaLabel` is required. A real Playwright browser check selected the checkbox
and observed `["payment-001"]`, then cleared it and observed `[]`; the formatted
$2,400.00 payment remained visible. Strict typechecking passed again. Evidence
is in `work/probes/pretable-selection/browser-assertions.log`, `selected.png`,
and `cleared.png`. The temporary browser and Vite server were stopped; the only
console error was a missing favicon. This verifies the grid contract separately
from the connected B4 proof, not a completed invoice application.

## Ledger foundation — September 15, 2026

The server now implements pure ledger transitions and an isolated in-memory
session store. The proof has one 240000-cent payment and invoice. Stored
proposals retain authoritative cents, record versions, proposal version,
operation identity, and session generation. Duplicate decisions return recorded
results; conflicting decisions, stale records, reset generations, and foreign
session references fail without extra allocations. Store outputs are copied.

All 29 tests pass, including concurrent delivery, forged decision identity,
changed record currency/customer, and operation-result isolation. Server build
(type-check only) and lint pass. The environment emits a `NO_COLOR` /
`FORCE_COLOR` warning. The sample README describes commands and limits. This
stage does not implement HTTP cookies, B4 thread ownership, or the browser
approval-to-allocation flow; those remain required before application completion.

## Selected application imports

The planned direct dependency set is `@b4run/cli`, `@b4run/sdk`,
`@b4run/langchain` (0.8.33 once publication is verified), and
`@pretable/react` (0.19.0). These are the user-authorized B4 and Pretable
integrations; no additional package is needed for the model factory.

- `createRuntimeRequestListener` from `@b4run/cli/runtime` owns the B4 HTTP route.
- `agent` and `B4ToolContext` from `@b4run/sdk` define the agent and tool context.
- `createChatModel` from `@b4run/langchain` creates the nested provider model.
- `PretableSurface` and `PretableColumn` from `@pretable/react` render payments.

A live `gpt-5-mini` call through the public `createChatModel` factory, using the
built B4 worktree, accepted the preserved Hashbrown schema through
`withStructuredOutput(schema, { method: "jsonSchema", strict: true,
name: "record_ui" })` and returned the expected `RecordCard` record ID.
Evidence: `work/probes/b4-public-model-factory.log`. This replaces the probe's
need to directly import a model constructor from a resolved transitive package
path. The factory returns `unknown`, so the sample must validate the structured
model interface before use. Keys remain server-only; no credentials were copied
into application files. Registry execution remains pending.

## Connected browser proof — September 15, 2026

The React `useUiChat` facade now has an executed direct-HTTP proof against B4,
without transcript replay. A temporary Vite page used `HashbrownProvider`, two
exposed `RecordCard` components, and selection state `{ selectedRecordId:
"record-1" }`. B4 middleware compared the browser's supplied UI schema against
the expected generated schema, checked the selection ID, and passed the accepted
schema through existing middleware context to the nested model calls. Both the
initial request and resume passed this validation.

Two runs passed: first with deterministic root orchestration and live nested
models, then with a live `gpt-5-mini` root agent and live nested models. The root
agent requested generation, then paused before `applyReview`; the browser showed
two cards and one approval. Clicking **Approve once** submitted Hashbrown's
current batch with B4's `once` decision. The approval cleared, the runtime became
idle, and exactly the same two cards remained with no runtime error. The live
root returned an empty UI envelope after the operation; that final response was
prompt-directed, whereas nested UI generation used provider-enforced schemas.

Playwright observed the approval state and asserted the settled card count,
record IDs, cleared approval, and absence of runtime errors. Server observations
recorded exactly two requests, two validated schemas, and the selected ID. The
proof uses synthetic records and a string-returning operation; it does not prove
financial mutation idempotency, durable recovery, or authorization policy.

Artifacts under `work/probes/connected-ui/` include the browser fixture,
`live-root-approval.png`, `live-root-assertions.log`, and
`live-root-server-observations.json`. B4 scripts are
`work/probes/agent-connected-ui.mjs` and `agent-connected-live-root.mjs` in its
isolated worktree. Temporary servers were stopped after verification.

Remaining before the canonical sample: Pretable selection, the invoice/payment
ledger and immutable proposal contract, real operation idempotency, and the
approved Dashboard/Payments shell. Cancellation, disconnect/reload recovery,
and provider refusal/error behavior need dedicated scenarios. No production
library or application manifests were changed by these probes.

## Upstream follow-up — September 15, 2026

Current B4 main (`0003db28`, inspected in an isolated worktree) has completed
the package rename. Registry metadata now reports `@b4run/sdk`, `@b4run/cli`,
and `@b4run/ag-ui` at `0.8.31`. The older Dawn artifacts below remain the
evidence for the September 14 probe, not the current installation recommendation.

[B4 PR #657](https://github.com/cacheplane/b4run/pull/657) adds a generalized
`MiddlewareRequest.body?: unknown` snapshot on POST execution requests.
Applications can validate request fields and use existing `allow(context)`
to pass selected data to tools. The snapshot is detached; it does not merge
client state into checkpoints or make arbitrary extensions runtime options.
This follows the user's requirement to improve B4 for all clients without
solution-specific public integrations.

Further source tracing corrected the preliminary custom-tool recommendation.
A tool can own a schema-constrained model call, but that alone does not establish
a supported way to stream its result as assistant UI before interruption:

- `packages/langchain/src/agent-adapter.ts` rejects reserved event names,
  including `token`, from capability events.
- `packages/langchain/src/tool-converter.ts` invokes a tool's stream transformer
  only after its result resolves. An interrupt inside that tool prevents this
  emission until resume.
- `packages/ag-ui/src/outbound.ts` ignores unknown capability chunks after
  closing any open text message.
- `packages/cli/src/lib/runtime/execute-route-core.ts` registers built-in
  capabilities explicitly; an application capability-registration API was not
  found. Non-agent execution does not provide the same incremental streaming
  and interruption bookkeeping.

The Node and HTTP probes below establish ambient nested-model callback
propagation in the tested composition. They also expose a concurrent-message
framing defect. Cross-runtime support remains unverified. A second generalized
change requires a design that addresses event ownership and framing without
exposing application-specific output hooks.

PR #657 squash-merged on September 15, 2026 as `9e3c42e2` after current-head
CI passed, including `validate`, CopilotKit examples, and native Vercel checks.
Copilot findings were addressed in `fbfbe188`. The advisory Claude review could
not run because its Anthropic account had insufficient credits. The original
application compatibility milestone remains incomplete until actual B4,
Hashbrown, and Pretable execution is demonstrated.

## Concurrent-message fix — September 15, 2026

A generalized B4 fix merged in [PR #660](https://github.com/cacheplane/b4run/pull/660)
as `a239527d` on September 15, after required CI and the retried chart smoke
check passed. The original commit was `18596557` on
`blove/model-message-framing`, based on current main `eebd57f0`. It carries model
invocation identity alongside existing string tokens, emits model completion,
keeps concurrent AG-UI messages separate, and preserves identity when live-turn
snapshots coalesce tokens. Legacy anonymous tokens and raw SSE string payloads
remain compatible; no new author configuration or dependencies were added.

A deterministic HTTP regression failed before the fix (one message instead of
two) and passes afterward: two independent valid JSON messages, approval, and
successful `once` resume without regenerated JSON. The affected suites passed
201 AG-UI, 226 LangChain, and 1816 CLI tests, with four existing CLI skips. Root
build, typecheck, lint, and docs contract checks pass; upstream CI passed. The advisory Claude review was unavailable because of
insufficient Anthropic credits; no Copilot findings were posted. Independent spec and code reviews approved.

A follow-up Node/tsx probe replayed the fixed B4 HTTP transcript through
Hashbrown's actual `createChatRuntime`, with a Skillet object schema. It asserted
two distinct parsed records, no runtime error, and one retained pending approval
interrupt. This is recorded-event integration: only the request run/thread
identity was adapted for the replay. The transcript also contains empty assistant
entries associated with tool frames; final UI presentation has not been tested.
Reproduction: `work/probes/b4-hashbrown-parser.mts` and its log in this Hashbrown
worktree; B4 transcript under its `work/probes/` directory.

This establishes basic structured parsing across the corrected message framing.
An actual exposed-component UI schema, React rendering, and a live
provider-enforced structured response remain unproven. The canonical application
is still gated on that compatibility milestone.

## Exposed-component rendering proof — September 15, 2026

A second B4 default-HTTP probe generated two concurrent UI envelopes containing
`RecordCard` with a `recordId` prop, then paused at the existing approval gate.
The models were deterministic fixtures. The recorded events were replayed into
Hashbrown `createChatRuntime` using the schema generated by its UI kit from a
React `exposeComponent` descriptor. The public React `useUiKit` hook rendered
each parsed envelope using `renderToStaticMarkup`.

Assertions pass for two distinct rendered cards (`record-1` and `record-2`), no
runtime error, and one retained approval interrupt. This exercises the actual
component schema, structured parser, and React rendering hook. It does not test
browser hydration, the complete `useUiChat` facade, Pretable interaction, or a
live provider's enforcement of the response schema.

Reproduction artifacts in this Hashbrown worktree:

- `work/probes/b4-hashbrown-ui.mts` — run with
  `npx --no-install tsx --tsconfig tsconfig.base.json work/probes/b4-hashbrown-ui.mts`.
- `work/probes/b4-ui-response-schema.json` — generated provider schema.
- `work/probes/b4-hashbrown-ui.log` — assertions and parsed messages.
- `work/probes/b4-hashbrown-ui.html` — server-rendered React output.

The source B4 transcript and script are under
`/Users/blove/repos/dawn/.worktrees/model-message-framing/work/probes/agent-http-ui*`.
No application manifests, dependencies, or library code were changed.

The user identified `/Users/blove/repos/hashbrown/.env` as the credential
source. Its key was loaded only into the probe process and was not displayed,
written into generated application files, or committed.

The live variant passed on September 15: two concurrent `gpt-5-mini` calls used
LangChain `ChatOpenAI.withStructuredOutput` with the generated UI schema,
`method: "jsonSchema"`, and `strict: true`, targeting the real OpenAI endpoint.
Each returned one valid `RecordCard` for its requested record. Their text chunks
interleaved on the wire, but remained independently valid per message ID. B4
paused before the separate approved operation and completed a `once` resume.
Root-agent orchestration still used deterministic aimock fixtures (three root
requests); the two nested schema-constrained calls were live provider calls.

Replaying those actual live HTTP events through Hashbrown's runtime and public
React `useUiKit` hook passed the same assertions: two rendered cards, no runtime
error, and one retained pending approval. The artifact is
`work/probes/b4-hashbrown-live-ui.html`, generated by
`work/probes/b4-hashbrown-live-ui.mts`; its log records the passing assertions.
The B4 live script/transcripts are `work/probes/agent-http-live-ui*` in the B4
worktree. The script uses synthetic record IDs and a temporary loopback server.

This proves live provider schema enforcement, B4 streaming/approval, and
Hashbrown parsing/rendering through recorded events. A continuously connected
browser/`useUiChat` flow, real root-agent orchestration, dynamic request-schema
handoff through validated middleware, and Pretable selection remain open. The
full application compatibility milestone is not yet complete.

## Nested-model streaming probe — September 15, 2026

Executed against B4 PR #657 head `fbfbe188`, using built public
`@b4run/langchain` and `@b4run/ag-ui` exports, a real LangGraph `ToolNode`,
`MemorySaver`, and a deterministic `FakeStreamingChatModel`. This is a Node
adapter probe, not a live provider call or an HTTP application proof.

| Arrangement                                    | Before approval                         | After resume                                                                |
| ---------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Model invocation and interrupt inside one tool | Two JSON text deltas, then an interrupt | Model invoked again; same JSON emitted under a new message ID; run succeeds |
| Model invocation in a preceding graph node     | Same text deltas, then an interrupt     | Run succeeds without another model invocation or text message               |

Assertions pass for both arrangements: initial interruption, successful resume,
complete initial JSON text, model invocation count (two versus one), and resumed
text delta count (two versus zero). Resume uses the native checkpoint interrupt
ID. The probe must use the same ESM LangGraph implementation as the B4 adapter;
mixing CommonJS and ESM `Command` constructors caused an invalid initial probe
because the adapter uses `instanceof Command` to recognize resume input.

The evidence establishes that ambient nested model streaming works in this Node
composition and that checkpoint placement controls replay. It does not establish
that arbitrary graph routes receive agent streaming and permission handling in
the default B4 HTTP runtime. Nor does it prove provider-enforced structured
output, concurrent tool message isolation, cancellation, or Hashbrown rendering.

A subsequent HTTP probe used `createRuntimeRequestListener`, a discovered
`agent()` route, a completed `prepareReview` tool, and a separate `applyReview`
tool gated by `tools.approve`. The root model used B4's aimock fixtures; the
nested model used `FakeStreamingChatModel`. Requests went through the default
AG-UI handler with its normal permission and resume machinery.

Assertions passed: initial assistant text was exactly `{"recordId":"record-1"}`,
the initial run ended in an approval interrupt, and a `once` resume completed
successfully with only the root model's final `Applied.` text. The model fixture
recorded three root requests. This advances the normal-agent composition beyond
the custom graph probe, without adding a public API. It still does not establish
live provider schema enforcement or a working Hashbrown UI. The local fixture
had no thread access policy and was bound only to loopback; it is not the
application's session/security implementation.

A concurrent-tool variant confirmed a framing defect through the same HTTP
route. One root response requested two `prepareReview` calls. Each nested model
emitted a valid two-chunk JSON object, but AG-UI emitted one assistant message:

```text
{"recordId":{"recordId":"record-1"}"record-2"}
```

Both approval and resume still completed, but `JSON.parse` rejected that
combined assistant message. In `classifyStreamEvent`, non-subagent
`on_chat_model_stream` events become `{ type: "token", data: content }`, dropping
the originating model run identity. The AG-UI translator appends these tokens
to one open message. This affects ordinary concurrent nested model calls, not
only Hashbrown or invoices.

The next generalized B4 change should preserve model-message identity and
lifecycle through token projection. Before implementing it, define compatibility
for existing token consumers, concurrent message framing, retry boundaries, and
resume. Avoid an application-specific output hook. Proposal generation and
approval should still be separate completed tool steps; message identity alone
does not fix replay inside an interrupted tool. Hashbrown parsing, live provider
schema enforcement, and cancellation remain subsequent verification steps.

Local reproduction artifacts are in the isolated B4 worktree under
`work/probes/nested-model-stream.mjs`, with both event transcripts alongside it.
Run `node work/probes/nested-model-stream.mjs` and the same command with `--split`
from that worktree after building B4. No production code or dependencies changed
for these probes. The HTTP script is `work/probes/agent-http-stream.mjs`;
its first/resumed JSON transcripts and log are stored alongside it. Run it from
the built B4 worktree with Node. Its temporary app and server are cleaned up on
exit, and it uses a dummy key with a loopback model fixture. The concurrent
variant is `work/probes/agent-http-parallel-stream.mjs`, with its own transcripts
and log showing the malformed merged message.

Verified September 14, 2026. Status: **application scaffolding gated on the
B4 structured-output integration design**. No dependencies installed, runtime
started, or live model calls made by this checkpoint.

## Versions and evidence

| Component                         | Observed version / revision                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| Hashbrown checkout                | `42c79c0fada36eb68f62c4a9e5c0fae6a8f1c294`                         |
| Hashbrown AG-UI packages          | `0.0.59`                                                           |
| React                             | `19.2.8`                                                           |
| Node / npm                        | `24.20.0` / `11.19.0`                                              |
| Local B4 checkout                 | `260920ca2b6bf13ddd15839f6e9ec32ba4c90b3a`; manifests `0.8.21`     |
| Published B4 SDK, CLI, AG-UI      | `@dawn-ai/sdk`, `@dawn-ai/cli`, `@dawn-ai/ag-ui`, all `0.8.26`     |
| Published B4 CLI AG-UI dependency | `0.0.59`                                                           |
| Local Pretable checkout           | `b569902000172389584091d9f0c369ad10bcec3b`; React manifest `0.4.0` |
| Published Pretable React          | `@pretable/react@0.19.0`                                           |

Registry metadata was read with `npm view`. Published package tarballs were
downloaded with `npm pack --ignore-scripts` into
`work/compatibility-packages` and extracted for inspection. This did not change
the root manifest or lockfile. The extracted declarations and JavaScript, not
the older local manifests, are the release evidence below.

Candidate pins are the published versions above. The minimum full dependency
set remains unresolved until choosing the B4 structured-output extension point.
B4's Node >=24 requirement is satisfied. Pretable supports React 18 or 19 and
depends on matching `@pretable/core` and `@pretable/ui` releases.

## Confirmed public surfaces

- B4 `agent` is exported by `@dawn-ai/sdk`. Authored agent routes live at
  `src/app/<route>/index.ts`, with discovered tools in the sibling `tools/`
  directory. `agent({ model, systemPrompt, tools: { approve: [...] } })` supports
  per-tool permission gates.
- `@dawn-ai/ag-ui` exports `fromRunAgentInput` and `toAguiEvents`;
  `@dawn-ai/ag-ui/sse` exports `encodeAgUiSse`.
- `@dawn-ai/cli/runtime` exports `streamResolvedRoute`, route preparation,
  runtime server and registry helpers. This is a possible custom-server seam,
  but using it requires preserving thread access, pending interrupt validation,
  run ownership, and disconnect handling. It is not a drop-in substitute for
  the default handler.
- Pretable exports `Pretable`, `PretableSurface`, `usePretable`, and
  `usePretableColumns`. Its public surface includes `onRowActivate` and stable
  row identities. Prefer this event for opening a payment review; multi-row
  checkbox selection is a different interaction.
- Hashbrown uses `useUiChat` and `exposeComponent` from `@hashbrownai/react`.
  Existing `tools/runtime-smoke/react/src/ui-smoke.tsx` and
  `interrupt-controls.tsx` demonstrate rendering and complete batch submission.

Documented B4 startup is `dawn dev --port 4325` from the application root;
the planned `/matching#agent` endpoint is `/agui/%2Fmatching%23agent`.
This command and route have **not** been executed for this application.
Provider/model selection and the deterministic model seam remain to be verified.

## Executed request and interrupt probe

A Node probe used the installed AG-UI `RunAgentInputSchema` at `0.0.59`, then
the published B4 `0.8.26` `fromRunAgentInput` and `toAguiInterrupt` functions.
It supplied a valid request with:

```json
{
  "state": { "selectedPaymentId": "payment-001" },
  "hashbrown": {
    "responseSchema": {
      "type": "object",
      "properties": { "proposalId": { "type": "string" } },
      "required": ["proposalId"],
      "additionalProperties": false
    },
    "ui": true
  },
  "resume": [
    {
      "interruptId": "approval-1",
      "status": "resolved",
      "payload": "once"
    }
  ]
}
```

The schema above is a minimal preservation probe, not Hashbrown's actual UI
schema. Production must preserve the actual schema emitted by Hashbrown.

Observed results:

1. `RunAgentInputSchema.parse` **removes the `hashbrown` extension**.
2. `fromRunAgentInput(parsed).raw.state` retains `selectedPaymentId`.
3. The resume maps to `interruptId`, `status: resolved`, `payload: once`.
4. A B4 tool interrupt maps its `callId` to AG-UI `toolCallId` and retains the
   original permission envelope under `metadata`.

Inspection of published
`@dawn-ai/cli/dist/lib/dev/agui-handler.js` confirms that it calls that base
schema parser and passes only the newest user message into route execution.
Thus preserving state in the translation function does not make it reach the
default route. The release's `AgentConfig` has no response-schema option, and
searches of the downloaded CLI/SDK/AG-UI distributions found no `hashbrown`,
`responseSchema`, or `withStructuredOutput` integration.

These are confirmed default-path gaps. They do not prove a custom B4 graph or
capability cannot implement the integration. That alternative needs its own
bounded design and verification before the application relies on it.

## Approval contract

Use an immutable stored proposal, then gate `applyAllocation` through B4's
per-tool approval. Its arguments identify the proposal and version; they do
not carry authoritative browser-calculated balances.

The candidate affirmative decision is:

```json
{ "interruptId": "<pending id>", "status": "resolved", "payload": "once" }
```

Cancellation is `{ "interruptId": "<pending id>", "status": "cancelled" }`.
Both libraries require the complete pending set. The client retains Hashbrown's
original local batch ID separately from B4 thread, proposal, and operation IDs.

The application boundary must reject `always`, prevent pre-approved write tools
and bypass mode, and bind the pending tool call to the exact server proposal.
Hiding an Always button is insufficient: the server must enforce the decision
policy. B4's ordinary `always` semantics persist permission by tool name, which
would violate per-allocation approval. The `argsPreview` in an interrupt is
truncated display text, not a source of proposal identity or authorization.

The ledger must independently revalidate record versions and store operation
results atomically. A permission checkpoint is not duplicate-write protection.

## Domain refresh choice

Use an application-owned `GET /api/snapshot` for authoritative payment/invoice
records and `GET /api/operations/:operationId` for uncertain results. Both are
scoped by the server's opaque session cookie. Browser IDs do not authorize
access. Refresh after application; query the operation after an ambiguous
transport outcome before offering another approval. These endpoints are planned,
not implemented. The proof does not require AG-UI state-event support.

## Historical next integration design — September 14

Compare a B4-native reusable AG-UI extension against an application-owned adapter
using the public runtime and a B4 graph/capability. Choose only after tracing the
model invocation and checkpoint APIs. Avoid duplicating B4 lifecycle handling.
The selected design must demonstrate:

- Validated selection context reaches tools without trusting financial values.
- Actual Hashbrown response schema and UI intent survive validation and resume.
- Schema-constrained streamed UI is available **before** the approval interrupt,
  not only as a final answer after the gated write tool has finished.
- The pending interrupt identifies the stored immutable proposal, even if the
  model's tool arguments or text are malformed.
- Only one-operation approval is accepted by the server.
- Existing plain AG-UI, permission, and non-Hashbrown clients remain compatible.

This was the September 14 gate. See the dated September 15 evidence above and
the implementation plan for current progress; the independent ledger work may
proceed while registry publication is pending.
