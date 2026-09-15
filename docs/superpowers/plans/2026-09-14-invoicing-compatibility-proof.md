# Invoicing Compatibility Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that a React/Pretable payment selection can start a real B4 model turn, render a trusted Hashbrown allocation proposal, pause for approval, and apply one simulated payment exactly once.

**Architecture:** A local React client uses Hashbrown's public UI-chat and interrupt APIs. A TypeScript B4 agent reads an application-owned ledger, creates an immutable proposal, and interrupts before mutation. The server validates the approved operation and returns authoritative records for the grid to refresh.

**Tech Stack:** Existing React 19, TypeScript, Nx, Vite, Vitest, Playwright, and Hashbrown workspace libraries; Pretable and B4 public packages at versions verified in Task 1.

---

## Scope and execution boundary

Design: `design/react/canonical-invoicing-example.md`.

The user approved the basic shadcn navigation, Dashboard landing, payment grid,
related invoice beneath it, and approval in the right chat sidebar, open on
both pages. Preserve that arrangement in the proof. The proof is local-only
and uses one $2,400 payment and invoice; do not present its tiny fixture as the
approved two-year application dataset. Full seed generation, multiple retained
payment reviews, public hosting, durable refresh recovery, and removal of old
samples belong to later plans.

Task 1 is a compatibility discovery checkpoint. It must resolve package imports,
approval payload, and the B4 route extension point before Tasks 2–6 begin.
There is deliberately no invented B4 API in this plan. If reusable library
support is required, record failing compatibility cases and write a separate
adapter implementation plan before application work depends on it. Do not
patch an unrelated local checkout or silently bypass B4 to claim compatibility.

The user already requested the named B4 and Pretable integrations. Record their
exact dependency additions before changing manifests. Ask before adding any
additional dependency not already authorized, as required by `AGENTS.md`.
No dependency is installed by this planning change.

## File map

All paths below are relative to this Hashbrown checkout unless absolute.
Follow the existing `samples/smart-home/react` and `samples/smart-home/server`
layout, without modifying either sample.

| Path                                                                                                              | Responsibility                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `samples/invoicing/compatibility.md`                                                                              | Verified versions, Node requirements, wire contracts, evidence, limitations    |
| `samples/invoicing/README.md`                                                                                     | Local startup, fixture, test and live-model instructions                       |
| `samples/invoicing/server/project.json`                                                                           | `invoicing-server` build/test/lint/serve targets                               |
| `samples/invoicing/server/tsconfig.json`, `tsconfig.app.json`, `vitest.config.ts`, `eslint.config.mjs`            | Server compilation and test configuration                                      |
| `samples/invoicing/server/src/ledger.ts`, `ledger.spec.ts`                                                        | Immutable ledger transitions and money invariants                              |
| `samples/invoicing/server/src/session-store.ts`, `session-store.spec.ts`                                          | Isolated in-memory sessions and atomic per-session application                 |
| `samples/invoicing/server/src/matching-agent.ts`, `matching-agent.spec.ts`                                        | Verified B4 route, read/proposal tools, approval interruption                  |
| `samples/invoicing/server/src/ag-ui.ts`, `ag-ui.spec.ts`                                                          | Application integration with the verified public B4 AG-UI boundary             |
| `samples/invoicing/server/src/main.ts`                                                                            | Loopback HTTP startup, session and snapshot endpoints                          |
| `samples/invoicing/react/project.json`                                                                            | `invoicing-react` build/test/lint/serve targets                                |
| `samples/invoicing/react/index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `eslint.config.mjs` | React scaffold; same-origin development API proxy                              |
| `samples/invoicing/react/src/main.tsx`, `app.tsx`, `styles.css`                                                   | Provider setup and approved two-page shell                                     |
| `samples/invoicing/react/src/payments-grid.tsx`                                                                   | Public Pretable API integration with stable record selection                   |
| `samples/invoicing/react/src/payment-review.tsx`, `payment-review.spec.tsx`                                       | Selection-triggered Hashbrown review and owned interrupt batch                 |
| `samples/invoicing/react/src/allocation-proposal.tsx`                                                             | Trusted proposal display; enabled approval only for a verified server proposal |
| `samples/invoicing/e2e/project.json`, `playwright.config.ts`, `matching.spec.ts`, `live-model.spec.ts`            | `invoicing-e2e` deterministic and explicit live-model checks                   |
| `package.json`, `package-lock.json`                                                                               | Verified, authorized package pins only                                         |

Any shared DTO module should be added at `samples/invoicing/contracts.ts` once
Task 1 fixes the wire boundary. Share readonly domain records, not library
internals. Public/reusable functions and types receive TSDoc. Do not add new
Hashbrown core exports just for the sample.

## Task 1: Resolve the integration contract

**Progress (September 15, 2026):** Task 1 remains in progress. Generalized
B4 fixes merged in PRs #657 and #660. A connected React browser proof passed
with live root and nested models, the preserved Hashbrown UI schema, and
`once` approval resume. That proof uses a built B4 worktree, not published
packages, and a string-returning operation rather than a ledger mutation.
Registry latest `@b4run/*` 0.8.31 predates both fixes; release PR #661 prepares
0.8.33. Published Pretable 0.19.0 selection passed strict types, SSR, and a real
browser select/clear check. The independent Task 3 ledger portion is implemented and verified;
Task 2 now has a working React/Pretable and read-only HTTP scaffold; the
B4-dependent portions of Tasks 2 and 4–6 remain pending. See the dated evidence at the top of
`samples/invoicing/compatibility.md`; the September 14 findings there are
historical and have been superseded where stated.

**Files:** Create `samples/invoicing/compatibility.md`; update this plan with
the selected public imports and commands after the investigation.

- [ ] Record this checkout's commit and dependency versions; inspect Node and
      package manager versions. Record the commits of `/Users/blove/repos/dawn`
      and `/Users/blove/repos/pretable` without changing those checkouts.
- [ ] Inspect the public package exports and runnable route examples in B4's
      `apps/web/content/docs/ag-ui.mdx`, `agents.mdx`, `routes.mdx`, and
      `permissions.mdx`; inspect Pretable's `apps/website/app/components/HeroGrid.tsx`
      and public React exports. Verify installable versions using package registry
      metadata. Source manifests are observations, not proof of published artifacts.
- [ ] Record the minimum package set, exact versions, Node requirement, provider
      configuration, and public imports. B4's inspected AG-UI source requires
      Node >=24 and uses Dawn package names; do not guess renamed B4 packages.
- [ ] Trace request validation through B4's
      `packages/cli/src/lib/dev/agui-handler.ts`, `packages/ag-ui/src/inbound.ts`,
      `outbound.ts`, and `interrupts.ts`. Record which public hook can preserve
      `state`, `hashbrown.responseSchema`, and `hashbrown.ui`, and how the schema
      constrains model output. Preserve the actual schema object; do not replace
      it with prose or a reconstructed approximation.
- [ ] Identify the supported B4 approval capability and copy its actual
      interrupt/resume payload contract into `compatibility.md`. Document binding
      to proposal ID/version and operation ID. If using a permission capability,
      an allowed decision must authorize only this exact operation, never future
      writes. Do not assume `{ approved: true }` is a supported B4 payload.
- [ ] Choose an authoritative snapshot endpoint for domain refresh. State events
      may supplement it if verified; they are not required to claim generic AG-UI
      shared-state support. Record unsupported protocol features explicitly.
- [ ] Resolve all three critical paths: selected payment ID reaches server tools;
      Hashbrown UI schema reaches model output; B4 interrupt resumes the stored
      proposal. If any path requires library changes, finish a separate reviewed
      adapter plan and its tests first. Revisit this checkpoint afterward.

**Exit evidence:** Exact public imports, runnable B4 startup command, route
registration, provider configuration, schema mapping, and approval payload are
written into this plan and `compatibility.md`. Only then proceed to scaffold.

### Sequencing update — September 15

Release PR #661 merged as `dd1c4c7c9e1aacaf079c18aef71bcdc81f5d5ebe`;
publication is pending. The dependency-free ledger/session portion of Task 3
can proceed with its Nx test/build/lint configuration while publication and
Pretable browser verification run. This does not satisfy Task 1 or authorize
using an unpublished package as if it were a registry release. Application
scaffolding and B4 integration remain gated on those checks. Domain DTOs live
in `samples/invoicing/server/src/contracts.ts` while only the server consumes
them. A root-level loose contracts module is classified as the root project by
Nx and violates its module boundary; establish a proper shared project when
the React scaffold needs those types, rather than bypassing lint with aliases.

### Further sequencing update — September 15

B4 publication is recovering from a publisher timeout. The React shell,
published Pretable grid, and application-owned read-only snapshot HTTP boundary
can proceed independently; live agent routes and approval remain gated on the
corrected registry packages. Add exactly `@pretable/react@0.19.0` now (the
user-authorized integration), with its matching core/ui transitive dependencies.
No simulated assistant response may stand in for a working model interaction.

## Task 2: Scaffold the smallest runnable pair

**September 15:** The local server serves `/api/snapshot` and session-scoped
operation reads on 127.0.0.1:4325. React runs on 127.0.0.1:4326 with a same-origin
proxy, real Pretable selection, Dashboard/Payments navigation, and the open
Assistant placeholder. `@pretable/react@0.19.0` and `@pretable/ui@0.19.0` are the direct
package additions. The UI package supplies the public CSS imports, so it is
declared directly rather than relying on a transitive install. B4 installation
and actual chat remain pending; the placeholder does not claim a model ran.
Shared DTOs now live in `samples/invoicing/shared/src/index.ts`, the
`invoicing-contracts` Nx library with explicit build/test/lint targets.

**Files:** Server and React configuration files in the file map, both `main`
files, `app.tsx`, `styles.css`, README, and approved manifest changes.

- [ ] Add verified dependency pins and generate the lockfile using the repo's
      package manager. Reuse installed testing, styling, and icon tools. Match basic
      shadcn sidebar behavior using existing primitives; no extra UI framework.
- [ ] Define explicit Nx targets: server build/test/lint/serve; client
      build/test/lint/serve; e2e build/test/lint/e2e/live-model. The e2e `test` target
      aliases the deterministic browser suite; `build` type-checks its test sources.
      Configure Vite's unit-test include to exclude Playwright tests.
- [ ] Use loopback server port 4325 and React port 4326, after checking they are
      available. Configure a same-origin API proxy and match ports in Playwright.
- [ ] Create Dashboard/Payments navigation with chat visible on each page.
      Render only fixture-derived summaries; label the proof as simulated data.
      The mature monthly chart is deferred until the two-year seed exists.
- [ ] Run `npx nx build invoicing-server`, `npx nx lint invoicing-server`,
      `npx nx build invoicing-react`, and `npx nx lint invoicing-react`.
      Expected: successful targets with no unresolved public imports.
- [ ] Commit the scaffold and compatibility record together after checks pass.

## Task 3: Prove the ledger's approval boundary

**September 15:** Domain and session-store portion implemented. Fresh
`npx nx build invoicing-server`, `npx nx test invoicing-server`, and
`npx nx lint invoicing-server` passed (29 tests in two files). The only warning
is the environment setting both `NO_COLOR` and `FORCE_COLOR`. DTOs currently
live inside `server/src/contracts.ts`. The build type-checks; HTTP startup and opaque cookie assignment are now implemented; B4 thread
authorization remains pending. These
tests establish domain behavior, not a completed browser approval boundary.

**Files:** `ledger.ts`, `ledger.spec.ts`, `session-store.ts`,
`session-store.spec.ts`, and `contracts.ts` from the file map.

- [ ] Write top-level failing tests for the following domain cases, with blank
      lines between arrange/act/assert. Use fixture payment `payment-001` and invoice
      `invoice-001`, same customer, USD 240000 cents, version 1. Stored proposals
      include exact allocations, both expected versions, session generation,
      operation ID, and proposal ID/version.

  | Test                 | Assertion                                                                                |
  | -------------------- | ---------------------------------------------------------------------------------------- |
  | Proposal creation    | Payment and invoice balances remain unchanged                                            |
  | Exact approval       | One 240000-cent allocation; both balances zero                                           |
  | Duplicate delivery   | Same recorded result; one allocation and activity entry                                  |
  | Conflicting reuse    | Same operation ID with a different proposal/decision rejected                            |
  | Stale version        | No allocation, activity, or balance changes                                              |
  | Invalid allocation   | Negative, fractional, unsafe integer, excessive amount, wrong currency/customer rejected |
  | Decline              | No ledger mutation                                                                       |
  | Cross-session access | Other session cannot read or apply proposal                                              |
  | Concurrent approval  | Two concurrent calls produce one applied operation                                       |

- [ ] Run `npx nx test invoicing-server`; verify new tests fail for missing
      behavior rather than a broken test configuration.
- [ ] Implement pure validation and immutable ledger transitions. Derive balances
      from allocations. The session store serializes each session's operation:
      check recorded result, validate immutable proposal and record versions, then
      replace the complete snapshot with allocation and operation result atomically.
      Do not await external/model work inside that critical section.
- [ ] Store sessions server-side under opaque IDs from an HTTP-only cookie.
      The proof uses in-memory state and one server process; restarting starts fresh.
      Do not claim durable or distributed transaction guarantees.
- [ ] Run server test/build/lint. Expected: all cases above pass. Commit.

## Task 4: Run the real B4 proposal and interrupt path

**September 15:** The independent server review guard is implemented in
`server/src/review-coordinator.ts`, with session generation tracking and a
session-owned proposal read endpoint. Tests cover canonical nested schema
preservation, opaque capabilities, thread binding, immutable proposals, and
strict once/cancel resume identity. No B4 dependency is installed yet, and no
HTTP financial write or live agent route is enabled. These guard tests do not
satisfy the actual-B4 integration checks below.

The standalone React `AllocationProposal` card is also implemented, with an
identity-only model prop and trusted application context for displayed values
and decision callbacks. Its eight tests cover missing/mismatched proposals and
decision readiness. It remains unmounted until the real interrupt integration.
Both pieces passed independent specification and quality reviews. Current
build/test/lint checks pass: 70 server tests and 16 React tests.

**Files:** `matching-agent.ts`, `matching-agent.spec.ts`, `ag-ui.ts`,
`ag-ui.spec.ts`, and server `main.ts` from the file map.

- [ ] Write failing integration tests with a deterministic model provider at
      B4's supported test seam. Exercise the actual B4 execution and AG-UI mapping;
      do not replace those with hand-authored success events.
- [ ] Assert selected ID and authenticated session resolve authoritative records;
      browser-provided amounts never become ledger values. Assert invalid model
      candidate IDs and amounts cannot create an applicable proposal.
- [ ] Assert the exact `hashbrown.responseSchema` and `ui` intent survive initial
      request and resume. Chunk structured output across boundaries and verify
      Hashbrown renders the exposed allocation component, not raw JSON text.
- [ ] Assert proposing produces a standard B4 interrupt and no ledger mutation.
      Resume using the Task 1 payload contract; assert the route continues the exact
      stored proposal and calls the once-only operation. Decline remains read-only.
- [ ] Implement read and proposal tools, trusted UI output, interruption, and
      approved continuation with the public B4 contract verified in Task 1. The
      model can propose; the application validates and stores the exact proposal.
- [ ] Expose session-owned snapshot and operation-result reads. Validate session
      ownership for agent threads as well as payments and proposals. Keep model
      credentials and all financial writes on the server.
- [ ] Run server test/build/lint and record a redacted wire trace showing initial
      schema, interrupted run, resume, operation result, and refreshed snapshot.
      Commit only after the actual B4 path passes.

## Task 5: Connect the Pretable grid and Hashbrown approval

**Files:** `payments-grid.tsx`, `payment-review.tsx`,
`payment-review.spec.tsx`, `allocation-proposal.tsx`, and client shell.

Reference public patterns in `tools/runtime-smoke/react/src/ui-smoke.tsx` and
`interrupt-controls.tsx`; the latter's fixture approval payload is not a B4
contract and must not be copied without the Task 1 mapping.

- [ ] Write failing client tests: selecting the fixture starts one review;
      rerendering or selecting it again while pending does not start another;
      pending streamed props cannot enable approval; the immutable proposal and
      matching pending batch must both be present before approval becomes enabled.
- [ ] Test that approval submits the originally displayed batch ID and complete
      responses for its interrupts. One unanswered interrupt blocks the entire
      batch; never resolve unknown requests automatically. The happy-path fixture
      produces a single approval interrupt.
- [ ] Test applying disables repeated submission, keeps selection stable, and
      reads authoritative state after success. A failure after submission first
      queries the recorded operation; no blind second allocation or automatic
      approval of a revised proposal is allowed.
- [ ] Implement the grid using Pretable public exports and stable payment IDs.
      Trigger matching from the explicit selection action, not a render side effect.
      Use Hashbrown `useUiChat` and `exposeComponent` for trusted proposal rendering.
      The exposed component identifies a server proposal; it cannot grant authority
      through model-generated props. Render balances from the server snapshot.
- [ ] Keep review ownership above page navigation so Dashboard/Payments toggling
      does not recreate the one proof runtime. Related invoice remains below the
      grid; approval stays in the open right sidebar. No second confirmation dialog.
- [ ] Run `npx nx test invoicing-react`, `npx nx build invoicing-react`, and
      `npx nx lint invoicing-react`. Expected: all ownership and interaction checks
      pass. Commit.

## Task 6: Verify and document the end-to-end proof

**Files:** e2e files from the file map, README, compatibility record.

- [ ] Write the deterministic browser test first. Launch the same application
      and B4 path with its deterministic model seam. Assert Dashboard landing,
      chat open, Payments navigation, then select → proposal → approve. Verify the
      server snapshot has one allocation, the payment is applied, the invoice is
      paid, and selection is unchanged.
- [ ] Add duplicate delivery, stale proposal, and two separate browser-session
      checks. For stale records, use a test-only fixture interface disabled in live
      mode. For duplicate delivery, inspect ledger counts, not only button state.
- [ ] Add an explicit `live-model` Nx target using server-only credentials and a
      bounded provider configuration recorded in Task 1. It must fail clearly when
      credentials are absent, never pass by silently skipping. Assert semantic
      outcomes and trusted component rendering, not exact model prose.
- [ ] Run `npx nx build invoicing-e2e`, `npx nx lint invoicing-e2e`, and
      `npx nx test invoicing-e2e`. Expected: deterministic browser suite passes.
- [ ] Run `npx nx live-model invoicing-e2e` with available authorized server
      credentials. Record provider/model, package versions, and result, without
      secrets. If unavailable, report live verification outstanding; do not claim
      the compatibility milestone is complete.
- [ ] Run build/test/lint for both application projects after final changes.
      If a Hashbrown package changed, run its required targets from `AGENTS.md`,
      including applicable API reports and integration coverage. Record every
      failure or warning. Do not alter existing runtime-smoke fixtures or old apps.
- [ ] Document startup commands, fixture amounts, two-click behavior, actual
      protocol support, local-only persistence limits, and next-stage work.
      Request code review using @superpowers:requesting-code-review; resolve issues
      and verify completion using @superpowers:verification-before-completion.
- [ ] Commit the verified proof. Report deterministic and live results separately.

## Completion criteria

All three actual libraries participate; no mock transcript substitutes for the
live-model evidence. Approval is the only path to allocation. Duplicate delivery
cannot create a second application. The authoritative payment and invoice state
updates in Pretable after approval. The approved shell is recognizable, while
full seed/dashboard work remains explicitly pending. Existing showcases remain
intact until their separately planned replacement and retirement.

## Plan review

Independent review on September 14, 2026: **Approved**, with no blocking
issues. The review confirmed the bounded scope, compatibility checkpoint,
approval ownership, session isolation, duplicate protection, and separate
deterministic/live-model evidence. Implementation has not started.
