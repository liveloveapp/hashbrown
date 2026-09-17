# Invoicing Example on Vercel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the invoicing example to `https://invoicing.hashbrown.dev` as the second Vercel target, with B4's checkpoints and the example's session/review state durable in one Neon Postgres, without putting infrastructure code in the example.

**Architecture:** `samples/invoicing` moves to `examples/invoicing`. The example's authoritative state (sessions, proposals, operations, review bindings/tokens, thread ownership) keeps its pure logic and moves behind `SessionRepository`/`ThreadRepository` with memory and Postgres (CAS on JSONB documents) implementations. The server becomes a real B4 app root (`b4.config.ts`, file-convention `src/middleware.ts`, `src/api.ts`); `b4 build` with the `vercel` target emits the agent function; `tools/vercel/assemble.mjs` merges it with the React static build and an `api` function into `examples/invoicing/.vercel/output`, which the existing `deploy.yml` deploys.

**Tech Stack:** B4 0.8.34 (`vercel` target, `@b4run/sdk` middleware), `pg` 8, esbuild (workspace dep), Nx 23, Vercel Build Output API v3, Node 24 `node --test`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-invoicing-vercel-deployment-design.md`

**Working directory for every command:** `/Users/blove/repos/hashbrown/.claude/worktrees/homepage-v0-5-refresh-0d5f43` on branch `blove/invoicing-vercel` (from `origin/main`). Never `cd` to `/Users/blove/repos/hashbrown`. Never print `/Users/blove/repos/hashbrown/.env`. The B4 workspace at `examples/invoicing/server` has its own `node_modules`; `npm ci` at the root installs it.

---

## File Map

| Path                                                                    | Action                        | Responsibility                                                           |
| ----------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `examples/invoicing/**`                                                 | move from `samples/invoicing` | the example                                                              |
| `examples/invoicing/server/src/persistence/types.ts`                    | create                        | `Session`, `ThreadRecord`, repository interfaces                         |
| `examples/invoicing/server/src/persistence/memory.ts`                   | create                        | in-memory repositories                                                   |
| `examples/invoicing/server/src/persistence/postgres.ts`                 | create                        | `pg`-backed repositories, CAS, `ensureSchema`                            |
| `examples/invoicing/server/src/persistence/from-env.ts`                 | create                        | choose memory vs Postgres by `DATABASE_URL`                              |
| `examples/invoicing/server/src/persistence/contract.spec.ts`            | create                        | shared contract tests (memory always, Postgres when `TEST_DATABASE_URL`) |
| `examples/invoicing/server/src/session-store.ts`                        | rewrite                       | async store over `SessionRepository`, pure transitions                   |
| `examples/invoicing/server/src/review-coordinator.ts`                   | rewrite                       | async coordinator over `ThreadRepository`                                |
| `examples/invoicing/server/src/thread-ownership.ts`                     | rewrite                       | async guard over `ThreadRepository`                                      |
| `examples/invoicing/server/src/assistant-middleware.ts`                 | modify                        | async; owners via `ThreadRepository`                                     |
| `examples/invoicing/server/src/review-middleware.ts`                    | modify                        | async                                                                    |
| `examples/invoicing/server/src/http.ts`                                 | modify                        | async reads; `Secure` cookie on HTTPS                                    |
| `examples/invoicing/server/src/middleware.ts`                           | create                        | B4 file-convention middleware                                            |
| `examples/invoicing/server/src/api.ts`                                  | create                        | Vercel `api` function entry (Node handler)                               |
| `examples/invoicing/server/src/main.ts`                                 | rewrite                       | local dev server, no temp workspace                                      |
| `examples/invoicing/server/src/runtime.ts` (+spec)                      | delete                        | replaced by app root + `middleware.ts`                                   |
| `examples/invoicing/server/b4.config.ts`, `vercel.json`, `package.json` | create/modify                 | B4 app root, target, runtime deps                                        |
| `examples/invoicing/server/browser-fixture.ts`                          | modify                        | async store API, memory repositories                                     |
| `examples/invoicing/vercel.assembly.json`                               | create                        | assembly manifest                                                        |
| `examples/invoicing/project.json`                                       | create                        | Nx app `invoicing`: `build`, `e2e`                                       |
| `examples/invoicing/e2e/deployment-artifact.e2e.test.mjs`               | create                        | artifact assertions + `api` function boot                                |
| `tools/vercel/assemble.mjs`, `assemble.test.mjs`, `project.json`        | create/modify                 | generic Build Output assembler                                           |
| `tools/vercel/bootstrap.mjs`, `bootstrap.test.mjs`                      | modify                        | per-target domains + required env check                                  |
| `.github/workflows/pr-main.yml`                                         | modify                        | second `DEPLOY_TARGETS` entry                                            |
| `www/analog/DEPLOY.md`, `examples/invoicing/README.md`, `AGENTS.md`     | modify                        | docs                                                                     |

---

### Task 1: Move `samples/invoicing` to `examples/invoicing`

**Files:** everything under `samples/invoicing`; `tsconfig.base.json:19`; `package.json:241`; `design/react/canonical-invoicing-example.md`

- [ ] **Step 1: Move**

```bash
mkdir -p examples && git mv samples/invoicing examples/invoicing
```

- [ ] **Step 2: Rewrite path references**

```bash
grep -rl "samples/invoicing" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude=package-lock.json --exclude-dir=docs . | xargs sed -i '' 's#samples/invoicing#examples/invoicing#g'
```

Then check the diff touches only: `tsconfig.base.json`, `package.json` (workspaces), `examples/invoicing/**/{project.json,vite.config.mts,vitest.config.mts,playwright*.config.ts,browser-fixture.ts,README.md,compatibility.md}`, `design/react/canonical-invoicing-example.md`. The React `outDir` becomes `../../../dist/examples/invoicing/react`. If any other file changed, inspect it.

- [ ] **Step 3: Reinstall so the workspace link follows the move**

Run: `npm install --no-audit --no-fund` (updates `package-lock.json`'s workspace path), then `npm ls --all > /dev/null && echo TREE_OK`.

- [ ] **Step 4: Verify every invoicing project**

Run: `npx nx run-many -t lint,test,build -p invoicing-contracts invoicing-server invoicing-react invoicing-e2e --skip-nx-cache`
Expected: all pass.
Run: `npx nx example-e2e invoicing-e2e --skip-nx-cache` → 4 browser scenarios pass.

- [ ] **Step 5: Commit**

```bash
git add -A examples samples tsconfig.base.json package.json package-lock.json design
git commit -m "refactor: move the invoicing example to examples/invoicing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Persistence types and the in-memory repositories (TDD)

**Files:** create `examples/invoicing/server/src/persistence/{types.ts,memory.ts,contract.spec.ts}`

- [ ] **Step 1: Types**

`examples/invoicing/server/src/persistence/types.ts`:

```ts
import type {
  DecisionRequest,
  DecisionResult,
  Ledger,
  Proposal,
} from '@invoicing/contracts';

/** One session's authoritative state; plain records so it serialises to JSONB. */
export interface Session {
  readonly generation: number;
  readonly ledger: Ledger;
  readonly proposals: Readonly<Record<string, Proposal>>;
  readonly operations: Readonly<
    Record<
      string,
      { readonly request: DecisionRequest; readonly result: DecisionResult }
    >
  >;
}

/** Per-thread review binding, capability tokens, and ownership. */
export interface ThreadRecord {
  readonly sessionId: string;
  readonly routeId: string;
  readonly generation: number;
  readonly selectedPaymentId?: string;
  readonly selectedInvoiceId?: string;
  readonly proposalId?: string;
  readonly tokens: Readonly<
    Partial<Record<'initial' | 'once' | 'cancelled', string>>
  >;
}

export interface Document<T> {
  readonly version: number;
  readonly value: T;
}

export class ConflictError extends Error {
  constructor() {
    super('conflict');
    this.name = 'ConflictError';
  }
}

export interface SessionRepository {
  create(initial: Session): Promise<string>;
  load(id: string): Promise<Document<Session> | undefined>;
  /** Compare-and-swap. Rejects with ConflictError when `expectedVersion` is stale. */
  commit(id: string, expectedVersion: number, next: Session): Promise<void>;
}

export interface ThreadRepository {
  load(threadId: string): Promise<Document<ThreadRecord> | undefined>;
  /** `expectedVersion: null` inserts; rejects with ConflictError if the row exists or moved. */
  commit(
    threadId: string,
    expectedVersion: number | null,
    next: ThreadRecord,
  ): Promise<void>;
}

export interface Repositories {
  readonly sessions: SessionRepository;
  readonly threads: ThreadRepository;
  close(): Promise<void>;
}
```

- [ ] **Step 2: Write the contract tests (fail first)**

`examples/invoicing/server/src/persistence/contract.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createLedger } from '../ledger';
import { ConflictError, type Repositories, type Session } from './types';
import { createMemoryRepositories } from './memory';

const emptySession = (): Session => ({
  generation: 1,
  ledger: createLedger(),
  proposals: {},
  operations: {},
});

export function repositoryContract(
  name: string,
  open: () => Promise<Repositories>,
) {
  describe(`${name} repositories`, () => {
    it('creates a session and loads it at version 0', async () => {
      const repos = await open();
      try {
        const id = await repos.sessions.create(emptySession());
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        const doc = await repos.sessions.load(id);
        expect(doc?.version).toBe(0);
        expect(doc?.value.generation).toBe(1);
      } finally {
        await repos.close();
      }
    });

    it('commits with compare-and-swap and rejects stale versions', async () => {
      const repos = await open();
      try {
        const id = await repos.sessions.create(emptySession());
        await repos.sessions.commit(id, 0, {
          ...emptySession(),
          generation: 2,
        });
        expect((await repos.sessions.load(id))?.value.generation).toBe(2);
        await expect(
          repos.sessions.commit(id, 0, { ...emptySession(), generation: 3 }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await repos.sessions.load(id))?.version).toBe(1);
      } finally {
        await repos.close();
      }
    });

    it('returns undefined for unknown ids', async () => {
      const repos = await open();
      try {
        expect(
          await repos.sessions.load('00000000-0000-0000-0000-000000000000'),
        ).toBeUndefined();
        expect(await repos.threads.load('missing')).toBeUndefined();
      } finally {
        await repos.close();
      }
    });

    it('inserts a thread record only once and swaps by version', async () => {
      const repos = await open();
      try {
        const record = {
          sessionId: 's',
          routeId: '/review',
          generation: 1,
          tokens: {},
        };
        await repos.threads.commit('t1', null, record);
        await expect(
          repos.threads.commit('t1', null, record),
        ).rejects.toBeInstanceOf(ConflictError);
        await repos.threads.commit('t1', 0, { ...record, proposalId: 'p' });
        expect((await repos.threads.load('t1'))?.value.proposalId).toBe('p');
        await expect(
          repos.threads.commit('t1', 0, record),
        ).rejects.toBeInstanceOf(ConflictError);
      } finally {
        await repos.close();
      }
    });

    it('never returns shared references', async () => {
      const repos = await open();
      try {
        const session = emptySession();
        const id = await repos.sessions.create(session);
        const a = await repos.sessions.load(id);
        const b = await repos.sessions.load(id);
        expect(a?.value).not.toBe(b?.value);
        expect(a?.value).toEqual(b?.value);
      } finally {
        await repos.close();
      }
    });
  });
}

repositoryContract('memory', async () => createMemoryRepositories());
```

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts src/persistence` → fails (`./memory` missing).

- [ ] **Step 3: Memory implementation**

`examples/invoicing/server/src/persistence/memory.ts`:

```ts
import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  type Document,
  type Repositories,
  type Session,
  type ThreadRecord,
} from './types';

/** Process-local repositories for tests, the e2e fixture, and local development. */
export function createMemoryRepositories(): Repositories {
  const sessions = new Map<string, Document<Session>>();
  const threads = new Map<string, Document<ThreadRecord>>();
  const snapshot = <T>(doc: Document<T> | undefined) =>
    doc
      ? { version: doc.version, value: structuredClone(doc.value) }
      : undefined;

  return {
    sessions: {
      async create(initial) {
        const id = randomUUID();
        sessions.set(id, { version: 0, value: structuredClone(initial) });
        return id;
      },
      async load(id) {
        return snapshot(sessions.get(id));
      },
      async commit(id, expectedVersion, next) {
        const current = sessions.get(id);
        if (!current || current.version !== expectedVersion)
          throw new ConflictError();
        sessions.set(id, {
          version: current.version + 1,
          value: structuredClone(next),
        });
      },
    },
    threads: {
      async load(threadId) {
        return snapshot(threads.get(threadId));
      },
      async commit(threadId, expectedVersion, next) {
        const current = threads.get(threadId);
        if (expectedVersion === null) {
          if (current) throw new ConflictError();
          threads.set(threadId, { version: 0, value: structuredClone(next) });
          return;
        }
        if (!current || current.version !== expectedVersion)
          throw new ConflictError();
        threads.set(threadId, {
          version: current.version + 1,
          value: structuredClone(next),
        });
      },
    },
    async close() {},
  };
}
```

- [ ] **Step 4: Run tests** → 5 pass. Lint: `npx nx lint invoicing-server`.

- [ ] **Step 5: Commit**

```bash
git add examples/invoicing/server/src/persistence
git commit -m "feat(invoicing): add session and thread repositories with an in-memory implementation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Session store over the repository (TDD)

**Files:** rewrite `examples/invoicing/server/src/session-store.ts`; update `session-store.spec.ts`

- [ ] **Step 1: Convert the spec to the async API**

Every scenario in `session-store.spec.ts` stays; the store is created with `createSessionStore(createMemoryRepositories().sessions, createSampleLedger)` (or `createLedger` where the file used it) and every call becomes `await store.<method>(...)`. Expectations that used `expect(() => store.decide(...)).toThrow('stale_generation')` become `await expect(store.decide(...)).rejects.toThrow('stale_generation')`. Add one new scenario:

```ts
it('retries a decision once when the document moved underneath it', async () => {
  const repos = createMemoryRepositories();
  const store = createSessionStore(repos.sessions, createSampleLedger);
  const id = await store.createSession();
  const original = repos.sessions.commit.bind(repos.sessions);
  let injected = false;
  repos.sessions.commit = async (sid, version, next) => {
    if (!injected) {
      injected = true;
      await original(sid, version, next); // someone else commits first
      throw new ConflictError();
    }
    return original(sid, version, next);
  };
  const before = await store.snapshot(id);
  const payment = before.payments.find((p) => p.unappliedCents > 0)!;
  const invoice = before.invoices.find(
    (i) => i.customerId === payment.customerId && i.outstandingCents > 0,
  )!;
  const proposal = await store.propose(id, {
    paymentId: payment.id,
    invoiceId: invoice.id,
    amountCents: Math.min(payment.unappliedCents, invoice.outstandingCents),
  });
  expect(proposal.proposalId).toBeTruthy();
});
```

- [ ] **Step 2: Rewrite the store**

`examples/invoicing/server/src/session-store.ts` — keep every rule from the current file; the `Map`s become records and each mutation is a pure transition committed with CAS:

```ts
import { randomUUID } from 'node:crypto';
import type {
  DecisionRequest,
  DecisionResult,
  Ledger,
  LedgerSnapshot,
  Proposal,
  ProposalRequest,
} from '@invoicing/contracts';
import {
  applyProposal,
  createLedger,
  createProposal,
  getSnapshot,
} from './ledger';
import {
  ConflictError,
  type Session,
  type SessionRepository,
} from './persistence/types';

export interface SessionStore {
  createSession(): Promise<string>;
  generation(sessionId: string): Promise<number>;
  snapshot(sessionId: string): Promise<LedgerSnapshot>;
  propose(sessionId: string, request: ProposalRequest): Promise<Proposal>;
  proposal(sessionId: string, proposalId: string): Promise<Proposal>;
  decide(sessionId: string, request: DecisionRequest): Promise<DecisionResult>;
  operationResult(
    sessionId: string,
    operationId: string,
  ): Promise<DecisionResult | undefined>;
  reset(sessionId: string): Promise<LedgerSnapshot>;
}

type Transition<R> = (session: Session) => {
  readonly session: Session;
  readonly result: R;
};

/** Session-scoped API over a repository; every mutation is one compare-and-swap. */
export function createSessionStore(
  repository: SessionRepository,
  createInitialLedger: () => Ledger = createLedger,
): SessionStore {
  const load = async (id: string) => {
    const doc = await repository.load(id);
    if (!doc) throw new Error('session_not_found');
    return doc;
  };
  const mutate = async <R>(
    id: string,
    transition: Transition<R>,
  ): Promise<R> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const doc = await load(id);
      const { session, result } = transition(doc.value);
      try {
        await repository.commit(id, doc.version, session);
        return result;
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt === 1) throw error;
      }
    }
    throw new ConflictError();
  };

  return {
    async createSession() {
      return repository.create({
        generation: 1,
        ledger: structuredClone(createInitialLedger()),
        proposals: {},
        operations: {},
      });
    },
    async generation(id) {
      return (await load(id)).value.generation;
    },
    async snapshot(id) {
      return getSnapshot((await load(id)).value.ledger);
    },
    propose: (id, request) =>
      mutate(id, (session) => {
        const proposal = createProposal(session.ledger, request, {
          generation: session.generation,
          proposalId: randomUUID(),
          operationId: randomUUID(),
        });
        return {
          session: {
            ...session,
            proposals: {
              ...session.proposals,
              [proposal.proposalId]: proposal,
            },
          },
          result: proposal,
        };
      }),
    async proposal(id, proposalId) {
      const proposal = (await load(id)).value.proposals[proposalId];
      if (!proposal) throw new Error('proposal_not_found');
      return proposal;
    },
    decide: (id, request) =>
      mutate(id, (session) => {
        if (request.generation !== session.generation)
          throw new Error('stale_generation');
        if (request.decision !== 'approve' && request.decision !== 'decline')
          throw new Error('invalid_decision');
        const recorded = session.operations[request.operationId];
        if (recorded) {
          if (
            recorded.request.proposalId !== request.proposalId ||
            recorded.request.proposalVersion !== request.proposalVersion ||
            recorded.request.decision !== request.decision
          )
            throw new Error('operation_conflict');
          return { session, result: recorded.result };
        }
        const proposal = session.proposals[request.proposalId];
        if (!proposal) throw new Error('proposal_not_found');
        if (proposal.operationId !== request.operationId)
          throw new Error('operation_conflict');
        if (proposal.proposalVersion !== request.proposalVersion)
          throw new Error('stale_proposal');
        const ledger =
          request.decision === 'approve'
            ? applyProposal(session.ledger, proposal)
            : session.ledger;
        const result: DecisionResult = {
          proposalId: proposal.proposalId,
          operationId: proposal.operationId,
          status: request.decision === 'approve' ? 'approved' : 'declined',
          snapshot: getSnapshot(ledger),
        };
        const identity: DecisionRequest = {
          proposalId: request.proposalId,
          operationId: request.operationId,
          generation: request.generation,
          proposalVersion: request.proposalVersion,
          decision: request.decision,
        };
        return {
          session: {
            ...session,
            ledger,
            operations: {
              ...session.operations,
              [request.operationId]: { request: identity, result },
            },
          },
          result,
        };
      }),
    async operationResult(id, operationId) {
      return (await load(id)).value.operations[operationId]?.result;
    },
    reset: (id) =>
      mutate(id, (session) => {
        const next: Session = {
          generation: session.generation + 1,
          ledger: structuredClone(createInitialLedger()),
          proposals: {},
          operations: {},
        };
        return { session: next, result: getSnapshot(next.ledger) };
      }),
  };
}
```

Note `mutate` re-runs the transition on conflict, so a transition that throws a domain error (e.g. `stale_generation`) propagates immediately — it is not a `ConflictError`.

- [ ] **Step 3: Run** `npx vitest run --config examples/invoicing/server/vitest.config.mts src/session-store` → all scenarios pass. Other suites will now fail to compile (callers are still synchronous) — that is expected until Task 4; run only this file.

- [ ] **Step 4: Commit**

```bash
git add examples/invoicing/server/src/session-store.ts examples/invoicing/server/src/session-store.spec.ts
git commit -m "refactor(invoicing): make the session store asynchronous over a repository

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Coordinator, ownership, and middlewares over `ThreadRepository`

**Files:** rewrite `review-coordinator.ts`, `thread-ownership.ts`; modify `assistant-middleware.ts`, `review-middleware.ts`, `review-tools.ts` (if it awaits), `http.ts`, `browser-fixture.ts`; update their specs.

- [ ] **Step 1: Coordinator**

Rewrite `review-coordinator.ts` keeping every validation and error string. Shape:

```ts
export function createReviewCoordinator(
  store: SessionStore,
  threads: ThreadRepository,
  expectedResponseSchema: unknown,
): ReviewCoordinator;
```

- `authorize(sessionId, body)` becomes async. It validates exactly as today, then loads `threads.load(threadId)`. Missing record → build a new `ThreadRecord` (`routeId: '/review'`, `tokens: {}`), insert with `commit(threadId, null, record)`. Existing → the same `current()` checks (`thread_binding_conflict`, `stale_generation`), plus `routeId === '/review'` else `thread_binding_conflict`. Token reuse per decision: if `record.tokens[decision]` exists return the context rebuilt from the record; else mint `randomUUID()`, commit the record with the new token (CAS on `doc.version`), and return the context.
- `ReviewContext` gains no fields; `resolve(context)` becomes `threads.load(context.threadId)` and checks `record.tokens[context.decision] === context.token` (else `invalid_review_context`), then rebuilds the binding from the record.
- `prepare` stores `proposalId` on the record with CAS; `apply` calls `store.decide` (async); `getProposal` loads the record.
- Convert `review-coordinator.spec.ts` to `await`/`rejects.toThrow` with the same scenarios; construct with `createMemoryRepositories()`.

- [ ] **Step 2: Ownership guard and assistant owners**

`thread-ownership.ts`: `createThreadOwnershipGuard(store, threads)` returns `async (headers, routeId, body) => void`. Load the record; if present compare `sessionId`, `routeId`, `generation` (`thread_binding_conflict`); if absent insert `{ sessionId, routeId, generation: await store.generation(sessionId), tokens: {} }` (a `ConflictError` on insert means a concurrent first claim — reload and compare instead of failing).

`assistant-middleware.ts`: drop the local `owners` map; the guard above owns `/assistant` threads too (routeId `/assistant`). Everything else stays, made async: `store.generation`, `store.snapshot` awaited. The `current()` helper inside `readLedger`/`validatePayment` becomes async and the tool closures `await` it — check `src/app/assistant/tools/*.ts` and `review-tools.ts` already `await` the context functions; if a tool calls them synchronously, add `await`.

`review-middleware.ts`: async; `reviews.authorize` awaited; closures await `store.*`.

- [ ] **Step 3: HTTP reads**

`http.ts`: `createInvoicingListener(store, reviews?, runReview?)` — the handler body becomes an async IIFE with the same branches, `await`ing store calls; the cookie line becomes

```ts
const secure =
  request.headers['x-forwarded-proto'] === 'https' ||
  (request.socket as { encrypted?: boolean }).encrypted === true;
response.setHeader(
  'set-cookie',
  `${cookieName}=${sessionId}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
);
```

Any thrown error inside the IIFE responds `500 { error: 'internal_error' }` (never leak messages).

- [ ] **Step 4: Fixture**

`browser-fixture.ts`: build `const repos = createMemoryRepositories(); const store = createSessionStore(repos.sessions, createSampleLedger); const reviews = createReviewCoordinator(store, repos.threads, invoicingUiResponseSchema);` and `await` the coordinator/store calls it makes.

- [ ] **Step 5: Verify**

Run: `npx nx run-many -t test,lint,build -p invoicing-server --skip-nx-cache` → green (`runtime.spec.ts` may fail to compile because `runtime.ts` still passes a sync middleware — fix by awaiting inside its `middleware` callback for now; it is deleted in Task 6).
Run: `npx nx example-e2e invoicing-e2e --skip-nx-cache` → 4 scenarios pass.

- [ ] **Step 6: Commit**

```bash
git add examples/invoicing/server
git commit -m "refactor(invoicing): persist review bindings and thread ownership through the repository

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Postgres repositories (TDD, contract-driven)

**Files:** create `persistence/postgres.ts`, `persistence/from-env.ts`; modify `contract.spec.ts`, `examples/invoicing/server/package.json`

- [ ] **Step 1: Dependencies**

Run: `npm install --no-audit --no-fund -w examples/invoicing/server pg@^8.16.0 && npm install --no-audit --no-fund -w examples/invoicing/server -D @types/pg@^8.15.0` then `npm ls --all > /dev/null && echo TREE_OK`.

- [ ] **Step 2: Register the Postgres contract run**

Append to `contract.spec.ts`:

```ts
import { createPostgresRepositories } from './postgres';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
if (testDatabaseUrl) {
  repositoryContract('postgres', () =>
    createPostgresRepositories({
      connectionString: testDatabaseUrl,
      schema: `invoicing_test_${process.pid}`,
    }),
  );
}
```

- [ ] **Step 3: Implementation**

`examples/invoicing/server/src/persistence/postgres.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Pool, type PoolConfig } from 'pg';
import {
  ConflictError,
  type Repositories,
  type Session,
  type ThreadRecord,
} from './types';

export interface PostgresRepositoryOptions extends PoolConfig {
  /** Optional schema for isolation (tests); production uses `public`. */
  readonly schema?: string;
}

const identifier = (value: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('invalid_identifier');
  return `"${value}"`;
};

/** JSONB document repositories with optimistic concurrency. */
export async function createPostgresRepositories(
  options: PostgresRepositoryOptions,
): Promise<Repositories> {
  const { schema = 'public', ...poolConfig } = options;
  const pool = new Pool({ max: 2, ...poolConfig });
  pool.on('error', () => undefined);
  const s = identifier(schema);
  const sessionsTable = `${s}.invoicing_sessions`;
  const threadsTable = `${s}.invoicing_threads`;

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${sessionsTable} (
    id uuid PRIMARY KEY,
    version integer NOT NULL,
    value jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${threadsTable} (
    thread_id text PRIMARY KEY,
    version integer NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now())`);

  return {
    sessions: {
      async create(initial: Session) {
        const id = randomUUID();
        await pool.query(
          `INSERT INTO ${sessionsTable} (id, version, value) VALUES ($1, 0, $2)`,
          [id, JSON.stringify(initial)],
        );
        return id;
      },
      async load(id) {
        const { rows } = await pool.query<{ version: number; value: Session }>(
          `SELECT version, value FROM ${sessionsTable} WHERE id = $1`,
          [id],
        );
        return rows[0];
      },
      async commit(id, expectedVersion, next) {
        const { rowCount } = await pool.query(
          `UPDATE ${sessionsTable} SET value = $3, version = version + 1, updated_at = now()
           WHERE id = $1 AND version = $2`,
          [id, expectedVersion, JSON.stringify(next)],
        );
        if (rowCount !== 1) throw new ConflictError();
      },
    },
    threads: {
      async load(threadId) {
        const { rows } = await pool.query<{
          version: number;
          value: ThreadRecord;
        }>(`SELECT version, value FROM ${threadsTable} WHERE thread_id = $1`, [
          threadId,
        ]);
        return rows[0];
      },
      async commit(threadId, expectedVersion, next) {
        if (expectedVersion === null) {
          const { rowCount } = await pool.query(
            `INSERT INTO ${threadsTable} (thread_id, version, value) VALUES ($1, 0, $2)
             ON CONFLICT (thread_id) DO NOTHING`,
            [threadId, JSON.stringify(next)],
          );
          if (rowCount !== 1) throw new ConflictError();
          return;
        }
        const { rowCount } = await pool.query(
          `UPDATE ${threadsTable} SET value = $3, version = version + 1, updated_at = now()
           WHERE thread_id = $1 AND version = $2`,
          [threadId, expectedVersion, JSON.stringify(next)],
        );
        if (rowCount !== 1) throw new ConflictError();
      },
    },
    async close() {
      if (schema !== 'public') await pool.query(`DROP SCHEMA ${s} CASCADE`);
      await pool.end();
    },
  };
}
```

Loading a `uuid` column with a non-UUID string throws in Postgres; the HTTP layer only passes cookie values already validated by `readSessionCookie`, and the contract test's unknown id is a valid UUID.

- [ ] **Step 4: Environment selection**

`examples/invoicing/server/src/persistence/from-env.ts`:

```ts
import { createMemoryRepositories } from './memory';
import { createPostgresRepositories } from './postgres';
import type { Repositories } from './types';

let shared: Promise<Repositories> | undefined;

/** Postgres when DATABASE_URL is set, otherwise process memory. Shared per process. */
export function repositoriesFromEnv(): Promise<Repositories> {
  shared ??= (async () => {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) return createMemoryRepositories();
    return createPostgresRepositories({ connectionString });
  })();
  return shared;
}
```

- [ ] **Step 5: Run the contract against a real database**

Ask the user for a `TEST_DATABASE_URL` (a Neon branch or local Postgres) via a shell variable — never commit it. Run:
`TEST_DATABASE_URL=… npx vitest run --config examples/invoicing/server/vitest.config.mts src/persistence` → 10 pass (5 memory + 5 postgres). Without the variable → 5 pass.

- [ ] **Step 6: Commit**

```bash
git add examples/invoicing/server/src/persistence examples/invoicing/server/package.json package-lock.json
git commit -m "feat(invoicing): add Postgres repositories with compare-and-swap documents

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The server as a B4 app root

**Files:** create `b4.config.ts`, `src/middleware.ts`, `src/api.ts`; rewrite `src/main.ts`; delete `src/runtime.ts`, `src/runtime.spec.ts`; modify `package.json`, `.gitignore`

- [ ] **Step 1: Runtime dependencies for the Vercel target**

Run: `npm install --no-audit --no-fund -w examples/invoicing/server @b4run/postgres-storage@0.8.34 @neondatabase/serverless@^1 hono@^4` then `npm ls --all > /dev/null && echo TREE_OK`. (These are the packages the emitted runtime imports; the build prints a notice if they are missing from the manifest.)

- [ ] **Step 2: B4 config**

`examples/invoicing/server/b4.config.ts`:

```ts
import { config } from '@b4run/cli';

export default config({
  build: { targets: ['vercel'] },
});
```

- [ ] **Step 3: File-convention middleware**

`examples/invoicing/server/src/middleware.ts`:

```ts
import { allow, defineMiddleware, reject } from '@b4run/sdk';
import { invoicingUiResponseSchema } from '@invoicing/contracts';
import { createAssistantMiddleware } from './assistant-middleware';
import { repositoriesFromEnv } from './persistence/from-env';
import { createReviewCoordinator } from './review-coordinator';
import { createReviewMiddleware } from './review-middleware';
import { createSampleLedger } from './sample-ledger';
import { createSessionStore } from './session-store';
import { createThreadOwnershipGuard } from './thread-ownership';

const services = (async () => {
  const repos = await repositoriesFromEnv();
  const store = createSessionStore(repos.sessions, createSampleLedger);
  const reviews = createReviewCoordinator(
    store,
    repos.threads,
    invoicingUiResponseSchema,
  );
  return {
    assistant: createAssistantMiddleware(store, repos.threads),
    review: createReviewMiddleware(store, reviews),
    claimThread: createThreadOwnershipGuard(store, repos.threads),
  };
})();

/** Session-scoped authorization for the assistant and review routes. */
export default defineMiddleware(async (request) => {
  const { assistant, review, claimThread } = await services;
  const result =
    request.routeId === '/assistant'
      ? await assistant(request)
      : await review(request);
  if (result.action !== 'continue') return reject(result.status, result.body);
  try {
    await claimThread(request.headers, request.routeId, request.body);
  } catch {
    return reject(422, { error: 'invalid_thread' });
  }
  return allow(result.context);
});
```

`createAssistantMiddleware`/`createReviewMiddleware` keep returning `{ action, status, body }` / `{ action: 'continue', context }` so both the B4 file middleware and any test can consume them.

- [ ] **Step 4: The `api` function entry**

`examples/invoicing/server/src/api.ts`:

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { invoicingUiResponseSchema } from '@invoicing/contracts';
import { createInvoicingListener } from './http';
import { repositoriesFromEnv } from './persistence/from-env';
import { createReviewCoordinator } from './review-coordinator';
import { createSampleLedger } from './sample-ledger';
import { createSessionStore } from './session-store';

const listener = (async () => {
  const repos = await repositoriesFromEnv();
  const store = createSessionStore(repos.sessions, createSampleLedger);
  return createInvoicingListener(
    store,
    createReviewCoordinator(store, repos.threads, invoicingUiResponseSchema),
  );
})();

/** Vercel Node function: session-owned reads under /api. */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  (await listener)(request, response);
}
```

- [ ] **Step 5: Local dev server**

`examples/invoicing/server/src/main.ts`:

```ts
import { createRuntimeRequestListener } from '@b4run/cli/runtime';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import handler from './api';
import middleware from './middleware';

async function main() {
  if (process.env['INVOICING_ENV_FILE'])
    process.loadEnvFile(process.env['INVOICING_ENV_FILE']);
  if (!process.env['OPENAI_API_KEY'])
    throw new Error(
      'Set OPENAI_API_KEY or INVOICING_ENV_FILE before starting the agent server.',
    );
  const runtime = await createRuntimeRequestListener({
    appRoot: fileURLToPath(new URL('..', import.meta.url)),
    middleware,
  });
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (
      path.startsWith('/agui/') ||
      path.startsWith('/threads') ||
      path === '/healthz'
    )
      runtime.listener(request, response);
    else void handler(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(4325, '127.0.0.1', resolve);
  });
  console.log('Invoicing agent server: http://127.0.0.1:4325');
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      server.close();
      void runtime.close().finally(() => server.closeAllConnections());
    });
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

Delete `src/runtime.ts` and `src/runtime.spec.ts`. The old `http.ts` branch that forwarded `/agui/...` to `runReview` is no longer needed by `main.ts` (the runtime handles those paths), but `browser-fixture.ts` still injects its scripted `runReview` — keep the parameter.

- [ ] **Step 6: Ignore build products**

Append to the root `.gitignore` under `# Nitro`: `.b4/`. (`.vercel` is already ignored; B4 writes `examples/invoicing/server/.vercel/output` and `.b4/build`.)

- [ ] **Step 7: Check and build with B4**

Run: `npx b4 check --cwd examples/invoicing/server` → `B4.run app is valid: 2 routes discovered.` and middleware detected.
Run: `npx b4 build --cwd examples/invoicing/server --clean`
Expected: `.vercel/output/{config.json,functions/index.func/{.vc-config.json,index.mjs}}` under the server dir and a `vercel.json` written at `examples/invoicing/server/vercel.json` (`buildCommand`, `fluid: true`). Commit that `vercel.json`. If the build fails on a missing import, add it to the server `package.json` dependencies and rebuild.

- [ ] **Step 8: Local run**

With `OPENAI_API_KEY` exported (from your shell, not printed): `npx nx serve invoicing-server` in one terminal, `npx nx serve invoicing-react` in another; open `http://127.0.0.1:4326/`, ask a question, start a review, approve. Then stop, export `DATABASE_URL` to the same test database as Task 5, restart the server, and repeat; the assistant and review must work with Postgres-backed sessions and B4 stores writing `public.b4_*` (B4's Node dev lane still defaults to SQLite for its own stores — that is fine locally; only our repositories switch).

- [ ] **Step 9: Verify and commit**

Run: `npx nx run-many -t test,lint,build -p invoicing-server --skip-nx-cache && npx nx example-e2e invoicing-e2e --skip-nx-cache` → green.

```bash
git add examples/invoicing/server .gitignore package-lock.json
git commit -m "feat(invoicing): turn the server into a B4 app root with a Vercel build target

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `tools/vercel/assemble.mjs` (TDD)

**Files:** create `tools/vercel/assemble.mjs`, `tools/vercel/assemble.test.mjs`; modify `tools/vercel/project.json` (`test` already globs `*.test.mjs`)

- [ ] **Step 1: Failing tests**

`tools/vercel/assemble.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assemble, buildRoutes } from './assemble.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'assemble-'));
  await mkdir(join(root, 'static/assets'), { recursive: true });
  await writeFile(join(root, 'static/index.html'), '<html></html>');
  await writeFile(join(root, 'static/assets/app.js'), 'console.log(1)');
  await mkdir(join(root, 'b4/functions/index.func'), { recursive: true });
  await writeFile(
    join(root, 'b4/functions/index.func/.vc-config.json'),
    JSON.stringify({
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      runtime: 'nodejs24.x',
    }),
  );
  await writeFile(
    join(root, 'b4/functions/index.func/index.mjs'),
    'export default (req, res) => res.end("b4")',
  );
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(
    join(root, 'src/api.ts'),
    'const greeting: string = "api"; export default (req: any, res: any) => res.end(greeting);',
  );
  const manifest = {
    output: 'out',
    static: { dir: 'static', spaFallback: 'index.html' },
    functions: {
      index: { from: 'b4/functions/index.func' },
      api: { entry: 'src/api.ts', runtime: 'nodejs24.x', maxDuration: 30 },
    },
    routes: [
      { src: '/api/(.*)', dest: '/api' },
      { src: '/(agui|threads)(/.*)?', dest: '/index' },
    ],
  };
  await writeFile(join(root, 'vercel.assembly.json'), JSON.stringify(manifest));
  return root;
}

test('buildRoutes puts filesystem first and the SPA fallback last', () => {
  assert.deepEqual(
    buildRoutes({
      routes: [{ src: '/api/(.*)', dest: '/api' }],
      spaFallback: 'index.html',
    }),
    [
      { handle: 'filesystem' },
      { src: '/api/(.*)', dest: '/api' },
      { src: '/(.*)', dest: '/index.html' },
    ],
  );
});

test('assemble produces a Build Output tree from the manifest', async () => {
  const root = await fixture();
  await assemble(join(root, 'vercel.assembly.json'));
  const out = join(root, 'out');
  const config = JSON.parse(await readFile(join(out, 'config.json'), 'utf8'));
  assert.equal(config.version, 3);
  assert.deepEqual(config.routes[0], { handle: 'filesystem' });
  assert.deepEqual(config.routes.at(-1), { src: '/(.*)', dest: '/index.html' });
  assert.ok((await stat(join(out, 'static/assets/app.js'))).isFile());
  const b4 = JSON.parse(
    await readFile(join(out, 'functions/index.func/.vc-config.json'), 'utf8'),
  );
  assert.equal(b4.runtime, 'nodejs24.x');
  assert.equal(b4.handler, 'index.mjs');
  const api = JSON.parse(
    await readFile(join(out, 'functions/api.func/.vc-config.json'), 'utf8'),
  );
  assert.deepEqual(api, {
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    runtime: 'nodejs24.x',
    maxDuration: 30,
    supportsResponseStreaming: true,
  });
  const bundled = await readFile(
    join(out, 'functions/api.func/index.mjs'),
    'utf8',
  );
  assert.match(bundled, /"api"/);
  assert.doesNotMatch(bundled, /: string/);
});

test('assemble replaces a previous output atomically', async () => {
  const root = await fixture();
  await mkdir(join(root, 'out/stale'), { recursive: true });
  await assemble(join(root, 'vercel.assembly.json'));
  await assert.rejects(stat(join(root, 'out/stale')));
});
```

Run: `node --test tools/vercel/assemble.test.mjs` → fails (module missing).

- [ ] **Step 2: Implementation**

`tools/vercel/assemble.mjs`:

```js
#!/usr/bin/env node
/**
 * Assemble a Vercel Build Output API (v3) tree from a manifest:
 *
 *   node tools/vercel/assemble.mjs <path/to/vercel.assembly.json>
 *
 * {
 *   "output": ".vercel/output",
 *   "static": { "dir": "../../dist/app", "spaFallback": "index.html" },
 *   "functions": {
 *     "index": { "from": "server/.vercel/output/functions/index.func" },
 *     "api":   { "entry": "server/src/api.ts", "runtime": "nodejs24.x", "maxDuration": 30 }
 *   },
 *   "routes": [ { "src": "/api/(.*)", "dest": "/api" } ]
 * }
 *
 * Paths resolve relative to the manifest. `from` copies a prebuilt function
 * directory verbatim (its .vc-config.json included); `entry` bundles a Node
 * handler with esbuild. Routes are emitted after `handle: filesystem` and
 * before the SPA fallback.
 */
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export function buildRoutes({ routes = [], spaFallback }) {
  return [
    { handle: 'filesystem' },
    ...routes,
    ...(spaFallback ? [{ src: '/(.*)', dest: `/${spaFallback}` }] : []),
  ];
}

export async function assemble(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const base = dirname(resolve(manifestPath));
  const at = (p) => resolve(base, p);
  const output = at(manifest.output ?? '.vercel/output');
  const staging = `${output}.staging`;

  await rm(staging, { recursive: true, force: true });
  await mkdir(join(staging, 'functions'), { recursive: true });

  if (manifest.static?.dir) {
    await cp(at(manifest.static.dir), join(staging, 'static'), {
      recursive: true,
    });
  }

  for (const [name, fn] of Object.entries(manifest.functions ?? {})) {
    const dir = join(staging, 'functions', `${name}.func`);
    if (fn.from) {
      await cp(at(fn.from), dir, { recursive: true, verbatimSymlinks: true });
      continue;
    }
    await mkdir(dir, { recursive: true });
    await build({
      entryPoints: [at(fn.entry)],
      outfile: join(dir, 'index.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      sourcemap: false,
      logLevel: 'error',
      banner: {
        js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
      },
    });
    await writeFile(
      join(dir, '.vc-config.json'),
      `${JSON.stringify(
        {
          handler: 'index.mjs',
          launcherType: 'Nodejs',
          runtime: fn.runtime ?? 'nodejs24.x',
          ...(fn.maxDuration ? { maxDuration: fn.maxDuration } : {}),
          supportsResponseStreaming: true,
        },
        null,
        2,
      )}\n`,
    );
  }

  await writeFile(
    join(staging, 'config.json'),
    `${JSON.stringify(
      {
        version: 3,
        routes: buildRoutes({
          routes: manifest.routes,
          spaFallback: manifest.static?.spaFallback,
        }),
      },
      null,
      2,
    )}\n`,
  );

  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  return output;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error(
      'usage: node tools/vercel/assemble.mjs <vercel.assembly.json>',
    );
    process.exitCode = 1;
  } else {
    assemble(manifestPath).then(
      (output) => console.log(`assembled ${output}`),
      (error) => {
        console.error(error.message);
        process.exitCode = 1;
      },
    );
  }
}
```

The `createRequire` banner keeps CommonJS dependencies (`pg`) resolvable inside the ESM bundle.

- [ ] **Step 3: Run** `node --test tools/vercel/assemble.test.mjs` → 3 pass; `npx eslint tools/vercel`; `npx prettier --write tools/vercel`.

- [ ] **Step 4: Commit**

```bash
git add tools/vercel/assemble.mjs tools/vercel/assemble.test.mjs
git commit -m "chore(vercel): add a Build Output assembler for static assets and extra functions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The `invoicing` Nx app and its artifact test

**Files:** create `examples/invoicing/vercel.assembly.json`, `examples/invoicing/project.json`, `examples/invoicing/e2e/deployment-artifact.e2e.test.mjs`

- [ ] **Step 1: Manifest**

`examples/invoicing/vercel.assembly.json`:

```json
{
  "output": ".vercel/output",
  "static": {
    "dir": "../../dist/examples/invoicing/react",
    "spaFallback": "index.html"
  },
  "functions": {
    "index": { "from": "server/.vercel/output/functions/index.func" },
    "api": {
      "entry": "server/src/api.ts",
      "runtime": "nodejs24.x",
      "maxDuration": 30
    }
  },
  "routes": [
    { "src": "/api/(.*)", "dest": "/api" },
    { "src": "/(agui|threads)(/.*)?", "dest": "/index" },
    { "src": "/healthz", "dest": "/index" }
  ]
}
```

- [ ] **Step 2: Nx app**

`examples/invoicing/project.json`:

```json
{
  "name": "invoicing",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "projectType": "application",
  "implicitDependencies": [
    "invoicing-react",
    "invoicing-server",
    "invoicing-contracts"
  ],
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "outputs": ["{projectRoot}/.vercel/output"],
      "options": {
        "commands": [
          "npx nx build invoicing-react",
          "npx b4 build --cwd examples/invoicing/server --clean",
          "node tools/vercel/assemble.mjs examples/invoicing/vercel.assembly.json"
        ],
        "parallel": false
      }
    },
    "e2e": {
      "executor": "nx:run-commands",
      "dependsOn": ["build"],
      "options": {
        "command": "node --test examples/invoicing/e2e/*.e2e.test.mjs"
      }
    }
  }
}
```

- [ ] **Step 3: Artifact test**

`examples/invoicing/e2e/deployment-artifact.e2e.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';

const output = new URL('../.vercel/output/', import.meta.url);

test('assembled output has the B4 function, the api function, and the SPA', async () => {
  const config = JSON.parse(
    await readFile(new URL('config.json', output), 'utf8'),
  );
  assert.equal(config.version, 3);
  assert.deepEqual(config.routes[0], { handle: 'filesystem' });
  assert.deepEqual(config.routes.at(-1), { src: '/(.*)', dest: '/index.html' });
  const b4 = JSON.parse(
    await readFile(
      new URL('functions/index.func/.vc-config.json', output),
      'utf8',
    ),
  );
  assert.equal(b4.runtime, 'nodejs24.x');
  await stat(new URL('functions/index.func/index.mjs', output));
  await stat(new URL('static/index.html', output));
});

test('the api function serves a seeded snapshot and sets the session cookie', async () => {
  delete process.env.DATABASE_URL; // memory repositories for the artifact test
  const { default: handler } = await import(
    new URL('functions/api.func/index.mjs', output)
  );
  const server = createServer((req, res) => void handler(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/snapshot`);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('set-cookie') ?? '',
      /^invoicing_session=[0-9a-f-]{36}; Path=\/; HttpOnly; SameSite=Lax$/,
    );
    const snapshot = await response.json();
    assert.equal(snapshot.invoices.length, 150);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
```

- [ ] **Step 4: Build and test**

Run: `npx nx build invoicing --skip-nx-cache` → `assembled …/examples/invoicing/.vercel/output`.
Run: `find examples/invoicing/.vercel/output -maxdepth 3 -not -path '*/node_modules/*' | head -20` and `du -sh examples/invoicing/.vercel/output/functions/*.func` (B4's function is expected to be tens of MB; must be < 250 MB).
Run: `npx nx e2e invoicing --skip-nx-cache` → 2 pass.
Run: `npx nx show projects --affected --base=main --withTarget=build --type=app --json` after touching a file under `examples/invoicing/server` → includes `invoicing`.

- [ ] **Step 5: Commit**

```bash
git add examples/invoicing/vercel.assembly.json examples/invoicing/project.json examples/invoicing/e2e/deployment-artifact.e2e.test.mjs
git commit -m "feat(invoicing): assemble a deployable Vercel output for the example

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Bootstrap target entry, pipeline entry, docs

**Files:** modify `tools/vercel/bootstrap.mjs`, `bootstrap.test.mjs`, `.github/workflows/pr-main.yml`, `www/analog/DEPLOY.md`, `examples/invoicing/README.md`, `AGENTS.md`

- [ ] **Step 1: Generalise targets in the bootstrap**

`TARGETS` becomes:

```js
export const TARGETS = Object.freeze([
  Object.freeze({
    key: 'www',
    project: 'hashbrown-www',
    secret: 'VERCEL_PROJECT_ID_WWW',
    domains: [
      { name: DOMAIN },
      { name: `www.${DOMAIN}`, redirect: DOMAIN, redirectStatusCode: 308 },
    ],
    env: ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL'],
    requiredEnv: ['OPENAI_API_KEY'],
  }),
  Object.freeze({
    key: 'invoicing',
    project: 'hashbrown-invoicing',
    secret: 'VERCEL_PROJECT_ID_INVOICING',
    domains: [{ name: `invoicing.${DOMAIN}` }],
    env: ['OPENAI_API_KEY'],
    requiredEnv: ['OPENAI_API_KEY', 'DATABASE_URL'],
  }),
]);
```

In `main()`'s loop: upsert only `target.env` keys from the process env; `for (const domain of target.domains) log(\`domain ${domain.name}\`, await ensureDomain(vercel, project.id, domain))`; the `www`-only block (DNS zone, `--dns-records`, certificate) runs when `target.key === 'www'` as today; then add a required-env check:

```js
export async function missingEnv(vercel, projectId, keys) {
  const { envs = [] } = await vercel('GET', `/v9/projects/${projectId}/env`);
  const present = new Set(
    envs
      .filter((e) => (e.target ?? []).includes('production'))
      .map((e) => e.key),
  );
  return keys.filter((key) => !present.has(key));
}
```

logging `env <KEY>  missing  connect a Neon store to <project> in the Vercel dashboard (Storage → Neon); it injects DATABASE_URL` for each missing key (do not fail; the domain/secret steps still complete). Add a test `missingEnv reports keys absent from production` with a stubbed `GET /v9/projects/prj_1/env`.

- [ ] **Step 2: Pipeline**

`pr-main.yml` `DEPLOY_TARGETS`:

```yaml
DEPLOY_TARGETS: '[{"key":"www","dir":".","project_id_secret":"VERCEL_PROJECT_ID_WWW"},{"key":"invoicing","dir":"examples/invoicing","project_id_secret":"VERCEL_PROJECT_ID_INVOICING"}]'
```

`actionlint .github/workflows/pr-main.yml` → clean.

- [ ] **Step 3: Docs**

- `www/analog/DEPLOY.md`: in "Automated deployment", add the sentence "`invoicing` deploys `examples/invoicing/.vercel/output`, assembled by `tools/vercel/assemble.mjs` from B4's `vercel` build target, the React build, and the `api` function."
- `examples/invoicing/README.md`: add a "Deployment" section: `npx nx build invoicing` produces the Vercel output; production is `https://invoicing.hashbrown.dev`; `DATABASE_URL` (Neon) and `OPENAI_API_KEY` are Vercel project env vars; locally `DATABASE_URL` is optional (memory repositories).
- `AGENTS.md`: list `invoicing` (`build`, `e2e`) under Samples / apps and note the `examples/` tree.

- [ ] **Step 4: Verify and commit**

Run: `npx nx run-many -t test,lint -p vercel-bootstrap` → green.

```bash
git add tools/vercel .github/workflows/pr-main.yml www/analog/DEPLOY.md examples/invoicing/README.md AGENTS.md
git commit -m "ci: add the invoicing example as a Vercel deployment target

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Full verification and PR

- [ ] **Step 1:** `npx nx affected -t lint,test,typecheck,build,e2e --base=origin/main --parallel=3` → green (includes `invoicing:e2e`, `www:e2e`). `npx nx affected -t example-e2e --base=origin/main` → green.
- [ ] **Step 2:** `git push -u origin blove/invoicing-vercel` and `gh pr create` titled "feat: deploy the invoicing example to Vercel" (summary from the spec; note that the preview fails until the project and `DATABASE_URL` exist).

---

### Task 11: Provision (user's token; one manual dashboard step)

- [ ] **Step 1:** `node tools/vercel/bootstrap.mjs --env-file /Users/blove/repos/hashbrown/.env --skip-workflow` → `project hashbrown-invoicing created`, `domain invoicing.hashbrown.dev created`, `secret VERCEL_PROJECT_ID_INVOICING set`, `env DATABASE_URL missing …`.
- [ ] **Step 2 (user):** Vercel dashboard → Storage → Neon → create a store on blovedev and connect it to `hashbrown-invoicing` for Production and Preview.
- [ ] **Step 3:** re-run the bootstrap → no `missing` line. `curl -sI https://invoicing.hashbrown.dev` will 404/503 until the first deploy; DNS resolves immediately (same Vercel zone).

---

### Task 12: Preview proof, merge, production

- [ ] **Step 1:** re-run the PR workflow (`gh run rerun --failed`); `Preview / preview / invoicing` succeeds; read the deployment URL from the GitHub Deployment as for `www`.
- [ ] **Step 2:** `curl -sS -c cookies.txt "$url/api/snapshot" | head -c 200` → JSON with 150 invoices and a `Set-Cookie`.
- [ ] **Step 3:** in a browser on the preview URL: ask the assistant a question, select the Northstar Labs payment, start the review, **wait 60 seconds** (preview instances scale to zero after 30 s idle so the approval must resume on a fresh instance), approve → the ledger updates and "unapplied" for Northstar becomes $0. Verify in Neon: `SELECT count(*) FROM invoicing_sessions;` ≥ 1 and `SELECT count(*) FROM b4_threads;` ≥ 1.
- [ ] **Step 4:** merge; `Production / production / invoicing` succeeds; repeat Step 2 against `https://invoicing.hashbrown.dev`.

---

### Task 13: Upstream B4 gaps

- [ ] With the user's go-ahead, open issues in `cacheplane/b4run` for the six items in the spec's "B4 gaps" section, each referencing this example and the concrete workaround (`assemble.mjs`, committed `vercel.json`), so the assembler can be retired once the target supports static assets and app functions natively.

---

## Amendments applied during execution

- In the Build Output API a function named `index` is served at `/` as well as `/index`, so B4's `index.func` shadowed the SPA's `index.html` on the preview. The assembler manifest copies it as `agent.func` and routes `/agui`, `/threads`, and `/healthz` to `/agent`.
- B4's Vercel function default-exports a Hono app (`{ fetch }`), which Vercel's Node launcher accepts; the artifact test asserts that shape rather than a Node handler.
- `vercel integration add neon …` provisions and connects the store non-interactively once the marketplace terms have been accepted in a browser; the bootstrap keeps reporting `env DATABASE_URL missing` until then.
