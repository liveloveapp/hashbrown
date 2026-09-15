# Invoicing example — implementation in progress

This is the foundation for the canonical React / Hashbrown / Pretable / B4
example. The React Dashboard and Payments pages use a real Pretable grid and
session-owned HTTP snapshots. Live assistant messaging and approval are not
connected yet; those controls remain disabled.
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
This provides single-process behavior only. The local server assigns HTTP-only, SameSite cookies and scopes snapshot and
operation-result reads by session. B4 thread ownership, durable recovery, and
browser approval controls still need integration.
The domain `decide` method must remain behind that server approval boundary.

Run from the repository root:

```sh
npx nx test invoicing-server
npx nx build invoicing-server
npx nx lint invoicing-server
```

The server build target type-checks the domain and HTTP server; `serve` runs
TypeScript directly. The direct additions are `@pretable/react@0.19.0` and
`@pretable/ui@0.19.0` (public CSS imports), with matching core in the lockfile.

## Run the current UI

In two terminals at the repository root:

```sh
npx nx serve invoicing-server
npx nx serve invoicing-react
```

Open http://127.0.0.1:4326. Vite proxies requests to the loopback server on
port 4325. Select a payment by checkbox or its identifier to show related
invoices beneath the grid; selection remains across navigation. The Assistant
sidebar is open on both pages, with messaging explicitly unavailable.

Read endpoints are `GET /api/snapshot` and `GET /api/operations/:operationId`.
There is deliberately no general-purpose financial mutation endpoint. The
current app needs no model key. Future live B4 execution will load credentials
on the server only.

Shared readonly DTOs live in the `invoicing-contracts` Nx library, imported as
`@invoicing/contracts`. The client does not import server implementation code.
Run build, test, and lint targets for `invoicing-react` and
`invoicing-contracts` as well as `invoicing-server`.

Current warnings include Vite's large Pretable-containing JS chunk and the
environment's `NO_COLOR` / `FORCE_COLOR` conflict. npm audit reports 58 workspace
findings (22 moderate, 36 high); none name the added Pretable packages.

## Remaining application work

Verify published B4 packages containing PRs #657 and #660, then connect the
server-owned proposal to the approved Dashboard / Payments shell, Pretable
selection, and the open Hashbrown chat sidebar. Approval remains one click
with no second confirmation. Add deterministic and live-model browser tests
before calling the invoice allocation flow complete. Full data seeding and
retirement of the older examples follow later.
