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
copy's complete `functions` directory), `faultOutputTreePath` (its complete
`.vercel/output`), `faultArtifactPath` (its unchanged bundled runtime), and
`faultManifest` (a separate candidate fault provenance object). Independent
expected provenance adds `fault`:

```js
{
  sourceCommit, project, // exactly the normal reviewed source/project/team
  deployment: { id, origin, target: 'preview', readyState: 'READY' },
  normalTreeSha256, faultTreeSha256,
  normalConfigSha256, faultConfigSha256,
  outputTreeSha256, artifactSha256,
}
```

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
`code: 'FUNCTION_INVOCATION_TIMEOUT'`, and numeric `timestampMs` within that
request's observed start/end. The caller must establish that its adapter really
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
protocol failure; no workers are created. Synthetic audit rows remain intact.
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
