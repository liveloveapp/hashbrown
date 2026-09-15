# Invoicing example — local compatibility proof

The canonical React / Hashbrown / Pretable / B4 example now supports a real
model-driven payment review: select a payment, then **Approve and apply** in
the open assistant sidebar. The server records one simulated allocation and
refreshes the payment and invoice balances. **Decline** leaves the ledger unchanged.

This proof contains one USD $2,400 payment and matching invoice for a software
consulting customer. The planned two-year dataset, richer dashboard, and
retirement of older examples remain separate follow-ups. There are no real
payment transfers or collections workflows.

## Run locally

The current proof uses a built B4 checkout containing fixes from upstream PRs
#657, #660, and #663. The tested middleware-context-cache checkout contains the
last fix at commit `45084977` (merged upstream as `58436723`). Its package
metadata says 0.8.33; this is **fixed source-build evidence**, not verification
of the published 0.8.34 artifacts.

Install dependencies and run `pnpm build` in that B4 checkout first. Then run
from this Hashbrown repository root:

```sh
node samples/invoicing/server/link-local-b4.mjs /path/to/fixed-b4-worktree
INVOICING_ENV_FILE=/path/to/.env npx nx serve invoicing-server
```

In another terminal:

```sh
npx nx serve invoicing-react
```

The environment file must provide `OPENAI_API_KEY`; alternatively export the
key in the server environment. Credentials are loaded only by the server.
Both the root agent and nested structured UI generation use `gpt-5-mini`.
Open <http://127.0.0.1:4326/>. Vite proxies API and agent requests to port 4325.
Select the payment checkbox or identifier to start review; no extra Review
button is required. Selection and chat survive Dashboard/Payments navigation.

The setup script copies built SDK, LangChain, and CLI entry packages into
`node_modules`, linking their installed dependencies from the B4 checkout.
Keep that checkout and its dependencies available. Rerun the script after
rebuilding B4 or reinstalling this workspace. It does not change manifests or
lockfiles, and refuses to overwrite ordinary package-manager installations or
unrelated symlinks. Published-package installation remains a later integration
step; this local setup is intentionally not a registry dependency declaration.

## Authority and state

The server owns amounts, record versions, immutable proposals, operation IDs,
and session generations. Model UI props contain only a proposal ID. The
client fetches the session-owned proposal and verifies its pending interrupt
batch before enabling approval. It reads the recorded operation result before
refreshing balances, including when the approval stream fails after submission.
One unanswered interrupt holds the entire batch.

The review middleware binds B4 tools to the validated cookie session and exact
conversation. Proposed amounts come from server balances. Approval revalidates
records and applies the allocation synchronously with its recorded result.
Repeated identical decisions return that result; stale or conflicting decisions
and foreign-session proposals fail without changing balances.

HTTP-only SameSite cookies isolate browser sessions. Ledger and B4 history
start fresh together on server restart; this is single-process, temporary state,
not durable recovery. Each proof chat owns one payment review. Cancellation
confirms no allocation was requested; it does not record a domain decline.

Session-scoped reads:

- `GET /api/snapshot`
- `GET /api/proposals/:proposalId`
- `GET /api/reviews/:threadId`
- `GET /api/operations/:operationId`

Only `POST /agui/%2Freview%23agent` forwards to the guarded B4 listener. General
thread APIs and alternate agent routes are unavailable. There is no standalone
financial mutation endpoint. Shared DTOs and the identity-only component schema
live in `invoicing-contracts`; clients do not import server implementation code.

## Verification and next steps

Build, test, and lint pass for the application projects: 81 server tests,
30 React tests, and 3 shared-contract tests. The React suite exercises real
Hashbrown rendering with controlled transport. Live browser checks separately
exercise actual B4/model calls for approval and cancellation. Approval records
one allocation, changes both remaining balances to $0, and preserves selection;
cancellation leaves both balances at $2,400. The separate browser session
cannot read the approved session’s operation (404) and retains its own ledger.

Use `npx nx build`, `npx nx test`, and `npx nx lint` with each of
`invoicing-server`, `invoicing-react`, and `invoicing-contracts`. The server
build type-checks; serve runs TypeScript directly. Existing warnings include
the approximately 936 kB minified Vite chunk and terminal color settings.

Remaining work includes published B4 artifact verification, a repeatable Nx
browser/live-model test target, broader browser failure scenarios, two-year
seed data and scenario fixtures, and replacement of the older examples.
See `compatibility.md` and `design/react/canonical-invoicing-example.md` for
integration evidence and the approved application design.
