# ATC B4 preview-readiness probes

These are operator-run validation tools, not production endpoints or automated
production load generators. The reviewed 0.15.7 experiment design and execution
plan live in `docs/superpowers/specs` and `docs/superpowers/plans`.

## Local verification

```sh
node --test tools/atc-readiness/*.test.mjs
npx eslint tools/atc-readiness/*.mjs
```

Run these commands from the repository root. Tests need permission to bind owned loopback sockets. They use controlled local
fixtures and require no provider key or hosted database.

## Hosted prerequisites

Build the complete ATC B4 artifact from a clean, exact runtime source commit in a
separate checkout. Install the published lockfile packages; never use a source
overlay. Keep harness/report commits distinct from the deployed runtime source.

Before opening a database pool, each probe checks an independent expected record
against a sealed manifest, actual source/lock/package integrity, complete artifact
trees, two distinct READY HTTPS preview identities and the dedicated database
fingerprint. The independent record must come from authenticated project and
preview inspections plus reviewed build/publication evidence. Copying fields from
an unverified candidate manifest does not establish that authority. The manifest
proves verified prebuilt upload provenance, not remote byte attestation.

Supply two private files as positional arguments:

- Context JSON: `runtimeRoot`, `stagingDirectory`, `manifestPath`, `secretFile`,
  `artifactPath`, `functionTreePath`, `outputTreePath`, `schemaPath`.
- Independent expected JSON: the manifest fields documented in `common.mjs`,
  plus the SHA256 of the actual source-exported pinned schema as `schemaSha256`.

The staging directory must have mode 0700. The separate credential JSON must have
mode 0600 and contain `databaseUrl`, `cookieSecret`, `OPENAI_API_KEY` and, if used,
`OPENAI_BASE_URL`. The database must be the dedicated preview database with
verified TLS. No ambient database environment fallback is accepted. Keep the
pulled preview environment and credential JSON outside Git, never print them,
and delete both after the complete experiment set and credential-value scan.

## Execution order

```sh
node tools/atc-readiness/storage.mjs CONTEXT.json INDEPENDENT_EXPECTED.json
node tools/atc-readiness/runtime-recovery.mjs kill CONTEXT.json INDEPENDENT_EXPECTED.json
node tools/atc-readiness/runtime-recovery.mjs suspend CONTEXT.json INDEPENDENT_EXPECTED.json
node tools/atc-readiness/load.mjs CONTEXT.json INDEPENDENT_EXPECTED.json
```

Run sequentially; inspect terminal receipts and verified cleanup before advancing.
A failed or partial receipt is evidence to retain and diagnose, not a pass to
rerun blindly. Recovery reservations persist in `recovery-budget.json` with a
sixteen-attempt ceiling. Do not reset that ledger to evade the ceiling.

The load CLI reconciles all prior raw load receipts into a private durable 120-attempt ledger before starting; it does not reset that budget between runs. Its 30-second per-user spacing satisfies the reviewed minimum of twenty seconds and leaves room for the preserved interrupted run.

The load CLI has the reviewed fixed 1/2/4-user ramp on absolute 0/5/10/15-minute
boundaries, at least twenty seconds between starts per user, at most 120 attempts,
a 55-second request bound, and a twenty-minute total phase bound. It stops new
traffic on the first failure. Latencies and achieved rates are observations, not
a production SLO or capacity ceiling. Rendered text must match the persisted
response; full canonical hashes retain native reasoning blocks as well.

The generated-runtime recovery probes signal only owned local children sharing
hosted storage with a managed preview successor. They do not terminate a managed
Vercel worker or trigger database failover. Kill records the history actually
durable after confirmed death; asynchronous in-flight input may not have
committed. Suspend requires observed committed input before STOP and admission
unlock after STOP. Completed real provider bytes must be held before successor
dispatch. Generic admission-abort observation cannot identify the exact failed
checkpoint write, and stale streams may emit bytes before their terminal outcome.

Owned synthetic rows are retained. No global pruning, production backend change,
package publication, or production enablement is part of these commands.

## Managed platform timeout (programmatic, reviewed operator only)

`managed-timeout.mjs` is import-safe. Its `runManagedTimeout(options, expected,
adapters)` entry point uses `withRolloutRun` for every POST: a normal seed, one
fault attempt, an optional conflict, and a normal successor. Reservations and
spend observations use the existing reviewed timeout-phase ledger (at most six
phase requests and two fault reservations); there are no retries. The module
creates no approval, budget observation, platform log API, or token authority.
There is no standalone hosted CLI until a private operator supplies reviewed
spend and exact-request platform-log adapters.

Keep normal expected provenance independent of the candidate normal manifest.
The normal context is the context above, plus `faultFunctionTreePath` (the fault
copy's complete `functions/api/run.func` directory), `faultOutputTreePath` (its complete
`.vercel/output`), `faultArtifactPath` (its unchanged bundled runtime), and
`faultManifest` (a separate candidate fault provenance object). Independent
expected provenance adds `fault`:

```js
{
  sourceCommit, project, // exactly the normal reviewed source/project/team
  deployment: { id, origin, target: 'preview', readyState: 'READY' },
  normalTreeSha256, faultTreeSha256, // complete output/functions roots
  functionTreeSha256, // fault output/functions/api/run.func only
  normalConfigSha256, faultConfigSha256,
  outputTreeSha256, artifactSha256,
}
```

Normal `functionTreePath` and `expected.functionTreeSha256` retain the existing
complete `output/functions/api/run.func` scope. The fault path and
`fault.functionTreeSha256` use that same scope. Separately, the shared verifier's
`fault.normalTreeSha256` and `fault.faultTreeSha256` hash the broader complete
`output/functions` roots, derived from each output path. These raw digest scopes
are distinct; never relabel an existing `run.func` digest as an all-functions
digest.

The fault preview ID and HTTPS origin must differ from both normal READY
previews. The module checks the entire copied output's paths, file types, modes,
and bytes, the shared `verifyTimeoutVariant` verifier, raw full output/function
hashes, and unchanged runtime artifact. Only
`functions/api/run.func/.vc-config.json` may change, with the exact literal
`maxDuration` value changing from 60 to 1. Normal source cleanliness, lock and
installed packages, manifests and dedicated DSN remain guarded by
`storageContext` before pool creation. No fake provider, artificial delay, or
product fault endpoint is used.

The private operator must supply:

```js
await runManagedTimeout(context, independentlyReviewedExpected, {
  expectedBudget,
  runId,
  observationSource,
  platformProof: async ({ deployment, request, signal, deadlineMs }) => {
    // Query authenticated logs for this exact owned deployment/request.
    // Return null when proof is absent; never infer timeout from client abort.
    return proof;
  },
});
```

`expectedBudget` and `observationSource` follow `rollout-controls.mjs`.
`platformProof` is required and must honor its supplied abort/deadline bounds.
Accepted proof has `source: 'owned-deployment-request-logs'`, the exact
`deploymentId`, `origin`, and HTTP `requestId` captured from `x-vercel-id`,
and numeric `timestampMs` within that request's observed start/end. Two distinct
representations are accepted:

- Raw platform-code proof has `code: 'FUNCTION_INVOCATION_TIMEOUT'` and none
  of the normalization fields below.
- Normalized runtime-log proof has no `code` field, explicitly records
  `rawErrorCode: null`, and uses
  `normalizedClassification: 'platform-invocation-duration-exceeded'` with
  `normalizationRule: 'vercel-regional-header-native-id-epoch-and-exact-one-second-runtime-log-v1'`.
  `rawHeaderRequestId` must exactly equal `requestId`, with two regional prefixes
  (three lowercase letters and one nonzero digit each), separated by `::`, then
  `nativeLogRequestId` (five lowercase alphanumeric characters, a 13-digit epoch
  in milliseconds, and twelve lowercase hexadecimal characters, separated by
  hyphens). The native ID must exactly match the authenticated log request ID;
  its embedded epoch must equal `timestampMs`. `responseStatusCode` must equal
  the observed HTTP status, either 200 or 504. `timeoutSeconds` must be exactly
  1, and `platformMessageSha256` must be
  `aea360dd5096ef9c4511698bb6ceb6b4ab6158cd2a2da3e488d6c9f2a57030e5`, the SHA-256
  of the exact untruncated platform line
  `Vercel Runtime Timeout Error: Task timed out after 1 seconds`.

Receipts retain these normalization fields, including the explicit absence of a
raw error code; a normalized classification never creates a raw platform code.
The caller must establish that its adapter really
queries those owned platform logs. A structured object alone is not hosted
proof. Request receipts retain status, Vercel request/error headers, bounded
error-body digest/truncation and transport-failure classification. Attempts retain run/ordinal identities and
genuine terminal/checkpoint provider usage, model and response IDs where present.
Unavailable usage remains `null`; HTTP counts do not establish upstream billed
attempts or spend. Response text
and signed cookies are recursively redacted and never persisted.

The fault request must be observed pending with an actual active admission and
its durable new input. Missing log proof or an observed owner, client timeout,
and naturally fast valid completion are `inconclusive` and consume the fault
reservation. A proven timeout with immediate admission release is
`graceful-timeout-cleanup`. A surviving same-owner lease requires one real 409
with `Retry-After: 1`, bounded wholly before expiry using DB clocks, followed by
a normal managed successor only after natural DB-clock expiry; this is
`orphan-lease-recovered`. Unexpected failures stop qualification and preserve a
partial receipt. Check `qualified === true` and successful cleanup, never the
classification label alone.

After successful EOF, the first DB query snapshots admissions once; a nonzero
count fails without polling. Complete tuple/thread hashes, physical checkpoint
and pending-write records, full message prefixes, exactly-once new input,
isolated provider response IDs and the 4096 token cap must remain valid. The
same full snapshot must be unchanged after at least 75 seconds. The control's
signal/deadline bounds reads, drains, precondition polling and waits. Owned HTTP
requests and storage resources close even after partial initialization or
protocol failure. Each resource receives a fresh bounded five-second cleanup
grace even after phase expiry or abort; the enclosing rollout control still
rejects the expired phase. Cleanup failures keep qualification false. No workers
are created. Synthetic audit rows remain intact.
Receipts are private `managed-timeout-RUN_UUID.json` files. Keep the caller,
credentials and pulled environment private, then remove temporary credentials
and environment files after receipt review and the credential-value scan.

Offline verification (no hosted/model calls):

```sh
node --test tools/atc-readiness/*.test.mjs
npx eslint tools/atc-readiness/*.mjs
node --check tools/atc-readiness/managed-timeout.mjs
node --check tools/atc-readiness/managed-timeout-io.mjs
npx prettier --check tools/atc-readiness/managed-timeout*.mjs tools/atc-readiness/README.md
```

The controlled loopback HTTP and dependency-spy tests exercise protocol/IO
ordering and failure handling. They do not establish hosted timeout proof.

## Disposable compute restart and preview rollback

`compute-restart.mjs` exports `runComputeRestart(context, expected, adapters)`;
`rollback-check.mjs` exports `runRollbackCheck(context, expected, adapters)`.
Both are import-safe. They use the same independently reviewed spend adapter,
fixed aggregate ledger, concurrency, pacing and deadlines as the timeout phase.
The restart phase has six reservations and rollback has four; neither resets
historical attempts. A usual restart consumes seed/active/successor and optional
conflict reservations; rollback consumes two fresh visitor requests. Extra caps
are ceilings, not instructions to retry inconclusive results. No provider key,
Neon compute or alias is provisioned automatically. These modules have no CLI
that discovers credentials from environment variables.

Restart adapters require `expectedBudget`, `observationSource`, UUID `runId`,
privately supplied `managementToken`, and a reviewed `activeProvider` log reader.
The independent expected record additionally binds `computeOwnershipSha256` to
`context.computeOwnershipPath` and its parsed `compute` identity. That receipt
must come from actual authenticated project/branch/endpoint inspections and an
independent consumer inventory, never assertions copied from an unverified
candidate. It contains `projectId`, `branchId`, `endpointId`, provider `hostname`,
`role`, `database`, `databaseSha256`, and ownership:

```json
{
  "runId": "THE_APPROVED_RUN_UUID",
  "purpose": "atc-readiness",
  "consumers": ["EXACT_DEDICATED_PREVIEW_ID_1", "EXACT_DEDICATED_PREVIEW_ID_2"],
  "data": "empty-synthetic-only",
  "production": false,
  "shared": false
}
```

The receipt digest, exact expected receipt, dedicated preview IDs, actual DSN
endpoint/role/database, database fingerprint, actual SQL role/database and empty
user tables are checked before the seed. This does not authorize restarting a
shared preview compute. Management authentication is currently unavailable, so
hosted restart remains blocked. SQL credentials do not replace management auth.

After the durable prefix and active admission/input are observed, the log reader
receives the actual `runId`, `threadId`, deployment and owner hash. It must return
`source: 'owned-deployment-request-logs'`, exact `deploymentId`, `threadId`,
`runId`, `ownerSha256`, real in-flight `providerRequestId`, and numeric
`timestampMs` within the active request. The admission is rechecked as live
using DB time before the one supported Neon restart. The shared HTTP adapter
accepts an optional caller-generated `bounds.runId` to establish this binding.
A copied structured object does not establish active provider execution; the
operator must independently review the adapter's actual log access.

An exclusive per-stage `restart-operation.jsonl` fence is created and synced;
intent is persisted before POST and returned operation IDs before polling.
Finished provider operations, active endpoint identity and a fresh successful
DB-clock query are required. A prior journal, uncertain mutation or failed
operation never triggers another restart. Inspect its operation IDs read-only
instead. Missing active identity or unproven interruption produces an unqualified
`reconnect-only` receipt. Surviving live leases require one conflict wholly before
DB-clock expiry; successors wait for expiry or observed release. Prefixes,
provider isolation, one canonical successor, first post-EOF admission zero and
unchanged full state after at least 75 seconds are checked. Stale-write exclusion
remains explicitly `untested` because this harness does not prove old-owner
resumption. Compute restart does not qualify storage or physical-host failover.
All synthetic state/audit rows are retained; this harness creates no compute to
suspend or delete. Reviewed disposable compute ownership remains the operator's
responsibility after the terminal active-state receipt.

Rollback requires adapters `expectedBudget`, `observationSource`, `runId`,
privately supplied `vercelToken`, and a reviewed exact-request `routeProof`
reader. `expected.rollback` records exact `alias`, `aliasId`, `projectId`,
`ownerId`, `initialDeploymentId`, `createdForRun`, `runId`, `productionAliases`,
and separately verified `b4`/`openai` candidates. Only newly owned
`readiness-*.vercel.app` aliases created for this run are accepted; production
aliases/domains are rejected. Each candidate binds its deployment `id`,
`target: 'preview'`, `readyState: 'READY'`, `backend`, frozen `sourceCommit`,
`artifactSha256`, `functionTreeSha256`, `outputTreeSha256`, `lockSha256` and
`verificationSha256`. The normal B4 candidate must match the guarded storage
context. Candidates must have different compiled executable and function trees;
changing only backend environment configuration is rejected.

`context.artifacts.b4` and `.openai` supply `runtimeRoot`, `outputTreePath`,
`functionTreePath`, `artifactPath` and `verificationPath`. Complete tree/lock/
handler-byte hashes, normal 60-second streaming configs, filesystem routing and
isolated executable-verification receipts are checked before hosted IO. Each
verification receipt contains exactly `sourceCommit`, `backend`,
`artifactSha256`, `functionTreeSha256`, `outputTreeSha256`, `lockSha256` and its
independently reviewed raw digest. The receipt must represent an actual isolated
artifact smoke test, not an operator assertion that toggling configuration is
sufficient. Uploaded READY/project/team/source/preview identity is then inspected
using Vercel's API. Its real `target: null` preview representation is recorded as
`serviceTarget`, with independently inspected `inspectionTarget: 'preview'`.
Local upload provenance is not remote byte attestation.

The owned alias is moved to B4 and then direct OpenAI, with a fresh synthetic
thread and no visitor cookie on each request. Actual AG-UI completion, pinned
schema, unique response marker, exact request/run/thread platform correlation,
B4 canonical input/output and single assistant response are verified. The route
reader must return `source: 'owned-deployment-request-logs'`, exact `alias`,
`deploymentId`, `requestId` from `x-vercel-id`, actual `runId` and `threadId`.
Whole B4 physical state is snapshotted around the OpenAI request and must remain
unchanged. Each backend also gets a full unchanged-state check after at least
75 seconds. Existing B4 conversations cannot transparently continue as durable
B4 threads after direct-OpenAI rollback.

Alias inventory is durably appended before mutations. On success or failure,
the recorded initial mapping is restored and verified with a bounded fresh
cleanup deadline before the test-only alias is removed and its absence verified.
Failed restoration prevents deletion and qualification; preserve the inventory
for follow-up. HTTP/storage cleanup failures and phase exhaustion keep receipts
unqualified. Private sanitized receipts are `compute-restart-RUN_UUID.json` and
`rollback-RUN_UUID.json`. Keep all credentials, ownership reviews and
request-log adapters private; the existing credential cleanup/value-scan workflow
still applies. Offline tests exercise injected provider boundaries and real SSE
parsing, and do not establish hosted restart or rollback evidence.

Phase receipts retain each attempt’s ledger `id`/`ordinal`, native AG-UI `runId`,
`threadId`, actual request correlation and nullable terminal/checkpoint usage.
Restart has one top-level `threadId`; rollback has `threadIds` for its fresh
visitors. Failed attempts remain listed even when no result/usage is available.

Restart recovery records `recoveryAdmissionGate`: either a positively observed
release or a fresh database clock at/after the retained owner's expiry. An
expired physical admission row may remain until the successor atomically
reclaims it; only the first post-EOF admission snapshot must be zero. Native
AG-UI run IDs are assigned before HTTP dispatch. The optional internal
`bounds.onRequestObserved` callback publishes actual HTTP headers and terminal
usage as soon as observed, retaining known correlations if a later operation
fails. Unavailable usage remains null with its full outstanding reservation.

The precreated owned alias's idempotent cleanup is registered before artifact or
uploaded-deployment inspection and storage initialization; protocol cleanup is
also registered before its initial alias read. Cleanup independently rechecks
alias UID/name/project/team and an allowed preview mapping under fresh bounded
control before restoring or removing anything. A failed or foreign identity read
leaves the alias untouched and records cleanup failure; it never sets `closed`
to true. Owned IO closure is still attempted when alias cleanup fails. Optional
injected IO boundaries in `runRollbackCheck` support offline regressions; normal
execution uses the guarded artifact, Vercel, storage and aggregate-run adapters.

The wrapper also awaits its same idempotent resource finalizer in an outer
`finally`, covering coordinator-lock and observer startup errors that occur
before the run coordinator enters its own cleanup scope. It preserves another
owner's coordinator lock. Storage initialization checks cancellation/deadline
before opening a pool and bounds the opening wait and schema read. A late pool
remains owned by its opening continuation and closes under fresh bounded grace.
Initialization cleanup gets a five-second settlement grace; unresolved or failed
cleanup sets `cleanupFailed`, keeps the receipt's `closed` false and records a
cleanup error. The late continuation still attempts closure after that grace.
The wrapper waits for initialization ownership to settle before reporting clean
resource closure; each actual storage resource gets its own fresh five-second
close bound even after phase abort or expiry. Later closure does not silently
turn a previously uncertain receipt into successful cleanup.

Vercel alias metadata can omit team fields. Every successful alias inspection
also fetches authenticated `GET /v9/projects/{projectId}` scoped by the exact
`teamId`, requiring the returned project ID to match both the alias and expected
project and its `accountId` to match the expected owner. The normalized
snapshot's `ownerId` comes from that project `accountId`; no raw alias team field
is invented. Optional alias `teamId` or `team.id` fields, when present, must still
agree. Restore/delete cleanup uses this same fresh ownership proof each time.
No environment/decryption endpoint or decrypt option is used, and returned
project environment fields are ignored.
