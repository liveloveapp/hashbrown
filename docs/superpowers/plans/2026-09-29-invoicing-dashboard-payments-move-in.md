# Invoicing dashboard, PR 2: payments move in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put payments and matching on the dashboard: Payments and Unapplied tabs, computed match hints, and a "Match this payment" state in the focus band, then delete the old Payments page.

**Architecture:** Pure payment rows, match hints and fill order join the shared contracts package, pinned against the seeded ledger. The focus gains payment records and an explicit `scoped` flag. One `PaymentsGrid` serves both new tabs; a `MatchPanel` replaces the aging chart when a payment is focused and hands checked invoices to the existing assistant review. App collapses to one page whose single focus is also the assistant's context; the middleware requires a payment to belong to the focused client.

**Tech Stack:** React 19, Pretable 0.20.2, Vitest + Testing Library, Playwright, B4 0.13.0 server, Nx.

**Spec:** `docs/superpowers/specs/2026-09-28-invoicing-dashboard-grid-design.md`, section "Delivery", item 2. PR 1 merged as liveloveapp/hashbrown#613.

**Dry run (2026-09-29):** the code in this plan was written and verified on a branch from `main` at f0def22f, then reverted: contracts 20, server 259 and react 137 tests pass; build and lint are clean (server lint keeps its 23 pre-existing warnings); the deterministic browser suite passes 6 of 6; eval replay passes. A browser check against the seeded ledger showed all five Unapplied hints worded exactly as the spec's table and Harbor's panel tying out at $5,000.00. The dry run found one design problem and fixed it: see Task 3's `scoped` flag.

## Conventions every task follows

- AGENTS.md: failing tests first; top-level `test(...)` only with arrange/act/assert separated by blank lines; TSDoc on exports; no new dependencies.
- Patches in this plan were generated against `main` after #613; apply each with `git apply` in task order. If one does not apply, stop and report rather than hand-merging.
- Run `npx prettier --write` on touched files; `npx nx test` does not type-check, so run `build` too.
- B4 is installed under `examples/invoicing/server/node_modules`; check its version there before trusting a failure.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Deliberate choices and known gaps

- The match panel pre-checks the hint's invoices for exact, ties-out and partial suggestions; the user still clicks **Review match** and then approves in the review, so no allocation happens without two explicit actions. Ambiguous suggestions start unchecked, as the assistant prompt already requires.
- Invoices fill in the order checked (not list order), so a checked invoice can never receive 0, which the server rejects.
- The nav keeps a single Dashboard entry; the rail stays for PR 3.
- A client focused without a record and unscoped (after switching tabs from a record) reloads from its URL as scoped. Harmless: it only narrows the lists.
- PR 3: chart→grid filtering (bucket chip), answer components as focus links, re-recording the samples-page walkthrough video (the script is updated here and still runs).

### Task 1: Payment rows, match hints and fill order in the shared package

**Files:**
- Create: `examples/invoicing/shared/src/matching.ts`
- Create: `examples/invoicing/shared/src/matching.spec.ts`
- Modify: `examples/invoicing/shared/src/index.ts` (export block at the end)

The spec's hint rule, in order, over the payer's open invoices in the payment's currency: no open invoice is an **advance**; exactly one invoice of the exact amount is **exact**; else the smallest set of 2–5 invoices summing exactly **ties out**; else one invoice larger than the payment is a **partial**; two or more equally good candidates at any step are **ambiguous**; anything else is **none**. `fillInOrder` mirrors the server's `fillLines` in `server/src/ledger.ts` (each invoice takes the smaller of its balance and what is left).
- [ ] **Step 1: Write the failing tests**

Create `examples/invoicing/shared/src/matching.spec.ts` with exactly this content:

````ts
import { expect, test } from 'vitest';
import type { LedgerSnapshot } from './index';
import { fillInOrder, matchHint, paymentRows } from './matching';

const AS_OF = '2026-09-15';

const invoice = (
  id: string,
  customerId: string,
  outstandingCents: number,
  date: string,
  currency = 'USD',
) => ({
  id,
  customerId,
  currency,
  date,
  amountCents: outstandingCents,
  outstandingCents,
  version: 1,
});

const payment = (
  id: string,
  customerId: string,
  unappliedCents: number,
  amountCents = unappliedCents,
) => ({
  id,
  customerId,
  currency: 'USD',
  date: '2026-09-10',
  amountCents,
  unappliedCents,
  version: 1,
});

const ledger = (
  invoices: LedgerSnapshot['invoices'],
  payments: LedgerSnapshot['payments'],
): LedgerSnapshot => ({
  customers: [{ id: 'c', name: 'Cobalt', currency: 'USD', profile: 'on-time' }],
  invoices,
  payments,
  allocations: [],
  activities: [],
});

test('paymentRows carries payer, applied cash, age and status', () => {
  const snapshot = ledger(
    [],
    [
      { ...payment('p1', 'c', 0, 5000), reference: 'ACH 1' },
      payment('p2', 'c', 2000, 5000),
      payment('p3', 'c', 5000),
    ],
  );

  const rows = paymentRows(snapshot, AS_OF);

  expect(rows[0]).toEqual({
    id: 'p1',
    reference: 'ACH 1',
    payerId: 'c',
    payerName: 'Cobalt',
    currency: 'USD',
    received: '2026-09-10',
    amountCents: 5000,
    appliedCents: 5000,
    unappliedCents: 0,
    ageDays: 5,
    status: 'matched',
  });
  expect(rows.map((row) => row.status)).toEqual([
    'matched',
    'partly-applied',
    'unmatched',
  ]);
  expect(rows[2].reference).toBe('p3');
});

test('matchHint names an advance, an exact match and an ambiguous pair', () => {
  const snapshot = ledger(
    [
      invoice('a', 'c', 1500, '2026-09-01'),
      invoice('b', 'c', 1500, '2026-09-02'),
      invoice('x', 'c', 2400, '2026-09-03'),
    ],
    [
      payment('advance', 'other', 1000),
      payment('exact', 'c', 2400),
      payment('pair', 'c', 1500),
    ],
  );

  const hints = ['advance', 'exact', 'pair'].map((id) =>
    matchHint(snapshot, id),
  );

  expect(hints).toEqual([
    { kind: 'advance' },
    { kind: 'exact', invoiceIds: ['x'] },
    { kind: 'ambiguous', invoiceIds: ['a', 'b'] },
  ]);
});

test('matchHint ties out the smallest set of invoices, oldest first', () => {
  const snapshot = ledger(
    [
      invoice('late', 'c', 1800, '2026-09-10'),
      invoice('early', 'c', 3200, '2026-09-09'),
      invoice('small', 'c', 1000, '2026-09-01'),
    ],
    [payment('p', 'c', 5000)],
  );

  const hint = matchHint(snapshot, 'p');

  expect(hint).toEqual({ kind: 'ties-out', invoiceIds: ['early', 'late'] });
});

test('matchHint calls two equally small tie-outs ambiguous', () => {
  const snapshot = ledger(
    [
      invoice('a', 'c', 1000, '2026-09-01'),
      invoice('b', 'c', 2000, '2026-09-02'),
      invoice('d', 'c', 1500, '2026-09-03'),
      invoice('e', 'c', 1500, '2026-09-04'),
    ],
    [payment('p', 'c', 3000)],
  );

  const hint = matchHint(snapshot, 'p');

  expect(hint).toEqual({
    kind: 'ambiguous',
    invoiceIds: ['a', 'b', 'd', 'e'],
  });
});

test('matchHint falls back to a single larger invoice as a partial, else none', () => {
  const partial = ledger(
    [invoice('big', 'c', 5000, '2026-09-01')],
    [payment('p', 'c', 2000)],
  );
  const none = ledger(
    [invoice('tiny', 'c', 100, '2026-09-01')],
    [payment('p', 'c', 2000)],
  );

  const hints = [matchHint(partial, 'p'), matchHint(none, 'p')];

  expect(hints).toEqual([
    { kind: 'partial', invoiceIds: ['big'] },
    { kind: 'none' },
  ]);
});

test('matchHint ignores other currencies and fully applied payments', () => {
  const snapshot = ledger(
    [invoice('eur', 'c', 2400, '2026-09-01', 'EUR')],
    [payment('p', 'c', 2400), payment('done', 'c', 0, 2400)],
  );

  const hints = [matchHint(snapshot, 'p'), matchHint(snapshot, 'done')];

  expect(hints).toEqual([{ kind: 'advance' }, { kind: 'none' }]);
});

test('fillInOrder spends the payment on each invoice in turn', () => {
  const invoices = [
    { id: 'a', outstandingCents: 3200 },
    { id: 'b', outstandingCents: 1800 },
    { id: 'c', outstandingCents: 900 },
  ];

  const plan = fillInOrder(4000, invoices);

  expect(plan).toEqual({
    lines: [
      { invoiceId: 'a', amountCents: 3200 },
      { invoiceId: 'b', amountCents: 800 },
      { invoiceId: 'c', amountCents: 0 },
    ],
    appliedCents: 4000,
    remainingCents: 0,
  });
});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-contracts -- matching`
Expected: FAIL: `./matching` does not exist (the test target runs `tsc` first, so the error may be TS2307).
- [ ] **Step 3: Implement**

Create `examples/invoicing/shared/src/matching.ts` with exactly this content:

````ts
import { daysBetween } from './aging';
import type { LedgerSnapshot } from './index';

type Invoice = LedgerSnapshot['invoices'][number];
type Payment = LedgerSnapshot['payments'][number];

/** How much of a payment has been applied to invoices. */
export type PaymentStatus = 'matched' | 'partly-applied' | 'unmatched';

/** One row of the Payments and Unapplied grids. */
export interface PaymentRow {
  readonly id: string;
  /** The bank reference, or the payment id when the bank sent none. */
  readonly reference: string;
  readonly payerId: string;
  readonly payerName: string;
  readonly currency: string;
  readonly received: string;
  readonly amountCents: number;
  readonly appliedCents: number;
  readonly unappliedCents: number;
  /** Days from receipt to the as-of date; zero when undated. */
  readonly ageDays: number;
  readonly status: PaymentStatus;
}

/**
 * The page's suggestion for an unapplied payment, from the payer's open
 * invoices in the payment's currency. `invoiceIds` are in fill order (oldest
 * first); for `ambiguous` they are every tied candidate.
 */
export type MatchHint =
  | { readonly kind: 'advance' }
  | { readonly kind: 'exact'; readonly invoiceIds: readonly string[] }
  | { readonly kind: 'ties-out'; readonly invoiceIds: readonly string[] }
  | { readonly kind: 'partial'; readonly invoiceIds: readonly string[] }
  | { readonly kind: 'ambiguous'; readonly invoiceIds: readonly string[] }
  | { readonly kind: 'none' };

/** Largest invoice set the ties-out search tries, following Stripe's rule. */
export const MAX_TIE_OUT_INVOICES = 5;

/** A payment's status from its applied and unapplied cents. */
export function paymentStatus(payment: Payment): PaymentStatus {
  if (payment.unappliedCents === 0) return 'matched';
  return payment.unappliedCents < payment.amountCents
    ? 'partly-applied'
    : 'unmatched';
}

/** Every payment with its payer, applied amount, age and status. */
export function paymentRows(
  snapshot: LedgerSnapshot,
  asOf: string,
): PaymentRow[] {
  const names = new Map(snapshot.customers.map((c) => [c.id, c.name]));
  return snapshot.payments.map((payment) => ({
    id: payment.id,
    reference: payment.reference ?? payment.id,
    payerId: payment.customerId,
    payerName:
      payment.customerName ??
      names.get(payment.customerId) ??
      payment.customerId,
    currency: payment.currency,
    received: payment.date ?? '',
    amountCents: payment.amountCents,
    appliedCents: payment.amountCents - payment.unappliedCents,
    unappliedCents: payment.unappliedCents,
    ageDays: payment.date ? Math.max(0, daysBetween(payment.date, asOf)) : 0,
    status: paymentStatus(payment),
  }));
}

/** The payer's open invoices in the payment's currency, oldest first: the fill order. */
export function matchCandidates(
  snapshot: LedgerSnapshot,
  payment: Payment,
): Invoice[] {
  return snapshot.invoices
    .filter(
      (i) =>
        i.customerId === payment.customerId &&
        i.currency === payment.currency &&
        i.outstandingCents > 0,
    )
    .toSorted(
      (a, b) =>
        (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id),
    );
}

/** Every `size`-invoice combination summing to `target`, stopping after two. */
function combinationsSumming(
  invoices: readonly Invoice[],
  size: number,
  target: number,
): Invoice[][] {
  const found: Invoice[][] = [];
  const walk = (start: number, chosen: Invoice[], total: number) => {
    if (found.length > 1) return;
    if (chosen.length === size) {
      if (total === target) found.push(chosen);
      return;
    }
    for (let i = start; i < invoices.length; i++) {
      const next = total + invoices[i].outstandingCents;
      if (next <= target) walk(i + 1, [...chosen, invoices[i]], next);
    }
  };
  walk(0, [], 0);
  return found;
}

const ids = (invoices: readonly Invoice[]) => invoices.map((i) => i.id);

/**
 * Suggest how an unapplied payment matches, in order: no open invoice is an
 * advance; one invoice of the exact amount is exact; else the smallest set of
 * two to five invoices that sums exactly ties out; else one invoice larger
 * than the payment is a partial. Two or more equally good candidates at any
 * step are ambiguous. Anything else is `none`.
 */
export function matchHint(
  snapshot: LedgerSnapshot,
  paymentId: string,
): MatchHint {
  const payment = snapshot.payments.find((p) => p.id === paymentId);
  if (!payment || payment.unappliedCents === 0) return { kind: 'none' };
  const target = payment.unappliedCents;
  const candidates = matchCandidates(snapshot, payment);
  if (candidates.length === 0) return { kind: 'advance' };
  const exact = candidates.filter((i) => i.outstandingCents === target);
  if (exact.length === 1) return { kind: 'exact', invoiceIds: ids(exact) };
  if (exact.length > 1) return { kind: 'ambiguous', invoiceIds: ids(exact) };
  const smaller = candidates.filter((i) => i.outstandingCents < target);
  for (let size = 2; size <= MAX_TIE_OUT_INVOICES; size++) {
    const sets = combinationsSumming(smaller, size, target);
    if (sets.length === 1)
      return { kind: 'ties-out', invoiceIds: ids(sets[0]) };
    if (sets.length > 1)
      return {
        kind: 'ambiguous',
        invoiceIds: [...new Set(sets.flatMap(ids))],
      };
  }
  const larger = candidates.filter((i) => i.outstandingCents > target);
  if (larger.length === 1) return { kind: 'partial', invoiceIds: ids(larger) };
  if (larger.length > 1) return { kind: 'ambiguous', invoiceIds: ids(larger) };
  return { kind: 'none' };
}

/** What a payment would apply to each invoice, filling them in the order given. */
export interface FillPlan {
  readonly lines: readonly {
    readonly invoiceId: string;
    readonly amountCents: number;
  }[];
  readonly appliedCents: number;
  /** Cash left unapplied after the fill. */
  readonly remainingCents: number;
}

/**
 * Fill invoices in order from a payment's unapplied cash: each takes the
 * smaller of its balance and what is left, the way an allocation proposal
 * spends a combined payment.
 */
export function fillInOrder(
  unappliedCents: number,
  invoices: readonly {
    readonly id: string;
    readonly outstandingCents: number;
  }[],
): FillPlan {
  const lines = invoices.reduce<
    { invoiceId: string; amountCents: number; left: number }[]
  >((acc, invoice) => {
    const left = acc.length ? acc[acc.length - 1].left : unappliedCents;
    const amountCents = Math.min(invoice.outstandingCents, left);
    return [
      ...acc,
      { invoiceId: invoice.id, amountCents, left: left - amountCents },
    ];
  }, []);
  const appliedCents = lines.reduce((total, l) => total + l.amountCents, 0);
  return {
    lines: lines.map(({ invoiceId, amountCents }) => ({
      invoiceId,
      amountCents,
    })),
    appliedCents,
    remainingCents: unappliedCents - appliedCents,
  };
}
````

Apply this patch to `examples/invoicing/shared/src/index.ts` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/shared/src/index.ts b/examples/invoicing/shared/src/index.ts
index 3774a30b..d45c0e78 100644
--- a/examples/invoicing/shared/src/index.ts
+++ b/examples/invoicing/shared/src/index.ts
@@ -154,3 +154,15 @@ export type {
   CustomerCardNode,
   ReviewPaymentNode,
 } from './assistant-ui';
+export {
+  fillInOrder,
+  type FillPlan,
+  MAX_TIE_OUT_INVOICES,
+  matchCandidates,
+  matchHint,
+  type MatchHint,
+  paymentRows,
+  type PaymentRow,
+  paymentStatus,
+  type PaymentStatus,
+} from './matching';
````

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-contracts`
Expected: PASS (20 tests).
- [ ] **Step 5: Lint and commit**

```bash
npx nx run-many -t build,lint -p invoicing-contracts
```

```bash
npx prettier --write examples/invoicing/shared/src/matching.ts examples/invoicing/shared/src/matching.spec.ts examples/invoicing/shared/src/index.ts
git add examples/invoicing/shared/src/matching.ts examples/invoicing/shared/src/matching.spec.ts examples/invoicing/shared/src/index.ts
git commit -m "feat(invoicing): payment rows, match hints and fill order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 2: Pin the five seeded hints

**Files:**
- Create: `examples/invoicing/server/src/matching-figures.spec.ts`

These are the spec's hint table on the seeded ledger (446 payments; only the five scenario payments are unapplied).
- [ ] **Step 1: Write the test**

Create `examples/invoicing/server/src/matching-figures.spec.ts` with exactly this content:

````ts
import { expect, test } from 'vitest';
import { matchHint, paymentRows } from '@invoicing/contracts';
import { getSnapshot } from './ledger';
import { createSampleLedger, sampleScenarios } from './sample-ledger';

const AS_OF = '2026-09-15';
const snapshot = getSnapshot(createSampleLedger());

test('the seeded ledger has 446 payments and exactly the five scenario payments unapplied', () => {
  const rows = paymentRows(snapshot, AS_OF);

  const unapplied = rows.filter((row) => row.unappliedCents > 0);

  expect(rows).toHaveLength(446);
  expect(unapplied.map((row) => row.id).sort()).toEqual(
    [
      sampleScenarios.advance.paymentId,
      sampleScenarios.ambiguous.paymentId,
      sampleScenarios.combined.paymentId,
      sampleScenarios.exact.paymentId,
      sampleScenarios.partial.paymentId,
    ].sort(),
  );
  expect(unapplied.every((row) => row.status === 'unmatched')).toBe(true);
});

test('each seeded scenario gets the hint the spec promises', () => {
  const hint = (paymentId: string) => matchHint(snapshot, paymentId);

  const hints = {
    exact: hint(sampleScenarios.exact.paymentId),
    partial: hint(sampleScenarios.partial.paymentId),
    combined: hint(sampleScenarios.combined.paymentId),
    ambiguous: hint(sampleScenarios.ambiguous.paymentId),
    advance: hint(sampleScenarios.advance.paymentId),
  };

  expect(hints).toEqual({
    exact: { kind: 'exact', invoiceIds: [sampleScenarios.exact.invoiceId] },
    partial: {
      kind: 'partial',
      invoiceIds: [sampleScenarios.partial.invoiceId],
    },
    combined: {
      kind: 'ties-out',
      invoiceIds: [...sampleScenarios.combined.invoiceIds],
    },
    ambiguous: {
      kind: 'ambiguous',
      invoiceIds: [...sampleScenarios.ambiguous.invoiceIds],
    },
    advance: { kind: 'advance' },
  });
});
````

- [ ] **Step 2: Run it**

Run: `npx nx test invoicing-server -- matching-figures`
Expected: PASS (2 tests). If a hint differs, stop: the seed or the rule changed, and the spec quotes these.
- [ ] **Step 3: Build and commit**

```bash
npx nx build invoicing-server
```

```bash
npx prettier --write examples/invoicing/server/src/matching-figures.spec.ts
git add examples/invoicing/server/src/matching-figures.spec.ts
git commit -m "test(invoicing): pin the seeded match hints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 3: Focus: four tabs, payment records, list scoping

**Files:**
- Modify: `examples/invoicing/react/src/focus.ts`
- Modify: `examples/invoicing/react/src/focus.test.ts`

Changes: `DASHBOARD_TABS` gains `payments` and `unapplied`; a `FocusRecord` can be a `payment`; a `select-payment` action; the URL carries `payment=`; `sanitizeFocus` checks the right collection; and a new `scoped` flag. **Why `scoped`:** a focused client narrows the other tabs to that client, which is right after picking a client on the Clients tab but wrong after picking a payment from the full Unapplied list (the list collapsed to one row in the dry run). So `select-client` sets `scoped: true`, picking a record keeps a list narrowed only if it already was, and a shared link to a client alone is scoped while one to a record is not. `focusSelection` maps the focus to the assistant's run state.
- [ ] **Step 1: Update the tests first**

Apply this patch to `examples/invoicing/react/src/focus.test.ts` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/focus.test.ts b/examples/invoicing/react/src/focus.test.ts
index 6b724b10..843823ef 100644
--- a/examples/invoicing/react/src/focus.test.ts
+++ b/examples/invoicing/react/src/focus.test.ts
@@ -5,6 +5,7 @@ import {
   DEFAULT_FOCUS,
   focusFromSearch,
   focusReducer,
+  focusSelection,
   focusToSearch,
   sanitizeFocus,
 } from './focus';
@@ -55,12 +56,17 @@ test('selecting a client focuses it; selecting an invoice focuses its client and
     clientId: 'thistle',
   });
 
-  expect(client).toEqual({ ...DEFAULT_FOCUS, clientId: 'thistle' });
+  expect(client).toEqual({
+    ...DEFAULT_FOCUS,
+    clientId: 'thistle',
+    scoped: true,
+  });
   expect(reselected).toBe(client);
   expect(invoice).toEqual({
     ...DEFAULT_FOCUS,
     clientId: 'thistle',
     record: { kind: 'invoice', id: 'inv-t' },
+    scoped: true,
   });
 });
 
@@ -235,3 +241,114 @@ test('assistantRunState keeps only the selections that are set', () => {
     { focusedClientId: 'thistle', focusedInvoiceId: 'inv-t' },
   ]);
 });
+
+const withPayment = {
+  ...snapshot,
+  payments: [
+    {
+      id: 'pay-t',
+      customerId: 'thistle',
+      currency: 'GBP',
+      amountCents: 1,
+      unappliedCents: 1,
+      version: 1,
+    },
+  ],
+} as LedgerSnapshot;
+
+test('selecting a payment focuses its client and marks the payment, once', () => {
+  const selected = focusReducer(DEFAULT_FOCUS, {
+    type: 'select-payment',
+    paymentId: 'pay-t',
+    clientId: 'thistle',
+  });
+
+  const again = focusReducer(selected, {
+    type: 'select-payment',
+    paymentId: 'pay-t',
+    clientId: 'thistle',
+  });
+
+  expect(selected).toEqual({
+    ...DEFAULT_FOCUS,
+    clientId: 'thistle',
+    record: { kind: 'payment', id: 'pay-t' },
+  });
+  expect(again).toBe(selected);
+});
+
+test('a payment focus round-trips through the URL and survives sanitising', () => {
+  const focus = {
+    tab: 'unapplied' as const,
+    currency: 'USD',
+    clientId: 'thistle',
+    record: { kind: 'payment' as const, id: 'pay-t' },
+  };
+
+  const search = focusToSearch(focus);
+  const read = focusFromSearch(search);
+  const kept = sanitizeFocus(focus, withPayment);
+  const dropped = sanitizeFocus(
+    { ...focus, record: { kind: 'payment', id: 'inv-t' } },
+    withPayment,
+  );
+
+  expect(search).toBe('?tab=unapplied&client=thistle&payment=pay-t');
+  expect(read).toEqual(focus);
+  expect(kept).toBe(focus);
+  expect(dropped).toEqual({
+    tab: 'unapplied',
+    currency: 'USD',
+    clientId: 'thistle',
+  });
+});
+
+test('focusSelection tells the assistant the client and the record inside it', () => {
+  const payment = {
+    ...DEFAULT_FOCUS,
+    clientId: 'thistle',
+    record: { kind: 'payment' as const, id: 'pay-t' },
+  };
+  const invoice = {
+    ...DEFAULT_FOCUS,
+    clientId: 'thistle',
+    record: { kind: 'invoice' as const, id: 'inv-t' },
+  };
+
+  const selections = [payment, invoice, DEFAULT_FOCUS].map((focus) =>
+    assistantRunState(focusSelection(focus)),
+  );
+
+  expect(selections).toEqual([
+    { focusedClientId: 'thistle', selectedPaymentId: 'pay-t' },
+    { focusedClientId: 'thistle', focusedInvoiceId: 'inv-t' },
+    {},
+  ]);
+});
+
+test('a record picked from a full list focuses its client without narrowing the lists', () => {
+  const full = { ...DEFAULT_FOCUS, tab: 'unapplied' as const };
+
+  const picked = focusReducer(full, {
+    type: 'select-payment',
+    paymentId: 'pay-t',
+    clientId: 'thistle',
+  });
+  const switched = focusReducer(picked, { type: 'set-tab', tab: 'invoices' });
+  const narrowed = focusReducer(
+    focusReducer(DEFAULT_FOCUS, { type: 'select-client', clientId: 'thistle' }),
+    { type: 'set-tab', tab: 'invoices' },
+  );
+
+  expect(picked.scoped).toBeUndefined();
+  expect(switched).toEqual({
+    tab: 'invoices',
+    currency: 'USD',
+    clientId: 'thistle',
+  });
+  expect(narrowed.scoped).toBe(true);
+  expect(focusFromSearch('?client=thistle').scoped).toBe(true);
+  expect(
+    focusFromSearch('?client=thistle&payment=pay-t').scoped,
+  ).toBeUndefined();
+});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- focus.test`
Expected: FAIL (`select-payment`, `focusSelection` and `scoped` do not exist yet).
- [ ] **Step 3: Implement**

Apply this patch to `examples/invoicing/react/src/focus.ts` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/focus.ts b/examples/invoicing/react/src/focus.ts
index c519a923..897ebcbe 100644
--- a/examples/invoicing/react/src/focus.ts
+++ b/examples/invoicing/react/src/focus.ts
@@ -1,16 +1,21 @@
 import type { LedgerSnapshot } from '@invoicing/contracts';
 
-/** The dashboard's tabs. PR 2 adds Payments and Unapplied. */
-export const DASHBOARD_TABS = ['clients', 'invoices'] as const;
+/** The dashboard's tabs, in the order keys 1–4 select them. */
+export const DASHBOARD_TABS = [
+  'clients',
+  'invoices',
+  'payments',
+  'unapplied',
+] as const;
 /** One of {@link DASHBOARD_TABS}. */
 export type DashboardTab = (typeof DASHBOARD_TABS)[number];
 
 /** The currencies the switcher offers, in its order. */
 export const SWITCHER_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
 
-/** A single record the focus marks inside its client's charts. */
+/** A single invoice or payment the focus marks inside its client's band. */
 export interface FocusRecord {
-  readonly kind: 'invoice';
+  readonly kind: 'invoice' | 'payment';
   readonly id: string;
 }
 
@@ -24,6 +29,12 @@ export interface Focus {
   readonly currency: string;
   readonly clientId?: string;
   readonly record?: FocusRecord;
+  /**
+   * True when the client was picked on the Clients tab: the other tabs then
+   * list only that client's rows. Picking an invoice or payment from a full
+   * list focuses its client without narrowing the list under the pointer.
+   */
+  readonly scoped?: true;
 }
 
 /** Everything that can change the focus. */
@@ -34,6 +45,11 @@ export type FocusAction =
       readonly invoiceId: string;
       readonly clientId: string;
     }
+  | {
+      readonly type: 'select-payment';
+      readonly paymentId: string;
+      readonly clientId: string;
+    }
   | { readonly type: 'clear' }
   | { readonly type: 'set-tab'; readonly tab: DashboardTab }
   | { readonly type: 'set-currency'; readonly currency: string };
@@ -41,41 +57,58 @@ export type FocusAction =
 /** Nothing focused, Clients tab, USD. */
 export const DEFAULT_FOCUS: Focus = { tab: 'clients', currency: 'USD' };
 
+function selectRecord(
+  focus: Focus,
+  kind: FocusRecord['kind'],
+  id: string,
+  clientId: string,
+): Focus {
+  if (
+    focus.record?.kind === kind &&
+    focus.record.id === id &&
+    focus.clientId === clientId
+  )
+    return focus;
+  // A list narrowed to this client stays narrowed; a full list stays full.
+  const scoped = focus.scoped && focus.clientId === clientId;
+  return {
+    tab: focus.tab,
+    currency: focus.currency,
+    clientId,
+    record: { kind, id },
+    ...(scoped ? { scoped: true as const } : {}),
+  };
+}
+
 /** Apply one action; pure, so the page and tests share it. */
 export function focusReducer(focus: Focus, action: FocusAction): Focus {
   switch (action.type) {
     case 'select-client':
       // Pretable reports one click several times; keep the same object so React bails out.
-      return focus.clientId === action.clientId && !focus.record
+      return focus.clientId === action.clientId && !focus.record && focus.scoped
         ? focus
         : {
             tab: focus.tab,
             currency: focus.currency,
             clientId: action.clientId,
+            scoped: true,
           };
     case 'select-invoice':
-      if (
-        focus.record?.id === action.invoiceId &&
-        focus.clientId === action.clientId
-      )
-        return focus;
-      return {
-        tab: focus.tab,
-        currency: focus.currency,
-        clientId: action.clientId,
-        record: { kind: 'invoice', id: action.invoiceId },
-      };
+      return selectRecord(focus, 'invoice', action.invoiceId, action.clientId);
+    case 'select-payment':
+      return selectRecord(focus, 'payment', action.paymentId, action.clientId);
     case 'clear':
       return !focus.clientId && !focus.record
         ? focus
         : { tab: focus.tab, currency: focus.currency };
     case 'set-tab':
-      // A record belongs to the tab it was picked on; the client carries over.
+      // A record belongs to the tab it was picked on; the client and its scope carry over.
       return focus.clientId
         ? {
             tab: action.tab,
             currency: focus.currency,
             clientId: focus.clientId,
+            ...(focus.scoped ? { scoped: true as const } : {}),
           }
         : { tab: action.tab, currency: focus.currency };
     case 'set-currency':
@@ -96,13 +129,19 @@ export function focusFromSearch(search: string): Focus {
   const currency = params.get('currency');
   const clientId = params.get('client') ?? undefined;
   const invoiceId = params.get('invoice') ?? undefined;
+  const paymentId = params.get('payment') ?? undefined;
+  const record: FocusRecord | undefined = invoiceId
+    ? { kind: 'invoice', id: invoiceId }
+    : paymentId
+      ? { kind: 'payment', id: paymentId }
+      : undefined;
   return {
     tab: isTab(tab) ? tab : DEFAULT_FOCUS.tab,
     currency: isCurrency(currency) ? currency : DEFAULT_FOCUS.currency,
     ...(clientId ? { clientId } : {}),
-    ...(clientId && invoiceId
-      ? { record: { kind: 'invoice' as const, id: invoiceId } }
-      : {}),
+    ...(clientId && record ? { record } : {}),
+    // A shared link to a client alone narrows the lists; one to a record does not.
+    ...(clientId && !record ? { scoped: true as const } : {}),
   };
 }
 
@@ -113,7 +152,8 @@ export function focusToSearch(focus: Focus): string {
   if (focus.currency !== DEFAULT_FOCUS.currency)
     params.set('currency', focus.currency);
   if (focus.clientId) params.set('client', focus.clientId);
-  if (focus.clientId && focus.record) params.set('invoice', focus.record.id);
+  if (focus.clientId && focus.record)
+    params.set(focus.record.kind, focus.record.id);
   const query = params.toString();
   return query ? `?${query}` : '';
 }
@@ -129,10 +169,18 @@ export function sanitizeFocus(focus: Focus, snapshot: LedgerSnapshot): Focus {
   if (!snapshot.customers.some((c) => c.id === focus.clientId)) return base;
   const record = focus.record;
   if (!record) return focus;
-  const owned = snapshot.invoices.some(
-    (i) => i.id === record.id && i.customerId === focus.clientId,
+  const records =
+    record.kind === 'invoice' ? snapshot.invoices : snapshot.payments;
+  const owned = records.some(
+    (r) => r.id === record.id && r.customerId === focus.clientId,
   );
-  return owned ? focus : { ...base, clientId: focus.clientId };
+  return owned
+    ? focus
+    : {
+        ...base,
+        clientId: focus.clientId,
+        ...(focus.scoped ? { scoped: true as const } : {}),
+      };
 }
 
 /** What the page tells the assistant it is looking at. */
@@ -155,3 +203,14 @@ export function assistantRunState(
     ),
   );
 }
+
+/** What the focus tells the assistant: its client, and the invoice or payment inside it. */
+export function focusSelection(focus: Focus): AssistantSelection {
+  return {
+    focusedClientId: focus.clientId,
+    focusedInvoiceId:
+      focus.record?.kind === 'invoice' ? focus.record.id : undefined,
+    selectedPaymentId:
+      focus.record?.kind === 'payment' ? focus.record.id : undefined,
+  };
+}
````

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-react -- focus.test`
Expected: PASS (15 tests).
- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/react/src/focus.ts examples/invoicing/react/src/focus.test.ts
git add examples/invoicing/react/src/focus.ts examples/invoicing/react/src/focus.test.ts
git commit -m "feat(invoicing): focus payments on four tabs, narrowing lists only for a picked client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 4: Payment status and hint wording

**Files:**
- Modify: `examples/invoicing/react/src/ledger-views.ts`
- Modify: `examples/invoicing/react/src/ledger-views.test.ts`

- [ ] **Step 1: Write the failing tests**

Apply this patch to `examples/invoicing/react/src/ledger-views.test.ts` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/ledger-views.test.ts b/examples/invoicing/react/src/ledger-views.test.ts
index 6e7b3f07..09187e2c 100644
--- a/examples/invoicing/react/src/ledger-views.test.ts
+++ b/examples/invoicing/react/src/ledger-views.test.ts
@@ -5,11 +5,13 @@ import {
   appliedSummary,
   customerSummary,
   HABITS,
+  hintLabel,
   invoiceStatusLabel,
   listJoin,
   money,
   monthLabel,
   monthlySeries,
+  paymentStatusLabel,
   resolveRecords,
   wholeMoney,
 } from './ledger-views';
@@ -361,3 +363,58 @@ test('invoiceStatusLabel words each status with a tone by how late it is', () =>
     { label: 'Partly paid · 1 day', tone: 'warning' },
   ]);
 });
+
+test('paymentStatusLabel words how much of a payment is applied', () => {
+  const statuses = ['matched', 'partly-applied', 'unmatched'] as const;
+
+  const labels = statuses.map(paymentStatusLabel);
+
+  expect(labels).toEqual([
+    { label: 'Matched', tone: 'good' },
+    { label: 'Partly applied', tone: 'warning' },
+    { label: 'Unmatched', tone: 'neutral' },
+  ]);
+});
+
+test('hintLabel words each match hint the way the Unapplied grid shows it', () => {
+  const balances = new Map([
+    ['ns', { reference: 'INV-202609-NS-101', outstandingCents: 240000 }],
+    ['ch', { reference: 'INV-202609-CH-102', outstandingCents: 500000 }],
+    ['a1', { reference: 'INV-A1', outstandingCents: 150000 }],
+    ['a2', { reference: 'INV-A2', outstandingCents: 150000 }],
+    ['b', { reference: 'INV-B', outstandingCents: 90000 }],
+  ]);
+  const usd = (unappliedCents: number) => ({ unappliedCents, currency: 'USD' });
+
+  const labels = [
+    hintLabel({ kind: 'exact', invoiceIds: ['ns'] }, usd(240000), balances),
+    hintLabel({ kind: 'partial', invoiceIds: ['ch'] }, usd(200000), balances),
+    hintLabel(
+      { kind: 'ties-out', invoiceIds: ['a1', 'b'] },
+      usd(240000),
+      balances,
+    ),
+    hintLabel(
+      { kind: 'ambiguous', invoiceIds: ['a1', 'a2'] },
+      usd(150000),
+      balances,
+    ),
+    hintLabel(
+      { kind: 'ambiguous', invoiceIds: ['a1', 'b'] },
+      usd(150000),
+      balances,
+    ),
+    hintLabel({ kind: 'advance' }, usd(300000), balances),
+    hintLabel({ kind: 'none' }, usd(100), balances),
+  ];
+
+  expect(labels).toEqual([
+    'Exact: INV-202609-NS-101',
+    'Partial: $2,000 of $5,000',
+    'Ties out across 2 invoices',
+    'Ambiguous: 2 invoices at $1,500',
+    'Ambiguous: 2 candidates',
+    'Advance: no open invoice',
+    'No clear match',
+  ]);
+});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- ledger-views`
Expected: FAIL (`hintLabel` and `paymentStatusLabel` are not exported).
- [ ] **Step 3: Implement**

Apply this patch to `examples/invoicing/react/src/ledger-views.ts` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/ledger-views.ts b/examples/invoicing/react/src/ledger-views.ts
index 5a1c5617..fbc3d81e 100644
--- a/examples/invoicing/react/src/ledger-views.ts
+++ b/examples/invoicing/react/src/ledger-views.ts
@@ -5,8 +5,10 @@ import {
   daysBetween,
   type InvoiceStatus,
   type LedgerSnapshot,
+  type MatchHint,
   monthAt,
   type PaymentProfile,
+  type PaymentStatus,
   type Proposal,
   TERMS_DAYS,
 } from '@invoicing/contracts';
@@ -311,3 +313,57 @@ export function invoiceStatusLabel(status: InvoiceStatus): {
       };
   }
 }
+
+/** Words and tone for how much of a payment has been applied. */
+export function paymentStatusLabel(status: PaymentStatus): {
+  readonly label: string;
+  readonly tone: StatusTone;
+} {
+  switch (status) {
+    case 'matched':
+      return { label: 'Matched', tone: 'good' };
+    case 'partly-applied':
+      return { label: 'Partly applied', tone: 'warning' };
+    case 'unmatched':
+      return { label: 'Unmatched', tone: 'neutral' };
+  }
+}
+
+/**
+ * A match hint in coarse words for the Unapplied grid, e.g. "Exact:
+ * INV-202609-NS-101" or "Partial: $2,000 of $5,000". `balances` maps invoice
+ * ids to their reference and open balance.
+ */
+export function hintLabel(
+  hint: MatchHint,
+  payment: { readonly unappliedCents: number; readonly currency: string },
+  balances: ReadonlyMap<
+    string,
+    { readonly reference: string; readonly outstandingCents: number }
+  >,
+): string {
+  const whole = (cents: number) => wholeMoney(cents, payment.currency);
+  switch (hint.kind) {
+    case 'advance':
+      return 'Advance: no open invoice';
+    case 'none':
+      return 'No clear match';
+    case 'exact':
+      return `Exact: ${balances.get(hint.invoiceIds[0])?.reference ?? 'invoice'}`;
+    case 'ties-out':
+      return `Ties out across ${hint.invoiceIds.length} invoices`;
+    case 'partial':
+      return `Partial: ${whole(payment.unappliedCents)} of ${whole(
+        balances.get(hint.invoiceIds[0])?.outstandingCents ?? 0,
+      )}`;
+    case 'ambiguous': {
+      const amounts = new Set(
+        hint.invoiceIds.map((id) => balances.get(id)?.outstandingCents),
+      );
+      const [only] = amounts;
+      return amounts.size === 1 && only !== undefined
+        ? `Ambiguous: ${hint.invoiceIds.length} invoices at ${whole(only)}`
+        : `Ambiguous: ${hint.invoiceIds.length} candidates`;
+    }
+  }
+}
````

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-react -- ledger-views`
Expected: PASS.
- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/react/src/ledger-views.ts examples/invoicing/react/src/ledger-views.test.ts
git add examples/invoicing/react/src/ledger-views.ts examples/invoicing/react/src/ledger-views.test.ts
git commit -m "feat(invoicing): words for payment status and match hints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 5: Payments and Unapplied grid

**Files:**
- Create: `examples/invoicing/react/src/payments-grid.tsx`
- Create: `examples/invoicing/react/src/payments-grid.test.tsx`

One component serves both tabs: `mode="all"` lists every payment newest first (Received, Payer and reference, Amount, Applied, Unapplied, Status); `mode="unapplied"` lists cash still to match oldest first (Payer and reference, Received, Unapplied, Age, Match hint). The payer leads and the full bank reference sits beneath it. It mirrors `clients-grid.tsx` and `invoices-grid.tsx`: grouped by currency with the switcher's currency first, app-driven selection via `state.rowSelection` plus `onRowActivate`/`onFocusChange` (both fire per click; the reducer is idempotent). Vitest has no auto-cleanup: each test calls `cleanup()` first.
- [ ] **Step 1: Write the failing tests**

Create `examples/invoicing/react/src/payments-grid.test.tsx` with exactly this content:

````tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { PaymentRow } from '@invoicing/contracts';
import { PaymentsGrid } from './payments-grid';

const payment = (
  id: string,
  payerId: string,
  received: string,
  amountCents: number,
  unappliedCents: number,
  currency = 'USD',
): PaymentRow => ({
  id,
  reference: `ACH ${id.toUpperCase()}`,
  payerId,
  payerName: payerId.toUpperCase(),
  currency,
  received,
  amountCents,
  appliedCents: amountCents - unappliedCents,
  unappliedCents,
  ageDays: 3,
  status:
    unappliedCents === 0
      ? 'matched'
      : unappliedCents < amountCents
        ? 'partly-applied'
        : 'unmatched',
});

const rows = [
  payment('p1', 'acme', '2026-09-01', 100000, 0),
  payment('p2', 'acme', '2026-09-12', 50000, 20000),
  payment('p3', 'birch', '2026-09-05', 80000, 80000),
  payment('p4', 'thistle', '2026-09-03', 70000, 0, 'GBP'),
];

const dataRowIds = () =>
  [
    ...document.querySelectorAll('[data-pretable-row][data-pretable-row-id]'),
  ].map((row) => row.getAttribute('data-pretable-row-id'));

test('the Payments tab lists every payment newest first, with payer, reference and status', () => {
  cleanup();

  render(
    <PaymentsGrid
      rows={rows}
      mode="all"
      currency="USD"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(dataRowIds()).toEqual(['p2', 'p3', 'p1', 'p4']);
  expect(screen.getByText('ACH P2')).toBeVisible();
  expect(screen.getByText('Partly applied')).toBeVisible();
  expect(screen.getAllByText('Matched')).toHaveLength(2);
  expect(screen.getByText('Unmatched')).toBeVisible();
});

test('the Unapplied tab lists cash still to match, oldest first, with its hint', () => {
  cleanup();

  render(
    <PaymentsGrid
      rows={rows}
      mode="unapplied"
      currency="USD"
      hints={new Map([['p3', 'Advance: no open invoice']])}
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(dataRowIds()).toEqual(['p3', 'p2']);
  expect(screen.getByText('Advance: no open invoice')).toBeVisible();
  expect(
    screen.getByRole('treegrid', { name: 'Unapplied payments' }),
  ).toBeVisible();
});

test('a focused client narrows the grid to its payments', () => {
  cleanup();

  render(
    <PaymentsGrid
      rows={rows}
      mode="all"
      currency="USD"
      clientId="acme"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(dataRowIds()).toEqual(['p2', 'p1']);
});

test('clicking a payment reports it with its payer', () => {
  cleanup();
  const onSelect = vi.fn();
  render(
    <PaymentsGrid
      rows={rows}
      mode="all"
      currency="USD"
      onSelect={onSelect}
      viewportHeight={600}
    />,
  );

  fireEvent.click(screen.getByText('ACH P3'));

  expect(onSelect).toHaveBeenCalledWith('p3', 'birch');
});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- payments-grid`
Expected: FAIL (`./payments-grid` missing).
- [ ] **Step 3: Implement**

Create `examples/invoicing/react/src/payments-grid.tsx` with exactly this content:

````tsx
import {
  type PretableColumn,
  PretableSurface,
  type PretableSurfaceProps,
} from '@pretable/react';
import type { PaymentRow } from '@invoicing/contracts';
import { useMemo, useState } from 'react';
import { currencyColumn, moneyColumn } from './grid-columns';
import { paymentStatusLabel } from './ledger-views';
import { StatusDot } from './status-dot';

type Query = NonNullable<PretableSurfaceProps<PaymentRow>['query']>;

/** Which payments a {@link PaymentsGrid} lists. */
export type PaymentsGridMode = 'all' | 'unapplied';

const INITIAL_QUERY: Record<PaymentsGridMode, Query> = {
  // Payments: newest first. Unapplied: oldest first, the longest-waiting cash on top.
  all: {
    filters: [],
    sort: [{ columnId: 'received', direction: 'desc' }],
    rowGroups: [{ columnId: 'currency' }],
  },
  unapplied: {
    filters: [],
    sort: [{ columnId: 'received', direction: 'asc' }],
    rowGroups: [{ columnId: 'currency' }],
  },
};

/** Inputs for {@link PaymentsGrid}. */
export interface PaymentsGridProps {
  readonly rows: PaymentRow[];
  readonly mode: PaymentsGridMode;
  /** The currency whose group comes first. */
  readonly currency: string;
  /** The focused client; when set, only its payments show. */
  readonly clientId?: string;
  readonly selectedId?: string;
  /** Match-hint words by payment id, shown in unapplied mode. */
  readonly hints?: ReadonlyMap<string, string>;
  /** Fires on click, Enter/Space and ↑/↓, possibly more than once per gesture. */
  readonly onSelect: (paymentId: string, clientId: string) => void;
  readonly viewportHeight?: number;
}

function Payer({ row }: { readonly row: PaymentRow }) {
  return (
    <span className="payer">
      <span>{row.payerName}</span>
      <span className="payer-reference">{row.reference}</span>
    </span>
  );
}

/**
 * The Payments tab (every payment, newest first) or the Unapplied tab (cash
 * still to match, oldest first, with a match hint), grouped by currency. A row
 * click focuses the payment and its payer.
 */
export function PaymentsGrid({
  rows,
  mode,
  currency,
  clientId,
  selectedId,
  hints,
  onSelect,
  viewportHeight = 420,
}: PaymentsGridProps) {
  const [query, setQuery] = useState<Query>(INITIAL_QUERY[mode]);
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!clientId || row.payerId === clientId) &&
          (mode === 'all' || row.unappliedCents > 0),
      ),
    [rows, clientId, mode],
  );
  const payerOf = useMemo(
    () => new Map(rows.map((row) => [row.id, row.payerId])),
    [rows],
  );
  const select = (paymentId: string) => {
    const payer = payerOf.get(paymentId);
    if (payer) onSelect(paymentId, payer);
  };
  const columns = useMemo<PretableColumn<PaymentRow>[]>(() => {
    const received: PretableColumn<PaymentRow> = {
      id: 'received',
      header: 'Received',
      widthPx: 104,
      type: 'text',
      value: (row) => row.received || '—',
    };
    const payer: PretableColumn<PaymentRow> = {
      id: 'payer',
      header: 'Payer and reference',
      pinned: 'left',
      flex: 2,
      minWidthPx: 220,
      type: 'text',
      value: (row) => `${row.payerName} ${row.reference}`,
      render: ({ row }) => <Payer row={row} />,
    };
    if (mode === 'unapplied')
      return [
        payer,
        currencyColumn<PaymentRow>(currency),
        received,
        moneyColumn<PaymentRow>(
          'unapplied',
          'Unapplied',
          (row) => row.unappliedCents,
        ),
        {
          id: 'age',
          header: 'Age',
          widthPx: 80,
          type: 'number',
          value: (row) => row.ageDays,
          format: ({ row }) =>
            `${row.ageDays} day${row.ageDays === 1 ? '' : 's'}`,
        },
        {
          id: 'hint',
          header: 'Match hint',
          flex: 2,
          minWidthPx: 200,
          sortable: false,
          type: 'text',
          value: (row) => hints?.get(row.id) ?? '—',
        },
      ];
    return [
      payer,
      currencyColumn<PaymentRow>(currency),
      received,
      moneyColumn<PaymentRow>('amount', 'Amount', (row) => row.amountCents),
      moneyColumn<PaymentRow>('applied', 'Applied', (row) => row.appliedCents),
      moneyColumn<PaymentRow>(
        'unapplied',
        'Unapplied',
        (row) => row.unappliedCents,
      ),
      {
        id: 'status',
        header: 'Status',
        widthPx: 150,
        type: 'text',
        value: (row) => paymentStatusLabel(row.status).label,
        render: ({ row }) => <StatusDot {...paymentStatusLabel(row.status)} />,
      },
    ];
  }, [mode, currency, hints]);
  return (
    <div className="dashboard-grid" data-density="compact">
      <PretableSurface
        rows={visible}
        columns={columns}
        getRowId={(row: PaymentRow) => row.id}
        ariaLabel={mode === 'all' ? 'Payments' : 'Unapplied payments'}
        viewportHeight={viewportHeight}
        toolPanel={false}
        groupColumn={{ header: 'Currency', pinned: 'left' }}
        query={query}
        onQueryChange={setQuery}
        state={{
          rowSelection: {
            kind: 'explicit',
            rowIds: selectedId ? [selectedId] : [],
          },
        }}
        onRowActivate={({ rowId }) => select(rowId)}
        onFocusChange={({ ref }) => {
          if (ref?.kind === 'data') select(ref.rowId);
        }}
      />
    </div>
  );
}
````

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-react -- payments-grid`
Expected: PASS (4 tests).
- [ ] **Step 5: Build, lint, commit**

```bash
npx nx run-many -t build,lint -p invoicing-react
```

```bash
npx prettier --write examples/invoicing/react/src/payments-grid.tsx examples/invoicing/react/src/payments-grid.test.tsx
git add examples/invoicing/react/src/payments-grid.tsx examples/invoicing/react/src/payments-grid.test.tsx
git commit -m "feat(invoicing): Payments and Unapplied grids with payer, reference and match hint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 6: Match this payment

**Files:**
- Create: `examples/invoicing/react/src/match-panel.tsx`
- Create: `examples/invoicing/react/src/match-panel.test.tsx`

The band's payment state (spec: "Match this payment"). Server constraints it must respect (`server/src/ledger.ts`): a proposal line that would receive 0 is rejected (`insufficient_balance`) and a proposal covers at most 10 invoices. So invoices fill **in the order they are checked**, unchecked boxes disable once the cash is used up or 10 are checked, and the review hands the checked ids in that order to `beginReview`, which already supports several invoices (#603). The suggestion from `matchHint` is pre-checked for exact, ties-out and partial; ambiguous and advance start unchecked. Human approval is unchanged: **Review match** only starts the existing review.
- [ ] **Step 1: Write the failing tests**

Create `examples/invoicing/react/src/match-panel.test.tsx` with exactly this content:

````tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import { MatchPanel } from './match-panel';
import { SnapshotContext } from './snapshot-context';

const invoice = (
  id: string,
  customerId: string,
  outstandingCents: number,
  date: string,
) => ({
  id,
  reference: `INV-${id.toUpperCase()}`,
  customerId,
  currency: 'USD',
  date,
  amountCents: outstandingCents,
  outstandingCents,
  version: 1,
});

const payment = (id: string, customerId: string, unappliedCents: number) => ({
  id,
  customerId,
  currency: 'USD',
  date: '2026-09-14',
  amountCents: unappliedCents,
  unappliedCents,
  version: 1,
});

const snapshot: LedgerSnapshot = {
  customers: [],
  invoices: [
    invoice('api', 'harbor', 320000, '2026-09-09'),
    invoice('mig', 'harbor', 180000, '2026-09-10'),
    invoice('old', 'harbor', 90000, '2026-08-01'),
    invoice('a1', 'atlas', 150000, '2026-09-10'),
    invoice('a2', 'atlas', 150000, '2026-09-11'),
  ],
  payments: [
    payment('harbor-pay', 'harbor', 500000),
    payment('atlas-pay', 'atlas', 150000),
    payment('summit-pay', 'summit', 300000),
    { ...payment('done-pay', 'harbor', 0), amountCents: 5000 },
  ],
  allocations: [],
  activities: [],
};

const withSnapshot = (ui: ReactNode) =>
  render(
    <SnapshotContext.Provider value={snapshot}>{ui}</SnapshotContext.Provider>,
  );

test('a payment that ties out starts with its invoices checked and reviews them in fill order', () => {
  cleanup();
  const onReview = vi.fn();
  withSnapshot(<MatchPanel paymentId="harbor-pay" onReview={onReview} />);

  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));

  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-API' }),
  ).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-MIG' }),
  ).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-OLD' }),
  ).toBeDisabled();
  expect(screen.getByText('$5,000.00 of $5,000.00 ✓')).toBeVisible();
  expect(onReview).toHaveBeenCalledWith('harbor-pay', ['api', 'mig']);
});

test('an ambiguous payment starts unchecked, and one choice uses up the cash', () => {
  cleanup();
  const onReview = vi.fn();
  withSnapshot(<MatchPanel paymentId="atlas-pay" onReview={onReview} />);
  expect(screen.getByRole('button', { name: 'Review match' })).toBeDisabled();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-A2' }));

  expect(screen.getByText('$1,500.00 of $1,500.00 ✓')).toBeVisible();
  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-A1' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Review match' })).toBeEnabled();
});

test('invoices fill in the order they were checked, the last taking what is left', () => {
  cleanup();
  const onReview = vi.fn();
  withSnapshot(<MatchPanel paymentId="harbor-pay" onReview={onReview} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-API' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-MIG' }));

  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-OLD' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-API' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-MIG' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));

  const migRow = screen
    .getByRole('checkbox', { name: 'Apply to INV-MIG' })
    .closest('tr') as HTMLElement;
  expect(migRow).toHaveTextContent('$1,800.00$900.00');
  expect(screen.getByText('$5,000.00 of $5,000.00 ✓')).toBeVisible();
  expect(onReview).toHaveBeenCalledWith('harbor-pay', ['old', 'api', 'mig']);
});

test('an advance explains there is nothing to match yet', () => {
  cleanup();

  withSnapshot(<MatchPanel paymentId="summit-pay" onReview={vi.fn()} />);

  expect(screen.getByText(/No open USD invoice for this client/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Review match' }),
  ).not.toBeInTheDocument();
});

test('a fully matched payment says so', () => {
  cleanup();

  withSnapshot(<MatchPanel paymentId="done-pay" onReview={vi.fn()} />);

  expect(screen.getByText('This payment is fully matched.')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Review match' }),
  ).not.toBeInTheDocument();
});

test('without an assistant the review stays off, and a notice is announced', () => {
  cleanup();

  withSnapshot(<MatchPanel paymentId="harbor-pay" notice="Busy." />);

  expect(screen.getByRole('button', { name: 'Review match' })).toBeDisabled();
  expect(
    screen.getByText('Matching opens once the assistant is connected.'),
  ).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Busy.');
});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- match-panel`
Expected: FAIL (`./match-panel` missing).
- [ ] **Step 3: Implement**

Create `examples/invoicing/react/src/match-panel.tsx` with exactly this content:

````tsx
import {
  fillInOrder,
  matchCandidates,
  matchHint,
  type MatchHint,
} from '@invoicing/contracts';
import { useContext, useState } from 'react';
import { money } from './ledger-views';
import { SnapshotContext } from './snapshot-context';

/** The most invoices one allocation proposal may cover (the server's limit). */
export const MAX_MATCH_INVOICES = 10;

/** Inputs for {@link MatchPanel}. */
export interface MatchPanelProps {
  readonly paymentId: string;
  /**
   * Hands the checked invoices, in fill order, to the assistant's approval
   * flow. Absent while the assistant is unavailable.
   */
  readonly onReview?: (
    paymentId: string,
    invoiceIds: readonly string[],
  ) => void;
  /** Why the last review request did not start, if it did not. */
  readonly notice?: string;
}

/**
 * "Match this payment": the payer's open invoices in the payment's currency
 * with checkboxes, the amount each would receive, and a running total that
 * must tie out. Invoices fill in the order they were checked; the page's
 * suggestion is checked to start with, except when it is ambiguous. Reads the
 * ledger from `SnapshotContext`; key it by payment so a new payment starts
 * fresh.
 */
export function MatchPanel({ paymentId, onReview, notice }: MatchPanelProps) {
  const snapshot = useContext(SnapshotContext);
  const [checked, setChecked] = useState<readonly string[]>(() => {
    const hint: MatchHint = snapshot
      ? matchHint(snapshot, paymentId)
      : { kind: 'none' };
    return hint.kind === 'exact' ||
      hint.kind === 'ties-out' ||
      hint.kind === 'partial'
      ? hint.invoiceIds
      : [];
  });
  const payment = snapshot?.payments.find((p) => p.id === paymentId);
  if (!snapshot || !payment) return null;
  const candidates = matchCandidates(snapshot, payment);
  const byId = new Map(candidates.map((invoice) => [invoice.id, invoice]));
  const order = checked.filter((id) => byId.has(id));
  const plan = fillInOrder(
    payment.unappliedCents,
    order.map((id) => ({
      id,
      outstandingCents: byId.get(id)?.outstandingCents ?? 0,
    })),
  );
  const applied = new Map(
    plan.lines.map((line) => [line.invoiceId, line.amountCents]),
  );
  const tiesOut =
    payment.unappliedCents > 0 && plan.appliedCents === payment.unappliedCents;
  const full = order.length >= MAX_MATCH_INVOICES;
  const toggle = (id: string) =>
    setChecked((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id],
    );

  return (
    <section
      className="match-panel"
      aria-label="Match this payment"
      id="match-panel"
      tabIndex={-1}
    >
      <h3>Match this payment</h3>
      {payment.unappliedCents === 0 ? (
        <p className="muted">This payment is fully matched.</p>
      ) : candidates.length === 0 ? (
        <p className="muted">
          No open {payment.currency} invoice for this client. Hold the cash as
          an advance until one is issued.
        </p>
      ) : (
        <table aria-label="Open invoices">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Apply</span>
              </th>
              <th scope="col">Invoice</th>
              <th scope="col">Issued</th>
              <th scope="col">Balance</th>
              <th scope="col">Apply</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((invoice) => {
              const reference = invoice.reference ?? invoice.id;
              const isChecked = order.includes(invoice.id);
              return (
                <tr key={invoice.id} data-checked={isChecked || undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Apply to ${reference}`}
                      checked={isChecked}
                      disabled={
                        !isChecked && (plan.remainingCents === 0 || full)
                      }
                      onChange={() => toggle(invoice.id)}
                    />
                  </td>
                  <td>{reference}</td>
                  <td>{invoice.date ?? '—'}</td>
                  <td>{money(invoice.outstandingCents, invoice.currency)}</td>
                  <td>
                    {isChecked
                      ? money(applied.get(invoice.id) ?? 0, invoice.currency)
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {payment.unappliedCents > 0 && candidates.length > 0 && (
        <div className="match-footer">
          <p className="match-total" data-ties-out={tiesOut || undefined}>
            {money(plan.appliedCents, payment.currency)} of{' '}
            {money(payment.unappliedCents, payment.currency)}
            {tiesOut ? ' ✓' : ''}
          </p>
          <button
            type="button"
            disabled={!onReview || order.length === 0}
            onClick={() => onReview?.(payment.id, order)}
          >
            Review match
          </button>
        </div>
      )}
      {!onReview && payment.unappliedCents > 0 && candidates.length > 0 && (
        <p className="muted">Matching opens once the assistant is connected.</p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
````

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-react -- match-panel`
Expected: PASS (6 tests).
- [ ] **Step 5: Build, lint, commit**

```bash
npx nx run-many -t build,lint -p invoicing-react
```

```bash
npx prettier --write examples/invoicing/react/src/match-panel.tsx examples/invoicing/react/src/match-panel.test.tsx
git add examples/invoicing/react/src/match-panel.tsx examples/invoicing/react/src/match-panel.test.tsx
git commit -m "feat(invoicing): match a payment from the band, with a running total that ties out

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 7: Band: the payment state

**Files:**
- Modify: `examples/invoicing/react/src/focus-band.tsx`
- Modify: `examples/invoicing/react/src/focus-band.test.tsx`

- [ ] **Step 1: Write the failing test**

Apply this patch to `examples/invoicing/react/src/focus-band.test.tsx` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/focus-band.test.tsx b/examples/invoicing/react/src/focus-band.test.tsx
index 43087866..2005d3ed 100644
--- a/examples/invoicing/react/src/focus-band.test.tsx
+++ b/examples/invoicing/react/src/focus-band.test.tsx
@@ -5,6 +5,7 @@ import type {
   ClientRow,
   InvoiceRow,
   LedgerSnapshot,
+  PaymentRow,
 } from '@invoicing/contracts';
 import { FocusBand } from './focus-band';
 import { SnapshotContext } from './snapshot-context';
@@ -124,3 +125,58 @@ test('a focused invoice is named and its age bucket is outlined', () => {
     'days1to30',
   );
 });
+
+test('a focused payment swaps the aging chart for the match panel', () => {
+  cleanup();
+  const withPayment: LedgerSnapshot = {
+    ...snapshot,
+    payments: [
+      {
+        id: 'tp',
+        customerId: 'thistle',
+        reference: 'BACS THISTLE',
+        date: '2026-09-12',
+        currency: 'GBP',
+        amountCents: 200000,
+        unappliedCents: 200000,
+        version: 1,
+      },
+    ],
+  };
+  const payment: PaymentRow = {
+    id: 'tp',
+    reference: 'BACS THISTLE',
+    payerId: 'thistle',
+    payerName: 'Thistle Retail',
+    currency: 'GBP',
+    received: '2026-09-12',
+    amountCents: 200000,
+    appliedCents: 0,
+    unappliedCents: 200000,
+    ageDays: 3,
+    status: 'unmatched',
+  };
+
+  render(
+    <SnapshotContext.Provider value={withPayment}>
+      <FocusBand
+        currency="GBP"
+        client={thistle}
+        payment={payment}
+        match={{ onReview: vi.fn() }}
+        onClear={vi.fn()}
+      />
+    </SnapshotContext.Provider>,
+  );
+
+  expect(screen.getByText('BACS THISTLE · £2,000 unapplied')).toBeVisible();
+  expect(
+    screen.getByRole('region', { name: 'Match this payment' }),
+  ).toBeVisible();
+  expect(
+    screen.getByRole('checkbox', { name: 'Apply to INV-T1' }),
+  ).toBeChecked();
+  expect(
+    screen.queryByRole('figure', { name: /Aging/ }),
+  ).not.toBeInTheDocument();
+});
````

- [ ] **Step 2: Run to verify it fails**

Run: `npx nx test invoicing-react -- focus-band`
Expected: FAIL (no `payment` prop yet).
- [ ] **Step 3: Implement**

Apply this patch to `examples/invoicing/react/src/focus-band.tsx` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/focus-band.tsx b/examples/invoicing/react/src/focus-band.tsx
index 888fd963..859d5420 100644
--- a/examples/invoicing/react/src/focus-band.tsx
+++ b/examples/invoicing/react/src/focus-band.tsx
@@ -1,6 +1,7 @@
-import type { ClientRow, InvoiceRow } from '@invoicing/contracts';
+import type { ClientRow, InvoiceRow, PaymentRow } from '@invoicing/contracts';
 import { AgingSummary, TrendChart } from './assistant-charts';
 import { HABITS, wholeMoney } from './ledger-views';
+import { MatchPanel, type MatchPanelProps } from './match-panel';
 import { StatusDot } from './status-dot';
 
 /** Inputs for {@link FocusBand}. */
@@ -8,17 +9,24 @@ export interface FocusBandProps {
   readonly currency: string;
   readonly client?: ClientRow;
   readonly invoice?: InvoiceRow;
+  /** A focused payment turns the band's right half into "Match this payment". */
+  readonly payment?: PaymentRow;
+  /** Review wiring for the match panel. */
+  readonly match?: Pick<MatchPanelProps, 'onReview' | 'notice'>;
   readonly onClear: () => void;
 }
 
 /**
  * The fixed-height band of charts under the KPI strip: every client in one
- * currency, or the focused client. Reads the ledger from `SnapshotContext`.
+ * currency, or the focused client, with a focused payment's match panel in
+ * place of the aging chart. Reads the ledger from `SnapshotContext`.
  */
 export function FocusBand({
   currency,
   client,
   invoice,
+  payment,
+  match,
   onClear,
 }: FocusBandProps) {
   const customerId = client?.id ?? null;
@@ -33,6 +41,12 @@ export function FocusBand({
             {wholeMoney(invoice.balanceCents, invoice.currency)} open
           </span>
         )}
+        {payment && (
+          <span className="focus-record">
+            {payment.reference} ·{' '}
+            {wholeMoney(payment.unappliedCents, payment.currency)} unapplied
+          </span>
+        )}
         {client && (
           <button
             type="button"
@@ -51,7 +65,16 @@ export function FocusBand({
         data-outline-bucket={invoice?.bucket ?? undefined}
       >
         <TrendChart currency={currency} customerId={customerId} months={12} />
-        <AgingSummary currency={currency} customerId={customerId} />
+        {payment ? (
+          <MatchPanel
+            key={payment.id}
+            paymentId={payment.id}
+            onReview={match?.onReview}
+            notice={match?.notice}
+          />
+        ) : (
+          <AgingSummary currency={currency} customerId={customerId} />
+        )}
       </div>
     </section>
   );
````

- [ ] **Step 4: Run to verify it passes**

Run: `npx nx test invoicing-react -- focus-band`
Expected: PASS (4 tests).
- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/react/src/focus-band.tsx examples/invoicing/react/src/focus-band.test.tsx
git add examples/invoicing/react/src/focus-band.tsx examples/invoicing/react/src/focus-band.test.tsx
git commit -m "feat(invoicing): a focused payment swaps the aging chart for its match panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 8: Dashboard: Payments and Unapplied tabs

**Files:**
- Modify: `examples/invoicing/react/src/dashboard-view.tsx`
- Modify: `examples/invoicing/react/src/dashboard-view.test.tsx`

Adds the two tabs (keys 3 and 4), payment rows, hint words per unapplied payment, the `match` prop passed through to the band, and scoping by `focus.scoped`. The `PaymentsGrid` is keyed by tab so each keeps its own sort.
- [ ] **Step 1: Update the tests first**

Apply this patch to `examples/invoicing/react/src/dashboard-view.test.tsx` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/dashboard-view.test.tsx b/examples/invoicing/react/src/dashboard-view.test.tsx
index 9db51be2..7929bb05 100644
--- a/examples/invoicing/react/src/dashboard-view.test.tsx
+++ b/examples/invoicing/react/src/dashboard-view.test.tsx
@@ -6,7 +6,7 @@ import {
   within,
 } from '@testing-library/react';
 import { useState } from 'react';
-import { expect, test } from 'vitest';
+import { expect, test, vi } from 'vitest';
 import type { LedgerSnapshot } from '@invoicing/contracts';
 import { DashboardView } from './dashboard-view';
 import { DEFAULT_FOCUS, type Focus, focusReducer } from './focus';
@@ -64,18 +64,49 @@ const snapshot: LedgerSnapshot = {
       version: 1,
     },
   ],
-  payments: [],
+  payments: [
+    {
+      id: 'pb',
+      customerId: 'birch',
+      reference: 'ACH BIRCH',
+      date: '2026-09-12',
+      currency: 'USD',
+      amountCents: 90000,
+      unappliedCents: 90000,
+      version: 1,
+    },
+    {
+      id: 'pa',
+      customerId: 'acme',
+      reference: 'ACH ACME',
+      date: '2026-09-13',
+      currency: 'USD',
+      amountCents: 10000,
+      unappliedCents: 10000,
+      version: 1,
+    },
+  ],
   allocations: [],
   activities: [],
 };
 
-function Harness({ initial = DEFAULT_FOCUS }: { readonly initial?: Focus }) {
+function Harness({
+  initial = DEFAULT_FOCUS,
+  onReview,
+}: {
+  readonly initial?: Focus;
+  readonly onReview?: (
+    paymentId: string,
+    invoiceIds: readonly string[],
+  ) => void;
+}) {
   const [focus, setFocus] = useState(initial);
   return (
     <DashboardView
       snapshot={snapshot}
       focus={focus}
       onFocus={(action) => setFocus((current) => focusReducer(current, action))}
+      match={{ onReview }}
       gridHeight={600}
     />
   );
@@ -124,7 +155,11 @@ test('Escape clears the focus', () => {
 
 test('key 2 opens Invoices, still scoped to the focused client', () => {
   cleanup();
-  render(<Harness initial={{ ...DEFAULT_FOCUS, clientId: 'thistle' }} />);
+  render(
+    <Harness
+      initial={{ ...DEFAULT_FOCUS, clientId: 'thistle', scoped: true }}
+    />,
+  );
 
   fireEvent.keyDown(screen.getByRole('treegrid', { name: 'Clients' }), {
     key: '2',
@@ -152,3 +187,37 @@ test('selecting an invoice focuses its client and outlines its age bucket', () =
     'days1to30',
   );
 });
+
+test('key 4 opens Unapplied with a hint, and a payment row opens the match panel', () => {
+  cleanup();
+  const onReview = vi.fn();
+  render(<Harness onReview={onReview} />);
+  fireEvent.keyDown(screen.getByRole('treegrid', { name: 'Clients' }), {
+    key: '4',
+  });
+  expect(screen.getByText('Exact: INV-B1')).toBeVisible();
+
+  fireEvent.click(screen.getByText('ACH BIRCH'));
+  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));
+
+  expect(screen.getByRole('tab', { name: /Unapplied/ })).toHaveAttribute(
+    'aria-selected',
+    'true',
+  );
+  expect(screen.getByRole('heading', { name: 'Birch' })).toBeVisible();
+  expect(screen.getByText('ACH BIRCH · $900 unapplied')).toBeVisible();
+  expect(
+    screen.getByRole('checkbox', { name: 'Apply to INV-B1' }),
+  ).toBeChecked();
+  expect(onReview).toHaveBeenCalledWith('pb', ['b1']);
+});
+
+test('picking a payment from the full Unapplied list keeps the other payments listed', () => {
+  cleanup();
+  render(<Harness initial={{ ...DEFAULT_FOCUS, tab: 'unapplied' }} />);
+
+  fireEvent.click(screen.getByText('ACH BIRCH'));
+
+  expect(screen.getByText('ACH BIRCH · $900 unapplied')).toBeVisible();
+  expect(screen.getByText('ACH ACME')).toBeVisible();
+});
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- dashboard-view`
Expected: FAIL (no Unapplied tab; `match` prop unknown).
- [ ] **Step 3: Implement**

Apply this patch to `examples/invoicing/react/src/dashboard-view.tsx` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/dashboard-view.tsx b/examples/invoicing/react/src/dashboard-view.tsx
index 6a87989d..6800ffcb 100644
--- a/examples/invoicing/react/src/dashboard-view.tsx
+++ b/examples/invoicing/react/src/dashboard-view.tsx
@@ -3,6 +3,8 @@ import {
   currencyTotals,
   invoiceRows,
   type LedgerSnapshot,
+  matchHint,
+  paymentRows,
 } from '@invoicing/contracts';
 import { type KeyboardEvent, useMemo } from 'react';
 import { ClientsGrid } from './clients-grid';
@@ -12,15 +14,18 @@ import {
   type Focus,
   type FocusAction,
 } from './focus';
-import { FocusBand } from './focus-band';
+import { FocusBand, type FocusBandProps } from './focus-band';
 import { InvoicesGrid } from './invoices-grid';
 import { KpiStrip } from './kpi-strip';
-import { AS_OF } from './ledger-views';
+import { AS_OF, hintLabel } from './ledger-views';
+import { PaymentsGrid } from './payments-grid';
 import { SnapshotContext } from './snapshot-context';
 
 const TAB_LABELS: Record<DashboardTab, string> = {
   clients: 'Clients',
   invoices: 'Invoices',
+  payments: 'Payments',
+  unapplied: 'Unapplied',
 };
 
 /** Inputs for {@link DashboardView}. */
@@ -28,31 +33,61 @@ export interface DashboardViewProps {
   readonly snapshot: LedgerSnapshot;
   readonly focus: Focus;
   readonly onFocus: (action: FocusAction) => void;
+  /** Review wiring for the band's "Match this payment" panel. */
+  readonly match?: FocusBandProps['match'];
   /** Grid viewport height in px; tests raise it because jsdom has no layout. */
   readonly gridHeight?: number;
 }
 
 /**
  * The grid-centred dashboard: KPI strip, fixed-height focus band and one
- * tabbed grid, all reading one {@link Focus}. Keys 1–2 switch tabs; Esc clears.
+ * tabbed grid, all reading one {@link Focus}. Keys 1–4 switch tabs; Esc clears.
  */
 export function DashboardView({
   snapshot,
   focus,
   onFocus,
+  match,
   gridHeight = 420,
 }: DashboardViewProps) {
   const totals = useMemo(() => currencyTotals(snapshot, AS_OF), [snapshot]);
   const clients = useMemo(() => clientRows(snapshot, AS_OF), [snapshot]);
   const invoices = useMemo(() => invoiceRows(snapshot, AS_OF), [snapshot]);
+  const payments = useMemo(() => paymentRows(snapshot, AS_OF), [snapshot]);
+  const hints = useMemo(() => {
+    const balances = new Map(
+      snapshot.invoices.map((i) => [
+        i.id,
+        {
+          reference: i.reference ?? i.id,
+          outstandingCents: i.outstandingCents,
+        },
+      ]),
+    );
+    return new Map(
+      payments
+        .filter((row) => row.unappliedCents > 0)
+        .map((row) => [
+          row.id,
+          hintLabel(matchHint(snapshot, row.id), row, balances),
+        ]),
+    );
+  }, [snapshot, payments]);
   const client = clients.find((row) => row.id === focus.clientId);
-  const invoice = focus.record
-    ? invoices.find((row) => row.id === focus.record?.id)
-    : undefined;
+  const invoice =
+    focus.record?.kind === 'invoice'
+      ? invoices.find((row) => row.id === focus.record?.id)
+      : undefined;
+  const payment =
+    focus.record?.kind === 'payment'
+      ? payments.find((row) => row.id === focus.record?.id)
+      : undefined;
   const currency = client?.currency ?? focus.currency;
   const counts: Record<DashboardTab, number> = {
     clients: clients.length,
     invoices: invoices.filter((row) => row.balanceCents > 0).length,
+    payments: payments.length,
+    unapplied: hints.size,
   };
 
   function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
@@ -85,6 +120,8 @@ export function DashboardView({
           currency={currency}
           client={client}
           invoice={invoice}
+          payment={payment}
+          match={match}
           onClear={() => onFocus({ type: 'clear' })}
         />
         <div
@@ -112,7 +149,7 @@ export function DashboardView({
           role="tabpanel"
           aria-labelledby={`dashboard-tab-${focus.tab}`}
         >
-          {focus.tab === 'clients' ? (
+          {focus.tab === 'clients' && (
             <ClientsGrid
               rows={clients}
               currency={focus.currency}
@@ -122,18 +159,34 @@ export function DashboardView({
               }
               viewportHeight={gridHeight}
             />
-          ) : (
+          )}
+          {focus.tab === 'invoices' && (
             <InvoicesGrid
               rows={invoices}
               currency={focus.currency}
-              clientId={focus.clientId}
-              selectedId={focus.record?.id}
+              clientId={focus.scoped ? focus.clientId : undefined}
+              selectedId={invoice?.id}
               onSelect={(invoiceId, clientId) =>
                 onFocus({ type: 'select-invoice', invoiceId, clientId })
               }
               viewportHeight={gridHeight}
             />
           )}
+          {(focus.tab === 'payments' || focus.tab === 'unapplied') && (
+            <PaymentsGrid
+              key={focus.tab}
+              rows={payments}
+              mode={focus.tab === 'payments' ? 'all' : 'unapplied'}
+              currency={focus.currency}
+              clientId={focus.scoped ? focus.clientId : undefined}
+              selectedId={payment?.id}
+              hints={hints}
+              onSelect={(paymentId, clientId) =>
+                onFocus({ type: 'select-payment', paymentId, clientId })
+              }
+              viewportHeight={gridHeight}
+            />
+          )}
         </div>
       </div>
     </SnapshotContext.Provider>
````

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-react -- dashboard-view`
Expected: PASS (7 tests).
- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/react/src/dashboard-view.tsx examples/invoicing/react/src/dashboard-view.test.tsx
git add examples/invoicing/react/src/dashboard-view.tsx examples/invoicing/react/src/dashboard-view.test.tsx
git commit -m "feat(invoicing): Payments and Unapplied tabs on the dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 9: One page: delete the Payments page

**Files:**
- Modify (rewrite): `examples/invoicing/react/src/App.tsx`
- Modify: `examples/invoicing/react/src/App.test.tsx`
- Modify: `examples/invoicing/react/src/assistant-workspace.tsx` (one notice string)

The Payments page, its checkbox grid, filters, related-invoices panel, invoice picker and **Match payment** button go. The spec: "One page replaces Dashboard and Payments. The nav keeps its rail." The payment selection is now the focus's payment record, so the old "latest selection wins" bookkeeping disappears: one focus, one context. The assistant's **Review …** for an ambiguous payment now opens the Unapplied tab on that payment and moves keyboard focus to its match panel. The busy notice ("Finish the current assistant request…") shows in the match panel. The App test fixture gains the customer so payment focus survives sanitising; tests of the deleted UI are removed and the matching tests rewritten.
- [ ] **Step 1: Update the tests first**

Apply this patch to `examples/invoicing/react/src/App.test.tsx` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/App.test.tsx b/examples/invoicing/react/src/App.test.tsx
index f489beef..474f8a9c 100644
--- a/examples/invoicing/react/src/App.test.tsx
+++ b/examples/invoicing/react/src/App.test.tsx
@@ -34,7 +34,14 @@ const snapshot: LedgerSnapshot = {
       outstandingCents: 240000,
     },
   ],
-  customers: [],
+  customers: [
+    {
+      id: 'customer-001',
+      name: 'Northstar Labs',
+      currency: 'USD',
+      profile: 'on-time',
+    },
+  ],
   allocations: [],
   activities: [],
 };
@@ -59,29 +66,6 @@ test('lands on Dashboard with canonical totals and an open Assistant', () => {
   ).toBeVisible();
 });
 
-test('preserves selected payment context when navigating between pages', () => {
-  cleanup();
-  render(<App initialSnapshot={snapshot} />);
-
-  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
-  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
-  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
-
-  expect(
-    screen.getByRole('heading', { name: 'Business overview' }),
-  ).toBeVisible();
-  expect(
-    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
-  ).toHaveTextContent('payment-001');
-  expect(
-    screen.getByRole('textbox', { name: 'Message assistant' }),
-  ).toBeDisabled();
-  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
-  expect(
-    screen.getByRole('region', { name: 'Related invoices' }),
-  ).toHaveTextContent('invoice-001');
-});
-
 test('shows a loading state while the initial snapshot is requested', () => {
   cleanup();
 
@@ -121,48 +105,6 @@ test('requests one initial snapshot for a StrictMode bootstrap', async () => {
   expect(request).toHaveBeenCalledTimes(1);
 });
 
-test('selects the newly checked payment even when it precedes the old selection', () => {
-  cleanup();
-  const twoPayments = {
-    ...snapshot,
-    payments: [
-      ...snapshot.payments,
-      { ...snapshot.payments[0], id: 'payment-002' },
-    ],
-  };
-  render(<App initialSnapshot={twoPayments} />);
-  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
-
-  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[1]);
-  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
-
-  expect(
-    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
-  ).toHaveTextContent('payment-001');
-  expect(
-    screen.getAllByRole('checkbox', { name: 'Select row' })[0],
-  ).toBeChecked();
-  expect(
-    screen.getAllByRole('checkbox', { name: 'Select row' })[1],
-  ).not.toBeChecked();
-});
-
-test('clears payment and invoice context when the selected row is unchecked', () => {
-  cleanup();
-  render(<App initialSnapshot={snapshot} />);
-  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
-  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
-
-  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
-
-  expect(
-    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
-  ).not.toHaveTextContent('payment-001');
-  expect(
-    screen.getByRole('region', { name: 'Related invoices' }),
-  ).not.toHaveTextContent('invoice-001');
-});
-
 test('starts a fresh snapshot request for a new bootstrap', async () => {
   const request = vi.fn(async () => snapshot);
   const firstBootstrap = createSnapshotLoader(request);
@@ -175,7 +117,7 @@ test('starts a fresh snapshot request for a new bootstrap', async () => {
   expect(request).toHaveBeenCalledTimes(2);
 });
 
-test('explicit matching starts one real chat and approval refreshes the ledger without changing selection', async () => {
+test('matching from the band starts one real chat and approval refreshes the ledger without changing the focus', async () => {
   cleanup();
   const requests: TransportRequest[] = [];
   const proposal = {
@@ -298,19 +240,19 @@ test('explicit matching starts one real chat and approval refreshes the ledger w
       />
     </StrictMode>,
   );
-  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
+  fireEvent.click(screen.getByRole('tab', { name: /Unapplied/ }));
+  fireEvent.click(screen.getByText('payment-001'));
 
-  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
   expect(requests).toHaveLength(0);
-  fireEvent.click(screen.getByRole('button', { name: 'Match payment' }));
+  expect(
+    screen.getByRole('checkbox', { name: 'Apply to invoice-001' }),
+  ).toBeChecked();
+  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));
   const approve = await screen.findByRole('button', {
     name: 'Approve and apply',
   });
   await waitFor(() => expect(approve).toBeEnabled());
-  fireEvent.click(screen.getByRole('button', { name: 'Review payment-001' }));
-  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[1]);
-  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
-  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
+  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));
 
   expect(requests).toHaveLength(1);
   expect(requests[0].input.state).toMatchObject({
@@ -318,14 +260,6 @@ test('explicit matching starts one real chat and approval refreshes the ledger w
     selectedInvoiceIds: ['invoice-001'],
   });
   expect(requests[0].input.hashbrown?.ui).toBe(true);
-  expect(
-    screen.getAllByRole('checkbox', { name: 'Select row' })[0],
-  ).toBeChecked();
-  expect(
-    screen.getAllByRole('checkbox', { name: 'Select row' })[1],
-  ).not.toBeChecked();
-
-  fireEvent.click(screen.getByRole('button', { name: 'Match payment' }));
   expect(
     screen.getByText(/Finish the current assistant request/),
   ).toBeVisible();
@@ -349,114 +283,19 @@ test('explicit matching starts one real chat and approval refreshes the ledger w
   ]);
   expect(
     within(
-      screen
-        .getByRole('button', { name: 'Review payment-001' })
-        .closest('[role="row"]') as HTMLElement,
-    ).getByRole('checkbox', { name: 'Select row' }),
-  ).toBeChecked();
-  fireEvent.click(screen.getByText('Paid invoices (1)'));
-  expect(
-    screen.getByRole('region', { name: 'Related invoices' }),
-  ).toHaveTextContent('Paid');
-  expect(
-    screen.getByRole('region', { name: 'Related invoices' }),
-  ).toHaveTextContent('$0.00');
-  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
-  expect(
-    screen.getByRole('region', { name: 'Ledger totals' }),
-  ).toHaveTextContent('1 payment to match');
+      screen.getByRole('region', { name: 'Match this payment' }),
+    ).getByText('This payment is fully matched.'),
+  ).toBeVisible();
+  expect(screen.getByRole('tab', { name: /Unapplied/ })).toHaveTextContent(
+    'Unapplied 1',
+  );
   expect(
     screen.getByRole('complementary', { name: 'Assistant sidebar' }),
   ).toHaveTextContent('$0.00 unapplied');
   vi.unstubAllGlobals();
 });
 
-test('shows client metadata and defaults to unmatched payments', async () => {
-  cleanup();
-  const ledger = {
-    ...snapshot,
-    payments: [
-      {
-        ...snapshot.payments[0],
-        customerName: 'Northstar Labs',
-        reference: 'PAY-2026-01',
-        date: '2026-01-15',
-      },
-      {
-        ...snapshot.payments[0],
-        id: 'paid-payment',
-        unappliedCents: 0,
-        reference: 'PAY-PAID',
-      },
-    ],
-  };
-
-  render(<App initialSnapshot={ledger} />);
-  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
-
-  expect(screen.getByText('Northstar Labs')).toBeVisible();
-  expect(screen.getByText('PAY-2026-01')).toBeVisible();
-  expect(screen.getByText('PAY-2026-01')).toHaveAttribute(
-    'title',
-    'PAY-2026-01',
-  );
-  expect(screen.getByText('2026-01-15')).toBeVisible();
-  expect(screen.queryByText('PAY-PAID')).not.toBeInTheDocument();
-  fireEvent.click(screen.getByRole('button', { name: 'All payments' }));
-  expect(await screen.findByText('PAY-PAID')).toBeVisible();
-});
-
-test('requires an invoice choice when a payment has multiple outstanding invoices', () => {
-  cleanup();
-  const ledger = {
-    ...snapshot,
-    invoices: [
-      ...snapshot.invoices,
-      { ...snapshot.invoices[0], id: 'invoice-002', reference: 'INV-002' },
-    ],
-  };
-
-  render(<App initialSnapshot={ledger} enableAssistant />);
-  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
-  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
-
-  expect(screen.getByRole('button', { name: 'Match payment' })).toBeDisabled();
-  fireEvent.change(screen.getByRole('combobox', { name: 'Invoice to match' }), {
-    target: { value: 'invoice-002' },
-  });
-  expect(screen.getByRole('button', { name: 'Match payment' })).toBeEnabled();
-});
-
-test('the Status column tells partially matched payments apart', async () => {
-  cleanup();
-  const ledger = {
-    ...snapshot,
-    payments: [
-      { ...snapshot.payments[0], unappliedCents: 100000, reference: 'PART' },
-      {
-        ...snapshot.payments[0],
-        id: 'payment-002',
-        unappliedCents: 0,
-        reference: 'DONE',
-      },
-      { ...snapshot.payments[0], id: 'payment-003', reference: 'OPEN' },
-    ],
-  };
-
-  render(<App initialSnapshot={ledger} />);
-  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
-  fireEvent.click(screen.getByRole('button', { name: 'All payments' }));
-  await screen.findByText('DONE');
-
-  const rowOf = (reference: string) =>
-    screen.getByText(reference).closest('[role="row"]') as HTMLElement;
-  expect(rowOf('PART')).toHaveTextContent('Partially matched');
-  expect(rowOf('DONE')).toHaveTextContent('Matched');
-  expect(rowOf('DONE')).not.toHaveTextContent('Partially');
-  expect(rowOf('OPEN')).toHaveTextContent('Unmatched');
-});
-
-test('an assistant review of an ambiguous payment selects it and focuses the invoice picker', async () => {
+test('an assistant review of an ambiguous payment focuses it and brings its match panel to the user', async () => {
   cleanup();
   const requests: TransportRequest[] = [];
   const args = JSON.stringify({
@@ -526,10 +365,19 @@ test('an assistant review of an ambiguous payment selects it and focuses the inv
 
   fireEvent.click(review);
 
-  expect(screen.getByRole('checkbox', { name: 'Select row' })).toBeChecked();
+  expect(screen.getByRole('tab', { name: /Unapplied/ })).toHaveAttribute(
+    'aria-selected',
+    'true',
+  );
+  expect(
+    screen.getByRole('checkbox', { name: 'Apply to invoice-001' }),
+  ).not.toBeChecked();
+  expect(
+    screen.getByRole('checkbox', { name: 'Apply to INV-002' }),
+  ).not.toBeChecked();
   await waitFor(() =>
     expect(
-      screen.getByRole('combobox', { name: 'Invoice to match' }),
+      screen.getByRole('region', { name: 'Match this payment' }),
     ).toHaveFocus(),
   );
   expect(requests).toHaveLength(1);
@@ -574,49 +422,43 @@ test('a shared URL opens the dashboard on its focus, dropping ids the ledger doe
   expect(window.location.search).toBe('?tab=invoices');
 });
 
-const ledgerWithClient: LedgerSnapshot = {
-  ...snapshot,
-  customers: [
-    {
-      id: 'customer-001',
-      name: 'Northstar Labs',
-      currency: 'USD',
-      profile: 'on-time',
-    },
-  ],
-};
-
-test('focusing a client replaces a payment selected earlier in the rail', () => {
-  onTestFinished(() => window.history.replaceState(null, '', '/'));
+test('selecting a payment on the Unapplied tab opens its match panel and payment context', () => {
   cleanup();
-  window.history.replaceState(null, '', '/');
-  render(<App initialSnapshot={ledgerWithClient} />);
-  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
-  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
-  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
+  onTestFinished(() => window.history.replaceState(null, '', '/'));
+  render(<App initialSnapshot={snapshot} />);
+  fireEvent.click(screen.getByRole('tab', { name: /Unapplied/ }));
 
-  fireEvent.click(screen.getByText('Northstar Labs'));
+  fireEvent.click(screen.getByText('payment-001'));
 
-  const rail = screen.getByRole('complementary', { name: 'Assistant sidebar' });
   expect(
-    within(rail).getByRole('heading', { name: 'Client context' }),
+    screen.getByRole('region', { name: 'Match this payment' }),
   ).toBeVisible();
-  expect(rail).not.toHaveTextContent('payment-001');
+  expect(screen.getByText('$2,400.00 of $2,400.00 ✓')).toBeVisible();
+  expect(screen.getByRole('button', { name: 'Review match' })).toBeDisabled();
+  expect(
+    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
+  ).toHaveTextContent('Payment context');
+  expect(window.location.search).toBe(
+    '?tab=unapplied&client=customer-001&payment=payment-001',
+  );
 });
 
-test('selecting a payment replaces a client focused earlier in the rail', () => {
-  onTestFinished(() => window.history.replaceState(null, '', '/'));
+test('focusing a client after a payment replaces the payment context', () => {
   cleanup();
-  window.history.replaceState(null, '', '/');
-  render(<App initialSnapshot={ledgerWithClient} />);
-  fireEvent.click(screen.getByText('Northstar Labs'));
-  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
+  onTestFinished(() => window.history.replaceState(null, '', '/'));
+  render(<App initialSnapshot={snapshot} />);
+  fireEvent.click(screen.getByRole('tab', { name: /Unapplied/ }));
+  fireEvent.click(screen.getByText('payment-001'));
 
-  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
+  fireEvent.click(screen.getByRole('tab', { name: /Clients/ }));
+  fireEvent.click(
+    within(screen.getByRole('treegrid', { name: 'Clients' })).getByText(
+      'Northstar Labs',
+    ),
+  );
 
-  const rail = screen.getByRole('complementary', { name: 'Assistant sidebar' });
   expect(
-    within(rail).getByRole('heading', { name: 'Payment context' }),
-  ).toBeVisible();
-  expect(window.location.search).not.toContain('client');
+    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
+  ).toHaveTextContent('Client context');
+  expect(window.location.search).toBe('?client=customer-001');
 });
````

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- App.test`
Expected: FAIL (no Unapplied tab reachable from App; no match panel).
- [ ] **Step 3: Replace `App.tsx`**

Apply this patch to `examples/invoicing/react/src/App.tsx` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/App.tsx b/examples/invoicing/react/src/App.tsx
index 9aab2bdb..36d51d0a 100644
--- a/examples/invoicing/react/src/App.tsx
+++ b/examples/invoicing/react/src/App.tsx
@@ -4,20 +4,18 @@ import {
   AssistantWorkspace,
   type AssistantWorkspaceHandle,
 } from './assistant-workspace';
-import { type PretableColumn, PretableSurface } from '@pretable/react';
 import type { LedgerSnapshot } from '@invoicing/contracts';
 import { DashboardView } from './dashboard-view';
 import {
   type FocusAction,
   focusFromSearch,
   focusReducer,
+  focusSelection,
   focusToSearch,
   sanitizeFocus,
 } from './focus';
 import { HABITS, money } from './ledger-views';
 
-type Payment = LedgerSnapshot['payments'][number];
-
 /** Initial data and optional snapshot transport for the invoicing workspace. */
 export interface AppProps {
   readonly initialSnapshot?: LedgerSnapshot;
@@ -33,7 +31,10 @@ async function fetchSnapshot(): Promise<LedgerSnapshot> {
   return response.json();
 }
 
-/** Live ledger workspace with persistent payment context across its two pages. */
+const BUSY_NOTICE =
+  'Finish the current assistant request or approval before starting another match.';
+
+/** Live ledger workspace: one dashboard whose focus the assistant shares. */
 export function App({
   initialSnapshot,
   loadSnapshot = fetchSnapshot,
@@ -42,17 +43,10 @@ export function App({
 }: AppProps) {
   const [snapshot, setSnapshot] = useState(initialSnapshot);
   const [error, setError] = useState(false);
-  const [page, setPage] = useState<'Dashboard' | 'Payments'>('Dashboard');
-  const [selectedIds, setSelectedIds] = useState<string[]>([]);
   const reviewRef = useRef<AssistantWorkspaceHandle>(null);
-  const [paymentFilter, setPaymentFilter] = useState<'unmatched' | 'all'>(
-    'unmatched',
-  );
-  const [invoiceChoice, setInvoiceChoice] = useState('');
   const [reviewNotice, setReviewNotice] = useState('');
   const [assistantBusy, setAssistantBusy] = useState(false);
-  const pickerRef = useRef<HTMLSelectElement>(null);
-  const [pickerRequest, setPickerRequest] = useState(0);
+  const [matchRequest, setMatchRequest] = useState(0);
   const handleBusyChange = useCallback((busy: boolean) => {
     setAssistantBusy(busy);
     if (!busy) setReviewNotice('');
@@ -66,19 +60,11 @@ export function App({
     [focusState, snapshot],
   );
   function dispatchFocus(action: FocusAction) {
+    setReviewNotice('');
     setFocusState((prev) =>
       focusReducer(snapshot ? sanitizeFocus(prev, snapshot) : prev, action),
     );
   }
-  // The most recent selection owns the assistant: focusing a client or invoice drops the payment.
-  function handleFocus(action: FocusAction) {
-    dispatchFocus(action);
-    if (action.type !== 'select-client' && action.type !== 'select-invoice')
-      return;
-    setInvoiceChoice('');
-    setReviewNotice('');
-    setSelectedIds((ids) => (ids.length ? [] : ids));
-  }
   useEffect(() => {
     const search = focusToSearch(focus);
     if (window.location.search === search) return;
@@ -88,37 +74,33 @@ export function App({
       `${window.location.pathname}${search}${window.location.hash}`,
     );
   }, [focus]);
-  const focusedClient = snapshot?.customers.find(
-    (customer) => customer.id === focus.clientId,
-  );
-  const focusedInvoice = snapshot?.invoices.find(
-    (invoice) => invoice.id === focus.record?.id,
-  );
-
-  function selectPayment(ids: string[]) {
-    const addedId = ids.find((id) => !selectedIds.includes(id));
-    const nextId = addedId ?? ids[0];
-    setInvoiceChoice('');
-    setReviewNotice('');
-    setSelectedIds(nextId ? [nextId] : []);
-    // A payment selected now replaces any client focused earlier.
-    if (nextId) dispatchFocus({ type: 'clear' });
-  }
 
-  // The assistant asked for an invoice choice: bring the picker to the user.
+  // The assistant offered a payment without a clear invoice: bring its match panel to the user.
   useEffect(() => {
-    if (!pickerRequest) return;
-    pickerRef.current?.scrollIntoView?.({ block: 'center' });
-    pickerRef.current?.focus();
-  }, [pickerRequest]);
+    if (!matchRequest) return;
+    const panel = document.getElementById('match-panel');
+    panel?.scrollIntoView?.({ block: 'center' });
+    panel?.focus();
+  }, [matchRequest]);
 
   function chooseInvoice(paymentId: string) {
-    setPage('Payments');
-    setInvoiceChoice('');
-    setReviewNotice('');
-    setSelectedIds([paymentId]);
-    dispatchFocus({ type: 'clear' });
-    setPickerRequest((count) => count + 1);
+    const payment = snapshot?.payments.find((p) => p.id === paymentId);
+    if (!payment) return;
+    dispatchFocus({
+      type: 'set-tab',
+      tab: payment.unappliedCents > 0 ? 'unapplied' : 'payments',
+    });
+    dispatchFocus({
+      type: 'select-payment',
+      paymentId,
+      clientId: payment.customerId,
+    });
+    setMatchRequest((count) => count + 1);
+  }
+
+  function review(paymentId: string, invoiceIds: readonly string[]) {
+    const started = reviewRef.current?.beginReview(paymentId, invoiceIds);
+    setReviewNotice(started ? '' : BUSY_NOTICE);
   }
 
   useEffect(() => {
@@ -136,143 +118,16 @@ export function App({
     };
   }, [initialSnapshot, loadSnapshot]);
 
-  const selected = snapshot?.payments.find(
-    (payment) => payment.id === selectedIds[0],
+  const selection = focusSelection(focus);
+  const focusedClient = snapshot?.customers.find(
+    (customer) => customer.id === focus.clientId,
   );
-  const invoices = selected
-    ? (snapshot?.invoices.filter(
-        (invoice) =>
-          invoice.customerId === selected.customerId &&
-          invoice.currency === selected.currency,
-      ) ?? [])
-    : [];
-  const outstandingInvoices = invoices.filter(
-    (invoice) => invoice.outstandingCents > 0,
+  const focusedInvoice = snapshot?.invoices.find(
+    (invoice) => invoice.id === selection.focusedInvoiceId,
   );
-  const paidInvoices = invoices.filter(
-    (invoice) => invoice.outstandingCents === 0,
+  const selected = snapshot?.payments.find(
+    (payment) => payment.id === selection.selectedPaymentId,
   );
-  const targetInvoiceId =
-    outstandingInvoices.length === 1
-      ? outstandingInvoices[0].id
-      : invoiceChoice;
-  const visiblePayments = (snapshot?.payments ?? [])
-    .filter(
-      (payment) =>
-        paymentFilter === 'all' ||
-        payment.unappliedCents > 0 ||
-        payment.id === selected?.id,
-    )
-    .toSorted(
-      (a, b) =>
-        Number(b.unappliedCents > 0) - Number(a.unappliedCents > 0) ||
-        (b.date ?? '').localeCompare(a.date ?? ''),
-    );
-  function invoiceRow(invoice: LedgerSnapshot['invoices'][number]) {
-    return (
-      <div className="invoice-row" key={invoice.id}>
-        <div>
-          <strong>{invoice.reference ?? invoice.id}</strong>
-          <small>
-            {invoice.customerName ?? invoice.customerId} ·{' '}
-            {invoice.date ?? 'Undated'}
-          </small>
-        </div>
-        <div>
-          <strong>{money(invoice.outstandingCents, invoice.currency)}</strong>
-          <small>
-            {invoice.outstandingCents === 0 ? 'Paid' : 'Outstanding'}
-          </small>
-        </div>
-      </div>
-    );
-  }
-  const columns: PretableColumn<Payment>[] = [
-    ...(enableAssistant
-      ? [
-          {
-            id: 'reviewSelection',
-            header: '',
-            widthPx: 44,
-            sortable: false,
-            filterable: false,
-            type: 'text' as const,
-            value: (row: Payment) => row.id,
-            render: ({ row }: { row: Payment }) => (
-              <input
-                type="checkbox"
-                aria-label="Select row"
-                checked={selectedIds.includes(row.id)}
-                onChange={() =>
-                  selectPayment(selectedIds.includes(row.id) ? [] : [row.id])
-                }
-              />
-            ),
-          },
-        ]
-      : []),
-    {
-      id: 'id',
-      header: 'Payment',
-      flex: 3,
-      minWidthPx: 215,
-      type: 'text',
-      value: (row) => row.id,
-      render: ({ row }) => (
-        <button
-          className="payment-link"
-          title={row.reference ?? row.id}
-          aria-label={`Review ${row.id}`}
-          onClick={() => selectPayment([row.id])}
-        >
-          {row.reference ?? row.id}
-        </button>
-      ),
-    },
-    {
-      id: 'customer',
-      header: 'Customer',
-      flex: 2,
-      minWidthPx: 140,
-      type: 'text',
-      value: (row) => row.customerName ?? row.customerId,
-    },
-    {
-      id: 'amount',
-      header: 'Received',
-      widthPx: 100,
-      type: 'number',
-      value: (row) => row.amountCents,
-      format: ({ row }) => money(row.amountCents, row.currency),
-    },
-    {
-      id: 'unapplied',
-      header: 'Unapplied',
-      widthPx: 100,
-      type: 'number',
-      value: (row) => row.unappliedCents,
-      format: ({ row }) => money(row.unappliedCents, row.currency),
-    },
-    {
-      id: 'date',
-      header: 'Date',
-      widthPx: 100,
-      type: 'text',
-      value: (row) => row.date ?? '—',
-    },
-    {
-      id: 'status',
-      header: 'Status',
-      widthPx: 130,
-      type: 'text',
-      value: (row) =>
-        row.unappliedCents === 0
-          ? 'Matched'
-          : row.unappliedCents < row.amountCents
-            ? 'Partially matched'
-            : 'Unmatched',
-    },
-  ];
 
   return (
     <div className="workspace">
@@ -280,16 +135,10 @@ export function App({
         <div className="brand">
           <span className="brand-mark">S</span> Studio
         </div>
-        {(['Dashboard', 'Payments'] as const).map((item) => (
-          <button
-            key={item}
-            aria-current={page === item ? 'page' : undefined}
-            onClick={() => setPage(item)}
-          >
-            <span aria-hidden="true">{item === 'Dashboard' ? '▦' : '↙'}</span>
-            {item}
-          </button>
-        ))}
+        <button aria-current="page">
+          <span aria-hidden="true">▦</span>
+          Dashboard
+        </button>
         <p className="nav-footer">
           Software consulting
           <br />
@@ -298,15 +147,13 @@ export function App({
       </nav>
       <main>
         <header className="page-header">
-          <span>{page}</span>
+          <span>Dashboard</span>
           <span className="badge">Sample ledger · Sep 15, 2026</span>
         </header>
         <div className="content">
-          <h1>{page === 'Dashboard' ? 'Business overview' : 'Payments'}</h1>
+          <h1>Business overview</h1>
           <p className="muted">
-            {page === 'Dashboard'
-              ? 'Select a client or invoice to focus the charts.'
-              : 'Select a payment to review its related invoices.'}
+            Select a client, invoice or payment to focus the charts.
           </p>
           {!snapshot && !error && <p role="status">Loading ledger…</p>}
           {error && (
@@ -315,162 +162,15 @@ export function App({
             </p>
           )}
           {snapshot && (
-            <>
-              {page === 'Dashboard' && (
-                <DashboardView
-                  snapshot={snapshot}
-                  focus={focus}
-                  onFocus={handleFocus}
-                />
-              )}
-              {page === 'Payments' && (
-                <>
-                  <div className="section-heading">
-                    <h2>Incoming payments</h2>
-                    <span className="muted">
-                      {snapshot.payments.length} total
-                    </span>
-                  </div>
-                  <div className="payment-filters" aria-label="Payment filters">
-                    <button
-                      aria-pressed={paymentFilter === 'unmatched'}
-                      onClick={() => setPaymentFilter('unmatched')}
-                    >
-                      Unmatched
-                    </button>
-                    <button
-                      aria-pressed={paymentFilter === 'all'}
-                      onClick={() => setPaymentFilter('all')}
-                    >
-                      All payments
-                    </button>
-                  </div>
-                  {paymentFilter === 'unmatched' &&
-                    selected?.unappliedCents === 0 && (
-                      <p className="muted">
-                        Your selected matched payment stays visible for context.
-                      </p>
-                    )}
-                  <div className="payment-grid">
-                    <PretableSurface
-                      rows={visiblePayments}
-                      columns={columns}
-                      getRowId={(row: Payment) => row.id}
-                      ariaLabel="Incoming payments"
-                      viewportHeight={320}
-                      toolPanel={false}
-                      rowSelectionColumn={
-                        enableAssistant
-                          ? undefined
-                          : { enabled: true, headerCheckbox: false }
-                      }
-                      state={{
-                        rowSelection: { kind: 'explicit', rowIds: selectedIds },
-                      }}
-                      onRowSelectionChange={
-                        enableAssistant ? undefined : selectPayment
-                      }
-                    />
-                  </div>
-                  <section
-                    className="invoice-context"
-                    aria-label="Related invoices"
-                  >
-                    <h2>Related invoices</h2>
-                    {!selected ? (
-                      <p className="muted">
-                        Select a payment above to see invoices for the same
-                        customer and currency.
-                      </p>
-                    ) : (
-                      <>
-                        <p className="muted">
-                          {selected.customerName ?? selected.customerId} ·{' '}
-                          {selected.reference ?? selected.id}
-                        </p>
-                        {outstandingInvoices.map(invoiceRow)}
-                        {outstandingInvoices.length === 0 && (
-                          <p className="muted">
-                            No outstanding invoices for this customer and
-                            currency.
-                          </p>
-                        )}
-                        {paidInvoices.length > 0 && (
-                          <details>
-                            <summary>
-                              Paid invoices ({paidInvoices.length})
-                            </summary>
-                            {paidInvoices.map(invoiceRow)}
-                          </details>
-                        )}
-                        {enableAssistant && (
-                          <div className="match-controls">
-                            {outstandingInvoices.length > 1 && (
-                              <label>
-                                Invoice to match
-                                <select
-                                  ref={pickerRef}
-                                  aria-label="Invoice to match"
-                                  value={invoiceChoice}
-                                  onChange={(event) =>
-                                    setInvoiceChoice(event.target.value)
-                                  }
-                                >
-                                  <option value="">
-                                    Choose an outstanding invoice
-                                  </option>
-                                  {outstandingInvoices.map((invoice) => (
-                                    <option key={invoice.id} value={invoice.id}>
-                                      {invoice.reference ?? invoice.id} ·{' '}
-                                      {money(
-                                        invoice.outstandingCents,
-                                        invoice.currency,
-                                      )}
-                                    </option>
-                                  ))}
-                                </select>
-                              </label>
-                            )}
-                            <button
-                              disabled={
-                                !targetInvoiceId ||
-                                selected.unappliedCents === 0
-                              }
-                              onClick={() => {
-                                const started = reviewRef.current?.beginReview(
-                                  selected.id,
-                                  targetInvoiceId
-                                    ? [targetInvoiceId]
-                                    : undefined,
-                                );
-                                setReviewNotice(
-                                  started
-                                    ? ''
-                                    : 'Finish the current assistant request or approval before starting another match.',
-                                );
-                              }}
-                            >
-                              Match payment
-                            </button>
-                            {selected.unappliedCents === 0 && (
-                              <p className="muted">
-                                This payment is fully matched.
-                              </p>
-                            )}
-                            {reviewNotice && assistantBusy && (
-                              <p role="status">{reviewNotice}</p>
-                            )}
-                          </div>
-                        )}
-                        <p className="context-note">
-                          Related by customer and currency.
-                        </p>
-                      </>
-                    )}
-                  </section>
-                </>
-              )}
-            </>
+            <DashboardView
+              snapshot={snapshot}
+              focus={focus}
+              onFocus={dispatchFocus}
+              match={{
+                onReview: enableAssistant ? review : undefined,
+                notice: reviewNotice && assistantBusy ? reviewNotice : '',
+              }}
+            />
           )}
         </div>
       </main>
@@ -515,9 +215,9 @@ export function App({
             <AssistantWorkspace
               ref={reviewRef}
               snapshot={snapshot}
-              selectedPaymentId={selected?.id}
-              focusedClientId={focus.clientId}
-              focusedInvoiceId={focus.record?.id}
+              selectedPaymentId={selection.selectedPaymentId}
+              focusedClientId={selection.focusedClientId}
+              focusedInvoiceId={selection.focusedInvoiceId}
               transport={transport}
               onApplied={setSnapshot}
               onBusyChange={handleBusyChange}
````

Apply this patch to `examples/invoicing/react/src/assistant-workspace.tsx` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/assistant-workspace.tsx b/examples/invoicing/react/src/assistant-workspace.tsx
index f11a87a9..9e7f1e32 100644
--- a/examples/invoicing/react/src/assistant-workspace.tsx
+++ b/examples/invoicing/react/src/assistant-workspace.tsx
@@ -392,7 +392,7 @@ export function AssistantWorkspace({
       }
       setNotice(
         candidates.length
-          ? 'Select this payment in the grid and choose an invoice before matching.'
+          ? 'Select this payment on the Unapplied tab and check an invoice before matching.'
           : 'No outstanding invoice is available for this payment.',
       );
       return false;
````

- [ ] **Step 4: Run the whole react suite**

Run: `npx nx run-many -t build,test,lint -p invoicing-react`
Expected: PASS (137 tests), lint clean.
- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/react/src/App.tsx examples/invoicing/react/src/App.test.tsx examples/invoicing/react/src/assistant-workspace.tsx
git add examples/invoicing/react/src/App.tsx examples/invoicing/react/src/App.test.tsx examples/invoicing/react/src/assistant-workspace.tsx
git commit -m "feat(invoicing): one dashboard page; matching moves into the band

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 10: Server: a payment must belong to the focused client

**Files:**
- Modify: `examples/invoicing/server/src/assistant-middleware.ts`
- Modify: `examples/invoicing/server/src/assistant-middleware.spec.ts`

A payment focus now always arrives with its payer as `focusedClientId`. The middleware already checks each key alone; this adds that the payment belongs to that client, so the browser cannot pair one client's payment with another client.
- [ ] **Step 1: Write the failing test**

Apply this patch to `examples/invoicing/server/src/assistant-middleware.spec.ts` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/server/src/assistant-middleware.spec.ts b/examples/invoicing/server/src/assistant-middleware.spec.ts
index bc4ebe0c..441042aa 100644
--- a/examples/invoicing/server/src/assistant-middleware.spec.ts
+++ b/examples/invoicing/server/src/assistant-middleware.spec.ts
@@ -273,3 +273,39 @@ test('rejects focus the ledger does not hold or that crosses clients', async ()
     'continue',
   ]);
 });
+
+test("a payment sent with a focused client must be that client's payment", async () => {
+  const { request } = await setup();
+  const repositories = createMemoryRepositories();
+  const store = createSessionStore(repositories.sessions, createSampleLedger());
+  const session = await store.createSession();
+  const middleware = createAssistantMiddleware(store, repositories.threads);
+  const ledger = await store.snapshot(session);
+  const payment = ledger.payments.find((p) => p.unappliedCents > 0);
+  const other = ledger.customers.find((c) => c.id !== payment?.customerId);
+  if (!payment || !other)
+    throw new Error('the sample ledger has several clients');
+  const withState = (state: Record<string, unknown>) =>
+    middleware({
+      ...request,
+      headers: { cookie: `invoicing_session=${session}` },
+      body: { ...request.body, state },
+    });
+
+  const actions = [
+    (
+      await withState({
+        selectedPaymentId: payment.id,
+        focusedClientId: other.id,
+      })
+    ).action,
+    (
+      await withState({
+        selectedPaymentId: payment.id,
+        focusedClientId: payment.customerId,
+      })
+    ).action,
+  ];
+
+  expect(actions).toEqual(['reject', 'continue']);
+});
````

- [ ] **Step 2: Run to verify it fails**

Run: `npx nx test invoicing-server -- assistant-middleware`
Expected: FAIL (the cross-client pair is accepted).
- [ ] **Step 3: Implement**

Apply this patch to `examples/invoicing/server/src/assistant-middleware.ts` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/server/src/assistant-middleware.ts b/examples/invoicing/server/src/assistant-middleware.ts
index 73f0e81b..992289f7 100644
--- a/examples/invoicing/server/src/assistant-middleware.ts
+++ b/examples/invoicing/server/src/assistant-middleware.ts
@@ -188,7 +188,12 @@ export function createAssistantMiddleware(
       if (!ledger) return reject(422);
       if (
         (selection.selectedPaymentId !== undefined &&
-          !ledger.payments.some((p) => p.id === selection.selectedPaymentId)) ||
+          !ledger.payments.some(
+            (p) =>
+              p.id === selection.selectedPaymentId &&
+              (selection.focusedClientId === undefined ||
+                p.customerId === selection.focusedClientId),
+          )) ||
         (selection.focusedClientId !== undefined &&
           !ledger.customers.some((c) => c.id === selection.focusedClientId)) ||
         (selection.focusedInvoiceId !== undefined &&
````

- [ ] **Step 4: Verify**

```bash
npx nx run-many -t build,test,lint -p invoicing-server
```

Expected: PASS (259 tests); lint shows only the 23 pre-existing warnings in unrelated files.
- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/server/src/assistant-middleware.ts examples/invoicing/server/src/assistant-middleware.spec.ts
git add examples/invoicing/server/src/assistant-middleware.ts examples/invoicing/server/src/assistant-middleware.spec.ts
git commit -m "fix(invoicing): reject a payment paired with another client's focus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 11: Styles: payer, match panel; drop the Payments page CSS

**Files:**
- Modify: `examples/invoicing/react/src/styles.css`

Removes the rules for classes nothing renders any more (`section-heading`, `payment-grid`, `payment-link`, `invoice-context`, `invoice-row`, `context-note`, `payment-filters`, `match-controls`) and adds the payer, match panel and `visually-hidden` rules.
- [ ] **Step 1: Apply**

Apply this patch to `examples/invoicing/react/src/styles.css` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/react/src/styles.css b/examples/invoicing/react/src/styles.css
index 634f1cc1..a8860fcf 100644
--- a/examples/invoicing/react/src/styles.css
+++ b/examples/invoicing/react/src/styles.css
@@ -149,57 +149,6 @@ h2 {
   margin: 12px 0;
   font-variant-numeric: tabular-nums;
 }
-.section-heading {
-  display: flex;
-  align-items: center;
-  justify-content: space-between;
-  margin-bottom: 12px;
-}
-.payment-grid {
-  border: 1px solid #e4e6e5;
-  border-radius: 8px;
-  overflow: hidden;
-  min-width: 0;
-}
-.payment-link {
-  background: none;
-  border: 0;
-  padding: 5px 0;
-  text-align: left;
-  color: #293e34;
-  text-decoration: underline;
-  text-underline-offset: 3px;
-}
-.invoice-context {
-  margin-top: 24px;
-  padding: 20px;
-  border: 1px solid #e4e6e5;
-  border-radius: 8px;
-}
-.invoice-row {
-  display: flex;
-  justify-content: space-between;
-  gap: 16px;
-  padding: 14px 0;
-  border-top: 1px solid #efefef;
-  font-size: 12px;
-}
-.invoice-row div:last-child {
-  text-align: right;
-}
-.invoice-row strong {
-  font-weight: 500;
-}
-.invoice-row small {
-  display: block;
-  color: #777d80;
-  margin-top: 6px;
-}
-.context-note {
-  font-size: 12px;
-  color: #73777c;
-  margin-bottom: 0;
-}
 .assistant {
   border-left: 1px solid #e7e7e7;
   display: flex;
@@ -462,51 +411,6 @@ h2 {
   color: #73777c;
 }
 
-.payment-filters {
-  display: flex;
-  gap: 8px;
-  margin: 0 0 12px;
-}
-.payment-filters button,
-.match-controls button {
-  padding: 8px 12px;
-  border: 1px solid #d4ddd7;
-  border-radius: 6px;
-  background: #fff;
-  color: #253d32;
-}
-.payment-filters button[aria-pressed='true'],
-.match-controls button {
-  background: #edf3ef;
-}
-.match-controls button:disabled {
-  opacity: 0.5;
-}
-.match-controls {
-  display: grid;
-  justify-items: start;
-  gap: 12px;
-  margin-top: 18px;
-}
-.match-controls label {
-  display: grid;
-  gap: 8px;
-  font-size: 12px;
-}
-.match-controls select {
-  max-width: 100%;
-  padding: 8px;
-  font: inherit;
-  border: 1px solid #d4ddd7;
-  border-radius: 6px;
-}
-.invoice-context summary {
-  cursor: pointer;
-  padding: 12px 0;
-  color: #73777c;
-  font-size: 12px;
-}
-
 .assistant-body textarea {
   width: 100%;
   min-height: 64px;
@@ -858,3 +762,90 @@ h2 {
     transition: none;
   }
 }
+
+/* Payments and matching (PR 2). */
+.payer {
+  display: flex;
+  flex-direction: column;
+  gap: 2px;
+  min-width: 0;
+}
+.payer-reference {
+  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
+  font-size: 12px;
+  color: #73777c;
+  overflow-wrap: anywhere;
+}
+.match-panel {
+  display: flex;
+  flex-direction: column;
+  gap: 8px;
+  min-height: 0;
+  outline: none;
+}
+.match-panel:focus-visible {
+  outline: 2px solid #3d745a;
+  outline-offset: 2px;
+}
+.match-panel h3 {
+  margin: 0;
+  font-size: 13px;
+  font-weight: 600;
+}
+.match-panel table {
+  width: 100%;
+  border-collapse: collapse;
+  font-size: 12px;
+  font-variant-numeric: tabular-nums;
+}
+.match-panel th,
+.match-panel td {
+  padding: 6px 4px;
+  border-bottom: 1px solid #efefef;
+  text-align: right;
+}
+.match-panel th:nth-child(-n + 3),
+.match-panel td:nth-child(-n + 3) {
+  text-align: left;
+}
+.match-panel th {
+  font-weight: 500;
+  color: #73777c;
+}
+.match-panel tr[data-checked] td {
+  background: var(--tint, #eef3f0);
+}
+.match-footer {
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  gap: 12px;
+}
+.match-total {
+  margin: 0;
+  font-variant-numeric: tabular-nums;
+  font-weight: 500;
+}
+.match-total[data-ties-out] {
+  color: #0b7a0b;
+}
+.match-footer button {
+  padding: 6px 12px;
+  border: 1px solid #253d32;
+  border-radius: 6px;
+  background: #253d32;
+  color: #fff;
+}
+.match-footer button:disabled {
+  background: #fff;
+  color: #73777c;
+  border-color: #d4ddd7;
+}
+.visually-hidden {
+  position: absolute;
+  width: 1px;
+  height: 1px;
+  overflow: hidden;
+  clip-path: inset(50%);
+  white-space: nowrap;
+}
````

- [ ] **Step 2: Check no dead classes remain**

```bash
cd examples/invoicing/react/src && for c in $(grep -oE '^\.[a-z][a-z0-9-]*' styles.css | sort -u | tr -d .); do grep -lq "\b$c\b" *.tsx || echo "unused: $c"; done; cd -
```

Expected: no output.
- [ ] **Step 3: Build and commit**

```bash
npx nx run-many -t build,lint -p invoicing-react
```

```bash
npx prettier --write examples/invoicing/react/src/styles.css
git add examples/invoicing/react/src/styles.css
git commit -m "style(invoicing): payer references and the match panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 12: End-to-end: match through the band

**Files:**
- Modify: `examples/invoicing/e2e/workflow.spec.ts`
- Modify: `examples/invoicing/e2e/live.spec.ts`
- Modify: `examples/invoicing/e2e/walkthrough/scenes.ts`

Payments are selected as rows on the Unapplied tab (`[data-pretable-row-id="payment-…"]`), and **Review match** replaces **Match payment**. The first workflow test changes meaning on purpose: Harbor's combined payment is now pre-checked from its tie-out hint, while Atlas's ambiguous pair still starts unchecked. The lost-approval test also asserts the busy notice, then clears the focus to read the USD portfolio strip.
- [ ] **Step 1: Apply**

Apply this patch to `examples/invoicing/e2e/workflow.spec.ts` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/e2e/workflow.spec.ts b/examples/invoicing/e2e/workflow.spec.ts
index 8f42b7f3..cc982454 100644
--- a/examples/invoicing/e2e/workflow.spec.ts
+++ b/examples/invoicing/e2e/workflow.spec.ts
@@ -6,12 +6,19 @@ async function snapshot(page: Page): Promise<LedgerSnapshot> {
   return page.evaluate(async () => (await fetch('/api/snapshot')).json());
 }
 
-async function openPayments(page: Page) {
-  await page.getByRole('button', { name: 'Payments', exact: true }).click();
-  await page.getByRole('heading', { name: 'Payments', level: 1 }).waitFor();
+/** Open the Unapplied tab and focus one payment, which brings up its match panel. */
+async function focusPayment(page: Page, paymentId: string) {
+  await page.getByRole('tab', { name: /^Unapplied/ }).click();
+  await page.locator(`[data-pretable-row-id="${paymentId}"]`).click();
+  await page
+    .getByRole('region', { name: 'Match this payment', exact: true })
+    .waitFor();
 }
 
-test('ambiguous and combined payments require an explicit invoice choice', async ({
+const reviewMatch = (page: Page) =>
+  page.getByRole('button', { name: 'Review match', exact: true });
+
+test('the match panel suggests a tie-out but never picks between ambiguous invoices', async ({
   page,
 }) => {
   const agentRequests: unknown[] = [];
@@ -21,33 +28,39 @@ test('ambiguous and combined payments require an explicit invoice choice', async
   });
   await page.goto('/');
   const baseline = await snapshot(page);
-  await openPayments(page);
+  await page.getByRole('tab', { name: /^Unapplied/ }).click();
+  await expect(
+    page.getByText('Ambiguous: 2 invoices at $1,500', { exact: true }),
+  ).toBeVisible();
 
+  await focusPayment(page, 'payment-atlas-ambiguous');
+  await expect(reviewMatch(page)).toBeDisabled();
   await page
-    .getByRole('button', {
-      name: 'Review payment-atlas-ambiguous',
-      exact: true,
-    })
-    .click();
+    .getByRole('checkbox', { name: 'Apply to INV-202609-AA-105', exact: true })
+    .check();
+  await expect(reviewMatch(page)).toBeEnabled();
   await expect(
-    page.getByRole('button', { name: 'Match payment', exact: true }),
+    page.getByRole('checkbox', {
+      name: 'Apply to INV-202609-AA-106',
+      exact: true,
+    }),
   ).toBeDisabled();
-  await page.getByRole('combobox').selectOption('invoice-atlas-discovery');
+  await focusPayment(page, 'payment-harbor-combined');
+
   await expect(
-    page.getByRole('button', { name: 'Match payment', exact: true }),
-  ).toBeEnabled();
-  await page
-    .getByRole('button', {
-      name: 'Review payment-harbor-combined',
+    page.getByRole('checkbox', {
+      name: 'Apply to INV-202609-HC-103',
       exact: true,
-    })
-    .click();
-
-  await expect(page.getByRole('combobox')).toHaveValue('');
+    }),
+  ).toBeChecked();
   await expect(
-    page.getByRole('button', { name: 'Match payment', exact: true }),
-  ).toBeDisabled();
-  await expect(page.getByRole('combobox').locator('option')).toHaveCount(3);
+    page.getByRole('checkbox', {
+      name: 'Apply to INV-202609-HC-104',
+      exact: true,
+    }),
+  ).toBeChecked();
+  await expect(page.getByText('$5,000.00 of $5,000.00 ✓')).toBeVisible();
+  await expect(reviewMatch(page)).toBeEnabled();
   expect(agentRequests).toEqual([]);
   expect(await snapshot(page)).toEqual(baseline);
 });
@@ -61,15 +74,13 @@ test('advance payment cannot start a review without an outstanding invoice', asy
   });
   await page.goto('/');
   const baseline = await snapshot(page);
-  await openPayments(page);
 
-  await page
-    .getByRole('button', { name: 'Review payment-summit-advance', exact: true })
-    .click();
+  await focusPayment(page, 'payment-summit-advance');
 
   await expect(
-    page.getByRole('button', { name: 'Match payment', exact: true }),
-  ).toBeDisabled();
+    page.getByText(/No open USD invoice for this client/),
+  ).toBeVisible();
+  await expect(reviewMatch(page)).toHaveCount(0);
   await expect(
     page.getByRole('textbox', { name: 'Message assistant', exact: true }),
   ).toBeEnabled();
@@ -86,17 +97,9 @@ test('failed review releases chat and retries with a fresh thread without changi
   });
   await page.goto('/');
   const baseline = await snapshot(page);
-  await openPayments(page);
-  await page
-    .getByRole('button', {
-      name: 'Review payment-northstar-exact',
-      exact: true,
-    })
-    .click();
+  await focusPayment(page, 'payment-northstar-exact');
 
-  await page
-    .getByRole('button', { name: 'Match payment', exact: true })
-    .click();
+  await reviewMatch(page).click();
   await expect(
     page.getByText(
       'No allocation proposal was completed. You can start another review.',
@@ -106,9 +109,7 @@ test('failed review releases chat and retries with a fresh thread without changi
   await expect(
     page.getByRole('textbox', { name: 'Message assistant', exact: true }),
   ).toBeEnabled();
-  await page
-    .getByRole('button', { name: 'Match payment', exact: true })
-    .click();
+  await reviewMatch(page).click();
   await expect(
     page.getByText(
       'No allocation proposal was completed. You can start another review.',
@@ -165,16 +166,8 @@ test('lost approval response holds further work until the committed operation is
   });
   await page.goto('/');
   const baseline = await snapshot(page);
-  await openPayments(page);
-  await page
-    .getByRole('button', {
-      name: 'Review payment-northstar-exact',
-      exact: true,
-    })
-    .click();
-  await page
-    .getByRole('button', { name: 'Match payment', exact: true })
-    .click();
+  await focusPayment(page, 'payment-northstar-exact');
+  await reviewMatch(page).click();
 
   await page
     .getByRole('button', { name: 'Approve and apply', exact: true })
@@ -191,12 +184,11 @@ test('lost approval response holds further work until the committed operation is
   await expect(
     page.getByRole('textbox', { name: 'Message assistant', exact: true }),
   ).toBeDisabled();
-  await page
-    .getByRole('button', { name: 'Review payment-cedar-partial', exact: true })
-    .click();
-  await page
-    .getByRole('button', { name: 'Match payment', exact: true })
-    .click();
+  await focusPayment(page, 'payment-cedar-partial');
+  await reviewMatch(page).click();
+  await expect(
+    page.getByText(/Finish the current assistant request/),
+  ).toBeVisible();
   await expect(
     page.getByRole('region', { name: 'Payment review chat', exact: true }),
   ).toHaveCount(1);
@@ -212,7 +204,7 @@ test('lost approval response holds further work until the committed operation is
   await expect(
     page.getByRole('textbox', { name: 'Message assistant', exact: true }),
   ).toBeEnabled();
-  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
+  await page.getByRole('button', { name: 'Clear focus', exact: true }).click();
   await expect(
     page.getByRole('region', { name: 'Ledger totals', exact: true }),
   ).toContainText('$11,500');
````

Apply this patch to `examples/invoicing/e2e/live.spec.ts` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/e2e/live.spec.ts b/examples/invoicing/e2e/live.spec.ts
index be7e5c3c..bdf3aba1 100644
--- a/examples/invoicing/e2e/live.spec.ts
+++ b/examples/invoicing/e2e/live.spec.ts
@@ -26,16 +26,11 @@ test('seeded ledger supports questions, repeated approvals, cancellation and ses
     page.getByRole('region', { name: 'Ledger conversation' }),
   ).toContainText('13,900');
   await expect(message).toBeEnabled();
-  await page.getByRole('button', { name: 'Payments', exact: true }).click();
+  await page.getByRole('tab', { name: /^Unapplied/ }).click();
   await page
-    .getByRole('button', {
-      name: 'Review payment-northstar-exact',
-      exact: true,
-    })
-    .click();
-  await page
-    .getByRole('button', { name: 'Match payment', exact: true })
+    .locator('[data-pretable-row-id="payment-northstar-exact"]')
     .click();
+  await page.getByRole('button', { name: 'Review match', exact: true }).click();
   await expect(message).toBeDisabled();
   await page
     .getByRole('button', { name: 'Approve and apply', exact: true })
@@ -52,12 +47,8 @@ test('seeded ledger supports questions, repeated approvals, cancellation and ses
     applied.payments.find((p) => p.id === 'payment-northstar-exact')
       ?.unappliedCents,
   ).toBe(0);
-  await page
-    .getByRole('button', { name: 'Review payment-cedar-partial', exact: true })
-    .click();
-  await page
-    .getByRole('button', { name: 'Match payment', exact: true })
-    .click();
+  await page.locator('[data-pretable-row-id="payment-cedar-partial"]').click();
+  await page.getByRole('button', { name: 'Review match', exact: true }).click();
   await expect(
     page.getByRole('region', {
       name: 'Payment review chat',
@@ -83,9 +74,7 @@ test('seeded ledger supports questions, repeated approvals, cancellation and ses
     baseline.allocations.length + 1,
   );
 
-  await page
-    .getByRole('button', { name: 'Match payment', exact: true })
-    .click();
+  await page.getByRole('button', { name: 'Review match', exact: true }).click();
   await expect(
     page.getByRole('region', {
       name: 'Payment review chat',
````

Apply this patch to `examples/invoicing/e2e/walkthrough/scenes.ts` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/e2e/walkthrough/scenes.ts b/examples/invoicing/e2e/walkthrough/scenes.ts
index 3296ee48..52efd399 100644
--- a/examples/invoicing/e2e/walkthrough/scenes.ts
+++ b/examples/invoicing/e2e/walkthrough/scenes.ts
@@ -144,16 +144,14 @@ export async function recordApp(
     'The assistant sees what you select',
     'Page state flows into the chat',
   );
-  await glide(
-    page,
-    page.getByRole('button', { name: 'Payments', exact: true }),
-  );
-  await page.getByRole('heading', { name: 'Payments', level: 1 }).waitFor();
+  await glide(page, page.getByRole('tab', { name: /^Unapplied/ }));
+  await page.getByRole('treegrid', { name: 'Unapplied payments' }).waitFor();
   await pause(600);
   await glide(
     page,
-    page.getByRole('button', { name: 'Review payment-harbor-combined' }),
+    page.locator('[data-pretable-row-id="payment-harbor-combined"]'),
   );
+  await page.getByRole('region', { name: 'Match this payment' }).waitFor();
   await pause(900);
   await caption(
     page,
@@ -209,8 +207,12 @@ export async function recordApp(
   await pause(2600);
   await zoom(page, null);
   await pause(600);
-  await caption(page, 'The grid agrees', 'Harbor’s payment now reads Matched');
-  await glide(page, page.locator('.payment-grid'), false);
+  await caption(
+    page,
+    'The dashboard agrees',
+    'Harbor’s payment now reads fully matched',
+  );
+  await glide(page, page.locator('.match-panel'), false);
   await pause(2200);
   await caption(page, '');
   await pause(500);
````

- [ ] **Step 2: Type-check and lint**

```bash
npx nx run-many -t build,lint,test-walkthrough -p invoicing-e2e
```

Expected: PASS.
- [ ] **Step 3: Run the deterministic browser suite**

```bash
npx nx application-e2e invoicing-e2e
```

Expected: 6 passed. Do not run `live-model` or `walkthrough` (they need a real model key).
- [ ] **Step 4: Commit**

```bash
npx prettier --write examples/invoicing/e2e/workflow.spec.ts examples/invoicing/e2e/live.spec.ts examples/invoicing/e2e/walkthrough/scenes.ts
git add examples/invoicing/e2e/workflow.spec.ts examples/invoicing/e2e/live.spec.ts examples/invoicing/e2e/walkthrough/scenes.ts
git commit -m "test(invoicing): e2e matches through the band's panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 13: README

**Files:**
- Modify: `examples/invoicing/README.md`

- [ ] **Step 1: Apply**

Apply this patch to `examples/invoicing/README.md` (save it to a file and run `git apply <file>`; it was generated against `main` after #613):

````diff
diff --git a/examples/invoicing/README.md b/examples/invoicing/README.md
index 19c4d339..ade5ec88 100644
--- a/examples/invoicing/README.md
+++ b/examples/invoicing/README.md
@@ -26,19 +26,24 @@ Five incoming payments initially have unapplied cash totaling **$13,900**:
 The assistant accepts questions immediately, without selecting a payment, and
 an empty conversation offers starter questions. Selecting a row adds context:
 the assistant reads a payment through `selectedPayment` when you ask about
-"this payment", and a focused client or invoice through `focusedClient`. The
-most recent selection wins, so the rail shows either a payment or a client,
-never both. The assistant column stays in view while the page scrolls, with the
+"this payment", and a focused client or invoice through `focusedClient`. A
+payment focus carries its payer, so the rail shows the payment; picking a
+client instead shows the client. The assistant column stays in view while the page scrolls, with the
 message box pinned under the thread; Enter sends and Shift+Enter adds a line.
 
-**Match payment** opens a separately authorized allocation review, and so does
+Selecting a payment on the Payments or Unapplied tab turns the band's right half
+into **Match this payment**: the payer's open invoices in the payment's
+currency, each with a checkbox and the amount it would receive, and a running
+total that must tie out. The page's suggestion is checked to start with, except
+when it is ambiguous; invoices fill in the order they are checked.
+**Review match** opens a separately authorized allocation review, and so does
 the assistant's own offer: **Match to INV-…** when it names the invoice (or
 **Match to INV-… and INV-…** when one payment covers several), or
-**Review …** for an ambiguous payment, which selects it and focuses the invoice
-picker instead. **Approve and apply** records the simulated allocation,
+**Review …** for an ambiguous payment, which focuses it and brings its match
+panel to you instead. **Approve and apply** records the simulated allocation,
 refreshes the balances and leaves a confirmation in the thread saying what was
-applied and what stays unapplied; the grid marks such a payment **Partially
-matched**. With multiple open invoices, choose an invoice first. A combined
+applied and what stays unapplied; the Payments tab marks such a payment **Partly
+applied**. A combined
 payment is one proposal with a line per invoice and takes a single approval:
 the card lists each invoice's share and the total, and approving applies every
 line together or none of them. **Decline** leaves the ledger unchanged. Chat becomes available
@@ -66,13 +71,16 @@ produced no validated UI at all.
 
 The Dashboard opens on a KPI strip with a USD/EUR/GBP switcher, a
 fixed-height focus band (an invoiced vs received trend and aging for the chosen
-currency or the focused client) and Clients/Invoices grids grouped by
-currency. Selecting a row focuses the charts and the assistant; keys 1/2 switch
-tabs and Esc clears the focus, which is shareable through `?client=` and
-`?tab=` in the URL. Payments and matching live on the Payments page.
-Payments default to unmatched items; All payments includes historical receipts.
-A selected payment remains visible after matching to preserve context. There
-are no real transfers, collections workflows, or payment reminders.
+currency or the focused client) and Clients, Invoices, Payments and Unapplied
+grids grouped by currency. Payments lists all 446 receipts newest first;
+Unapplied lists the cash still to match, oldest first, with a match hint in
+words (exact, ties out, partial, ambiguous or advance). Selecting a row focuses
+the band and the assistant; picking a client narrows the other tabs to that
+client, while picking an invoice or payment leaves the list whole. Keys 1–4
+switch tabs and Esc clears the focus, which is shareable through `?tab=`,
+`?client=`, `?invoice=` and `?payment=` in the URL.
+A focused payment stays focused after matching, and its panel says it is fully
+matched. There are no real transfers, collections workflows, or payment reminders.
 
 The Pretable and B4 dependencies were explicitly requested and approved as part
 of this example's design; the root Zod 4 migration was separately approved.
@@ -100,7 +108,7 @@ The environment file must provide `OPENAI_API_KEY`; alternatively export the
 key in the server environment. Credentials are loaded only by the server.
 Both the root agent and nested structured UI generation use `gpt-5-mini`.
 Open <http://127.0.0.1:4326/>. Vite proxies API and agent requests to port 4325.
-Selection and chat survive Dashboard/Payments navigation. Matching is an
+Matching is an
 explicit action; selecting a record never initiates a financial proposal.
 
 The root lockfile includes the server workspace and registry integrity hashes.
@@ -304,7 +312,7 @@ Failure traces go to `work/invoicing-deterministic`.
 The server build type-checks; serve runs TypeScript directly. Existing warnings
 include the large minified Vite chunk and terminal color settings.
 
-V1 scope is complete for the local example: seeded Dashboard/Payments, real-model
+V1 scope is complete for the local example: seeded dashboard, real-model
 conversation, explicit simulated approvals, and operation-result verification.
 Per-session state is durable: the Postgres repositories commit each session and
 each thread by compare-and-swap, so a ledger outlives the process that created
````

- [ ] **Step 2: Commit**

```bash
git add examples/invoicing/README.md
git commit -m "docs(invoicing): describe matching in the band and the four tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 14: Final verification

**Files:**
examples/invoicing/(no file changes)

- [ ] **Step 1: Confirm the install matches the pins**

```bash
node -p "require('./examples/invoicing/server/node_modules/@b4run/cli/package.json').version"
```

Expected: `0.13.0` (the version in `examples/invoicing/server/package.json`). Otherwise run `npm ci --no-audit --no-fund` first.
- [ ] **Step 2: Everything**

```bash
npx nx run-many -t build,test,lint -p invoicing-contracts,invoicing-server,invoicing-react,invoicing-e2e
npx nx application-e2e invoicing-e2e
npx nx eval invoicing-server
```

Expected: contracts 20, server 259, react 137 tests; browser 6 passed; eval gate passed.
- [ ] **Step 3: Hand off** with superpowers:finishing-a-development-branch.

---
