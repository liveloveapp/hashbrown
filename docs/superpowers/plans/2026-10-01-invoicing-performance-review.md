# Invoicing performance, PR 2: review and approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut model calls out of the payment review: no `readPayment` turn, no nested model call to echo the card, no closing turn after the allocation applies, and minimal reasoning for what is left.

**Architecture:** The review agent keeps its B4 approval interrupt. `prepareAllocation` takes no input and reads the selected payment and invoices from the authorised run state, so the model's only jobs are to call it and then call `applyAllocation` with the returned `proposalId`. `applyAllocation` ends the run on success (`returnDirect`), because the browser already confirms the result from `/api/operations/:id`. The page renders the `AllocationProposal` card from the proposal it verifies against the server, and ignores any UI the model streams.

**Tech Stack:** B4 0.13.0 (`agent`, `returnDirect`, `tools.approve`), React 19, Hashbrown React, Vitest, Playwright, Nx.

**Spec:** `docs/superpowers/specs/2026-09-30-invoicing-performance-design.md`, delivery item 2.

**Dry run (2026-10-01):** this plan's patches were written and verified on `blove/invoicing-perf-review` from `main` at ec80f77a, then reverted.
- Every patch applies in task order, and the result is byte-identical to the trial.
- Each task's tests fail before its implementation and pass after it.
- Results: server 265 tests, React 153 tests; build and lint clean (0 errors, only warnings already on `main`); the deterministic browser suite passes; eval replay mean 1.00.
- Against the live model, `live-model` passes (40 s). It covers a question, the Northstar approval, the Cedar decline and session isolation.
- `perf-live` on a local stack, median of 3: approval card **6.63 s** (production baseline 7.60 s); approve to applied **0.21 s** (baseline 6.63 s).

## Conventions every task follows

- AGENTS.md rules:
  - Write failing tests first.
  - Use top-level `test(...)` only, with arrange/act/assert separated by blank lines.
  - Give every export a TSDoc block.
  - Add no new dependencies.
- Apply each patch with `git apply` in task order. If one does not apply, stop and report; do not hand-merge.
- `npx nx test` does not type-check, so build too.
- Run `npx prettier --write` on touched files only, never on whole directories.
- B4 lives under `examples/invoicing/server/node_modules`. Check its version there before trusting a failure:
  ```
  node -p "require('./examples/invoicing/server/node_modules/@b4run/cli/package.json').version"
  ```
  It should print `0.13.0`.
- Live runs need the model key: `INVOICING_ENV_FILE=/Users/blove/repos/hashbrown/.env`. Never print that file.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Deviations from the spec, and why

- **The card is rendered from the verified proposal, not from the tool call.**
  - The spec said the page would render the card from the `prepareAllocation` server tool call, through `serverToolCalls`.
  - The review chat already fetches and verifies the proposal against the server when the approval interrupt arrives (`owned`), and only a verified proposal can be approved.
  - Rendering from that one source avoids a second, unverified path to the same card.
  - The card appears together with the approval buttons. Until then the review shows "Preparing the proposal…".
- **Approval card target (under 5 s) is not met: 6.63 s locally.**
  - What remains is two model turns at minimal reasoning: one calls `prepareAllocation`, the next calls `applyAllocation`.
  - Locally, the first turn takes 3.4–7.9 s before the tool call and the second about 2 s.
  - Removing a further turn means preparing the proposal without the model, which the spec ruled out ("keep the B4 agent").
  - The PR records this number and reason.

## File map

| File | Change |
| --- | --- |
| `examples/invoicing/server/src/review-middleware.ts` | `prepareAllocation()` takes no input; `readPayment` stays internal |
| `examples/invoicing/server/src/review-tools.ts` | drop `readPayment` from the check; delete `prepareAllocationUi` |
| `examples/invoicing/server/src/app/review/tools/prepareAllocation.ts` | no nested model call; no input |
| `examples/invoicing/server/src/app/review/tools/readPayment.ts` | deleted |
| `examples/invoicing/server/src/app/review/tools/applyAllocation.ts` | `returnDirect = true` |
| `examples/invoicing/server/src/app/review/index.ts` | minimal reasoning, shorter prompt, `recursionLimit: 8` |
| `examples/invoicing/react/src/review-chat.tsx` | card from the verified proposal; "Preparing the proposal…" |
| `examples/invoicing/server/browser-fixture.ts` | scripted review sends only the interrupt (the new turn sequence) |
| `examples/invoicing/e2e/live.spec.ts` | payment rows scoped to the Unapplied grid |
| matching `*.spec.ts` / `*.test.tsx` | tests for the above |

### Task 1: `prepareAllocation` reads the selection from the server

**Files:**
- Modify: `examples/invoicing/server/src/review-middleware.ts`, `examples/invoicing/server/src/review-tools.ts`, `examples/invoicing/server/src/app/review/tools/prepareAllocation.ts`
- Delete: `examples/invoicing/server/src/app/review/tools/readPayment.ts`
- Test: `examples/invoicing/server/src/review-middleware.spec.ts`, `examples/invoicing/server/src/review-tools.spec.ts`

Today the model calls `readPayment`, then passes invoice ids back into `prepareAllocation`, whose body makes a nested `gpt-5-mini` call only to echo a fixed card. The selection already arrives in the validated run state (`selectedPaymentId`, `selectedInvoiceIds`), so the tool can read it directly:
- With `selectedInvoiceIds`, the proposal fills those invoices in that order.
- Without them, it fills the payment's only open invoice.
- With two or more open invoices and no selection, it throws `invoice_choice_required`.

- [ ] **Step 1: Write the failing tests**

Apply this patch (two spec files) with `git apply`; generated against `main` at ec80f77a:

````diff
diff --git a/examples/invoicing/server/src/review-middleware.spec.ts b/examples/invoicing/server/src/review-middleware.spec.ts
index ee4943ae..a7e57c9a 100644
--- a/examples/invoicing/server/src/review-middleware.spec.ts
+++ b/examples/invoicing/server/src/review-middleware.spec.ts
@@ -32,15 +32,15 @@ test('middleware supplies server-owned payment tools without financial writes',
 
   expect(result.action).toBe('continue');
   if (result.action !== 'continue') throw new Error('Expected trusted tools');
-  const records = await result.context.readPayment();
-  expect(records.payment.id).toBe('payment-001');
-  expect(records.invoices.map((invoice) => invoice.id)).toEqual([
-    'invoice-001',
-  ]);
-  const proposal = await result.context.prepareAllocation({
-    invoiceIds: ['invoice-001'],
-  });
+  const proposal = await result.context.prepareAllocation();
+  expect(proposal.paymentId).toBe('payment-001');
+  expect(proposal.lines.map((line) => line.invoiceId)).toEqual(['invoice-001']);
   expect(proposal.amountCents).toBe(240000);
+  expect(Object.keys(result.context).sort()).toEqual([
+    'applyAllocation',
+    'prepareAllocation',
+    'responseSchema',
+  ]);
   await expect(
     result.context.applyAllocation({ proposalId: proposal.proposalId }),
   ).rejects.toThrow('approval_required');
@@ -88,24 +88,26 @@ test('middleware validates the route and schema before exposing tools', async ()
   ).toMatchObject({ action: 'reject', status: 422 });
 });
 
-test('middleware tools ignore extra amounts and invalidate reads after reset', async () => {
+test('preparing takes nothing from the model, and stops after a reset', async () => {
   const { store, owner, middleware, request } = await setup();
   const result = await middleware(request);
   if (result.action !== 'continue') throw new Error('Expected trusted tools');
-  const candidate = {
-    invoiceIds: ['invoice-001'],
+  const prepare = result.context.prepareAllocation as (
+    input?: unknown,
+  ) => Promise<{ readonly amountCents: number; readonly paymentId: string }>;
+
+  const proposal = await prepare({
+    invoiceIds: ['foreign'],
     amountCents: 1,
     paymentId: 'foreign',
-  };
-
-  const proposal = await result.context.prepareAllocation(candidate);
+  });
   await store.reset(owner);
+  const stale = await prepare().catch((error: Error) => error);
 
   expect(proposal.amountCents).toBe(240000);
   expect(proposal.paymentId).toBe('payment-001');
-  await expect(result.context.readPayment()).rejects.toThrow(
-    'stale_generation',
-  );
+  expect(stale).toBeInstanceOf(Error);
+  expect((stale as Error).message).toBe('stale_generation');
 });
 
 /** A $150 payment against two open $100 invoices for the same client. */
@@ -159,22 +161,17 @@ async function twoInvoices() {
   return { store, session, request };
 }
 
-test('an ambiguous payment requires a chosen invoice and cannot substitute another invoice', async () => {
+test("an ambiguous payment needs the user's choice; a chosen invoice is the one prepared", async () => {
   const { store, session, request } = await twoInvoices();
   const ambiguous = await request('ambiguous');
   const chosen = await request('chosen', ['i2']);
 
-  await expect(
-    ambiguous.prepareAllocation({ invoiceIds: ['i1'] }),
-  ).rejects.toThrow('invoice_choice_required');
-  await expect(
-    ambiguous.prepareAllocation({ invoiceIds: ['i1', 'i2'] }),
-  ).rejects.toThrow('invoice_choice_required');
-  await expect(
-    chosen.prepareAllocation({ invoiceIds: ['i1'] }),
-  ).rejects.toThrow('invoice_binding_conflict');
-  const proposal = await chosen.prepareAllocation({ invoiceIds: ['i2'] });
+  const refused = await ambiguous
+    .prepareAllocation()
+    .catch((error: Error) => error);
+  const proposal = await chosen.prepareAllocation();
 
+  expect((refused as Error).message).toBe('invoice_choice_required');
   expect(proposal.lines.map((line) => line.invoiceId)).toEqual(['i2']);
   expect((await store.snapshot(session)).allocations).toHaveLength(0);
 });
@@ -183,14 +180,8 @@ test('a review bound to several invoices fills them in order from the payment',
   const { store, session, request } = await twoInvoices();
   const combined = await request('combined', ['i2', 'i1']);
 
-  const read = await combined.readPayment();
-  const reordered = combined.prepareAllocation({ invoiceIds: ['i1', 'i2'] });
-  const proposal = await combined.prepareAllocation({
-    invoiceIds: ['i2', 'i1'],
-  });
+  const proposal = await combined.prepareAllocation();
 
-  expect(read.selectedInvoiceIds).toEqual(['i2', 'i1']);
-  await expect(reordered).rejects.toThrow('invoice_binding_conflict');
   expect(proposal.lines).toEqual([
     { invoiceId: 'i2', amountCents: 10000, expectedInvoiceVersion: 1 },
     { invoiceId: 'i1', amountCents: 5000, expectedInvoiceVersion: 1 },
diff --git a/examples/invoicing/server/src/review-tools.spec.ts b/examples/invoicing/server/src/review-tools.spec.ts
index bfbc396d..a462d5a8 100644
--- a/examples/invoicing/server/src/review-tools.spec.ts
+++ b/examples/invoicing/server/src/review-tools.spec.ts
@@ -2,7 +2,7 @@ import { expect, test } from 'vitest';
 import { createSessionStore } from './session-store';
 import { createReviewCoordinator } from './review-coordinator';
 import { createReviewMiddleware } from './review-middleware';
-import { prepareAllocationUi, reviewTools } from './review-tools';
+import { reviewTools } from './review-tools';
 import { createMemoryRepositories } from './persistence/memory';
 
 async function setup() {
@@ -41,81 +41,8 @@ test('validates middleware functions and response schema before tool access', as
     { middleware: {} },
     { middleware: { ...middleware, responseSchema: null } },
     { middleware: { ...middleware, applyAllocation: 'apply' } },
+    { middleware: { ...middleware, prepareAllocation: undefined } },
   ]) {
     expect(() => reviewTools(invalid)).toThrow('invalid_review_middleware');
   }
 });
-
-test('renders the exact server proposal through the supplied schema without applying it', async () => {
-  const { middleware, store, owner } = await setup();
-  let rendered = false;
-
-  const proposal = await prepareAllocationUi(
-    middleware,
-    { invoiceIds: ['invoice-001'] },
-    async (schema, expected) => {
-      expect(schema).toBe(middleware.responseSchema);
-      rendered = true;
-      return {
-        ui: [
-          {
-            AllocationProposal: { props: { proposalId: expected.proposalId } },
-          },
-        ],
-      };
-    },
-  );
-
-  expect(rendered).toBe(true);
-  expect(proposal.lines[0].invoiceId).toBe('invoice-001');
-  expect(proposal.amountCents).toBe(240000);
-  expect((await store.snapshot(owner)).allocations).toHaveLength(0);
-});
-
-test('rejects generated UI with missing, duplicated, or substituted proposal identity', async () => {
-  const { middleware } = await setup();
-
-  const proposal = await middleware.prepareAllocation({
-    invoiceIds: ['invoice-001'],
-  });
-  const component = {
-    AllocationProposal: { props: { proposalId: proposal.proposalId } },
-  };
-
-  for (const ui of [
-    [],
-    [component, component],
-    [{ AllocationProposal: { props: { proposalId: 'forged' } } }],
-    [
-      {
-        AllocationProposal: {
-          props: { proposalId: proposal.proposalId, amountCents: 1 },
-        },
-      },
-    ],
-  ]) {
-    await expect(
-      prepareAllocationUi(
-        middleware,
-        { invoiceIds: ['invoice-001'] },
-        async () => ({ ui }),
-      ),
-    ).rejects.toThrow('invalid_allocation_ui');
-  }
-});
-
-test('propagates model failure without applying an allocation', async () => {
-  const { middleware, store, owner } = await setup();
-
-  await expect(
-    prepareAllocationUi(
-      middleware,
-      { invoiceIds: ['invoice-001'] },
-      async () => {
-        throw new Error('model_unavailable');
-      },
-    ),
-  ).rejects.toThrow('model_unavailable');
-
-  expect((await store.snapshot(owner)).allocations).toHaveLength(0);
-});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-server --skip-nx-cache`
Expected: 4 failures, all in `review-middleware.spec.ts`. The context still exposes `readPayment`, and `prepareAllocation()` without input throws reading `invoiceIds`.

- [ ] **Step 3: Implement**

Apply this patch (middleware, tool check, tool file, and the `readPayment.ts` deletion) with `git apply`; generated against `main` at ec80f77a:

````diff
diff --git a/examples/invoicing/server/src/app/review/tools/prepareAllocation.ts b/examples/invoicing/server/src/app/review/tools/prepareAllocation.ts
index 7e17e233..bebee06f 100644
--- a/examples/invoicing/server/src/app/review/tools/prepareAllocation.ts
+++ b/examples/invoicing/server/src/app/review/tools/prepareAllocation.ts
@@ -1,47 +1,10 @@
 import type { B4ToolContext } from '@b4run/sdk';
-import { createChatModel } from '@b4run/langchain';
-import { prepareAllocationUi, reviewTools } from '../../../review-tools';
+import { reviewTools } from '../../../review-tools';
 
-interface UiModel {
-  withStructuredOutput(
-    schema: unknown,
-    options: {
-      readonly strict: true;
-      readonly method: 'jsonSchema';
-      readonly name: string;
-    },
-  ): { invoke(prompt: string): Promise<unknown> };
-}
-
-/** Prepare one authoritative allocation across the given invoices, in order, and stream its UI through a nested model call. */
-export default async function prepareAllocation(
-  input: { readonly invoiceIds: readonly string[] },
+/** Prepare the server-owned allocation proposal for the selected payment and invoices. Takes no input: the server already knows the selection. Returns the proposal, including its proposalId. */
+export default function prepareAllocation(
+  _input: Record<string, never>,
   context: B4ToolContext,
 ) {
-  return prepareAllocationUi(
-    reviewTools(context),
-    input,
-    async (schema, proposal) => {
-      const model = await createChatModel({
-        model: 'gpt-5-mini',
-        provider: 'openai',
-      });
-      if (
-        typeof model !== 'object' ||
-        model === null ||
-        !('withStructuredOutput' in model) ||
-        typeof model.withStructuredOutput !== 'function'
-      )
-        throw new Error('structured_output_unavailable');
-      return (model as UiModel)
-        .withStructuredOutput(schema, {
-          strict: true,
-          method: 'jsonSchema',
-          name: 'allocation_ui',
-        })
-        .invoke(
-          `Render exactly one AllocationProposal component with props containing only proposalId ${JSON.stringify(proposal.proposalId)}. Return exactly {"ui":[{"AllocationProposal":{"props":{"proposalId":${JSON.stringify(proposal.proposalId)}}}}]}. Do not include narration, additional components, children, or other properties.`,
-        );
-    },
-  );
+  return reviewTools(context).prepareAllocation();
 }
diff --git a/examples/invoicing/server/src/app/review/tools/readPayment.ts b/examples/invoicing/server/src/app/review/tools/readPayment.ts
deleted file mode 100644
index 2cf444f7..00000000
--- a/examples/invoicing/server/src/app/review/tools/readPayment.ts
+++ /dev/null
@@ -1,10 +0,0 @@
-import type { B4ToolContext } from '@b4run/sdk';
-import { reviewTools } from '../../../review-tools';
-
-/** Read the selected payment and matching invoices from the authorized server session. */
-export default function readPayment(
-  _input: Record<string, never>,
-  context: B4ToolContext,
-) {
-  return reviewTools(context).readPayment();
-}
diff --git a/examples/invoicing/server/src/review-middleware.ts b/examples/invoicing/server/src/review-middleware.ts
index cec9182b..0e0b3dad 100644
--- a/examples/invoicing/server/src/review-middleware.ts
+++ b/examples/invoicing/server/src/review-middleware.ts
@@ -1,10 +1,13 @@
-import { isDeepStrictEqual } from 'node:util';
 import { fillLines } from './ledger';
 import type { SessionStore } from './session-store';
 import type { ReviewCoordinator } from './review-coordinator';
 import { readSessionCookie } from './session-cookie';
 
-/** Bind review tools to validated server state; B4 must validate the pending interrupt before invoking apply. */
+/**
+ * Bind review tools to validated server state; B4 must validate the pending
+ * interrupt before invoking apply. The invoices come from the authorised run
+ * state, never from the model: `prepareAllocation` takes no input.
+ */
 export function createReviewMiddleware(
   store: SessionStore,
   reviews: ReviewCoordinator,
@@ -57,22 +60,16 @@ export function createReviewMiddleware(
         action: 'continue' as const,
         context: Object.freeze({
           responseSchema: context.responseSchema,
-          readPayment,
-          prepareAllocation: async (input: {
-            readonly invoiceIds: readonly string[];
-          }) => {
+          // The selected invoices, in fill order; without a selection, the
+          // payment's only open invoice. Two or more open invoices and no
+          // selection is a choice only the user can make.
+          prepareAllocation: async () => {
             const { payment, invoices } = await readPayment();
-            const ids = input.invoiceIds;
-            if (!Array.isArray(ids)) throw new Error('invoice_not_found');
-            if (context.selectedInvoiceIds) {
-              if (!isDeepStrictEqual([...ids], [...context.selectedInvoiceIds]))
-                throw new Error('invoice_binding_conflict');
-            } else if (
-              ids.length !== 1 ||
-              invoices.filter((item) => item.outstandingCents > 0).length > 1
-            )
+            const open = invoices.filter((item) => item.outstandingCents > 0);
+            const ids = context.selectedInvoiceIds ?? [];
+            if (ids.length === 0 && open.length !== 1)
               throw new Error('invoice_choice_required');
-            const chosen = ids.map((id) => {
+            const chosen = (ids.length ? ids : [open[0].id]).map((id) => {
               const invoice = invoices.find((item) => item.id === id);
               if (!invoice) throw new Error('invoice_not_found');
               return invoice;
diff --git a/examples/invoicing/server/src/review-tools.ts b/examples/invoicing/server/src/review-tools.ts
index 55059809..fc5fe338 100644
--- a/examples/invoicing/server/src/review-tools.ts
+++ b/examples/invoicing/server/src/review-tools.ts
@@ -1,5 +1,3 @@
-import { isDeepStrictEqual } from 'node:util';
-import type { Proposal } from '@invoicing/contracts';
 import type { createReviewMiddleware } from './review-middleware';
 
 type ReviewTools = Extract<
@@ -17,30 +15,9 @@ export function reviewTools(context: unknown): ReviewTools {
   const middleware = context.middleware;
   if (
     !record(middleware.responseSchema) ||
-    typeof middleware.readPayment !== 'function' ||
     typeof middleware.prepareAllocation !== 'function' ||
     typeof middleware.applyAllocation !== 'function'
   )
     throw new Error('invalid_review_middleware');
   return middleware as ReviewTools;
 }
-
-/** Prepare a server-owned proposal and verify that generated UI preserves its identity. */
-export async function prepareAllocationUi(
-  middleware: ReviewTools,
-  input: { readonly invoiceIds: readonly string[] },
-  render: (schema: unknown, proposal: Proposal) => Promise<unknown>,
-): Promise<Proposal> {
-  const proposal = await middleware.prepareAllocation({
-    invoiceIds: input.invoiceIds,
-  });
-  const output = await render(middleware.responseSchema, proposal);
-  const expected = {
-    ui: [
-      { AllocationProposal: { props: { proposalId: proposal.proposalId } } },
-    ],
-  };
-  if (!isDeepStrictEqual(output, expected))
-    throw new Error('invalid_allocation_ui');
-  return proposal;
-}
````

If `git apply` leaves `readPayment.ts` in place, run `git rm examples/invoicing/server/src/app/review/tools/readPayment.ts`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx run-many -t test,build -p invoicing-server --skip-nx-cache`
Expected: 265 tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add examples/invoicing/server/src/review-middleware.ts examples/invoicing/server/src/review-middleware.spec.ts examples/invoicing/server/src/review-tools.ts examples/invoicing/server/src/review-tools.spec.ts examples/invoicing/server/src/app/review/tools/prepareAllocation.ts examples/invoicing/server/src/app/review/tools/readPayment.ts
git commit -m "perf(invoicing): prepare the allocation from the server's selection, with no nested model call

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: End the run on apply, at minimal reasoning

**Files:**
- Modify: `examples/invoicing/server/src/app/review/tools/applyAllocation.ts`, `examples/invoicing/server/src/app/review/index.ts`

`returnDirect = true` makes B4 end the run when `applyAllocation` succeeds (end-on-success, as the assistant's `render` tool does). That removes the closing `{"ui":[]}` turn. A declined approval also ends the run, because B4 returns the denial as an ordinary tool result rather than an error. Only a failed apply (a thrown error) returns to the model, which outputs `{"ui":[]}`. (Corrected after review; the patch below has the earlier wording, fixed in a later commit.)

The prompt shrinks to two tool calls. `reasoning: { effort: 'minimal' }` reaches OpenAI as `reasoningEffort` (see `@b4run/langchain` `chat-model-factory.js`). `recursionLimit` drops from 12 to 8, since the run is now at most three model turns.

B4 agent files have no unit tests here. The deterministic browser suite (Task 4) and `live-model` (Task 5) cover this behaviour.

- [ ] **Step 1: Implement**

Apply this patch (tool flag and agent settings) with `git apply`; generated against `main` at ec80f77a:

````diff
diff --git a/examples/invoicing/server/src/app/review/index.ts b/examples/invoicing/server/src/app/review/index.ts
index a52203aa..6ec49321 100644
--- a/examples/invoicing/server/src/app/review/index.ts
+++ b/examples/invoicing/server/src/app/review/index.ts
@@ -2,17 +2,15 @@ import { agent } from '@b4run/sdk';
 
 export default agent({
   model: 'gpt-5-mini',
+  // A fixed two-step procedure with no judgement, so the least reasoning.
+  reasoning: { effort: 'minimal' },
   tools: { approve: ['applyAllocation'] },
   retry: { maxAttempts: 1 },
-  recursionLimit: 12,
+  recursionLimit: 8,
   systemPrompt: `Review the selected payment using server-owned records.
-Call readPayment({}) first. When selectedInvoiceIds is provided, use exactly those IDs in that order. Otherwise use the sole invoice with an outstanding balance. Never choose arbitrarily between multiple outstanding invoices.
-Call prepareAllocation({invoiceIds}) exactly once with that list of invoice IDs. This tool
-renders the allocation proposal for the user. Then call applyAllocation({proposalId})
-with exactly the proposalId returned by prepareAllocation. The runtime pauses that
-call for user approval. Never ask for approval in prose. Never invent identifiers,
-amounts, tool results, or additional UI. Do not narrate any step or emit text before
-or between tool calls. After applyAllocation completes or approval is cancelled,
-output exactly {"ui":[]} with no Markdown or other text. If a tool fails, do not
-retry or prepare a second proposal; output exactly {"ui":[]}.`,
+Call prepareAllocation({}) exactly once; it prepares the proposal for the invoices the user selected.
+Then call applyAllocation({proposalId}) with exactly the proposalId it returned. The runtime pauses that
+call for the user's approval and the page shows the proposal. Never ask for approval in prose. Never invent
+identifiers, amounts or tool results. Do not narrate or emit text before or between tool calls. If approval
+is cancelled or a tool fails, do not retry or prepare a second proposal; output exactly {"ui":[]}.`,
 });
diff --git a/examples/invoicing/server/src/app/review/tools/applyAllocation.ts b/examples/invoicing/server/src/app/review/tools/applyAllocation.ts
index 734cdd2b..99e7c0bb 100644
--- a/examples/invoicing/server/src/app/review/tools/applyAllocation.ts
+++ b/examples/invoicing/server/src/app/review/tools/applyAllocation.ts
@@ -1,7 +1,15 @@
 import type { B4ToolContext } from '@b4run/sdk';
 import { reviewTools } from '../../../review-tools';
 
-/** Apply the server-owned proposal only after runtime approval resumes this tool. */
+/**
+ * Ends the run when the allocation applies: the browser confirms the result
+ * from the server (`/api/operations/:id`), so a closing model turn would only
+ * add latency. A declined approval or a failed apply still returns to the
+ * model, which ends with an empty answer.
+ */
+export const returnDirect = true;
+
+/** Apply the prepared proposal by its proposalId. The runtime pauses this call for the user's approval. */
 export default function applyAllocation(
   input: { readonly proposalId: string },
   context: B4ToolContext,
````

- [ ] **Step 2: Verify**

Run: `npx nx run-many -t test,build,lint -p invoicing-server --skip-nx-cache`
Expected: 265 tests pass; build succeeds; lint has 0 errors. The warnings in `history.spec.ts`, `review-coordinator.spec.ts`, `session-store.spec.ts` and `thread-access.spec.ts` are already on `main`.

- [ ] **Step 3: Commit**

```bash
git add examples/invoicing/server/src/app/review/tools/applyAllocation.ts examples/invoicing/server/src/app/review/index.ts
git commit -m "perf(invoicing): end the review run on apply, at minimal reasoning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: The page renders the card from the verified proposal

**Files:**
- Modify: `examples/invoicing/react/src/review-chat.tsx`
- Test: `examples/invoicing/react/src/review-chat.test.tsx`

The model no longer streams the card. `ReviewChat` renders `<AllocationProposal>` from `owned`, the proposal it has verified against the server, and ignores assistant `message.ui` entirely. While the agent works and no interrupt has arrived, it shows "Preparing the proposal…".

In the tests, the `setup` helper streams model UI only when given `modelUi`; by default the model streams none.

- [ ] **Step 1: Write the failing tests**

Apply this patch (review chat tests) with `git apply`; generated against `main` at ec80f77a:

````diff
diff --git a/examples/invoicing/react/src/review-chat.test.tsx b/examples/invoicing/react/src/review-chat.test.tsx
index feb38adf..bb6b4aee 100644
--- a/examples/invoicing/react/src/review-chat.test.tsx
+++ b/examples/invoicing/react/src/review-chat.test.tsx
@@ -49,6 +49,8 @@ function setup(
     immediate?: boolean;
     initialComplete?: boolean;
     resumeError?: boolean;
+    /** UI the model streams before the approval pause; the server sends none. */
+    modelUi?: unknown;
   } = {},
 ) {
   cleanup();
@@ -106,28 +108,22 @@ function setup(
             yield { type: EventType.RUN_FINISHED, ...identity };
             return;
           }
-          yield {
-            type: EventType.TEXT_MESSAGE_START,
-            messageId: 'proposal-message',
-            role: 'assistant',
-          };
-          yield {
-            type: EventType.TEXT_MESSAGE_CONTENT,
-            messageId: 'proposal-message',
-            delta: JSON.stringify({
-              ui: [
-                {
-                  AllocationProposal: {
-                    props: { proposalId: proposal.proposalId },
-                  },
-                },
-              ],
-            }),
-          };
-          yield {
-            type: EventType.TEXT_MESSAGE_END,
-            messageId: 'proposal-message',
-          };
+          if (options.modelUi) {
+            yield {
+              type: EventType.TEXT_MESSAGE_START,
+              messageId: 'proposal-message',
+              role: 'assistant',
+            };
+            yield {
+              type: EventType.TEXT_MESSAGE_CONTENT,
+              messageId: 'proposal-message',
+              delta: JSON.stringify({ ui: options.modelUi }),
+            };
+            yield {
+              type: EventType.TEXT_MESSAGE_END,
+              messageId: 'proposal-message',
+            };
+          }
           yield {
             type: EventType.RUN_FINISHED,
             ...identity,
@@ -402,3 +398,42 @@ test('releases the message claim after an immediately completed initial turn', a
 
   await waitFor(() => expect(subject.requests).toHaveLength(2));
 });
+
+test('the card comes from the verified proposal, never from UI the model streams', async () => {
+  const subject = setup({
+    modelUi: [{ AllocationProposal: { props: { proposalId: 'forged' } } }],
+  });
+
+  act(() => {
+    subject.start();
+  });
+  await waitFor(() =>
+    expect(
+      screen.getByRole('button', { name: 'Approve and apply' }),
+    ).toBeEnabled(),
+  );
+
+  expect(
+    screen.getAllByRole('region', { name: 'Allocation proposal' }),
+  ).toHaveLength(1);
+  expect(
+    screen.queryByText('Proposal unavailable for the selected payment.'),
+  ).not.toBeInTheDocument();
+});
+
+test('while the agent prepares, the review says so', async () => {
+  const subject = setup();
+
+  act(() => {
+    subject.start();
+  });
+
+  expect(screen.getByRole('status')).toHaveTextContent(
+    'Preparing the proposal…',
+  );
+  await waitFor(() =>
+    expect(
+      screen.getByRole('button', { name: 'Approve and apply' }),
+    ).toBeEnabled(),
+  );
+});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react --skip-nx-cache`
Expected: 10 failures in `review-chat.test.tsx`. With no streamed UI, today's page shows no card, and there is no "Preparing the proposal…" status.

- [ ] **Step 3: Implement**

Apply this patch (review chat) with `git apply`; generated against `main` at ec80f77a:

````diff
diff --git a/examples/invoicing/react/src/review-chat.tsx b/examples/invoicing/react/src/review-chat.tsx
index 491ffd2c..e33b51ea 100644
--- a/examples/invoicing/react/src/review-chat.tsx
+++ b/examples/invoicing/react/src/review-chat.tsx
@@ -9,7 +9,6 @@ import {
   type Proposal,
 } from '@invoicing/contracts';
 import {
-  Fragment,
   type Ref,
   useEffect,
   useImperativeHandle,
@@ -357,9 +356,7 @@ export function ReviewChat({
         }}
       >
         {chat.messages.map((message, index) =>
-          message.role === 'assistant' ? (
-            <Fragment key={index}>{message.ui}</Fragment>
-          ) : message.role === 'user' && showComposer ? (
+          message.role === 'user' && showComposer ? (
             // Embedded reviews start from a fixed kickoff message the user
             // never typed; only a review with its own composer shows them.
             <p key={index}>
@@ -367,7 +364,13 @@ export function ReviewChat({
             </p>
           ) : null,
         )}
+        {/* The card is the verified server proposal, rendered by the page. The
+            model streams no UI for it, and any it did stream is ignored. */}
+        {owned && <AllocationProposal proposalId={owned.proposal.proposalId} />}
       </AllocationProposalContext.Provider>
+      {isLoading && !pendingInterrupts && !attempt && !error && (
+        <p role="status">Preparing the proposal…</p>
+      )}
       {pendingInterrupts && !owned && !error && (
         <p role="status">Verifying proposal…</p>
       )}
````

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx run-many -t test,build,lint -p invoicing-react --skip-nx-cache`
Expected: 153 tests pass; build and lint succeed.

- [ ] **Step 5: Commit**

```bash
git add examples/invoicing/react/src/review-chat.tsx examples/invoicing/react/src/review-chat.test.tsx
git commit -m "perf(invoicing): render the allocation card from the verified proposal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Re-record the scripted review, and scope the live spec's row clicks

**Files:**
- Modify: `examples/invoicing/server/browser-fixture.ts`, `examples/invoicing/e2e/live.spec.ts`

There are two changes:
- The deterministic browser suite runs against `browser-fixture.ts`, which scripts the review agent's events. Its review now sends only the approval interrupt (`RUN_FINISHED` with the interrupt), matching the new turn sequence: the model streams no card.
- In `live.spec.ts`, answers in the conversation can render tables whose rows carry the same `data-pretable-row-id` as the dashboard grid. That makes the row locators ambiguous under Playwright's strict mode, so they are scoped to `treegrid "Unapplied payments"`.

- [ ] **Step 1: Implement**

Apply this patch (fixture and live spec) with `git apply`; generated against `main` at ec80f77a:

````diff
diff --git a/examples/invoicing/e2e/live.spec.ts b/examples/invoicing/e2e/live.spec.ts
index bdf3aba1..880f1bc3 100644
--- a/examples/invoicing/e2e/live.spec.ts
+++ b/examples/invoicing/e2e/live.spec.ts
@@ -27,7 +27,12 @@ test('seeded ledger supports questions, repeated approvals, cancellation and ses
   ).toContainText('13,900');
   await expect(message).toBeEnabled();
   await page.getByRole('tab', { name: /^Unapplied/ }).click();
-  await page
+  // Scoped to the grid: the answer above can list the same payments.
+  const unapplied = page.getByRole('treegrid', {
+    name: 'Unapplied payments',
+    exact: true,
+  });
+  await unapplied
     .locator('[data-pretable-row-id="payment-northstar-exact"]')
     .click();
   await page.getByRole('button', { name: 'Review match', exact: true }).click();
@@ -47,7 +52,9 @@ test('seeded ledger supports questions, repeated approvals, cancellation and ses
     applied.payments.find((p) => p.id === 'payment-northstar-exact')
       ?.unappliedCents,
   ).toBe(0);
-  await page.locator('[data-pretable-row-id="payment-cedar-partial"]').click();
+  await unapplied
+    .locator('[data-pretable-row-id="payment-cedar-partial"]')
+    .click();
   await page.getByRole('button', { name: 'Review match', exact: true }).click();
   await expect(
     page.getByRole('region', {
diff --git a/examples/invoicing/server/browser-fixture.ts b/examples/invoicing/server/browser-fixture.ts
index b778fcf5..4d0556c3 100644
--- a/examples/invoicing/server/browser-fixture.ts
+++ b/examples/invoicing/server/browser-fixture.ts
@@ -114,44 +114,25 @@ async function main() {
           });
           const interruptId = randomUUID();
           interrupts.set(body.threadId, interruptId);
-          events.push(
-            {
-              type: 'TEXT_MESSAGE_START',
-              messageId: proposal.proposalId,
-              role: 'assistant',
-            },
-            {
-              type: 'TEXT_MESSAGE_CONTENT',
-              messageId: proposal.proposalId,
-              delta: JSON.stringify({
-                ui: [
-                  {
-                    AllocationProposal: {
-                      props: { proposalId: proposal.proposalId },
-                    },
-                  },
-                ],
-              }),
-            },
-            { type: 'TEXT_MESSAGE_END', messageId: proposal.proposalId },
-            {
-              type: 'RUN_FINISHED',
-              ...identity,
-              outcome: {
-                type: 'interrupt',
-                interrupts: [
-                  {
-                    id: interruptId,
-                    reason: 'tool',
-                    metadata: {
-                      type: 'permission-request',
-                      detail: { toolName: 'applyAllocation' },
-                    },
+          // Like the real review agent: tool calls only, no UI. The page
+          // draws the card from the verified proposal it fetches.
+          events.push({
+            type: 'RUN_FINISHED',
+            ...identity,
+            outcome: {
+              type: 'interrupt',
+              interrupts: [
+                {
+                  id: interruptId,
+                  reason: 'tool',
+                  metadata: {
+                    type: 'permission-request',
+                    detail: { toolName: 'applyAllocation' },
                   },
-                ],
-              },
+                },
+              ],
             },
-          );
+          });
         }
         response.writeHead(200, { 'content-type': 'text/event-stream' });
         response.end(
````

- [ ] **Step 2: Verify**

Run each:
```bash
npx nx run-many -t build,lint -p invoicing-e2e
npx nx e2e invoicing
npx nx eval invoicing-server
```
Expected: build and lint succeed; the deterministic browser suite passes; eval replay prints `mean 1.00, gate passed`.

- [ ] **Step 3: Commit**

```bash
git add examples/invoicing/server/browser-fixture.ts examples/invoicing/e2e/live.spec.ts
git commit -m "test(invoicing): script the two-turn review, and scope live row clicks to the grid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Live verification and the performance table

No code changes. These steps produce the numbers for the PR description.

- [ ] **Step 1: Live model end to end**

Run: `INVOICING_ENV_FILE=/Users/blove/repos/hashbrown/.env npx nx live-model invoicing-e2e`
Expected: 1 passed.

Known flake: on 2026-10-01 the first question occasionally stayed on "Reading your ledger…" past the 90 s expect timeout. It happened only when Playwright started the servers itself, this PR does not touch the assistant route, and it is tracked separately. Rerun once before treating it as a failure of this PR.

- [ ] **Step 2: Local timings**

Run: `INVOICING_ENV_FILE=/Users/blove/repos/hashbrown/.env PERF_RUNS=3 npx nx perf-live invoicing-e2e`
Expected: 1 passed. Record the printed table. In the dry run the medians were:
- approval card about 6–7.5 s;
- approve to applied about 0.2–0.3 s.

- [ ] **Step 3: Check the run log**

Server stdout shows one `invoicing.run.step` line per tool call. Per review, expect:
- a `/review` run with only a `prepareAllocation` step and no `invoicing.run.done` (the run is parked on the approval interrupt);
- then a resumed `/review` run with an `applyAllocation` step and an `invoicing.run.done` total near 50 ms.

There should be no `readPayment` step.

- [ ] **Step 4: PR description**

Report the performance table before (the spec's production baseline) and after, for local runs now and production after deploy (`PERF_BASE_URL=https://invoicing.hashbrown.dev PERF_RUNS=5`). State the approval-card miss and its reason as written above.
