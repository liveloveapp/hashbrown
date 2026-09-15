# Invoicing example — implementation in progress

This is the foundation for the canonical React / Hashbrown / Pretable / B4
example. The runnable application and HTTP endpoints are not implemented yet.
The approved design is in `design/react/canonical-invoicing-example.md`; current
integration evidence is in `samples/invoicing/compatibility.md`.

## Ledger proof

The domain fixture contains one USD 2,400.00 payment and one invoice belonging
to the same customer. This is a compatibility fixture, not the planned two-year
software-consulting dataset. Amounts are integer cents; remaining balances are
derived from committed allocations.

`createSessionStore()` creates isolated in-memory visitor sessions. A proposal
captures exact allocations, record versions, proposal version, operation ID,
and session generation. Decisions reference that stored identity. Approval
revalidates the records and replaces the ledger and recorded operation result
in one synchronous critical section. Repeated identical decisions return the
recorded result; conflicting decisions, stale versions, and foreign-session
proposals fail without financial changes. Reset invalidates old proposals.

The store returns copies, so callers cannot mutate its authoritative records.
This provides single-process behavior only. HTTP-only cookies, B4 thread
ownership, durable recovery, and browser approval controls still need integration.
The domain `decide` method must remain behind that server approval boundary.

Run from the repository root:

```sh
npx nx test invoicing-server
npx nx build invoicing-server
npx nx lint invoicing-server
```

The current build target type-checks the domain and tests; it does not emit or
start an HTTP server. No new dependencies have been installed for this stage.

## Remaining application work

Verify published B4 packages containing PRs #657 and #660, then connect the
server-owned proposal to the approved Dashboard / Payments shell, Pretable
selection, and the open Hashbrown chat sidebar. Approval remains one click
with no second confirmation. Add deterministic and live-model browser tests
before calling the invoice allocation flow complete. Full data seeding and
retirement of the older examples follow later.
