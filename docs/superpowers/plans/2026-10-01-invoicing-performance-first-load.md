# Invoicing performance, PR 1: measurement and first load — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure where time goes (Server-Timing, per-run tool timing, a live performance script and its baseline) and make first load faster (prefetch the ledger from `index.html`, load the assistant in parallel).

**Architecture:** The API responds with `Server-Timing` and builds each snapshot once. The shared B4 middleware wraps each run's tool context with a timer that logs JSON lines. The browser starts the snapshot request from an inline script and the app takes that promise over; the assistant is a lazy chunk with a usable starter shell. A Playwright scenario reports medians against local servers or any deployment.

**Tech Stack:** Node HTTP (Vercel functions), B4 0.13.0 middleware, React 19 (`lazy`/`Suspense`), Vite, Playwright, Vitest, Nx.

**Spec:** `docs/superpowers/specs/2026-09-30-invoicing-performance-design.md`, delivery item 1.

**Dry run (2026-10-01):** this plan's code was written and verified on a branch from the spec commit (ad948366, on `main` at 02ccaff3), then reverted. Server 268, React 147, contracts 22 tests; e2e build and lint; perf and walkthrough unit tests; the deterministic browser suite (6) and eval replay all pass. In a browser, `/api/snapshot` started at 8 ms and was requested once, carried `server-timing`, and the assistant loaded as its own chunk. The perf script ran against production five times; Task 7 records the result.

## Conventions every task follows

- AGENTS.md: failing tests first; top-level `test(...)` only with arrange/act/assert separated by blank lines; TSDoc on exports; no new dependencies.
- Apply each patch with `git apply` in task order; if one does not apply, stop and report rather than hand-merging.
- `npx nx test` does not type-check; build too. Run `npx prettier --write` on touched files only (never on whole directories: it reformats unrelated files).
- B4 lives under `examples/invoicing/server/node_modules`; check its version there before trusting a failure.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Deviations from the spec, and why

- **Per-turn timing** is logged per tool call from inside our own context, not per model turn: B4 has no per-turn middleware hook, and its documented alternative (LangSmith tracing) needs an outside account. Model turns are the gaps between steps.
- **Server-Timing covers `/api` only.** The `/agui` routes stream through B4's runtime, which owns their response headers; their timing comes from the run log instead.
- **The cold-start fix is not in this PR.** It needs `Server-Timing` from the deployed function, which only exists after this PR ships; Task 8 says how to take that measurement.

### Task 1: A Server-Timing helper

**Files:**
- Create: `examples/invoicing/server/src/server-timing.ts`
- Create: `examples/invoicing/server/src/server-timing.spec.ts`

`Server-Timing` lets devtools and the perf script read where server time went, per response. One helper measures named async phases (recording a phase even when it throws) and formats them; another appends to a value an earlier layer set.
- [ ] **Step 1: Write the failing tests**

Create `examples/invoicing/server/src/server-timing.spec.ts` with exactly this content:

````ts
import { expect, test } from 'vitest';
import { appendServerTiming, createServerTiming } from './server-timing';

test('measure records each phase and the header lists them in order', async () => {
  const ticks = [0, 4.25, 10, 22.5];
  const timing = createServerTiming(() => ticks.shift() ?? 0);

  const session = await timing.measure('session', async () => 'id');
  const snapshot = await timing.measure('snapshot', async () => 'json');

  expect([session, snapshot]).toEqual(['id', 'json']);
  expect(timing.header()).toBe('session;dur=4.3, snapshot;dur=12.5');
});

test('a phase that throws is still recorded, and the error propagates', async () => {
  const ticks = [0, 3];
  const timing = createServerTiming(() => ticks.shift() ?? 0);

  const failed = timing.measure('session', async () => {
    throw new Error('stale');
  });

  await expect(failed).rejects.toThrow('stale');
  expect(timing.header()).toBe('session;dur=3.0');
});

test('appendServerTiming joins an earlier header without losing it', () => {
  const values = [
    appendServerTiming(undefined, 'session;dur=1.0'),
    appendServerTiming('init;dur=40.0', 'session;dur=1.0'),
    appendServerTiming('init;dur=40.0', ''),
  ];

  expect(values).toEqual([
    'session;dur=1.0',
    'init;dur=40.0, session;dur=1.0',
    'init;dur=40.0',
  ]);
});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-server -- server-timing`
Expected: FAIL (`./server-timing` missing).
- [ ] **Step 3: Implement**

Create `examples/invoicing/server/src/server-timing.ts` with exactly this content:

````ts
/**
 * Collects named phase durations for one HTTP response and formats them as a
 * `Server-Timing` header (`session;dur=1.2, snapshot;dur=10.4`), which browser
 * devtools and Playwright can read.
 */
export interface ServerTiming {
  /** Run `work`, recording how long it took under `name`, even if it throws. */
  measure<T>(name: string, work: () => Promise<T>): Promise<T>;
  /** The phases measured so far, in order, as a header value. */
  header(): string;
}

/**
 * Start collecting phases for one response.
 *
 * @param now - Clock in milliseconds; tests pass a fake one.
 */
export function createServerTiming(
  now: () => number = () => performance.now(),
): ServerTiming {
  const phases: { readonly name: string; readonly dur: number }[] = [];
  return {
    async measure(name, work) {
      const start = now();
      try {
        return await work();
      } finally {
        phases.push({ name, dur: now() - start });
      }
    },
    header: () =>
      phases.map(({ name, dur }) => `${name};dur=${dur.toFixed(1)}`).join(', '),
  };
}

/** Add phases to a `Server-Timing` value an earlier layer may already have set. */
export function appendServerTiming(
  existing: string | undefined,
  phases: string,
): string {
  return [existing, phases].filter(Boolean).join(', ');
}
````

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-server -- server-timing`
Expected: PASS (3 tests).
- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/server/src/server-timing.ts examples/invoicing/server/src/server-timing.spec.ts
git add examples/invoicing/server/src/server-timing.ts examples/invoicing/server/src/server-timing.spec.ts
git commit -m "feat(invoicing): a Server-Timing helper for the API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 2: Time the snapshot route, and build the snapshot once

**Files:**
- Modify: `examples/invoicing/server/src/http.ts`
- Modify: `examples/invoicing/server/src/http.spec.ts`
- Modify: `examples/invoicing/server/src/api.ts`
- Modify: `examples/invoicing/server/src/api.spec.ts`

Two findings from reading the route: a returning visit called `store.snapshot` twice (once to validate the cookie, once to respond), loading the session and building the 470 KB snapshot twice; and nothing reported where first-visit time goes. Now the snapshot route's single build doubles as the cookie check (other session reads check with the cheaper `store.generation`), every authenticated `/api` response carries `Server-Timing` (`session`, `snapshot`), and the Vercel entry adds `init`, the one-time setup that dominates a cold start. The API entry test re-imports the server module graph, which can pass Vitest's 5 s default on a busy machine (seen once in the dry run), so it allows 20 s.
- [ ] **Step 1: Write the failing tests**

Apply this patch to `examples/invoicing/server/src/http.spec.ts` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/server/src/http.spec.ts b/examples/invoicing/server/src/http.spec.ts
index 44c64e36..59e0189d 100644
--- a/examples/invoicing/server/src/http.spec.ts
+++ b/examples/invoicing/server/src/http.spec.ts
@@ -1,6 +1,6 @@
 import { createServer, type RequestListener } from 'node:http';
 import { AddressInfo } from 'node:net';
-import { expect, test } from 'vitest';
+import { expect, test, vi } from 'vitest';
 import { createInvoicingListener } from './http';
 import { createSessionStore } from './session-store';
 import { createReviewCoordinator } from './review-coordinator';
@@ -229,3 +229,46 @@ test('only the canonical POST review route reaches the agent runtime', async ()
     await app.close();
   }
 });
+
+test('a snapshot read reports its phases in Server-Timing and builds the snapshot once', async () => {
+  const app = await fixture();
+  try {
+    const first = await fetch(`${app.url}/api/snapshot`);
+    const cookie = (first.headers.get('set-cookie') ?? '').split(';')[0];
+    const builds = vi.spyOn(app.store, 'snapshot');
+
+    const second = await fetch(`${app.url}/api/snapshot`, {
+      headers: { cookie },
+    });
+
+    expect(first.headers.get('server-timing')).toMatch(
+      /^session;dur=\d+\.\d, snapshot;dur=\d+\.\d$/,
+    );
+    expect(second.headers.get('server-timing')).toMatch(
+      /^snapshot;dur=\d+\.\d$/,
+    );
+    expect(builds).toHaveBeenCalledOnce();
+    expect(await second.json()).toEqual(await first.json());
+  } finally {
+    await app.close();
+  }
+});
+
+test('other session reads report the session check in Server-Timing', async () => {
+  const app = await fixture();
+  try {
+    const first = await fetch(`${app.url}/api/snapshot`);
+    const cookie = (first.headers.get('set-cookie') ?? '').split(';')[0];
+
+    const missing = await fetch(`${app.url}/api/operations/nope`, {
+      headers: { cookie },
+    });
+
+    expect(missing.status).toBe(404);
+    expect(missing.headers.get('server-timing')).toMatch(
+      /^session;dur=\d+\.\d$/,
+    );
+  } finally {
+    await app.close();
+  }
+});
````

Apply this patch to `examples/invoicing/server/src/api.spec.ts` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/server/src/api.spec.ts b/examples/invoicing/server/src/api.spec.ts
index 58dadaae..ab637f6e 100644
--- a/examples/invoicing/server/src/api.spec.ts
+++ b/examples/invoicing/server/src/api.spec.ts
@@ -61,3 +61,24 @@ test('a cold-start repository failure answers 500 and is retried on the next req
   expect(recovered.body).toMatchObject({ payments: expect.any(Array) });
   expect(repositoriesFromEnv).toHaveBeenCalledTimes(2);
 });
+
+// A fresh import of the whole server module graph can pass 5 s on a busy
+// machine, so this test allows 20 s.
+test('Server-Timing reports the function setup before the request phases', async () => {
+  const repositories = createMemoryRepositories();
+  vi.resetModules();
+  vi.doMock('./persistence/from-env', () => ({
+    repositoriesFromEnv: async () => repositories,
+  }));
+  const handler = (await import('./api')).default;
+
+  const timing = await serving(
+    handler as unknown as RequestListener,
+    async (origin) =>
+      (await fetch(`${origin}/api/snapshot`)).headers.get('server-timing'),
+  );
+
+  expect(timing).toMatch(
+    /^init;dur=\d+\.\d, session;dur=\d+\.\d, snapshot;dur=\d+\.\d$/,
+  );
+}, 20_000);
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-server -- http.spec api.spec`
Expected: FAIL (no `server-timing` header; the snapshot is built twice).
- [ ] **Step 3: Implement**

Apply this patch to `examples/invoicing/server/src/http.ts` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/server/src/http.ts b/examples/invoicing/server/src/http.ts
index 6c388cd8..bdea7424 100644
--- a/examples/invoicing/server/src/http.ts
+++ b/examples/invoicing/server/src/http.ts
@@ -1,4 +1,6 @@
 import type { RequestListener, ServerResponse } from 'node:http';
+import type { LedgerSnapshot } from '@invoicing/contracts';
+import { appendServerTiming, createServerTiming } from './server-timing';
 import { readSessionCookie, sessionCookie } from './session-cookie';
 import type { SessionStore } from './session-store';
 import type { ReviewCoordinator } from './review-coordinator';
@@ -23,6 +25,8 @@ export function createInvoicingListener(
   runReview?: RequestListener,
 ): RequestListener {
   return (request, response) => {
+    const earlier = response.getHeader('server-timing');
+    const earlierTiming = typeof earlier === 'string' ? earlier : undefined;
     void (async () => {
       let path: string;
       try {
@@ -63,16 +67,36 @@ export function createInvoicingListener(
         return;
       }
 
+      // Server-Timing splits the read so slow first visits can be diagnosed:
+      // `session` is the cookie check or the new session, `snapshot` the
+      // ledger build. The snapshot route builds its snapshot once, and that
+      // build doubles as the cookie check.
+      const timing = createServerTiming();
+      const reply = (status: number, body: unknown) => {
+        response.setHeader(
+          'server-timing',
+          appendServerTiming(earlierTiming, timing.header()),
+        );
+        respond(response, status, body);
+      };
       let sessionId = readSessionCookie(request.headers.cookie);
+      let snapshot: LedgerSnapshot | undefined;
       if (sessionId) {
+        const id = sessionId;
         try {
-          await store.snapshot(sessionId);
+          if (path === '/api/snapshot')
+            snapshot = await timing.measure('snapshot', () =>
+              store.snapshot(id),
+            );
+          else await timing.measure('session', () => store.generation(id));
         } catch {
           sessionId = undefined;
         }
       }
       if (!sessionId) {
-        sessionId = await store.createSession();
+        sessionId = await timing.measure('session', () =>
+          store.createSession(),
+        );
         const secure =
           request.headers['x-forwarded-proto'] === 'https' ||
           (request.socket as { encrypted?: boolean }).encrypted === true;
@@ -81,34 +105,31 @@ export function createInvoicingListener(
       if (threadId) {
         try {
           if (!reviews) throw new Error('review_not_found');
-          respond(
-            response,
-            200,
-            await reviews.getProposal(sessionId, threadId),
-          );
+          reply(200, await reviews.getProposal(sessionId, threadId));
         } catch {
-          respond(response, 404, { error: 'review_not_found' });
+          reply(404, { error: 'review_not_found' });
         }
         return;
       }
       if (proposalId) {
         try {
-          respond(response, 200, await store.proposal(sessionId, proposalId));
+          reply(200, await store.proposal(sessionId, proposalId));
         } catch {
-          respond(response, 404, { error: 'proposal_not_found' });
+          reply(404, { error: 'proposal_not_found' });
         }
         return;
       }
       if (operationId) {
         const result = await store.operationResult(sessionId, operationId);
-        respond(
-          response,
-          result ? 200 : 404,
-          result ?? { error: 'operation_not_found' },
-        );
+        reply(result ? 200 : 404, result ?? { error: 'operation_not_found' });
         return;
       }
-      respond(response, 200, await store.snapshot(sessionId));
+      const id = sessionId;
+      reply(
+        200,
+        snapshot ??
+          (await timing.measure('snapshot', () => store.snapshot(id))),
+      );
     })().catch(() => {
       if (!response.headersSent)
         respond(response, 500, { error: 'internal_error' });
````

Apply this patch to `examples/invoicing/server/src/api.ts` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/server/src/api.ts b/examples/invoicing/server/src/api.ts
index 62b5f639..99b71755 100644
--- a/examples/invoicing/server/src/api.ts
+++ b/examples/invoicing/server/src/api.ts
@@ -4,6 +4,7 @@ import type {
   ServerResponse,
 } from 'node:http';
 import { createInvoicingListener } from './http';
+import { createServerTiming } from './server-timing';
 import { getServices } from './services';
 
 let listener: Promise<RequestListener> | undefined;
@@ -24,7 +25,12 @@ export default async function handler(
   response: ServerResponse,
 ) {
   try {
-    (await getListener())(request, response);
+    // `init` is the function's one-time setup (services, the Postgres pool):
+    // large on a cold start, near zero afterwards.
+    const timing = createServerTiming();
+    const listener = await timing.measure('init', getListener);
+    response.setHeader('server-timing', timing.header());
+    listener(request, response);
   } catch {
     if (!response.headersSent) {
       response.writeHead(500, {
````

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-server -- http.spec api.spec`
Expected: PASS (11 tests).
- [ ] **Step 5: Build and commit**

```bash
npx nx build invoicing-server
```

```bash
npx prettier --write examples/invoicing/server/src/http.ts examples/invoicing/server/src/http.spec.ts examples/invoicing/server/src/api.ts examples/invoicing/server/src/api.spec.ts
git add examples/invoicing/server/src/http.ts examples/invoicing/server/src/http.spec.ts examples/invoicing/server/src/api.ts examples/invoicing/server/src/api.spec.ts
git commit -m "perf(invoicing): build the snapshot once per read and report Server-Timing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 3: Log each agent run's tool calls and total

**Files:**
- Create: `examples/invoicing/server/src/run-timing.ts`
- Create: `examples/invoicing/server/src/run-timing.spec.ts`
- Modify: `examples/invoicing/server/src/middleware.ts`
- Modify: `examples/invoicing/server/src/middleware.spec.ts`

B4's middleware has no per-model-turn hook (its documented route to per-call timing is LangSmith tracing, which needs an account and key). So the shared middleware wraps every function in the run's context with a timer: each tool call logs one JSON line with its offset from the run's authorisation and its duration, and the `after` hook logs the total. The model's own turns are the gaps between steps. Non-function values (the response schema, the `rendered` marker the `after` hook reads) are kept by reference, so behaviour is unchanged; the context stays frozen. Lines go to stdout, which Vercel keeps in the function logs:

```json
{"event":"invoicing.run.step","route":"/assistant","runId":"…","step":"aging","at":4900,"dur":12,"ok":true}
{"event":"invoicing.run.done","route":"/assistant","runId":"…","total":11800}
```
- [ ] **Step 1: Write the failing tests**

Create `examples/invoicing/server/src/run-timing.spec.ts` with exactly this content:

````ts
import { expect, test } from 'vitest';
import {
  createRunTimer,
  runTimerOf,
  type RunTimingLine,
  timeContext,
} from './run-timing';

const clock =
  (...ticks: number[]) =>
  () =>
    ticks.shift() ?? 0;

test('each step logs its offset from the run start, its duration and outcome', async () => {
  const lines: RunTimingLine[] = [];
  const timer = createRunTimer(
    '/assistant',
    'run-1',
    (line) => lines.push(line),
    clock(100, 1300, 1340, 5000, 5100, 5200),
  );

  await timer.time('ledgerSummary', async () => 'ok');
  await expect(
    timer.time('aging', async () => {
      throw new Error('bad_currency');
    }),
  ).rejects.toThrow('bad_currency');
  timer.done();

  expect(lines).toEqual([
    {
      event: 'invoicing.run.step',
      route: '/assistant',
      runId: 'run-1',
      step: 'ledgerSummary',
      at: 1200,
      dur: 40,
      ok: true,
    },
    {
      event: 'invoicing.run.step',
      route: '/assistant',
      runId: 'run-1',
      step: 'aging',
      at: 4900,
      dur: 100,
      ok: false,
    },
    {
      event: 'invoicing.run.done',
      route: '/assistant',
      runId: 'run-1',
      total: 5100,
    },
  ]);
});

test('timeContext times the functions and keeps everything else by reference', async () => {
  const lines: RunTimingLine[] = [];
  const timer = createRunTimer('/review', 'run-2', (line) => lines.push(line));
  const rendered = { ui: false };
  const schema = { type: 'object' };
  const context = Object.freeze({
    rendered,
    responseSchema: schema,
    prepare: async (input: { readonly ids: readonly string[] }) =>
      input.ids.length,
  });

  const timed = timeContext(context, timer);
  const result = await timed.prepare({ ids: ['a', 'b'] });

  expect(result).toBe(2);
  expect(timed.rendered).toBe(rendered);
  expect(timed.responseSchema).toBe(schema);
  expect(Object.isFrozen(timed)).toBe(true);
  expect(runTimerOf(timed)).toBe(timer);
  expect(runTimerOf(context)).toBeUndefined();
  expect(
    lines.map((line) => line.event === 'invoicing.run.step' && line.step),
  ).toEqual(['prepare']);
});
````

Apply this patch to `examples/invoicing/server/src/middleware.spec.ts` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/server/src/middleware.spec.ts b/examples/invoicing/server/src/middleware.spec.ts
index 7b26287a..883eafbf 100644
--- a/examples/invoicing/server/src/middleware.spec.ts
+++ b/examples/invoicing/server/src/middleware.spec.ts
@@ -160,3 +160,32 @@ test('the review route keeps the final message it streamed', async () => {
 
   expect(middleware.after(afterRun('/review', undefined))).toBeUndefined();
 });
+
+test('an allowed run is timed: each tool call and the run total are logged', async () => {
+  const { middleware, request } = await setup(async () => undefined);
+  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
+  const result = await middleware.handle(request);
+  if (result.action !== 'continue') throw new Error('expected continue');
+  const context = result.context as Record<string, unknown> & {
+    readonly ledgerSummary: () => Promise<unknown>;
+  };
+
+  await context.ledgerSummary();
+  middleware.after(afterRun('/assistant', context));
+
+  const lines = info.mock.calls.map(([line]) => JSON.parse(String(line)));
+  expect(lines).toEqual([
+    expect.objectContaining({
+      event: 'invoicing.run.step',
+      route: '/assistant',
+      runId: 'turn',
+      step: 'ledgerSummary',
+      ok: true,
+    }),
+    expect.objectContaining({
+      event: 'invoicing.run.done',
+      route: '/assistant',
+      runId: 'turn',
+    }),
+  ]);
+});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-server -- run-timing middleware.spec`
Expected: FAIL (`./run-timing` missing; no timing lines).
- [ ] **Step 3: Implement**

Create `examples/invoicing/server/src/run-timing.ts` with exactly this content:

````ts
/** One structured log line about an agent run's timing. */
export type RunTimingLine =
  | {
      readonly event: 'invoicing.run.step';
      readonly route: string;
      readonly runId: string;
      readonly step: string;
      /** Milliseconds from the run's authorisation to the step's start. */
      readonly at: number;
      readonly dur: number;
      readonly ok: boolean;
    }
  | {
      readonly event: 'invoicing.run.done';
      readonly route: string;
      readonly runId: string;
      readonly total: number;
    };

/**
 * Times the tool calls of one agent run. B4 has no per-turn hook, so the
 * model's own turns show up as the gaps between steps: a step's `at` minus the
 * previous step's end is the model thinking.
 */
export interface RunTimer {
  /** Run `work` as the named step and log its offset and duration. */
  time<T>(step: string, work: () => Promise<T>): Promise<T>;
  /** Log the run's total duration so far. */
  done(): void;
}

const round = (ms: number) => Math.round(ms);

/**
 * Start timing one run.
 *
 * @param route - The B4 route, e.g. `/assistant`.
 * @param runId - The AG-UI run id from the request body.
 * @param log - Where lines go; one JSON object per line on stdout by default,
 *   which Vercel keeps in the function logs.
 * @param now - Clock in milliseconds; tests pass a fake one.
 */
export function createRunTimer(
  route: string,
  runId: string,
  log: (line: RunTimingLine) => void = (line) =>
    console.info(JSON.stringify(line)),
  now: () => number = () => performance.now(),
): RunTimer {
  const start = now();
  return {
    async time(step, work) {
      const begin = now();
      let ok = false;
      try {
        const result = await work();
        ok = true;
        return result;
      } finally {
        log({
          event: 'invoicing.run.step',
          route,
          runId,
          step,
          at: round(begin - start),
          dur: round(now() - begin),
          ok,
        });
      }
    },
    done() {
      log({
        event: 'invoicing.run.done',
        route,
        runId,
        total: round(now() - start),
      });
    },
  };
}

/**
 * A copy of a run's middleware context whose functions are timed as steps,
 * plus the timer itself under `runTimer` so the `after` hook can close the
 * run. Non-function values (the response schema, the `rendered` marker) are
 * kept by reference.
 */
export function timeContext<T extends Readonly<Record<string, unknown>>>(
  context: T,
  timer: RunTimer,
): T & { readonly runTimer: RunTimer } {
  const timed = Object.fromEntries(
    Object.entries(context).map(([name, value]) => [
      name,
      typeof value === 'function'
        ? (...args: unknown[]) =>
            timer.time(name, async () =>
              (value as (...a: unknown[]) => unknown)(...args),
            )
        : value,
    ]),
  );
  return Object.freeze({ ...timed, runTimer: timer }) as T & {
    readonly runTimer: RunTimer;
  };
}

/** The run timer `timeContext` attached, if this context has one. */
export function runTimerOf(
  context: Readonly<Record<string, unknown>> | undefined,
): RunTimer | undefined {
  const timer = context?.['runTimer'];
  return timer && typeof timer === 'object' && 'done' in timer
    ? (timer as RunTimer)
    : undefined;
}
````

Apply this patch to `examples/invoicing/server/src/middleware.ts` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/server/src/middleware.ts b/examples/invoicing/server/src/middleware.ts
index 0ea13fc0..5354442b 100644
--- a/examples/invoicing/server/src/middleware.ts
+++ b/examples/invoicing/server/src/middleware.ts
@@ -1,5 +1,6 @@
 import { allow, defineMiddleware, reject } from '@b4run/sdk';
 import { validatedUi } from './assistant-middleware';
+import { createRunTimer, runTimerOf, timeContext } from './run-timing';
 import { getServices } from './services';
 
 /** Errors the ownership guard raises about the request itself, rather than about storage. */
@@ -25,7 +26,13 @@ export default defineMiddleware({
         return reject(422, { error: 'invalid_thread' });
       throw error;
     }
-    return allow(result.context);
+    // Time every tool call of the run, so slow answers can be traced to a
+    // step or to the model turns between steps (see run-timing.ts).
+    const body = request.body as { readonly runId?: unknown } | undefined;
+    const runId = typeof body?.runId === 'string' ? body.runId : 'unknown';
+    return allow(
+      timeContext(result.context, createRunTimer(request.routeId, runId)),
+    );
   },
   /**
    * The assistant answers by calling `render`; the browser renders that call
@@ -47,6 +54,7 @@ export default defineMiddleware({
    * is a short paragraph that arrives in one piece instead of typing out.
    */
   after: (run) => {
+    runTimerOf(run.context)?.done();
     if (run.routeId !== '/assistant') return undefined;
     return validatedUi(run.context)
       ? { finalMessage: '' }
````

- [ ] **Step 4: Verify the whole server**

```bash
npx nx run-many -t build,test,lint -p invoicing-server
```

Expected: 268 tests pass; lint shows only the 23 pre-existing warnings in unrelated files.
- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/server/src/run-timing.ts examples/invoicing/server/src/run-timing.spec.ts examples/invoicing/server/src/middleware.ts examples/invoicing/server/src/middleware.spec.ts
git add examples/invoicing/server/src/run-timing.ts examples/invoicing/server/src/run-timing.spec.ts examples/invoicing/server/src/middleware.ts examples/invoicing/server/src/middleware.spec.ts
git commit -m "feat(invoicing): log each agent run's tool calls and total

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 4: Starters outside the assistant chunk, a loading shell, and a queued first question

**Files:**
- Create: `examples/invoicing/react/src/assistant-starters.ts`
- Create: `examples/invoicing/react/src/assistant-starters.test.ts`
- Create: `examples/invoicing/react/src/assistant-shell.tsx`
- Create: `examples/invoicing/react/src/assistant-shell.test.tsx`
- Modify: `examples/invoicing/react/src/assistant-workspace.tsx`
- Modify: `examples/invoicing/react/src/assistant-workspace.test.tsx`

Prepares Task 5's lazy assistant. The starter questions move to `assistant-starters.ts` (with the selection logic, unchanged) so the rail can show them without loading the assistant chunk. `AssistantShell` is what the rail renders while the chunk loads: the same starters, usable, holding a pick and saying it will be sent. `AssistantWorkspace` takes `initialPrompt` and sends it once when the conversation mounts.

Why the shell is tested directly rather than through App: in jsdom, Testing Library's `render` flushes the lazy import before returning, so the shell is never observable through App (found in the dry run).
- [ ] **Step 1: Write the failing tests**

Create `examples/invoicing/react/src/assistant-starters.test.ts` with exactly this content:

````ts
import { expect, test } from 'vitest';
import { SELECTED_STARTER, STARTERS, startersFor } from './assistant-starters';

test('a selected payment leads, then a focused client, else the general starters', () => {
  const selections = [
    { selectedPaymentId: 'p', focusedClientName: 'Cedar Health' },
    { focusedClientName: 'Cedar Health' },
    {},
  ];

  const starters = selections.map(startersFor);

  expect(starters).toEqual([
    [SELECTED_STARTER, STARTERS[0], STARTERS[1]],
    [
      'What does Cedar Health owe, and how late is it?',
      STARTERS[0],
      STARTERS[1],
    ],
    STARTERS,
  ]);
});
````

Create `examples/invoicing/react/src/assistant-shell.test.tsx` with exactly this content:

````tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { AssistantShell } from './assistant-shell';

test('while the assistant loads, its starters are usable and a pick is held', () => {
  cleanup();
  const onStart = vi.fn();
  render(
    <AssistantShell starters={['Which clients pay late?']} onStart={onStart} />,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Connecting the assistant…',
  );

  fireEvent.click(
    screen.getByRole('button', { name: 'Which clients pay late?' }),
  );

  expect(onStart).toHaveBeenCalledWith('Which clients pay late?');
});

test('a held starter is named and the other starters wait', () => {
  cleanup();

  render(
    <AssistantShell
      starters={['Which clients pay late?']}
      pending="Which clients pay late?"
      onStart={vi.fn()}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent(
    'Sending “Which clients pay late?” as soon as the assistant connects…',
  );
  expect(
    screen.getByRole('button', { name: 'Which clients pay late?' }),
  ).toBeDisabled();
});
````

Apply this patch to `examples/invoicing/react/src/assistant-workspace.test.tsx` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/react/src/assistant-workspace.test.tsx b/examples/invoicing/react/src/assistant-workspace.test.tsx
index 902a971d..bc579432 100644
--- a/examples/invoicing/react/src/assistant-workspace.test.tsx
+++ b/examples/invoicing/react/src/assistant-workspace.test.tsx
@@ -892,3 +892,24 @@ test('a focused client leads the starters and reaches the run state', async () =
   await screen.findByText('There is one unapplied payment.');
   await settle();
 });
+
+test('an initial prompt from the loading shell is sent once on mount', async () => {
+  cleanup();
+  const { requests, transport } = controlled();
+
+  render(
+    <AssistantWorkspace
+      snapshot={snapshot}
+      initialPrompt="What needs matching?"
+      onApplied={() => undefined}
+      transport={transport}
+    />,
+  );
+
+  await screen.findByText('There is one unapplied payment.');
+  expect(requests).toHaveLength(1);
+  expect(JSON.stringify(requests[0].input.messages)).toContain(
+    'What needs matching?',
+  );
+  await settle();
+});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- assistant-starters assistant-shell assistant-workspace`
Expected: FAIL (modules missing; `initialPrompt` unknown).
- [ ] **Step 3: Implement**

Create `examples/invoicing/react/src/assistant-starters.ts` with exactly this content:

````ts
/** The questions an empty conversation offers when nothing is selected. */
export const STARTERS = [
  'How much cash is still unapplied?',
  'Which clients pay late?',
  'How did invoicing trend over the last 6 months?',
] as const;

/** The first starter while a payment is selected. */
export const SELECTED_STARTER = 'Which invoices does this payment cover?';

/**
 * The starter questions for the current selection: a selected payment wins,
 * then a focused client; otherwise the general three. Kept outside the
 * assistant chunk so the rail can show them before the assistant loads.
 */
export function startersFor(selection: {
  readonly selectedPaymentId?: string;
  readonly focusedClientName?: string;
}): readonly string[] {
  if (selection.selectedPaymentId)
    return [SELECTED_STARTER, ...STARTERS.slice(0, 2)];
  if (selection.focusedClientName)
    return [
      `What does ${selection.focusedClientName} owe, and how late is it?`,
      ...STARTERS.slice(0, 2),
    ];
  return STARTERS;
}
````

Create `examples/invoicing/react/src/assistant-shell.tsx` with exactly this content:

````tsx
/** Inputs for {@link AssistantShell}. */
export interface AssistantShellProps {
  readonly starters: readonly string[];
  /** The starter the user picked while the assistant was loading, if any. */
  readonly pending?: string;
  readonly onStart: (prompt: string) => void;
}

/**
 * What the assistant rail shows while the assistant code is still loading:
 * the same starter questions, usable at once. A starter picked now is held and
 * sent as soon as the assistant arrives.
 */
export function AssistantShell({
  starters,
  pending,
  onStart,
}: AssistantShellProps) {
  return (
    <section className="conversation" aria-busy="true">
      <div className="thread">
        <div className="starters" role="group" aria-label="Suggested questions">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={Boolean(pending)}
              onClick={() => onStart(starter)}
            >
              {starter}
            </button>
          ))}
        </div>
        <p className="muted" role="status">
          {pending
            ? `Sending “${pending}” as soon as the assistant connects…`
            : 'Connecting the assistant…'}
        </p>
      </div>
    </section>
  );
}
````

Apply this patch to `examples/invoicing/react/src/assistant-workspace.tsx` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/react/src/assistant-workspace.tsx b/examples/invoicing/react/src/assistant-workspace.tsx
index 17934df0..be394e22 100644
--- a/examples/invoicing/react/src/assistant-workspace.tsx
+++ b/examples/invoicing/react/src/assistant-workspace.tsx
@@ -16,6 +16,7 @@ import type { TransportOrFactory } from '@hashbrownai/core';
 import type { LedgerSnapshot, Proposal } from '@invoicing/contracts';
 import { findRenderCall, RenderDraft } from './assistant-draft';
 import { assistantKit } from './assistant-kit';
+import { startersFor } from './assistant-starters';
 import { assistantRunState } from './focus';
 import { appliedSummary, listJoin } from './ledger-views';
 import { ReviewChat, type ReviewChatHandle } from './review-chat';
@@ -68,13 +69,6 @@ function ReviewPayment({
 const components = assistantKit(ReviewPayment);
 const ASSISTANT_URL = '/agui/%2Fassistant%23agent';
 
-const STARTERS = [
-  'How much cash is still unapplied?',
-  'Which clients pay late?',
-  'How did invoicing trend over the last 6 months?',
-] as const;
-const SELECTED_STARTER = 'Which invoices does this payment cover?';
-
 /** Explicit matching entry point; false means an existing operation or invoice choice needs attention. */
 export interface AssistantWorkspaceHandle {
   beginReview(paymentId: string, invoiceIds?: readonly string[]): boolean;
@@ -87,6 +81,8 @@ export interface AssistantWorkspaceProps {
   readonly focusedClientId?: string;
   /** The invoice focused on the dashboard; always one of `focusedClientId`'s. */
   readonly focusedInvoiceId?: string;
+  /** A starter the user picked before the assistant loaded; sent on mount. */
+  readonly initialPrompt?: string;
   readonly snapshot: LedgerSnapshot;
   readonly onApplied: (snapshot: LedgerSnapshot) => void;
   /** Reports whether conversation or an unresolved review prevents matching. */
@@ -186,6 +182,7 @@ function Conversation({
   focusedClientId,
   focusedInvoiceId,
   focusedClientName,
+  initialPrompt,
   locked,
   onBusy,
   transport,
@@ -196,6 +193,8 @@ function Conversation({
   focusedInvoiceId?: string;
   /** Names the focused client in the first starter question. */
   focusedClientName?: string;
+  /** A question to send as soon as the conversation mounts. */
+  initialPrompt?: string;
   locked: boolean;
   onBusy: (busy: boolean) => void;
   transport?: TransportOrFactory;
@@ -242,14 +241,14 @@ function Conversation({
     setPrompt('');
   }
 
-  const starters = selectedPaymentId
-    ? [SELECTED_STARTER, ...STARTERS.slice(0, 2)]
-    : focusedClientName
-      ? [
-          `What does ${focusedClientName} owe, and how late is it?`,
-          ...STARTERS.slice(0, 2),
-        ]
-      : STARTERS;
+  const starters = startersFor({ selectedPaymentId, focusedClientName });
+  // A starter picked in the loading shell is sent once, as soon as this mounts.
+  const sentInitial = useRef(false);
+  useEffect(() => {
+    if (!initialPrompt || sentInitial.current) return;
+    sentInitial.current = true;
+    send(initialPrompt);
+  });
   return (
     <section className="conversation" aria-label="Ledger conversation">
       <div className="thread" ref={thread}>
@@ -348,6 +347,7 @@ export function AssistantWorkspace({
   selectedPaymentId,
   focusedClientId,
   focusedInvoiceId,
+  initialPrompt,
   snapshot,
   onApplied,
   onBusyChange,
@@ -426,6 +426,7 @@ export function AssistantWorkspace({
             focusedClientName={
               snapshot.customers.find((c) => c.id === focusedClientId)?.name
             }
+            initialPrompt={initialPrompt}
             locked={Boolean(active)}
             onBusy={setConversationBusy}
             transport={transport}
````

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-react -- assistant-starters assistant-shell assistant-workspace`
Expected: PASS.
- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/react/src/assistant-starters.ts examples/invoicing/react/src/assistant-starters.test.ts examples/invoicing/react/src/assistant-shell.tsx examples/invoicing/react/src/assistant-shell.test.tsx examples/invoicing/react/src/assistant-workspace.tsx examples/invoicing/react/src/assistant-workspace.test.tsx
git add examples/invoicing/react/src/assistant-starters.ts examples/invoicing/react/src/assistant-starters.test.ts examples/invoicing/react/src/assistant-shell.tsx examples/invoicing/react/src/assistant-shell.test.tsx examples/invoicing/react/src/assistant-workspace.tsx examples/invoicing/react/src/assistant-workspace.test.tsx
git commit -m "feat(invoicing): starters and a loading shell outside the assistant chunk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 5: First load: prefetch the ledger, load the assistant in parallel

**Files:**
- Modify: `examples/invoicing/react/index.html`
- Create: `examples/invoicing/react/src/snapshot-prefetch.ts`
- Create: `examples/invoicing/react/src/snapshot-prefetch.test.ts`
- Modify: `examples/invoicing/react/src/main.tsx`
- Modify: `examples/invoicing/react/src/App.tsx`
- Modify: `examples/invoicing/react/src/App.test.tsx`

- **Prefetch.** A classic inline script in `index.html` starts `fetch('/api/snapshot')` while the HTML parses, before the 277 KB (gzipped) app script downloads; the server's work overlaps the download. It marks a failure as handled so it can surface later through the existing "Unable to load the ledger" path. `takePrefetchedSnapshot` hands the promise over once; `createSnapshotLoader` takes it as a second argument and fetches only when it is absent.
- **Lazy assistant.** App imports `AssistantWorkspace` through `React.lazy` and renders `AssistantShell` as the Suspense fallback. In the dry run this split the build into a 738 KB main script (216 KB gzipped, from 1,040 KB / 289 KB) and a 304 KB assistant chunk (75 KB gzipped). Hashbrown's core stays in the main script, because the shared contracts import it.
- **Test change.** The band-matching App test now waits for the assistant's message box before clicking Review match, since the assistant arrives a moment after the first render.
- [ ] **Step 1: Write the failing tests**

Create `examples/invoicing/react/src/snapshot-prefetch.test.ts` with exactly this content:

````ts
import { expect, test } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import { takePrefetchedSnapshot } from './snapshot-prefetch';

test('the prefetched snapshot request is handed over once', () => {
  const request = Promise.resolve({} as LedgerSnapshot);
  const host: Pick<Window, '__invoicingSnapshot'> = {
    __invoicingSnapshot: request,
  };

  const first = takePrefetchedSnapshot(host);
  const second = takePrefetchedSnapshot(host);

  expect(first).toBe(request);
  expect(second).toBeUndefined();
});
````

Apply this patch to `examples/invoicing/react/src/App.test.tsx` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/react/src/App.test.tsx b/examples/invoicing/react/src/App.test.tsx
index d8c4712e..9a3a6a40 100644
--- a/examples/invoicing/react/src/App.test.tsx
+++ b/examples/invoicing/react/src/App.test.tsx
@@ -105,6 +105,17 @@ test('requests one initial snapshot for a StrictMode bootstrap', async () => {
   expect(request).toHaveBeenCalledTimes(1);
 });
 
+test('a bootstrap uses the request index.html already started instead of fetching again', async () => {
+  const request = vi.fn(async () => snapshot);
+  const prefetched = Promise.resolve(snapshot);
+  const loadSnapshot = createSnapshotLoader(request, prefetched);
+
+  const loaded = await loadSnapshot();
+
+  expect(loaded).toBe(snapshot);
+  expect(request).not.toHaveBeenCalled();
+});
+
 test('starts a fresh snapshot request for a new bootstrap', async () => {
   const request = vi.fn(async () => snapshot);
   const firstBootstrap = createSnapshotLoader(request);
@@ -240,6 +251,8 @@ test('matching from the band starts one real chat and approval refreshes the led
       />
     </StrictMode>,
   );
+  // The assistant loads in its own chunk; matching needs it.
+  await screen.findByRole('textbox', { name: 'Message assistant' });
   fireEvent.click(screen.getByRole('tab', { name: /Unapplied/ }));
   fireEvent.click(screen.getByText('payment-001'));
 
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- snapshot-prefetch App.test`
Expected: FAIL (`./snapshot-prefetch` missing; the loader ignores a prefetched promise).
- [ ] **Step 3: Implement**

Apply this patch to `examples/invoicing/react/index.html` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/react/index.html b/examples/invoicing/react/index.html
index 76d0228f..5f9c8d38 100644
--- a/examples/invoicing/react/index.html
+++ b/examples/invoicing/react/index.html
@@ -4,6 +4,19 @@
     <meta charset="UTF-8" />
     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
     <title>Studio · Invoicing</title>
+    <script>
+      // Start the ledger request now, before the app script downloads, so the
+      // server's work overlaps it. main.tsx takes this promise over (see
+      // snapshot-prefetch.ts); errors surface there, so mark them handled here.
+      window.__invoicingSnapshot = fetch('/api/snapshot', {
+        credentials: 'same-origin',
+      }).then((response) => {
+        if (!response.ok)
+          throw new Error('Snapshot request failed: ' + response.status);
+        return response.json();
+      });
+      window.__invoicingSnapshot.catch(() => {});
+    </script>
   </head>
   <body>
     <div id="root"></div>
````

Create `examples/invoicing/react/src/snapshot-prefetch.ts` with exactly this content:

````ts
import type { LedgerSnapshot } from '@invoicing/contracts';

declare global {
  interface Window {
    /**
     * The `/api/snapshot` request `index.html` starts before the app script
     * loads, so the server's work overlaps the script's download.
     */
    __invoicingSnapshot?: Promise<LedgerSnapshot>;
  }
}

/**
 * Hand over the snapshot request `index.html` started, once: a later
 * bootstrap (or a host without the inline script) gets `undefined` and
 * fetches for itself.
 */
export function takePrefetchedSnapshot(
  host: Pick<Window, '__invoicingSnapshot'> = window,
): Promise<LedgerSnapshot> | undefined {
  const prefetched = host.__invoicingSnapshot;
  host.__invoicingSnapshot = undefined;
  return prefetched;
}
````

Apply this patch to `examples/invoicing/react/src/main.tsx` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/react/src/main.tsx b/examples/invoicing/react/src/main.tsx
index 24307cd1..ccf67189 100644
--- a/examples/invoicing/react/src/main.tsx
+++ b/examples/invoicing/react/src/main.tsx
@@ -1,11 +1,12 @@
 import { StrictMode } from 'react';
 import { createRoot } from 'react-dom/client';
 import { App, createSnapshotLoader } from './App';
+import { takePrefetchedSnapshot } from './snapshot-prefetch';
 import '@pretable/ui/themes/pretable.css';
 import '@pretable/ui/grid.css';
 import './styles.css';
 
-const loadSnapshot = createSnapshotLoader();
+const loadSnapshot = createSnapshotLoader(undefined, takePrefetchedSnapshot());
 const root = document.getElementById('root');
 if (!root) throw new Error('Missing application root');
 createRoot(root).render(
````

Apply this patch to `examples/invoicing/react/src/App.tsx` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/react/src/App.tsx b/examples/invoicing/react/src/App.tsx
index 5754fc4c..17f7950a 100644
--- a/examples/invoicing/react/src/App.tsx
+++ b/examples/invoicing/react/src/App.tsx
@@ -1,9 +1,16 @@
-import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
-import type { TransportOrFactory } from '@hashbrownai/core';
 import {
-  AssistantWorkspace,
-  type AssistantWorkspaceHandle,
-} from './assistant-workspace';
+  lazy,
+  Suspense,
+  useCallback,
+  useEffect,
+  useMemo,
+  useRef,
+  useState,
+} from 'react';
+import type { TransportOrFactory } from '@hashbrownai/core';
+import { AssistantShell } from './assistant-shell';
+import { startersFor } from './assistant-starters';
+import type { AssistantWorkspaceHandle } from './assistant-workspace';
 import type { LedgerSnapshot } from '@invoicing/contracts';
 import { DashboardView } from './dashboard-view';
 import {
@@ -24,6 +31,15 @@ export interface AppProps {
   readonly loadSnapshot?: () => Promise<LedgerSnapshot>;
 }
 
+// The assistant (Hashbrown's React runtime, the AG-UI client, the review
+// chat) loads in its own chunk, so the dashboard paints without waiting for
+// it; the rail shows `AssistantShell` meanwhile.
+const AssistantWorkspace = lazy(() =>
+  import('./assistant-workspace').then((module) => ({
+    default: module.AssistantWorkspace,
+  })),
+);
+
 async function fetchSnapshot(): Promise<LedgerSnapshot> {
   const response = await fetch('/api/snapshot', { credentials: 'same-origin' });
   if (!response.ok)
@@ -47,6 +63,7 @@ export function App({
   const [reviewNotice, setReviewNotice] = useState('');
   const [assistantBusy, setAssistantBusy] = useState(false);
   const [matchRequest, setMatchRequest] = useState(0);
+  const [pendingPrompt, setPendingPrompt] = useState<string>();
   const handleBusyChange = useCallback((busy: boolean) => {
     setAssistantBusy(busy);
     if (!busy) setReviewNotice('');
@@ -212,17 +229,31 @@ export function App({
             </p>
           )}
           {enableAssistant && snapshot ? (
-            <AssistantWorkspace
-              ref={reviewRef}
-              snapshot={snapshot}
-              selectedPaymentId={selection.selectedPaymentId}
-              focusedClientId={selection.focusedClientId}
-              focusedInvoiceId={selection.focusedInvoiceId}
-              transport={transport}
-              onApplied={setSnapshot}
-              onBusyChange={handleBusyChange}
-              onChooseInvoice={chooseInvoice}
-            />
+            <Suspense
+              fallback={
+                <AssistantShell
+                  starters={startersFor({
+                    selectedPaymentId: selected?.id,
+                    focusedClientName: focusedClient?.name,
+                  })}
+                  pending={pendingPrompt}
+                  onStart={setPendingPrompt}
+                />
+              }
+            >
+              <AssistantWorkspace
+                ref={reviewRef}
+                initialPrompt={pendingPrompt}
+                snapshot={snapshot}
+                selectedPaymentId={selection.selectedPaymentId}
+                focusedClientId={selection.focusedClientId}
+                focusedInvoiceId={selection.focusedInvoiceId}
+                transport={transport}
+                onApplied={setSnapshot}
+                onBusyChange={handleBusyChange}
+                onChooseInvoice={chooseInvoice}
+              />
+            </Suspense>
           ) : (
             <p className="connection-notice">
               Assistant connection is not ready yet. Payment context is
@@ -250,11 +281,16 @@ export function App({
   );
 }
 
-/** Creates the initial snapshot loader for one application bootstrap. */
+/**
+ * Creates the initial snapshot loader for one application bootstrap. It
+ * resolves to the request `index.html` already started when there is one
+ * (see `snapshot-prefetch.ts`), and otherwise fetches once.
+ */
 export function createSnapshotLoader(
   request: () => Promise<LedgerSnapshot> = fetchSnapshot,
+  prefetched?: Promise<LedgerSnapshot>,
 ): () => Promise<LedgerSnapshot> {
-  let initialRequest: Promise<LedgerSnapshot> | undefined;
+  let initialRequest: Promise<LedgerSnapshot> | undefined = prefetched;
   return () => {
     initialRequest ??= request();
     return initialRequest;
````

- [ ] **Step 4: Verify the whole React project**

```bash
npx nx run-many -t build,test,lint -p invoicing-react
```

Expected: 147 tests pass; the build lists two scripts, `index-*.js` (~738 KB, ~216 KB gzipped) and `assistant-workspace-*.js` (~304 KB, ~75 KB gzipped).
- [ ] **Step 5: Check it in a browser.** Start `invoicing-server` and `invoicing-react` (the preview launch config, or `npx nx serve` for each with `INVOICING_ENV_FILE` for the server, never printing the file). Load http://127.0.0.1:4326 and, in devtools: exactly one `/api/snapshot` request, starting before `main.tsx`/the app script finishes; its response carries `server-timing`; the assistant loads as its own request; no console errors.
- [ ] **Step 6: Commit**

```bash
npx prettier --write examples/invoicing/react/index.html examples/invoicing/react/src/snapshot-prefetch.ts examples/invoicing/react/src/snapshot-prefetch.test.ts examples/invoicing/react/src/main.tsx examples/invoicing/react/src/App.tsx examples/invoicing/react/src/App.test.tsx
git add examples/invoicing/react/index.html examples/invoicing/react/src/snapshot-prefetch.ts examples/invoicing/react/src/snapshot-prefetch.test.ts examples/invoicing/react/src/main.tsx examples/invoicing/react/src/App.tsx examples/invoicing/react/src/App.test.tsx
git commit -m "perf(invoicing): prefetch the ledger from index.html and load the assistant in parallel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 6: The live performance script

**Files:**
- Create: `examples/invoicing/e2e/perf/stats.ts`, `examples/invoicing/e2e/perf/stats.spec.ts`, `examples/invoicing/e2e/perf/vitest.config.mts`, `examples/invoicing/e2e/perf/perf.playwright.config.ts`, `examples/invoicing/e2e/perf/perf.live.ts`
- Modify: `examples/invoicing/e2e/project.json` (targets `perf-live`, `test-perf`)
- Modify: `examples/invoicing/e2e/tsconfig.json` (include `perf/*.ts`)

`npx nx perf-live invoicing-e2e` runs a fixed scenario in `PERF_RUNS` (default 5) fresh browser sessions, against local servers (needs the model key, like `live-model`) or any deployment via `PERF_BASE_URL`, and prints a Markdown table of medians plus the raw runs in `test-results/examples/invoicing-perf/perf.json`. Per run: navigation to the first dashboard figures (plus the snapshot's Server-Timing phases when the server sends them); for three fixed questions, send to the first answer text and to the settled answer; for Harbor's combined payment on the Unapplied tab, Review match to an approvable card, and Approve to the visible "Applied $…" outcome (the review panel collapses on success, hiding "Allocation applied.", found in the dry run).
- [ ] **Step 1: Write the failing unit tests**

Create `examples/invoicing/e2e/perf/stats.spec.ts` with exactly this content:

````ts
import { expect, test } from 'vitest';
import { median, parseServerTiming, type PerfRun, summarize } from './stats';

test('median handles odd, even and empty inputs', () => {
  const values = [median([5, 1, 3]), median([4, 1, 3, 2]), median([])];

  expect(values.slice(0, 2)).toEqual([3, 2.5]);
  expect(values[2]).toBeNaN();
});

test('parseServerTiming reads each phase duration', () => {
  const header = 'init;dur=3.1, session;dur=0.4, snapshot;dur=12.0';

  const phases = parseServerTiming(header);

  expect(phases).toEqual({ init: 3.1, session: 0.4, snapshot: 12 });
  expect(parseServerTiming(null)).toEqual({});
});

test('summarize prints the medians as a Markdown table', () => {
  const run = (scale: number): PerfRun => ({
    dashboardData: 400 * scale,
    snapshotServer: { snapshot: 10 * scale },
    questions: [
      { question: 'Q', firstText: 9000 * scale, settled: 12000 * scale },
    ],
    approvalCard: 11000 * scale,
    applied: 8000 * scale,
  });

  const table = summarize([run(1), run(2), run(3)]);

  expect(table.split('\n')).toEqual([
    '| Moment (median of 3) | Time |',
    '| --- | --- |',
    '| Dashboard data | 0.80 s |',
    '| Snapshot server: snapshot | 0.02 s |',
    '| First answer text: Q | 18.00 s |',
    '| Settled answer: Q | 24.00 s |',
    '| Approval card | 22.00 s |',
    '| Approve to applied | 16.00 s |',
  ]);
});
````

Create `examples/invoicing/e2e/perf/vitest.config.mts` with exactly this content:

````ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: { include: ['*.spec.ts'], environment: 'node' },
});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --config examples/invoicing/e2e/perf/vitest.config.mts`
Expected: FAIL (`./stats` missing).
- [ ] **Step 3: Implement**

Create `examples/invoicing/e2e/perf/stats.ts` with exactly this content:

````ts
/** One scenario run's timings, in milliseconds. */
export interface PerfRun {
  /** Navigation to the first dashboard figures. */
  readonly dashboardData: number;
  /** The snapshot response's Server-Timing phases, e.g. `{ init: 3, snapshot: 12 }`. */
  readonly snapshotServer: Readonly<Record<string, number>>;
  /** Per question: send to the first answer text, and to the settled answer. */
  readonly questions: readonly {
    readonly question: string;
    readonly firstText: number;
    readonly settled: number;
  }[];
  /** Review match to an approval card that can be approved. */
  readonly approvalCard: number;
  /** Approve and apply to the visible "Applied $…" outcome. */
  readonly applied: number;
}

/** The median of some numbers; NaN for none. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Parse a `Server-Timing` header (`init;dur=3.1, snapshot;dur=12`) into durations. */
export function parseServerTiming(
  header: string | null,
): Record<string, number> {
  const phases: Record<string, number> = {};
  for (const entry of (header ?? '').split(',')) {
    const [name, ...params] = entry.trim().split(';');
    const dur = params.find((p) => p.trim().startsWith('dur='));
    if (name && dur) phases[name] = Number(dur.trim().slice(4));
  }
  return phases;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

/**
 * The medians of several runs as the Markdown table PR descriptions quote:
 * one row per moment, plus one per question.
 */
export function summarize(runs: readonly PerfRun[]): string {
  const rows: [string, number][] = [
    ['Dashboard data', median(runs.map((r) => r.dashboardData))],
    ...Object.keys(runs[0]?.snapshotServer ?? {}).map(
      (phase): [string, number] => [
        `Snapshot server: ${phase}`,
        median(runs.map((r) => r.snapshotServer[phase] ?? Number.NaN)),
      ],
    ),
    ...(runs[0]?.questions ?? []).flatMap((q, i): [string, number][] => [
      [
        `First answer text: ${q.question}`,
        median(runs.map((r) => r.questions[i].firstText)),
      ],
      [
        `Settled answer: ${q.question}`,
        median(runs.map((r) => r.questions[i].settled)),
      ],
    ]),
    ['Approval card', median(runs.map((r) => r.approvalCard))],
    ['Approve to applied', median(runs.map((r) => r.applied))],
  ];
  return [
    `| Moment (median of ${runs.length}) | Time |`,
    '| --- | --- |',
    ...rows.map(([name, ms]) => `| ${name} | ${seconds(ms)} |`),
  ].join('\n');
}
````

Create `examples/invoicing/e2e/perf/perf.playwright.config.ts` with exactly this content:

````ts
import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');
const remote = process.env.PERF_BASE_URL;

if (!remote) {
  if (process.env.INVOICING_ENV_FILE)
    process.loadEnvFile(process.env.INVOICING_ENV_FILE);
  if (!process.env.OPENAI_API_KEY)
    throw new Error(
      'perf-live against local servers needs OPENAI_API_KEY or INVOICING_ENV_FILE; or set PERF_BASE_URL to a deployed app.',
    );
}

/**
 * The live performance scenario (`npx nx perf-live invoicing-e2e`): local
 * servers by default, or any deployment through PERF_BASE_URL. Uses the live
 * model, so results vary run to run; it reports medians.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'perf.live.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 15 * 60_000,
  expect: { timeout: 120_000 },
  outputDir: resolve(repoRoot, 'test-results/examples/invoicing-perf'),
  reporter: [['list']],
  use: {
    baseURL: remote ?? 'http://127.0.0.1:4326',
    channel: 'chrome',
    headless: true,
  },
  webServer: remote
    ? undefined
    : [
        {
          command: 'npx nx serve invoicing-server',
          cwd: repoRoot,
          url: 'http://127.0.0.1:4325/api/snapshot',
          reuseExistingServer: true,
          timeout: 30_000,
        },
        {
          command: 'npx nx serve invoicing-react',
          cwd: repoRoot,
          url: 'http://127.0.0.1:4326',
          reuseExistingServer: true,
          timeout: 30_000,
        },
      ],
});
````

Create `examples/invoicing/e2e/perf/perf.live.ts` with exactly this content:

````ts
import { expect, type Page, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseServerTiming, type PerfRun, summarize } from './stats';

const RUNS = Number(process.env.PERF_RUNS ?? 5);
const QUESTIONS = [
  'How much cash is still unapplied?',
  'Which clients pay late?',
  'How did invoicing trend over the last 6 months?',
];
const OUT = resolve(
  __dirname,
  '../../../../test-results/examples/invoicing-perf/perf.json',
);

/** Milliseconds `until` takes to resolve after `action` starts. */
async function timed(
  action: () => Promise<unknown>,
  until: () => Promise<unknown>,
) {
  const start = Date.now();
  await action();
  await until();
  return Date.now() - start;
}

async function ask(page: Page, question: string) {
  const answers = page.locator('.assistant-answer');
  const before = await answers.count();
  const message = page.getByRole('textbox', {
    name: 'Message assistant',
    exact: true,
  });
  await expect(message).toBeEnabled();
  await message.fill(question);
  const start = Date.now();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(answers.nth(before).locator('p').first()).not.toBeEmpty();
  const firstText = Date.now() - start;
  await expect(message).toBeEnabled();
  return { question, firstText, settled: Date.now() - start };
}

async function scenario(page: Page): Promise<PerfRun> {
  await page.goto('/');
  // Navigation start is 0 on the page's own clock, so this is load-to-figures.
  await page.waitForFunction(() =>
    document.querySelector('.kpi-strip strong')?.textContent?.includes('$'),
  );
  const dashboardData = await page.evaluate(() => performance.now());
  const header = await page.evaluate(() => {
    const entry = performance
      .getEntriesByType('resource')
      .find((e) => e.name.endsWith('/api/snapshot')) as
      PerformanceResourceTiming | undefined;
    return (entry?.serverTiming ?? [])
      .map((t) => `${t.name};dur=${t.duration}`)
      .join(', ');
  });

  const questions = [];
  for (const question of QUESTIONS) questions.push(await ask(page, question));

  await page.getByRole('tab', { name: /^Unapplied/ }).click();
  await page
    .getByRole('treegrid', { name: 'Unapplied payments', exact: true })
    .locator('[data-pretable-row-id="payment-harbor-combined"]')
    .click();
  const approve = page.getByRole('button', {
    name: 'Approve and apply',
    exact: true,
  });
  const approvalCard = await timed(
    () =>
      page.getByRole('button', { name: 'Review match', exact: true }).click(),
    () => expect(approve.last()).toBeEnabled(),
  );
  // The review collapses once applied; its visible outcome line is "Applied $…".
  const applied = await timed(
    () => approve.last().click(),
    () => expect(page.getByText(/^Applied \$/).last()).toBeVisible(),
  );

  return {
    dashboardData,
    snapshotServer: parseServerTiming(header),
    questions,
    approvalCard,
    applied,
  };
}

test(`performance scenario, ${RUNS} fresh sessions`, async ({ browser }) => {
  const runs: PerfRun[] = [];

  for (let i = 0; i < RUNS; i++) {
    // A fresh context is a fresh session, so Harbor's payment is unapplied again.
    const context = await browser.newContext();
    try {
      runs.push(await scenario(await context.newPage()));
    } finally {
      await context.close();
    }
  }

  mkdirSync(resolve(OUT, '..'), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ runs }, null, 2));
  console.log(`\n${summarize(runs)}\n\nRaw runs: ${OUT}`);
  expect(runs).toHaveLength(RUNS);
});
````

Apply this patch to `examples/invoicing/e2e/project.json` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/e2e/project.json b/examples/invoicing/e2e/project.json
index 1e586686..b8b7603c 100644
--- a/examples/invoicing/e2e/project.json
+++ b/examples/invoicing/e2e/project.json
@@ -108,6 +108,18 @@
       "options": {
         "command": "playwright test --config examples/invoicing/e2e/provider.playwright.config.ts"
       }
+    },
+    "perf-live": {
+      "executor": "nx:run-commands",
+      "options": {
+        "command": "playwright test --config examples/invoicing/e2e/perf/perf.playwright.config.ts"
+      }
+    },
+    "test-perf": {
+      "executor": "nx:run-commands",
+      "options": {
+        "command": "vitest run --config examples/invoicing/e2e/perf/vitest.config.mts"
+      }
     }
   },
   "implicitDependencies": [
````

Apply this patch to `examples/invoicing/e2e/tsconfig.json` (`git apply`; generated against `main` at 02ccaff3):

````diff
diff --git a/examples/invoicing/e2e/tsconfig.json b/examples/invoicing/e2e/tsconfig.json
index 899f49b7..ba86c194 100644
--- a/examples/invoicing/e2e/tsconfig.json
+++ b/examples/invoicing/e2e/tsconfig.json
@@ -8,5 +8,10 @@
     "types": ["node"],
     "ignoreDeprecations": "6.0"
   },
-  "include": ["*.ts", "walkthrough/*.ts", "../server/browser-fixture.ts"]
+  "include": [
+    "*.ts",
+    "walkthrough/*.ts",
+    "perf/*.ts",
+    "../server/browser-fixture.ts"
+  ]
 }
````

- [ ] **Step 4: Verify**

```bash
npx nx run-many -t build,lint,test-perf,test-walkthrough -p invoicing-e2e
PERF_BASE_URL=https://invoicing.hashbrown.dev PERF_RUNS=1 npx nx perf-live invoicing-e2e
```

Expected: type-check, lint and 3 unit tests pass; the single live run prints the table and `1 passed` (about a minute). It drives the public demo like a visitor, in a fresh session.
- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/e2e/perf/stats.ts examples/invoicing/e2e/perf/stats.spec.ts examples/invoicing/e2e/perf/vitest.config.mts examples/invoicing/e2e/perf/perf.playwright.config.ts examples/invoicing/e2e/perf/perf.live.ts examples/invoicing/e2e/project.json examples/invoicing/e2e/tsconfig.json
git add examples/invoicing/e2e/perf/stats.ts examples/invoicing/e2e/perf/stats.spec.ts examples/invoicing/e2e/perf/vitest.config.mts examples/invoicing/e2e/perf/perf.playwright.config.ts examples/invoicing/e2e/perf/perf.live.ts examples/invoicing/e2e/project.json examples/invoicing/e2e/tsconfig.json
git commit -m "test(invoicing): a live performance scenario with medians

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 7: Record the baseline in the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-invoicing-performance-design.md` (a new "Baseline" section after "Targets")

The dry run measured production (`https://invoicing.hashbrown.dev`, `main` at 02ccaff3, before this PR) with `PERF_RUNS=5` on 2026-10-01. It corrects the spec's early estimates: the approval card is ~7.6 s, not ~12 s, and Approve ~6.6 s, not ~9 s. Add this section, re-running the command first if you want fresh numbers (and replacing them if you do):
- [ ] **Step 1: Add the section** after the Targets table:

```markdown
## Baseline

Measured 2026-10-01 against production (`main` at 02ccaff3) with
`PERF_BASE_URL=https://invoicing.hashbrown.dev PERF_RUNS=5 npx nx perf-live invoicing-e2e`;
medians of five fresh sessions:

| Moment | Baseline |
| --- | --- |
| Dashboard data | 0.51 s |
| First answer text: How much cash is still unapplied? | 11.20 s |
| Settled answer: How much cash is still unapplied? | 13.00 s |
| First answer text: Which clients pay late? | 11.64 s |
| Settled answer: Which clients pay late? | 12.94 s |
| First answer text: How did invoicing trend over the last 6 months? | 9.16 s |
| Settled answer: How did invoicing trend over the last 6 months? | 11.45 s |
| Approval card | 7.60 s |
| Approve to applied | 6.63 s |

The earlier figures in "Why" (approval card ~12 s, Approve ~9 s) came from
walkthrough recordings; these replace them as the reference.
```
- [ ] **Step 2: Commit**

```bash
npx prettier --write docs/superpowers/specs/2026-09-30-invoicing-performance-design.md
git add docs/superpowers/specs/2026-09-30-invoicing-performance-design.md
git commit -m "docs(invoicing): record the performance baseline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Final verification, then measure after deploy

**Files:**
- (no file changes in this PR)

- [ ] **Step 1:** `node -p "require('./examples/invoicing/server/node_modules/@b4run/cli/package.json').version"` matches `examples/invoicing/server/package.json` (0.13.0 at planning time); otherwise `npm ci --no-audit --no-fund`.
- [ ] **Step 2:**

```bash
npx nx run-many -t build,test,lint -p invoicing-contracts,invoicing-server,invoicing-react,invoicing-e2e
npx nx run-many -t test-perf,test-walkthrough -p invoicing-e2e
npx nx application-e2e invoicing-e2e
npx nx eval invoicing-server
```

Expected: contracts 22, server 268, react 147 tests; perf 3 and walkthrough 4 unit tests; browser 6 passed; eval gate passed.
- [ ] **Step 3: Hand off** with superpowers:finishing-a-development-branch. The PR description includes the baseline table.
- [ ] **Step 4: After the PR deploys** (not part of the PR): run `PERF_BASE_URL=https://invoicing.hashbrown.dev PERF_RUNS=5 npx nx perf-live invoicing-e2e` again and post the table on the PR; then open the site in a fresh browser profile and read `/api/snapshot`'s `server-timing` on a first visit. Whichever of `init`, `session` or `snapshot` dominates the ~1.4 s first visit decides the cold-start fix (spec, section 2), which becomes its own small PR.

---
