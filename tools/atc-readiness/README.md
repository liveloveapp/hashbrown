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
