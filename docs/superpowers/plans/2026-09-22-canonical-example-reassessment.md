# Canonical example reassessment — September 22, 2026

Upstream checkpoint: `42be88af` (PR #569). Integration preserves the four local
inventory/conformance migration commits and follows the upstream move from
`samples/invoicing` to `examples/invoicing`.

## Supersedes earlier implementation assumptions

- B4 is now 0.9.0; prior compatibility workarounds have been removed. Do not
  reintroduce the 0.8.34 temp-workspace integration.
- Focused assistant tools already exist: ledgerSummary, monthlyTotals, aging,
  customerStatement, findRecords, unappliedPayments, and a validated render kit.
  Search defaults to 20 rows and caps at 50; matching returns at most 20 payments
  and three candidate invoices each. Statement collections are capped. Do not
  implement a second parallel ledger-query API from the September 15 draft.
- The assistant kit now includes a Pretable grid, SVG charts and customer cards.
  Product capability planning should start from these implementations.
- Nine assistant eval questions have committed replay fixtures and explicit
  live/record modes. Extend these rather than introducing another eval harness.
- Vercel deployment/build/bootstrap infrastructure is implemented. Cloudflare
  deployment removal instructions are obsolete. This pull did not verify current
  external deployment health, DNS, or live credentials.
- The server now has durable Postgres/Drizzle repositories and a generated ledger
  with per-session overlays. Earlier in-memory-only and fixed seed-count assumptions
  are obsolete. Do not remove upstream persistence under the older V1 plan.

## What the local branch still contributes

Canonical e2e ownership of Angular/React conformance, independent Node/Worker
provider fixtures, one combined 64-case browser runner and 42-case harness suite,
plus an assertion migration ledger. Keep Worker coverage even though upstream's
Cloudflare removal deleted the old sample-based Worker test. Test-only generic
Worker Request/Response coverage does not require a Cloudflare deployment.

## Remaining work, in priority order

1. Verify this integration, then publish the canonical coverage consolidation.
2. Audit current query caps, truncation semantics and access beyond the first
   page against representative questions; the current search has no cursor.
   Treat new pagination/detail requirements as gaps to establish, not assumptions.
3. Measure current payload sizes, time to useful UI, completion time and answer
   quality using the existing evals and real application. Previous 74s/16s timing
   samples are from an obsolete implementation and are not the new baseline.
4. Retire all Vox (including VAD/WASM build tree) and Lambda Chat repository
   surfaces, prune verified exclusive dependencies and remove stale Nx/docs refs.
5. Retire remaining legacy showcase source and links after verifying the canonical
   deployment. Smart Home's explicit CI tooling step still exists; remove it with
   its app. Keep library-local tests and both-framework canonical assertions.

External resource decommissioning is separate. No old showcase/Vox/Lambda source
was deleted during this reassessment. Local runtime artifacts remain untracked.

## Integration verification

Resolved directory-rename conflicts under `examples/invoicing`, retained main's
application/server/eval changes, and retained all three canonical provider route
cases (including the Worker assertion coverage). Updated CI diagnostics paths to
collect both upstream example artifacts and canonical conformance/provider output.
Independent static review found no blocking merge defects.

Fresh dependency install succeeded. Build/test/lint passed for server, React,
contracts and canonical e2e: 213 server + 65 React + 8 contracts + 42 harness
cases (328 total). Replay assistant eval gate passed with mean 1.00. These are
replay results, not fresh real-model quality or latency measurements. Existing
server lint warnings (23), dependency/tooling deprecations and bundle warnings
remain; no unrelated cleanup was attempted.

The consolidated browser target passed all 64 cases after integration (four
application, 56 conformance and four native-provider cases). Both relocated hosts'
lint targets passed. No live model run or deployed-site test was performed.
