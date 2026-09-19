# Handoff — invoicing example on Vercel, and what dog-fooding it found in B4

**Session:** 2026-09-17 → 2026-09-19
**Repos:** `liveloveapp/hashbrown` (this one) and `cacheplane/b4run` (B4, working copy at `~/repos/dawn`)
**State at handoff:** everything in this repo is merged and live. All open work is upstream in B4, or is a decision waiting on a human.

---

## 1. Where things stand

`main` is at `9c153cc`. Both sites are deployed and healthy:

|                                   |                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| <https://hashbrown.dev>           | serves ~584 KB of rendered HTML (was a 5 KB client shell)                                                       |
| <https://invoicing.hashbrown.dev> | `/`, `/api/snapshot`, `/healthz`, `/readyz` all 200; `/readyz` reports checkpointer, permissions and threads ok |

The example pins `@b4run/*` at `0.8.36`, which is current on npm.

### Merged this session

| PR                                                        | What                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [#549](https://github.com/liveloveapp/hashbrown/pull/549) | Deployable tree published by `b4 build` alone; `tools/vercel/assemble.mjs` deleted (+214/−388) |
| [#550](https://github.com/liveloveapp/hashbrown/pull/550) | e2e failure traces write to the paths CI actually uploads                                      |
| [#551](https://github.com/liveloveapp/hashbrown/pull/551) | Home page render no longer crashes on `window` during SSR                                      |
| [#552](https://github.com/liveloveapp/hashbrown/pull/552) | Home page served by the renderer instead of the static client shell                            |
| [#553](https://github.com/liveloveapp/hashbrown/pull/553) | Agent function's 300s ceiling declared in `b4.config.ts`                                       |
| [#554](https://github.com/liveloveapp/hashbrown/pull/554) | Pretable 0.20.2                                                                                |
| [#555](https://github.com/liveloveapp/hashbrown/pull/555) | Postgres repositories rewritten with Drizzle                                                   |
| [#556](https://github.com/liveloveapp/hashbrown/pull/556) | One thread-ownership rule; B4 thread-access policy enforcing it                                |

---

## 2. Decisions waiting on a human

These block nothing here — they are all about what B4 should do.

1. **Triage the six upstream PRs** (§3). Suggested split: ship [#739](https://github.com/cacheplane/b4run/pull/739) and [#742](https://github.com/cacheplane/b4run/pull/742) (small, general); spend real review time on [#745](https://github.com/cacheplane/b4run/pull/745); make a product call on [#740](https://github.com/cacheplane/b4run/pull/740) and [#744](https://github.com/cacheplane/b4run/pull/744).
2. **#740 is a breaking change.** Clients sending non-empty `tools` (CopilotKit frontend actions) get a `422` instead of a silently narrower run. Empty `tools: []` is unaffected, so ordinary clients see nothing. The affected population is apps whose frontend actions are _already_ dead — but it is real breakage.
3. **Is client-tool support on B4's roadmap?** [#743](https://github.com/cacheplane/b4run/issues/743)/[#744](https://github.com/cacheplane/b4run/pull/744) exist because #740 revealed the field is accepted and discarded. The invoicing example does not use client tools and is not blocked. Closing the PR with its design intact is a legitimate outcome.
4. **#745: accept "plaintext grant at rest", or split it?** See §5 — this is the one substantive design question left open, and it was never posted to the PR.

---

## 3. Upstream: B4 (`cacheplane/b4run`)

Fourteen issues were filed from dog-fooding and thirteen were fixed and released through `0.8.36` (#679–#690, plus #709 and #728). What remains open:

| PR                                                   | State          | Notes                                                                                                                                                              |
| ---------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#738](https://github.com/cacheplane/b4run/pull/738) | design doc     | Approval capability grants. Open question 1 settled in [a comment](https://github.com/cacheplane/b4run/pull/738#issuecomment-5738344370); questions 2–7 still open |
| [#739](https://github.com/cacheplane/b4run/pull/739) | implementation | `serve()` helper, plus one shared runtime-route definition consumed by the Vercel build target                                                                     |
| [#740](https://github.com/cacheplane/b4run/pull/740) | implementation | AG-UI envelope validation; **breaking**, see §2                                                                                                                    |
| [#742](https://github.com/cacheplane/b4run/pull/742) | implementation | Application document store. Would delete ~340 lines from this example                                                                                              |
| [#744](https://github.com/cacheplane/b4run/pull/744) | design doc     | Client-provided tools, Model A. Stacked on #740 — retarget to `main` when #740 lands                                                                               |
| [#745](https://github.com/cacheplane/b4run/pull/745) | implementation | Approval grants, 51 files. Postgres lane 117/117                                                                                                                   |

**Unfiled:** the `interruptId` weakness — `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` at `packages/core/src/capabilities/permission-gate.ts:427`, ~31 bits of non-crypto randomness in a persisted identifier. It is open question 7 in #738 and has no issue of its own.

### Adopting the upstream work back here

Once the relevant PRs land and release, this example gets smaller:

- `server/src/persistence/*` → the document store (#742), ~340 lines
- `server/src/main.ts` → `serve()` (#739), ~40 lines
- the envelope boolean in `server/src/assistant-middleware.ts` → #740, ~25 lines
- `server/src/thread-ownership.ts` → retired once the review binding has somewhere else to live, ~80 lines

Note from #738's appendix: `operationId` replay protection **stays app-side**. The runtime can give at-most-once _delivery_, not exactly-once _effect_. Do not delete it expecting grants to cover it.

---

## 4. Open work in this repo

**`readLedger` sends the entire ledger on every question.** `server/src/assistant-middleware.ts` returns `monthlyTotals`, `totals`, `unappliedPayments`, `outstandingInvoices` **and** all 149 payments and 150 invoices — ~87,100 characters, roughly 21,800 tokens. The system prompt says "For every question call readLedger", and the tool result stays in context for the follow-up `respond` call, so one question costs ~44K tokens. About 94% of it is fully-settled rows. Dropping the raw arrays (the `customerId` parameter already exists for per-customer detail) takes the payload to ~4,900 characters, a 94% cut. Not done because it trades an extra round trip on per-customer questions — a product call, not a defect.

**`server/src/review-coordinator.ts`** is 347 lines and the last file from the cleanup review left alone deliberately. It holds the capability-token logic; splitting security code across files can obscure as much as it clarifies. Worth revisiting after grants land.

**Housekeeping**, none blocking:

- Cloudflare teardown needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `/Users/blove/repos/hashbrown/.env`; run `node tools/vercel/bootstrap.mjs --env-file <path> --teardown-cloudflare`
- Stale `NETLIFY_*` GitHub secrets (destructive — values cannot be recovered)
- Merged remote branches from this session
- Local Docker container `hashbrown-pg` (postgres:16, port 5439, throwaway credentials) used for the Postgres test lane
- `license/cla` never reported a conclusion on any PR this session. Never gated anything; may or may not be intentional

---

## 5. The open design question on #745

Not yet posted to the PR.

A grant is 32 random bytes; only its SHA-256 hash is stored. But core mints at the park site, and the only channel from core to the outside is the `payload` passed to `interrupt()`, which LangGraph persists verbatim. So **the plaintext grant sits in the checkpointer's `writes` blob while a prompt is parked**, and the PR documents this as permanent.

Everything else in a checkpoint is data; the grant is authority. A reader with checkpoint access can learn what is being approved — with the grant they can _approve it_. Thread-access still gates _who_ may resume, but B4's default is no policy at all.

**A possible third option**, neither in the design nor evaluated: split the requirement from the secret.

|                 | created at                   | stored                                                     |
| --------------- | ---------------------------- | ---------------------------------------------------------- |
| requirement row | park site, in core           | "this call needs a grant", no secret                       |
| secret          | first disclosure, in the CLI | hash only; plaintext handed to the client, never persisted |

No window (the requirement exists from the park, so a grant-less resume fails closed at one place) and no plaintext at rest. Two disclosure paths racing to mint is handled by the conditional-`UPDATE` primitive the PR already uses — first mint wins.

This was not raised on the PR pending a decision on whether to pursue it.

---

## 6. Things that would bite the next person

**`CREATE TABLE IF NOT EXISTS` never alters an existing table.** Twice this session, idiomatic code passed against a fresh database and would have written NULLs into production: Drizzle column defaults (`defaultRandom()`, `default(0)`), and a `DEFAULT gen_random_uuid()` added to the DDL. Production's tables were created by older code and have no such defaults. `server/src/persistence/schema.ts` now says so, and every insert names every column. #742 uses real migrations upstream specifically to remove this failure mode.

**Verify deployment-shaped changes on a preview, not locally.** The home page SSR fix looked right locally because the test called the function directly, bypassing Vercel's route table. The actual cause was that `static/index.html` shadowed `/` via `{ handle: "filesystem" }`. Two PRs instead of one.

**A red workflow can sit over a healthy deployment.** When Vercel is backed up, `vercel deploy --prebuilt` can hang past the job's 20-minute timeout while the deployment completes server-side. Check the Vercel API before assuming a deploy failed.

**Use the repo's own biome config in b4run:** `pnpm exec biome check --write --config-path packages/config-biome/biome.json <files>`. A bare `biome check --write` reformats 363 files.

**Tool-role messages never reach the model** in B4: filtered at `agui-handler.ts:324` (newest user message only) and again at `agent-adapter.ts:1137` (`role === "user"`). This is load-bearing for #744's security argument. Relaxing either filter as a convenience is what would open the `toolCallId` forgery hole — which is latent today, not live.

**Local dev:** `INVOICING_ENV_FILE=/Users/blove/repos/hashbrown/.env npx nx serve invoicing-server` (port 4325) plus `npx vite --config examples/invoicing/react/vite.config.mts` (port 4326; another worktree may hold it — use `--port 4327`). Without `DATABASE_URL` the memory repositories are used and state resets on restart.

**Secrets:** the Vercel token lives in `/Users/blove/repos/hashbrown/.env` as `VERCEL_API_TOKEN` and is loaded via `process.loadEnvFile` without printing. Do not echo that file.
