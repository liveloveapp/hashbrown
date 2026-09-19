# Invoicing Query Tools, Kit Contracts, and Render Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the assistant's single dump tool and server-built UI with six query-shaped tools, a six-component kit the model composes directly, and a `render` tool that validates the composed tree against the kit and the session snapshot before streaming it.

**Architecture:** Kit configs and a `createAssistantKit` builder live in the shared contracts so the server schema and the React `useUiChat` schema come from one code path and stay byte-equal (Hashbrown deduplicates repeated sub-schemas by object identity, so both sides must build the kit the same way). Query logic is pure functions over a `LedgerSnapshot` in `assistant-queries.ts`; UI validation is a pure function in `assistant-ui.ts`; the middleware wires both to the session; one B4 tool file per query plus `render.ts`, which reuses the existing nested structured-output echo to stream UI. React gets minimal but truthful renderers for the four new components so the schema matches on both sides in this PR; PR 3 replaces those bodies with Pretable and charts.

**Tech Stack:** TypeScript, Vitest, Nx, B4 (`@b4run/sdk` tools with compiler-derived input schemas; unions and optionals are supported), Hashbrown `s` schema builder and `ɵcreateUiKit`, React.

This is PR 2 of 4 from [the design spec](../specs/2026-09-19-invoicing-generative-ui-design.md), stacked on PR 1 ([#558](https://github.com/liveloveapp/hashbrown/pull/558), branch `blove/invoicing-vercel-example-dcc083`). Work on branch `blove/invoicing-query-tools`.

**Two facts that shape this plan.** B4 converts each tool's TypeScript input type to JSON schema and validates arguments with zod before the tool runs, and it supports unions and optionals, so the `render` tool's `ui` argument is typed as a non-recursive union of node shapes. B4 has no post-run hook and does not apply the client's `responseSchema`, so validation must live in `render`, and the validated tree reaches the client through the nested structured-output echo the example already uses.

---

## File map

| File | Change | Responsibility |
| ---- | ------ | -------------- |
| `examples/invoicing/shared/src/aging.ts` | create | `TERMS_DAYS`, `agingBucket`, shared by server facts and React |
| `examples/invoicing/shared/src/assistant-ui.ts` | create | TypeScript node types for the composed tree |
| `examples/invoicing/shared/src/assistant-contract.ts` | rewrite | six kit configs, `createAssistantKit`, `assistantResponseSchema` |
| `examples/invoicing/shared/src/assistant-contract.spec.ts` | create | schema names, parity between placeholder and real kits |
| `examples/invoicing/shared/src/index.ts` | modify | exports |
| `examples/invoicing/server/src/generator/facts.ts` | modify | import `agingBucket`/`TERMS_DAYS` from contracts, re-export |
| `examples/invoicing/server/src/money.ts` | create | `formatMoney` |
| `examples/invoicing/server/src/assistant-queries.ts` | create | six pure query functions over a snapshot |
| `examples/invoicing/server/src/assistant-queries.spec.ts` | create | shapes and size budgets |
| `examples/invoicing/server/src/assistant-ui.ts` | create | `validateUi`, `renderUi` (echo + compare) |
| `examples/invoicing/server/src/assistant-ui.spec.ts` | create | |
| `examples/invoicing/server/src/assistant-middleware.ts` | modify | context exposes queries and `validateUi` |
| `examples/invoicing/server/src/assistant-middleware.spec.ts` | modify | |
| `examples/invoicing/server/src/assistant-tools.ts` | modify | guard for the new context |
| `examples/invoicing/server/src/app/assistant/tools/*.ts` | create six, create `render.ts`, delete `readLedger.ts` and `respond.ts` | |
| `examples/invoicing/server/src/app/assistant/index.ts` | modify | system prompt |
| `examples/invoicing/react/src/snapshot-context.ts` | create | `SnapshotContext` |
| `examples/invoicing/react/src/assistant-kit.tsx` | create | six renderers (four minimal) and the kit instance |
| `examples/invoicing/react/src/assistant-kit.test.tsx` | create | |
| `examples/invoicing/react/src/assistant-workspace.tsx` | modify | use the kit and provide the snapshot |
| `examples/invoicing/README.md` | modify | assistant tools paragraph |

All commands run from the repository root: `/Users/blove/repos/hashbrown/.claude/worktrees/xenodochial-rosalind-9aa111`.

Server unit tests: `npx vitest run --config examples/invoicing/server/vitest.config.mts <file>`. Shared: `npx vitest run --config examples/invoicing/shared/vitest.config.mts <file>`. React: `npx vitest run --config examples/invoicing/react/vite.config.mts <file>`. Formatting: `npx prettier --write <files>` before each commit. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Shared aging rule, node types, kit configs, and the kit builder

**Files:**
- Create: `examples/invoicing/shared/src/aging.ts`
- Create: `examples/invoicing/shared/src/assistant-ui.ts`
- Rewrite: `examples/invoicing/shared/src/assistant-contract.ts`
- Create: `examples/invoicing/shared/src/assistant-contract.spec.ts`
- Modify: `examples/invoicing/shared/src/index.ts`
- Modify: `examples/invoicing/server/src/generator/facts.ts`

- [ ] **Step 1: Write the failing contract test**

`examples/invoicing/shared/src/assistant-contract.spec.ts`:

```ts
import { s, ɵcreateUiKit } from '@hashbrownai/core';
import { expect, test } from 'vitest';
import { assistantResponseSchema, createAssistantKit } from './index';

const names = [
  'AssistantText',
  'LedgerTable',
  'TrendChart',
  'AgingSummary',
  'CustomerCard',
  'ReviewPayment',
];

test('the assistant schema names every kit component and nothing else', () => {
  const serialized = JSON.stringify(assistantResponseSchema);
  for (const name of names) expect(serialized).toContain(`"${name}"`);
  expect(serialized).not.toContain('AllocationProposal');
  expect(serialized).not.toContain('amountCents');
});

test('a kit built with any component implementations yields the same schema', () => {
  const kit = createAssistantKit({
    AssistantText: () => null,
    LedgerTable: () => null,
    TrendChart: () => null,
    AgingSummary: () => null,
    CustomerCard: () => null,
    ReviewPayment: () => null,
  });

  const schema = s.toJsonSchema(ɵcreateUiKit({ components: kit }).schema);

  expect(schema).toEqual(assistantResponseSchema);
  expect(kit.map((c) => c.name)).toEqual(names);
});

test('only AssistantText accepts children, and only leaf components', () => {
  const kit = createAssistantKit({
    AssistantText: {},
    LedgerTable: {},
    TrendChart: {},
    AgingSummary: {},
    CustomerCard: {},
    ReviewPayment: {},
  });
  const text = kit[0];
  const leaves = kit.slice(1);

  expect(Array.isArray(text.children)).toBe(true);
  expect((text.children as unknown[]).length).toBe(5);
  expect((text.children as { name: string }[]).map((c) => c.name)).toEqual(
    leaves.map((c) => c.name),
  );
  for (const leaf of leaves) expect(leaf.children).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config examples/invoicing/shared/vitest.config.mts examples/invoicing/shared/src/assistant-contract.spec.ts`
Expected: FAIL, `createAssistantKit` is not exported.

- [ ] **Step 3: Create the shared aging rule**

`examples/invoicing/shared/src/aging.ts`:

```ts
/** Net terms every invoice is issued on. Overdue starts the day after. */
export const TERMS_DAYS = 30;

/** Aging buckets, in cents, for open invoices on an as-of date. */
export interface AgingBuckets {
  readonly current: number;
  readonly days1to30: number;
  readonly days31to60: number;
  readonly days61to90: number;
  readonly over90: number;
}

export const AGING_BUCKETS: readonly (keyof AgingBuckets)[] = [
  'current',
  'days1to30',
  'days31to60',
  'days61to90',
  'over90',
];

const DAY = 86_400_000;

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY,
  );
}

/** Which aging bucket an open invoice falls in on `asOf`. */
export function agingBucket(
  invoiceDate: string,
  asOf: string,
): keyof AgingBuckets {
  const overdue = daysBetween(invoiceDate, asOf) - TERMS_DAYS;
  if (overdue <= 0) return 'current';
  if (overdue <= 30) return 'days1to30';
  if (overdue <= 60) return 'days31to60';
  if (overdue <= 90) return 'days61to90';
  return 'over90';
}
```

- [ ] **Step 4: Create the node types**

`examples/invoicing/shared/src/assistant-ui.ts`:

```ts
/**
 * The tree the assistant composes and hands to `render`. It is deliberately
 * not recursive: prose may contain leaf components, leaves contain nothing.
 * B4 derives the tool's argument schema from these types.
 */
export interface LedgerTableNode {
  readonly LedgerTable: {
    readonly props: {
      /** Short table title. */
      readonly title: string;
      /** Invoice or payment IDs returned by a tool, 1 to 50. */
      readonly recordIds: readonly string[];
    };
  };
}
export interface TrendChartNode {
  readonly TrendChart: {
    readonly props: {
      /** ISO currency code present in the ledger. */
      readonly currency: string;
      /** A customer ID, or null for all customers. */
      readonly customerId: string | null;
      /** Months of history to chart, 3 to 24. */
      readonly months: number;
    };
  };
}
export interface AgingSummaryNode {
  readonly AgingSummary: {
    readonly props: {
      /** ISO currency code present in the ledger. */
      readonly currency: string;
      /** A customer ID, or null for all customers. */
      readonly customerId: string | null;
    };
  };
}
export interface CustomerCardNode {
  readonly CustomerCard: {
    readonly props: {
      /** A customer ID returned by a tool. */
      readonly customerId: string;
    };
  };
}
export interface ReviewPaymentNode {
  readonly ReviewPayment: {
    readonly props: {
      /** An existing unapplied payment ID. */
      readonly paymentId: string;
    };
  };
}
export type AssistantLeafNode =
  | LedgerTableNode
  | TrendChartNode
  | AgingSummaryNode
  | CustomerCardNode
  | ReviewPaymentNode;
export interface AssistantTextNode {
  readonly AssistantText: {
    readonly props: {
      /** Plain prose. No Markdown. */
      readonly text: string;
    };
    /** Components to show under the prose. */
    readonly children?: readonly AssistantLeafNode[];
  };
}
export type AssistantUiNode = AssistantTextNode | AssistantLeafNode;
```

- [ ] **Step 5: Rewrite the assistant contract**

`examples/invoicing/shared/src/assistant-contract.ts`:

```ts
import { s, ɵcreateUiKit } from '@hashbrownai/core';

const nullableCustomerId = () =>
  s.anyOf([s.string('A customer ID'), s.nullish()]);

/** Plain prose that may carry other kit components under it. */
export const assistantTextConfig = {
  name: 'AssistantText',
  description:
    'A plain text answer grounded in the ledger. Put components that support the answer in its children.',
  props: { text: s.string('Answer text, no Markdown') },
} as const;

/** A grid of specific invoices or payments the model chose, by ID. */
export const ledgerTableConfig = {
  name: 'LedgerTable',
  description:
    'A table of specific invoices or payments the user asked about. Pass only IDs returned by tools.',
  children: false,
  props: {
    title: s.string('Short table title'),
    recordIds: s.array(
      'Invoice or payment IDs, 1 to 50',
      s.string('An invoice or payment ID'),
    ),
  },
} as const;

/** Monthly invoiced versus received, computed on the client from the snapshot. */
export const trendChartConfig = {
  name: 'TrendChart',
  description:
    'Monthly invoiced versus received for one currency, optionally one customer.',
  children: false,
  props: {
    currency: s.string('ISO currency code present in the ledger'),
    customerId: nullableCustomerId(),
    months: s.integer('Months of history to chart, 3 to 24'),
  },
} as const;

/** Open balance by aging bucket, computed on the client from the snapshot. */
export const agingSummaryConfig = {
  name: 'AgingSummary',
  description:
    'Outstanding balance in aging buckets (current, 1-30, 31-60, 61-90, over 90 days past terms) for one currency, optionally one customer.',
  children: false,
  props: {
    currency: s.string('ISO currency code present in the ledger'),
    customerId: nullableCustomerId(),
  },
} as const;

/** One client's profile and balances. */
export const customerCardConfig = {
  name: 'CustomerCard',
  description: 'One client: name, currency, payment habit, open items.',
  children: false,
  props: { customerId: s.string('A customer ID returned by a tool') },
} as const;

/** An explicit user action that opens a separately authorized payment review. */
export const reviewPaymentConfig = {
  name: 'ReviewPayment',
  description: 'Offer to review one existing unapplied payment.',
  children: false,
  props: { paymentId: s.string('The exact existing payment ID') },
} as const;

/** The component implementations a kit is built over, keyed by kit name. */
export interface AssistantKitComponents<T> {
  readonly AssistantText: T;
  readonly LedgerTable: T;
  readonly TrendChart: T;
  readonly AgingSummary: T;
  readonly CustomerCard: T;
  readonly ReviewPayment: T;
}

/**
 * Build the kit the same way on every side. The server passes placeholder
 * objects, React passes components; both get identical descriptors, and the
 * leaf descriptors are the same objects at the top level and under
 * AssistantText, which is what keeps the two JSON schemas equal.
 */
export function createAssistantKit<T>(components: AssistantKitComponents<T>) {
  const leaves = [
    { ...ledgerTableConfig, component: components.LedgerTable },
    { ...trendChartConfig, component: components.TrendChart },
    { ...agingSummaryConfig, component: components.AgingSummary },
    { ...customerCardConfig, component: components.CustomerCard },
    { ...reviewPaymentConfig, component: components.ReviewPayment },
  ] as const;
  const text = {
    ...assistantTextConfig,
    component: components.AssistantText,
    children: [...leaves],
  };
  return [text, ...leaves];
}

/** Canonical JSON response schema accepted by the invoicing server and React UI. */
export const assistantResponseSchema: Record<string, unknown> = s.toJsonSchema(
  ɵcreateUiKit({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    components: createAssistantKit<any>({
      AssistantText: {},
      LedgerTable: {},
      TrendChart: {},
      AgingSummary: {},
      CustomerCard: {},
      ReviewPayment: {},
    }),
  }).schema,
);
```

If `ɵcreateUiKit` rejects the descriptor type, widen `createAssistantKit`'s return with an explicit cast to the descriptor type Hashbrown exports (`ExposedComponentDescriptor[]` under `ɵtypes` or the type of `ɵcreateUiKit`'s `components` option); prefer one cast at the return over `any` at every call site, and report what you used.

- [ ] **Step 6: Export from the index and move the server's aging rule**

In `examples/invoicing/shared/src/index.ts`, replace the `assistant-contract` export block with:

```ts
export {
  assistantTextConfig,
  ledgerTableConfig,
  trendChartConfig,
  agingSummaryConfig,
  customerCardConfig,
  reviewPaymentConfig,
  createAssistantKit,
  assistantResponseSchema,
  type AssistantKitComponents,
} from './assistant-contract';
export {
  AGING_BUCKETS,
  agingBucket,
  daysBetween,
  TERMS_DAYS,
  type AgingBuckets,
} from './aging';
export type {
  AssistantUiNode,
  AssistantTextNode,
  AssistantLeafNode,
  LedgerTableNode,
  TrendChartNode,
  AgingSummaryNode,
  CustomerCardNode,
  ReviewPaymentNode,
} from './assistant-ui';
```

In `examples/invoicing/server/src/generator/facts.ts`: delete the local `TERMS_DAYS`, `AgingBuckets`, and `agingBucket` definitions; import `agingBucket`, `TERMS_DAYS`, and `type AgingBuckets` from `@invoicing/contracts`; and add `export { agingBucket, TERMS_DAYS } from '@invoicing/contracts'; export type { AgingBuckets } from '@invoicing/contracts';` so `facts.spec.ts` keeps importing `agingBucket` from `./facts`. Delete the now-unused `daysBetween` import from `./dates` only if `facts.ts` no longer uses it (it still does for lags; keep it).

- [ ] **Step 7: Run shared and server tests**

```bash
npx nx run-many -t build,test -p invoicing-contracts invoicing-server
```

Expected: contract spec 3 passed; server suite still 153 passed. If the schema parity test fails, the two kits are not structurally identical; the usual cause is a leaf descriptor object that differs between the top level and the `children` list.

- [ ] **Step 8: Commit**

```bash
npx prettier --write examples/invoicing/shared/src examples/invoicing/server/src/generator/facts.ts
git add examples/invoicing/shared/src examples/invoicing/server/src/generator/facts.ts
git commit -m "feat(invoicing): define the assistant kit contracts and a shared kit builder

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Money formatting and the six query functions

**Files:**
- Create: `examples/invoicing/server/src/money.ts`
- Create: `examples/invoicing/server/src/assistant-queries.ts`
- Create: `examples/invoicing/server/src/assistant-queries.spec.ts`

- [ ] **Step 1: Write the failing tests**

`examples/invoicing/server/src/assistant-queries.spec.ts`:

```ts
import { expect, test } from 'vitest';
import { getSnapshot } from './ledger';
import { createSampleLedger, sampleScenarios } from './sample-ledger';
import {
  aging,
  customerStatement,
  findRecords,
  ledgerSummary,
  monthlyTotals,
  unappliedPayments,
} from './assistant-queries';

const snapshot = getSnapshot(createSampleLedger());
/** Roughly 3K tokens; the whole point of query-shaped tools. */
const BUDGET = 12000;
const size = (value: unknown) => JSON.stringify(value).length;

test('ledgerSummary is small and names every customer and currency', () => {
  const result = ledgerSummary(snapshot);

  expect(result.asOf).toBe('2026-09-15');
  expect(result.currencies.map((c) => c.currency)).toEqual(['EUR', 'GBP', 'USD']);
  expect(result.customers).toHaveLength(12);
  expect(result.customers[0]).toMatchObject({ id: 'northstar', profile: 'on-time' });
  const usd = result.currencies.find((c) => c.currency === 'USD');
  expect(usd?.unappliedCents).toBe(1390000);
  expect(usd?.unapplied).toBe('$13,900.00');
  expect(usd?.unappliedPayments).toBe(5);
  expect(size(result)).toBeLessThan(BUDGET);
});

test('monthlyTotals returns the last N months for a currency, optionally one customer', () => {
  const all = monthlyTotals(snapshot, { currency: 'EUR' });
  const one = monthlyTotals(snapshot, { currency: 'EUR', customerId: 'lumen', months: 3 });

  expect(all.rows).toHaveLength(12);
  expect(all.rows.at(-1)?.month).toBe('2026-09');
  expect(all.rows[0].month).toBe('2025-10');
  expect(one.rows).toHaveLength(3);
  expect(one.rows.every((r) => r.invoicedCents > 0)).toBe(true);
  expect(one.rows[0]).toHaveProperty('invoiced');
  expect(monthlyTotals(snapshot, { currency: 'GBP', months: 99 }).rows).toHaveLength(24);
  expect(size(all)).toBeLessThan(BUDGET);
});

test('aging buckets reconcile with open balances and list invoice ids', () => {
  const gbp = aging(snapshot, { currency: 'GBP' });
  const thistle = aging(snapshot, { currency: 'GBP', customerId: 'thistle' });

  const open = snapshot.invoices.filter(
    (i) => i.currency === 'GBP' && i.outstandingCents > 0,
  );
  expect(gbp.buckets.reduce((sum, b) => sum + b.cents, 0)).toBe(
    open.reduce((sum, i) => sum + i.outstandingCents, 0),
  );
  expect(gbp.buckets.flatMap((b) => b.invoiceIds).sort()).toEqual(
    open.map((i) => i.id).sort(),
  );
  expect(gbp.buckets.map((b) => b.bucket)).toEqual([
    'current',
    'days1to30',
    'days31to60',
    'days61to90',
    'over90',
  ]);
  expect(thistle.buckets.every((b) => b.invoiceIds.every((id) => id.includes('thistle')))).toBe(true);
  expect(size(gbp)).toBeLessThan(BUDGET);
});

test('customerStatement reports habit and open items for one client', () => {
  const cedar = customerStatement(snapshot, { customerId: 'cedar' });
  const granite = customerStatement(snapshot, { customerId: 'granite' });

  expect(cedar.customer).toMatchObject({ id: 'cedar', currency: 'USD', profile: 'on-time' });
  expect(cedar.openInvoices.map((i) => i.id)).toEqual([sampleScenarios.partial.invoiceId]);
  expect(cedar.unappliedPayments.map((p) => p.id)).toEqual([sampleScenarios.partial.paymentId]);
  expect(cedar.averageDaysToPay).toBeGreaterThanOrEqual(5);
  expect(cedar.averageDaysToPay).toBeLessThanOrEqual(12);
  expect(granite.openInvoices.length).toBeGreaterThanOrEqual(24);
  expect(granite.openInvoices.length).toBeLessThanOrEqual(50);
  expect(granite.openInvoicesTruncated).toBe(granite.openInvoices.length < granite.openInvoiceCount);
  expect(() => customerStatement(snapshot, { customerId: 'nobody' })).toThrow('customer_not_found');
  expect(size(granite)).toBeLessThan(BUDGET);
});

test('findRecords filters, caps, and reports the total', () => {
  const open = findRecords(snapshot, { kind: 'invoice', status: 'open', currency: 'USD' });
  const text = findRecords(snapshot, { text: 'workshop' });
  const capped = findRecords(snapshot, { kind: 'payment', limit: 500 });
  const dated = findRecords(snapshot, { from: '2026-09-01', to: '2026-09-15', kind: 'payment' });

  expect(open.records.every((r) => r.kind === 'invoice' && r.balanceCents > 0)).toBe(true);
  expect(open.total).toBeGreaterThan(open.records.length);
  expect(open.records).toHaveLength(20);
  expect(text.records.map((r) => r.id).sort()).toEqual(
    [...sampleScenarios.ambiguous.invoiceIds, sampleScenarios.ambiguous.paymentId].sort(),
  );
  expect(capped.records).toHaveLength(50);
  expect(capped.total).toBe(snapshot.payments.length);
  expect(dated.records.every((r) => r.date >= '2026-09-01' && r.date <= '2026-09-15')).toBe(true);
  expect(dated.records[0].date >= dated.records.at(-1)!.date).toBe(true);
  expect(size(capped)).toBeLessThan(BUDGET);
});

test('unappliedPayments lists candidates per payment', () => {
  const all = unappliedPayments(snapshot, {});
  const eur = unappliedPayments(snapshot, { currency: 'EUR' });

  expect(all.payments.map((p) => p.id).sort()).toEqual(
    [
      sampleScenarios.exact.paymentId,
      sampleScenarios.partial.paymentId,
      sampleScenarios.combined.paymentId,
      sampleScenarios.ambiguous.paymentId,
      sampleScenarios.advance.paymentId,
    ].sort(),
  );
  const atlas = all.payments.find((p) => p.id === sampleScenarios.ambiguous.paymentId);
  expect(atlas?.candidates.map((c) => c.invoiceId).sort()).toEqual(
    [...sampleScenarios.ambiguous.invoiceIds].sort(),
  );
  expect(all.payments.find((p) => p.id === sampleScenarios.advance.paymentId)?.candidates).toEqual([]);
  expect(all.totals).toEqual([{ currency: 'USD', unappliedCents: 1390000, unapplied: '$13,900.00' }]);
  expect(eur.payments).toEqual([]);
  expect(size(all)).toBeLessThan(BUDGET);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/assistant-queries.spec.ts`
Expected: FAIL, cannot find module `./assistant-queries`.

- [ ] **Step 3: Create the money helper**

`examples/invoicing/server/src/money.ts`:

```ts
/** Format integer cents as a currency string the model can quote verbatim. */
export function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amountCents / 100,
  );
}
```

- [ ] **Step 4: Implement the queries**

`examples/invoicing/server/src/assistant-queries.ts`:

```ts
import {
  AGING_BUCKETS,
  agingBucket,
  type AgingBuckets,
  type LedgerSnapshot,
  type PaymentProfile,
} from '@invoicing/contracts';
import { AS_OF } from './generator/clients';
import { deriveFacts } from './generator/facts';
import { formatMoney } from './money';

/** Row caps keep one tool result near 3K tokens. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const DEFAULT_MONTHS = 12;
const MAX_MONTHS = 24;

type Snapshot = LedgerSnapshot;
type Invoice = Snapshot['invoices'][number];
type Payment = Snapshot['payments'][number];

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);
const byDateDesc = <T extends { readonly date?: string }>(a: T, b: T) =>
  (b.date ?? '').localeCompare(a.date ?? '');

function requireCustomer(snapshot: Snapshot, customerId: string) {
  const customer = snapshot.customers.find((c) => c.id === customerId);
  if (!customer) throw new Error('customer_not_found');
  return customer;
}

function requireCurrency(snapshot: Snapshot, currency: string) {
  if (!snapshot.customers.some((c) => c.currency === currency))
    throw new Error('currency_not_found');
  return currency;
}

const invoiceRow = (i: Invoice) => ({
  id: i.id,
  reference: i.reference ?? i.id,
  date: i.date ?? '',
  amountCents: i.amountCents,
  amount: formatMoney(i.amountCents, i.currency),
  outstandingCents: i.outstandingCents,
  outstanding: formatMoney(i.outstandingCents, i.currency),
});

const paymentRow = (p: Payment) => ({
  id: p.id,
  reference: p.reference ?? p.id,
  date: p.date ?? '',
  amountCents: p.amountCents,
  amount: formatMoney(p.amountCents, p.currency),
  unappliedCents: p.unappliedCents,
  unapplied: formatMoney(p.unappliedCents, p.currency),
});

/** Start here: per-currency totals and the customer list. */
export function ledgerSummary(snapshot: Snapshot) {
  const currencies = [...new Set(snapshot.customers.map((c) => c.currency))]
    .sort()
    .map((currency) => {
      const invoices = snapshot.invoices.filter((i) => i.currency === currency);
      const payments = snapshot.payments.filter((p) => p.currency === currency);
      const invoicedCents = sum(invoices.map((i) => i.amountCents));
      const receivedCents = sum(payments.map((p) => p.amountCents));
      const openCents = sum(invoices.map((i) => i.outstandingCents));
      const unappliedCents = sum(payments.map((p) => p.unappliedCents));
      return {
        currency,
        invoicedCents,
        invoiced: formatMoney(invoicedCents, currency),
        receivedCents,
        received: formatMoney(receivedCents, currency),
        openCents,
        open: formatMoney(openCents, currency),
        unappliedCents,
        unapplied: formatMoney(unappliedCents, currency),
        openInvoices: invoices.filter((i) => i.outstandingCents > 0).length,
        unappliedPayments: payments.filter((p) => p.unappliedCents > 0).length,
      };
    });
  return {
    asOf: AS_OF,
    currencies,
    customers: snapshot.customers.map(({ id, name, currency, profile }) => ({
      id,
      name,
      currency,
      profile,
    })),
  };
}

/** Invoiced versus received per month for one currency, optionally one customer. */
export function monthlyTotals(
  snapshot: Snapshot,
  input: { readonly currency: string; readonly customerId?: string; readonly months?: number },
) {
  const currency = requireCurrency(snapshot, input.currency);
  if (input.customerId) requireCustomer(snapshot, input.customerId);
  const months = Math.min(
    MAX_MONTHS,
    Math.max(1, Math.floor(input.months ?? DEFAULT_MONTHS)),
  );
  const own = <T extends Invoice | Payment>(records: readonly T[]) =>
    records.filter(
      (r) =>
        r.currency === currency &&
        (!input.customerId || r.customerId === input.customerId),
    );
  const invoices = own(snapshot.invoices);
  const payments = own(snapshot.payments);
  const allMonths = [
    ...new Set(
      [...invoices, ...payments].flatMap((r) =>
        r.date ? [r.date.slice(0, 7)] : [],
      ),
    ),
  ].sort();
  const rows = allMonths.slice(-months).map((month) => {
    const invoicedCents = sum(
      invoices.filter((i) => i.date?.startsWith(month)).map((i) => i.amountCents),
    );
    const receivedCents = sum(
      payments.filter((p) => p.date?.startsWith(month)).map((p) => p.amountCents),
    );
    return {
      month,
      invoicedCents,
      invoiced: formatMoney(invoicedCents, currency),
      receivedCents,
      received: formatMoney(receivedCents, currency),
    };
  });
  return { currency, customerId: input.customerId ?? null, rows };
}

/** Open balance by aging bucket, with the invoice IDs in each. */
export function aging(
  snapshot: Snapshot,
  input: { readonly currency: string; readonly customerId?: string },
) {
  const currency = requireCurrency(snapshot, input.currency);
  if (input.customerId) requireCustomer(snapshot, input.customerId);
  const open = snapshot.invoices.filter(
    (i) =>
      i.currency === currency &&
      i.outstandingCents > 0 &&
      (!input.customerId || i.customerId === input.customerId),
  );
  const cents: Record<keyof AgingBuckets, number> = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  };
  const ids: Record<keyof AgingBuckets, string[]> = {
    current: [],
    days1to30: [],
    days31to60: [],
    days61to90: [],
    over90: [],
  };
  for (const invoice of open) {
    const bucket = invoice.date ? agingBucket(invoice.date, AS_OF) : 'current';
    cents[bucket] += invoice.outstandingCents;
    ids[bucket].push(invoice.id);
  }
  return {
    currency,
    customerId: input.customerId ?? null,
    asOf: AS_OF,
    buckets: AGING_BUCKETS.map((bucket) => ({
      bucket,
      cents: cents[bucket],
      formatted: formatMoney(cents[bucket], currency),
      invoiceIds: ids[bucket],
    })),
  };
}

/** One client's habit, balances, and open items (capped). */
export function customerStatement(
  snapshot: Snapshot,
  input: { readonly customerId: string },
) {
  const customer = requireCustomer(snapshot, input.customerId);
  const facts = deriveFacts(snapshot).customers.find(
    (c) => c.customerId === customer.id,
  );
  if (!facts) throw new Error('customer_not_found');
  const openInvoices = snapshot.invoices
    .filter((i) => i.customerId === customer.id && i.outstandingCents > 0)
    .sort(byDateDesc);
  const unapplied = snapshot.payments
    .filter((p) => p.customerId === customer.id && p.unappliedCents > 0)
    .sort(byDateDesc);
  const lastPayment = [...snapshot.payments]
    .filter((p) => p.customerId === customer.id)
    .sort(byDateDesc)[0];
  return {
    customer: {
      id: customer.id,
      name: customer.name,
      currency: customer.currency,
      profile: customer.profile as PaymentProfile,
    },
    invoicedCents: facts.invoicedCents,
    invoiced: formatMoney(facts.invoicedCents, customer.currency),
    receivedCents: facts.receivedCents,
    received: formatMoney(facts.receivedCents, customer.currency),
    openCents: facts.openCents,
    open: formatMoney(facts.openCents, customer.currency),
    unappliedCents: facts.unappliedCents,
    unapplied: formatMoney(facts.unappliedCents, customer.currency),
    averageDaysToPay: facts.averageDaysToPay ?? null,
    latePaymentRate: facts.latePaymentRate ?? null,
    lastPaymentDate: lastPayment?.date ?? null,
    openInvoiceCount: openInvoices.length,
    openInvoicesTruncated: openInvoices.length > MAX_LIMIT,
    openInvoices: openInvoices.slice(0, MAX_LIMIT).map(invoiceRow),
    unappliedPayments: unapplied.map(paymentRow),
  };
}

/** Search invoices and payments; returns IDs the model can pass to LedgerTable. */
export function findRecords(
  snapshot: Snapshot,
  input: {
    readonly kind?: 'invoice' | 'payment';
    readonly customerId?: string;
    readonly currency?: string;
    readonly status?: 'open' | 'settled';
    readonly text?: string;
    readonly from?: string;
    readonly to?: string;
    readonly limit?: number;
  },
) {
  if (input.customerId) requireCustomer(snapshot, input.customerId);
  if (input.currency) requireCurrency(snapshot, input.currency);
  const needle = input.text?.trim().toLowerCase();
  const matches = <T extends Invoice | Payment>(r: T, balance: number) =>
    (!input.customerId || r.customerId === input.customerId) &&
    (!input.currency || r.currency === input.currency) &&
    (!input.status || (input.status === 'open' ? balance > 0 : balance === 0)) &&
    (!input.from || (r.date ?? '') >= input.from) &&
    (!input.to || (r.date ?? '') <= input.to) &&
    (!needle ||
      [r.reference, r.description, r.customerName, r.id].some((field) =>
        field?.toLowerCase().includes(needle),
      ));
  const invoices =
    input.kind === 'payment'
      ? []
      : snapshot.invoices
          .filter((i) => matches(i, i.outstandingCents))
          .map((i) => ({
            kind: 'invoice' as const,
            id: i.id,
            customerId: i.customerId,
            customerName: i.customerName ?? i.customerId,
            reference: i.reference ?? i.id,
            date: i.date ?? '',
            amountCents: i.amountCents,
            amount: formatMoney(i.amountCents, i.currency),
            balanceCents: i.outstandingCents,
            balance: formatMoney(i.outstandingCents, i.currency),
            description: i.description ?? '',
          }));
  const payments =
    input.kind === 'invoice'
      ? []
      : snapshot.payments
          .filter((p) => matches(p, p.unappliedCents))
          .map((p) => ({
            kind: 'payment' as const,
            id: p.id,
            customerId: p.customerId,
            customerName: p.customerName ?? p.customerId,
            reference: p.reference ?? p.id,
            date: p.date ?? '',
            amountCents: p.amountCents,
            amount: formatMoney(p.amountCents, p.currency),
            balanceCents: p.unappliedCents,
            balance: formatMoney(p.unappliedCents, p.currency),
            description: p.description ?? '',
          }));
  const all = [...invoices, ...payments].sort(byDateDesc);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)),
  );
  return { total: all.length, records: all.slice(0, limit) };
}

/** The cash-application inbox: every unapplied payment with its candidate invoices. */
export function unappliedPayments(
  snapshot: Snapshot,
  input: { readonly currency?: string },
) {
  if (input.currency) requireCurrency(snapshot, input.currency);
  const payments = snapshot.payments
    .filter(
      (p) =>
        p.unappliedCents > 0 && (!input.currency || p.currency === input.currency),
    )
    .sort(byDateDesc)
    .map((p) => ({
      ...paymentRow(p),
      customerId: p.customerId,
      customerName: p.customerName ?? p.customerId,
      currency: p.currency,
      candidates: snapshot.invoices
        .filter(
          (i) =>
            i.customerId === p.customerId &&
            i.currency === p.currency &&
            i.outstandingCents > 0,
        )
        .map((i) => ({
          invoiceId: i.id,
          reference: i.reference ?? i.id,
          outstandingCents: i.outstandingCents,
          outstanding: formatMoney(i.outstandingCents, i.currency),
        })),
    }));
  const totals = [...new Set(payments.map((p) => p.currency))].sort().map(
    (currency) => {
      const unappliedCents = sum(
        payments.filter((p) => p.currency === currency).map((p) => p.unappliedCents),
      );
      return { currency, unappliedCents, unapplied: formatMoney(unappliedCents, currency) };
    },
  );
  return { payments, totals };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/assistant-queries.spec.ts`
Expected: 6 passed. If a size budget fails, report the measured size and which tool; do not raise the budget without saying so.

- [ ] **Step 6: Lint, format, commit**

```bash
npx eslint examples/invoicing/server/src/assistant-queries.ts examples/invoicing/server/src/assistant-queries.spec.ts examples/invoicing/server/src/money.ts
npx prettier --write examples/invoicing/server/src/assistant-queries.ts examples/invoicing/server/src/assistant-queries.spec.ts examples/invoicing/server/src/money.ts
git add examples/invoicing/server/src/assistant-queries.ts examples/invoicing/server/src/assistant-queries.spec.ts examples/invoicing/server/src/money.ts
git commit -m "feat(invoicing): add query-shaped ledger reads for the assistant

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: UI validation and the render pipeline

**Files:**
- Create: `examples/invoicing/server/src/assistant-ui.ts`
- Create: `examples/invoicing/server/src/assistant-ui.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from 'vitest';
import type { AssistantTextNode, AssistantUiNode } from '@invoicing/contracts';
import { getSnapshot } from './ledger';
import { createSampleLedger, sampleScenarios } from './sample-ledger';
import { renderUi, validateUi } from './assistant-ui';

const snapshot = getSnapshot(createSampleLedger());
const text = (t: string, children?: AssistantUiNode[]) =>
  ({ AssistantText: { props: { text: t }, ...(children ? { children } : {}) } }) as AssistantUiNode;

test('a valid tree is normalized: children always present on text, null customer kept', () => {
  const ui: AssistantUiNode[] = [
    text('Atlas has two open invoices.', [
      { LedgerTable: { props: { title: 'Open', recordIds: [...sampleScenarios.ambiguous.invoiceIds] } } },
      { TrendChart: { props: { currency: 'USD', customerId: null, months: 6 } } },
      { AgingSummary: { props: { currency: 'GBP', customerId: 'thistle' } } },
      { CustomerCard: { props: { customerId: 'atlas' } } },
      { ReviewPayment: { props: { paymentId: sampleScenarios.ambiguous.paymentId } } },
    ]),
    text('Nothing else.'),
  ];

  const normalized = validateUi(snapshot, ui);

  expect(normalized).toEqual({
    ui: [
      {
        AssistantText: {
          props: { text: 'Atlas has two open invoices.' },
          children: (ui[0] as AssistantTextNode).AssistantText.children,
        },
      },
      { AssistantText: { props: { text: 'Nothing else.' }, children: [] } },
    ],
  });
});

test.each([
  [[], 'invalid_ui: empty'],
  [[{ Bogus: { props: {} } }], 'invalid_ui: unknown component Bogus'],
  [[text('')], 'invalid_ui: AssistantText.text is empty'],
  [[text('x', [text('nested')])], 'invalid_ui: AssistantText cannot contain AssistantText'],
  [[{ LedgerTable: { props: { title: 't', recordIds: [] } } }], 'invalid_ui: LedgerTable.recordIds must have 1 to 50 ids'],
  [[{ LedgerTable: { props: { title: 't', recordIds: ['nope'] } } }], 'invalid_ui: unknown record nope'],
  [[{ LedgerTable: { props: { title: 't', recordIds: ['invoice-cedar-partial', 'invoice-cedar-partial'] } } }], 'invalid_ui: duplicate record invoice-cedar-partial'],
  [[{ TrendChart: { props: { currency: 'JPY', customerId: null, months: 6 } } }], 'invalid_ui: unknown currency JPY'],
  [[{ TrendChart: { props: { currency: 'USD', customerId: 'nobody', months: 6 } } }], 'invalid_ui: unknown customer nobody'],
  [[{ TrendChart: { props: { currency: 'USD', customerId: null, months: 2 } } }], 'invalid_ui: TrendChart.months must be 3 to 24'],
  [[{ AgingSummary: { props: { currency: 'USD', customerId: 'lumen' } } }], 'invalid_ui: customer lumen is not billed in USD'],
  [[{ CustomerCard: { props: { customerId: 'nobody' } } }], 'invalid_ui: unknown customer nobody'],
  [[{ ReviewPayment: { props: { paymentId: 'payment-northstar-2024-10' } } }], 'invalid_ui: payment payment-northstar-2024-10 has no unapplied balance'],
  [[{ ReviewPayment: { props: { paymentId: 'nope' } } }], 'invalid_ui: unknown payment nope'],
] as [unknown[], string][])('rejects %j', (ui, message) => {
  expect(() => validateUi(snapshot, ui as AssistantUiNode[])).toThrow(message);
});

test('rejects more than 20 nodes', () => {
  const ui = Array.from({ length: 21 }, (_, i) => text(`line ${i}`));

  expect(() => validateUi(snapshot, ui)).toThrow('invalid_ui: too many components');
});

test('renderUi streams the normalized tree through the echo and retries once on drift', async () => {
  const ui: AssistantUiNode[] = [text('Hello')];
  const expected = validateUi(snapshot, ui);
  const calls: unknown[] = [];
  let first = true;
  const echo = async (schema: unknown, tree: unknown) => {
    calls.push(schema);
    if (first) {
      first = false;
      return { ui: [] };
    }
    return tree;
  };

  await expect(renderUi(expected, { schema: 's' }, echo)).resolves.toEqual({ rendered: true });
  expect(calls).toEqual([{ schema: 's' }, { schema: 's' }]);
  await expect(
    renderUi(expected, { schema: 's' }, async () => ({ ui: [] })),
  ).rejects.toThrow('invalid_assistant_ui');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/assistant-ui.spec.ts`
Expected: FAIL, cannot find module `./assistant-ui`.

- [ ] **Step 3: Implement**

`examples/invoicing/server/src/assistant-ui.ts`:

```ts
import { isDeepStrictEqual } from 'node:util';
import type {
  AssistantLeafNode,
  AssistantUiNode,
  LedgerSnapshot,
} from '@invoicing/contracts';

const MAX_NODES = 20;
const MAX_TABLE_ROWS = 50;

/** The canonical tree: what the echo must reproduce byte for byte. */
export interface CanonicalUi {
  readonly ui: readonly AssistantUiNode[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (detail: string): never => {
  throw new Error(`invalid_ui: ${detail}`);
};

/**
 * Check a composed tree against the kit and this session's snapshot and
 * return it in canonical form. Every ID must resolve; text nodes always carry
 * a `children` array; nullable customers keep an explicit null. Throws
 * `invalid_ui: <detail>` naming the offending value so the model can fix it.
 */
export function validateUi(
  snapshot: LedgerSnapshot,
  ui: readonly AssistantUiNode[],
): CanonicalUi {
  if (!Array.isArray(ui) || ui.length === 0) fail('empty');
  const customers = new Map(snapshot.customers.map((c) => [c.id, c]));
  const currencies = new Set(snapshot.customers.map((c) => c.currency));
  const invoices = new Set(snapshot.invoices.map((i) => i.id));
  const payments = new Map(snapshot.payments.map((p) => [p.id, p]));
  let count = 0;
  const tick = () => {
    count += 1;
    if (count > MAX_NODES) fail('too many components');
  };
  const requireCurrency = (currency: unknown) => {
    if (typeof currency !== 'string' || !currencies.has(currency))
      fail(`unknown currency ${String(currency)}`);
    return currency as string;
  };
  const requireCustomer = (customerId: unknown, currency?: string) => {
    if (typeof customerId !== 'string' || !customers.has(customerId))
      fail(`unknown customer ${String(customerId)}`);
    const customer = customers.get(customerId as string);
    if (currency && customer && customer.currency !== currency)
      fail(`customer ${customerId} is not billed in ${currency}`);
    return customerId as string;
  };
  const nullableCustomer = (customerId: unknown, currency: string) =>
    customerId === null || customerId === undefined
      ? null
      : requireCustomer(customerId, currency);

  const leaf = (node: unknown): AssistantLeafNode => {
    tick();
    if (!record(node) || Object.keys(node).length !== 1)
      fail('each node must have exactly one component key');
    const [name] = Object.keys(node as object);
    const body = (node as Record<string, unknown>)[name];
    const props = record(body) && record(body.props) ? body.props : fail(`${name} has no props`);
    switch (name) {
      case 'LedgerTable': {
        const ids = props.recordIds;
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_TABLE_ROWS)
          fail(`LedgerTable.recordIds must have 1 to ${MAX_TABLE_ROWS} ids`);
        const seen = new Set<string>();
        for (const id of ids as unknown[]) {
          if (typeof id !== 'string' || (!invoices.has(id) && !payments.has(id)))
            fail(`unknown record ${String(id)}`);
          if (seen.has(id)) fail(`duplicate record ${id}`);
          seen.add(id);
        }
        if (typeof props.title !== 'string' || !props.title.trim())
          fail('LedgerTable.title is empty');
        return { LedgerTable: { props: { title: props.title, recordIds: [...seen] } } };
      }
      case 'TrendChart': {
        const currency = requireCurrency(props.currency);
        const months = props.months;
        if (typeof months !== 'number' || !Number.isInteger(months) || months < 3 || months > 24)
          fail('TrendChart.months must be 3 to 24');
        return {
          TrendChart: {
            props: { currency, customerId: nullableCustomer(props.customerId, currency), months },
          },
        };
      }
      case 'AgingSummary': {
        const currency = requireCurrency(props.currency);
        return {
          AgingSummary: {
            props: { currency, customerId: nullableCustomer(props.customerId, currency) },
          },
        };
      }
      case 'CustomerCard':
        return { CustomerCard: { props: { customerId: requireCustomer(props.customerId) } } };
      case 'ReviewPayment': {
        const id = props.paymentId;
        if (typeof id !== 'string' || !payments.has(id)) fail(`unknown payment ${String(id)}`);
        if ((payments.get(id as string)?.unappliedCents ?? 0) <= 0)
          fail(`payment ${id} has no unapplied balance`);
        return { ReviewPayment: { props: { paymentId: id as string } } };
      }
      case 'AssistantText':
        return fail('AssistantText cannot contain AssistantText');
      default:
        return fail(`unknown component ${name}`);
    }
  };

  const node = (value: unknown): AssistantUiNode => {
    if (record(value) && 'AssistantText' in value && Object.keys(value).length === 1) {
      tick();
      const body = value.AssistantText;
      const props = record(body) && record(body.props) ? body.props : fail('AssistantText has no props');
      if (typeof props.text !== 'string' || !props.text.trim())
        fail('AssistantText.text is empty');
      const children = record(body) && body.children !== undefined ? body.children : [];
      if (!Array.isArray(children)) fail('AssistantText.children must be an array');
      return {
        AssistantText: {
          props: { text: props.text },
          children: (children as unknown[]).map(leaf),
        },
      };
    }
    return leaf(value);
  };

  return { ui: ui.map(node) };
}

/**
 * Push an already-validated canonical tree to the client through the nested
 * structured-output echo. The echo must reproduce the tree exactly; one
 * retry covers a transient drift, a second miss is an error.
 */
export async function renderUi(
  tree: CanonicalUi,
  schema: unknown,
  echo: (schema: unknown, tree: CanonicalUi) => Promise<unknown>,
): Promise<{ rendered: true }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const output = await echo(schema, tree);
    if (isDeepStrictEqual(output, tree)) return { rendered: true };
  }
  throw new Error('invalid_assistant_ui');
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/assistant-ui.spec.ts`
Expected: all pass. If the first test's `toEqual` fails on `children` for leaves, the canonical leaf must not carry a `children` key at all (the kit schema gives leaves no `children`).

- [ ] **Step 5: Lint, format, commit**

```bash
npx eslint examples/invoicing/server/src/assistant-ui.ts examples/invoicing/server/src/assistant-ui.spec.ts
npx prettier --write examples/invoicing/server/src/assistant-ui.ts examples/invoicing/server/src/assistant-ui.spec.ts
git add examples/invoicing/server/src/assistant-ui.ts examples/invoicing/server/src/assistant-ui.spec.ts
git commit -m "feat(invoicing): validate composed assistant UI against the kit and the session snapshot

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Middleware context and tool guard

**Files:**
- Modify: `examples/invoicing/server/src/assistant-middleware.ts` (the `context` object)
- Modify: `examples/invoicing/server/src/assistant-middleware.spec.ts`
- Modify: `examples/invoicing/server/src/assistant-tools.ts`

- [ ] **Step 1: Update the middleware tests**

In `assistant-middleware.spec.ts`:

In the first test replace the `readLedger`/keys assertions with:

```ts
  expect((await result.context.unappliedPayments({})).payments).toHaveLength(1);
  expect(Object.keys(result.context).sort()).toEqual([
    'aging',
    'customerStatement',
    'findRecords',
    'ledgerSummary',
    'monthlyTotals',
    'responseSchema',
    'unappliedPayments',
    'validateUi',
  ]);
```

In the third test (`read capabilities expire on reset ...`) replace the `validatePayment` and `readLedger` assertions with:

```ts
  await expect(
    result.context.validateUi([
      { ReviewPayment: { props: { paymentId: 'unknown' } } },
    ]),
  ).rejects.toThrow('unknown payment unknown');
  await store.reset(session);

  await expect(result.context.ledgerSummary()).rejects.toThrow('stale_generation');
  await expect(
    result.context.validateUi([{ AssistantText: { props: { text: 'hi' } } }]),
  ).rejects.toThrow('stale_generation');
```

(`validateUi` on the context is async because it reads the current snapshot first.)

In the fourth test (`conversation totals ...`) replace the `readLedger` call and its assertions with:

```ts
  const rows = (await result.context.monthlyTotals({ currency: 'USD' })).rows;
  const summary = await result.context.ledgerSummary();

  expect(rows).toEqual([
    {
      month: '2026-01',
      invoicedCents: 25000,
      invoiced: '$250.00',
      receivedCents: 15000,
      received: '$150.00',
    },
  ]);
  expect(summary.currencies).toEqual([
    expect.objectContaining({
      currency: 'USD',
      invoicedCents: 25000,
      receivedCents: 15000,
      unappliedCents: 15000,
      openCents: 25000,
    }),
  ]);
```

That test's inline ledger has `customers: []`; change it to `customers: [{ id: 'c', name: 'C', currency: 'USD', profile: 'on-time' }]` so `USD` is a known currency.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/assistant-middleware.spec.ts`
Expected: FAIL on the missing context functions.

- [ ] **Step 3: Rewire the middleware context**

In `assistant-middleware.ts`, add imports:

```ts
import type { AssistantUiNode } from '@invoicing/contracts';
import {
  aging,
  customerStatement,
  findRecords,
  ledgerSummary,
  monthlyTotals,
  unappliedPayments,
} from './assistant-queries';
import { validateUi } from './assistant-ui';
```

Replace the whole `context: Object.freeze({ ... })` block (from `responseSchema:` through the end of `validatePayment`) with:

```ts
      context: Object.freeze({
        responseSchema: assistantResponseSchema,
        ledgerSummary: async () => ledgerSummary(await current()),
        monthlyTotals: async (input: Parameters<typeof monthlyTotals>[1]) =>
          monthlyTotals(await current(), input),
        aging: async (input: Parameters<typeof aging>[1]) =>
          aging(await current(), input),
        customerStatement: async (
          input: Parameters<typeof customerStatement>[1],
        ) => customerStatement(await current(), input),
        findRecords: async (input: Parameters<typeof findRecords>[1]) =>
          findRecords(await current(), input),
        unappliedPayments: async (
          input: Parameters<typeof unappliedPayments>[1],
        ) => unappliedPayments(await current(), input),
        validateUi: async (ui: readonly AssistantUiNode[]) =>
          validateUi(await current(), ui),
      }),
```

Delete the now-unused local `payments`/`invoices` computations only if they were inside the old `readLedger`; the `selectedPaymentId` validation before the return stays. Update the doc comment on `createAssistantMiddleware` to "Read-only query and UI-validation capabilities scoped to a cookie, thread and generation."

- [ ] **Step 4: Update the tool guard**

`assistant-tools.ts`:

```ts
import type { createAssistantMiddleware } from './assistant-middleware';

type AssistantTools = Extract<
  Awaited<ReturnType<ReturnType<typeof createAssistantMiddleware>>>,
  { action: 'continue' }
>['context'];

const FUNCTIONS = [
  'ledgerSummary',
  'monthlyTotals',
  'aging',
  'customerStatement',
  'findRecords',
  'unappliedPayments',
  'validateUi',
] as const;

/** Resolve the read-only server context for the conversational agent. */
export function assistantTools(context: unknown): AssistantTools {
  if (!context || typeof context !== 'object' || !('middleware' in context))
    throw new Error('invalid_context');
  const tools = context.middleware as Record<string, unknown> | undefined;
  if (
    !tools ||
    !tools.responseSchema ||
    FUNCTIONS.some((name) => typeof tools[name] !== 'function')
  )
    throw new Error('invalid_context');
  return tools as unknown as AssistantTools;
}
```

- [ ] **Step 5: Run the middleware suite and typecheck**

```bash
npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/assistant-middleware.spec.ts
npx nx run invoicing-server:build
```

Expected: 4 passed. The build will fail on `app/assistant/tools/readLedger.ts` and `respond.ts`, which still call the removed context functions; that is expected and is fixed in Task 5. If the build fails anywhere else, fix that here.

- [ ] **Step 6: Commit**

```bash
npx prettier --write examples/invoicing/server/src/assistant-middleware.ts examples/invoicing/server/src/assistant-middleware.spec.ts examples/invoicing/server/src/assistant-tools.ts
git add examples/invoicing/server/src/assistant-middleware.ts examples/invoicing/server/src/assistant-middleware.spec.ts examples/invoicing/server/src/assistant-tools.ts
git commit -m "refactor(invoicing): expose query and UI-validation capabilities from the assistant middleware

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Tool files, render, and the system prompt

**Files:**
- Delete: `examples/invoicing/server/src/app/assistant/tools/readLedger.ts`, `respond.ts`
- Create: `ledgerSummary.ts`, `monthlyTotals.ts`, `aging.ts`, `customerStatement.ts`, `findRecords.ts`, `unappliedPayments.ts`, `render.ts` in the same directory
- Modify: `examples/invoicing/server/src/app/assistant/index.ts`

B4 derives each tool's argument schema from the first parameter's type and its description from the JSDoc on the default export; property JSDoc becomes property descriptions. Write the JSDoc for the model, not for the reader.

- [ ] **Step 1: Delete the old tools**

```bash
git rm examples/invoicing/server/src/app/assistant/tools/readLedger.ts examples/invoicing/server/src/app/assistant/tools/respond.ts
```

- [ ] **Step 2: Create the six query tools**

`ledgerSummary.ts`:

```ts
import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** Per-currency totals, counts of open invoices and unapplied payments, and the customer list with each client's payment habit. Call this first when you do not know where to look. */
export default function ledgerSummary(
  _input: Record<string, never>,
  context: B4ToolContext,
) {
  return assistantTools(context).ledgerSummary();
}
```

`monthlyTotals.ts`:

```ts
import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** Invoiced versus received per month for one currency, optionally one customer. Use for trend or month-over-month questions. */
export default function monthlyTotals(
  input: {
    /** ISO currency code from ledgerSummary. */
    readonly currency: string;
    /** Restrict to one customer ID. */
    readonly customerId?: string;
    /** Months of history, default 12, max 24. */
    readonly months?: number;
  },
  context: B4ToolContext,
) {
  return assistantTools(context).monthlyTotals(input);
}
```

`aging.ts`:

```ts
import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** Outstanding invoices grouped into aging buckets past net-30 terms, with the invoice IDs in each bucket. Use for overdue, late, or collections questions. */
export default function aging(
  input: {
    /** ISO currency code from ledgerSummary. */
    readonly currency: string;
    /** Restrict to one customer ID. */
    readonly customerId?: string;
  },
  context: B4ToolContext,
) {
  return assistantTools(context).aging(input);
}
```

`customerStatement.ts`:

```ts
import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** One client's payment habit, totals, open invoices, and unapplied payments. Use for any question about a specific customer. */
export default function customerStatement(
  input: {
    /** Customer ID from ledgerSummary. */
    readonly customerId: string;
  },
  context: B4ToolContext,
) {
  return assistantTools(context).customerStatement(input);
}
```

`findRecords.ts`:

```ts
import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** Search invoices and payments by customer, currency, status, free text, or date range. Returns record IDs you can show in a LedgerTable. Newest first, capped at 50. */
export default function findRecords(
  input: {
    /** Only invoices or only payments; omit for both. */
    readonly kind?: 'invoice' | 'payment';
    /** Customer ID from ledgerSummary. */
    readonly customerId?: string;
    /** ISO currency code. */
    readonly currency?: string;
    /** open: outstanding or unapplied balance; settled: fully applied. */
    readonly status?: 'open' | 'settled';
    /** Case-insensitive match on reference, description, customer name, or ID. */
    readonly text?: string;
    /** Earliest date, YYYY-MM-DD. */
    readonly from?: string;
    /** Latest date, YYYY-MM-DD. */
    readonly to?: string;
    /** Rows to return, default 20, max 50. */
    readonly limit?: number;
  },
  context: B4ToolContext,
) {
  return assistantTools(context).findRecords(input);
}
```

`unappliedPayments.ts`:

```ts
import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** Every payment that still needs matching, with the open invoices it could apply to. Use for "what needs matching" questions and before offering ReviewPayment. */
export default function unappliedPayments(
  input: {
    /** Restrict to one ISO currency code. */
    readonly currency?: string;
  },
  context: B4ToolContext,
) {
  return assistantTools(context).unappliedPayments(input);
}
```

- [ ] **Step 3: Create the render tool**

`render.ts`:

```ts
import type { B4ToolContext } from '@b4run/sdk';
import { createChatModel } from '@b4run/langchain';
import type { AssistantUiNode } from '@invoicing/contracts';
import { assistantTools } from '../../../assistant-tools';
import { renderUi } from '../../../assistant-ui';

interface UiModel {
  withStructuredOutput(
    schema: unknown,
    options: {
      readonly strict: true;
      readonly method: 'jsonSchema';
      readonly name: string;
    },
  ): { invoke(prompt: string): Promise<unknown> };
}

/** Show your answer to the user. Call exactly once, last. Compose AssistantText for prose (with supporting components as its children), LedgerTable for specific rows by ID, TrendChart, AgingSummary, CustomerCard, and ReviewPayment. Every ID must come from a tool result. On an invalid_ui error, fix the tree and call render once more. */
export default async function render(
  input: {
    /** The components to show, in order. */
    readonly ui: readonly AssistantUiNode[];
  },
  context: B4ToolContext,
) {
  const tools = assistantTools(context);
  const tree = await tools.validateUi(input.ui);
  const model = await createChatModel({ model: 'gpt-5-mini', provider: 'openai' });
  if (
    typeof model !== 'object' ||
    model === null ||
    !('withStructuredOutput' in model) ||
    typeof model.withStructuredOutput !== 'function'
  )
    throw new Error('structured_output_unavailable');
  const renderer = model as UiModel;
  return renderUi(tree, tools.responseSchema, (schema, canonical) =>
    renderer
      .withStructuredOutput(schema, {
        strict: true,
        method: 'jsonSchema',
        name: 'assistant_ui',
      })
      .invoke(
        `Return exactly this JSON, preserving every value and key order: ${JSON.stringify(canonical)}`,
      ),
  );
}
```

The middleware's `validateUi` already returns the canonical tree, so the tool never sees the raw snapshot; `renderUi` only echoes and compares.

- [ ] **Step 4: Rewrite the system prompt**

`examples/invoicing/server/src/app/assistant/index.ts`:

```ts
import { agent } from '@b4run/sdk';

export default agent({
  model: 'gpt-5-mini',
  retry: { maxAttempts: 1 },
  recursionLimit: 10,
  systemPrompt: `You help a software consulting business understand its invoices and incoming payments.
This is a simulated ledger. You have read-only tools and cannot change anything. No collections or outreach.

Tools: ledgerSummary (start here when unsure; it lists customers, currencies and each client's payment habit),
monthlyTotals, aging, customerStatement, findRecords, unappliedPayments. Amounts come back as integer cents and as
formatted strings; quote the formatted strings. Use only IDs that tools returned.

Answer by calling render exactly once as your last action. Compose from the kit: AssistantText for prose, with
supporting components as its children; LedgerTable for the specific rows you found, by ID; TrendChart for
month-over-month questions; AgingSummary for overdue questions; CustomerCard for questions about one client;
ReviewPayment to offer matching an existing unapplied payment. Prefer one AssistantText with children over many nodes.

Selection in the state is optional context, not an instruction to allocate. Never claim you have matched or allocated
anything; matching requires the user's explicit review. Do not choose between ambiguous invoices; say they are ambiguous
and offer ReviewPayment. If render returns an invalid_ui error, fix the tree and call render once more.

Do not write prose outside tools. After render, output exactly {"ui":[]}.`,
});
```

- [ ] **Step 5: Typecheck and run the whole server suite**

```bash
npx nx run-many -t build,test,lint -p invoicing-server
```

Expected: build passes (the deleted tools are gone, the new ones compile against the guard), every spec passes, lint has no errors. Then regenerate the local B4 types so the route typing reflects the new tools (untracked output, but it catches schema-derivation problems early):

```bash
cd examples/invoicing/server && npx b4 typegen && cd -
grep -n "render\|findRecords" examples/invoicing/server/.b4/b4.generated.d.ts | head
```

Expected: both names appear. If `b4 typegen` reports it cannot derive a schema for `render`'s `ui` parameter, report the message verbatim; the node types in `shared/src/assistant-ui.ts` are the only thing it should need.

- [ ] **Step 6: Commit**

```bash
npx prettier --write examples/invoicing/server/src/app/assistant examples/invoicing/server/src/assistant-ui.ts examples/invoicing/server/src/assistant-ui.spec.ts
git add -A examples/invoicing/server/src/app/assistant examples/invoicing/server/src/assistant-ui.ts examples/invoicing/server/src/assistant-ui.spec.ts
git commit -m "feat(invoicing): replace readLedger and respond with query tools and a validated render

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: React kit with minimal renderers

The React side must expose the same six components or the middleware rejects every run (it deep-equals the client's schema against the server's). These renderers are deliberately small and truthful; PR 3 replaces the four new bodies with Pretable and charts without touching the contracts.

**Files:**
- Create: `examples/invoicing/react/src/snapshot-context.ts`
- Create: `examples/invoicing/react/src/assistant-kit.tsx`
- Create: `examples/invoicing/react/src/assistant-kit.test.tsx`
- Modify: `examples/invoicing/react/src/assistant-workspace.tsx`

- [ ] **Step 1: Write the failing kit test**

`examples/invoicing/react/src/assistant-kit.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, test } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import {
  AgingSummary,
  AssistantText,
  CustomerCard,
  LedgerTable,
  TrendChart,
} from './assistant-kit';
import { SnapshotContext } from './snapshot-context';

afterEach(cleanup);

const snapshot: LedgerSnapshot = {
  customers: [
    { id: 'c', name: 'Cedar Health', currency: 'USD', profile: 'on-time' },
  ],
  payments: [
    {
      id: 'p',
      customerId: 'c',
      customerName: 'Cedar Health',
      currency: 'USD',
      amountCents: 10000,
      unappliedCents: 10000,
      reference: 'ACH 1',
      date: '2026-09-10',
      version: 1,
    },
  ],
  invoices: [
    {
      id: 'i',
      customerId: 'c',
      customerName: 'Cedar Health',
      currency: 'USD',
      amountCents: 25000,
      outstandingCents: 25000,
      reference: 'INV-1',
      date: '2026-07-01',
      version: 1,
    },
    {
      id: 'i2',
      customerId: 'c',
      customerName: 'Cedar Health',
      currency: 'USD',
      amountCents: 5000,
      outstandingCents: 0,
      reference: 'INV-2',
      date: '2026-08-01',
      version: 1,
    },
  ],
  allocations: [],
  activities: [],
};

const withSnapshot = (ui: ReactNode) =>
  render(<SnapshotContext.Provider value={snapshot}>{ui}</SnapshotContext.Provider>);

test('AssistantText renders prose and its children', () => {
  withSnapshot(
    <AssistantText text="Hello">
      <CustomerCard customerId="c" />
    </AssistantText>,
  );

  expect(screen.getByText('Hello')).toBeVisible();
  expect(screen.getByText('Cedar Health')).toBeVisible();
});

test('LedgerTable resolves ids from the snapshot and reports missing ones', () => {
  withSnapshot(<LedgerTable title="Rows" recordIds={['i', 'p', 'nope']} />);

  expect(screen.getByRole('heading', { name: 'Rows' })).toBeVisible();
  expect(screen.getByText('INV-1')).toBeVisible();
  expect(screen.getByText('ACH 1')).toBeVisible();
  expect(screen.getByText('1 record could not be shown.')).toBeVisible();
});

test('TrendChart lists the last months for a currency', () => {
  withSnapshot(<TrendChart currency="USD" customerId={null} months={3} />);

  expect(screen.getByText('Jul 2026')).toBeVisible();
  expect(screen.getByText('Sep 2026')).toBeVisible();
  expect(screen.getByText('$250.00')).toBeVisible();
});

test('AgingSummary buckets open invoices as of the ledger date', () => {
  withSnapshot(<AgingSummary currency="USD" customerId="c" />);

  expect(screen.getByText('31-60 days')).toBeVisible();
  expect(screen.getAllByText('$250.00').length).toBeGreaterThan(0);
});

test('CustomerCard shows habit and balances', () => {
  withSnapshot(<CustomerCard customerId="c" />);

  expect(screen.getByText('Cedar Health')).toBeVisible();
  expect(screen.getByText(/on-time/)).toBeVisible();
  expect(screen.getByText('$250.00')).toBeVisible();
  expect(screen.getByText('$100.00')).toBeVisible();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config examples/invoicing/react/vite.config.mts examples/invoicing/react/src/assistant-kit.test.tsx`
Expected: FAIL, cannot find module `./assistant-kit`.

- [ ] **Step 3: Create the snapshot context**

`examples/invoicing/react/src/snapshot-context.ts`:

```ts
import { createContext } from 'react';
import type { LedgerSnapshot } from '@invoicing/contracts';

/** The application's current ledger view; kit components resolve IDs against it, never trust model-typed numbers. */
export const SnapshotContext = createContext<LedgerSnapshot | undefined>(
  undefined,
);
```

- [ ] **Step 4: Create the kit**

`examples/invoicing/react/src/assistant-kit.tsx`:

```tsx
import { type ReactNode, useContext } from 'react';
import {
  AGING_BUCKETS,
  agingBucket,
  createAssistantKit,
  type AgingBuckets,
} from '@invoicing/contracts';
import { SnapshotContext } from './snapshot-context';

/** The ledger's fixed as-of date; the server's snapshot is dated the same. */
const AS_OF = '2026-09-15';

const BUCKET_LABELS: Record<keyof AgingBuckets, string> = {
  current: 'Current',
  days1to30: '1-30 days',
  days31to60: '31-60 days',
  days61to90: '61-90 days',
  over90: 'Over 90 days',
};

function money(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amountCents / 100,
  );
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function useSnapshot() {
  return useContext(SnapshotContext);
}

export function AssistantText({
  text,
  children,
}: {
  text: string;
  children?: ReactNode;
}) {
  if (!text) return null;
  return (
    <div className="assistant-answer">
      <p>{text}</p>
      {children}
    </div>
  );
}

export function LedgerTable({
  title,
  recordIds,
}: {
  title: string;
  recordIds: string[];
}) {
  const snapshot = useSnapshot();
  if (!snapshot) return null;
  const rows = recordIds.flatMap((id) => {
    const invoice = snapshot.invoices.find((i) => i.id === id);
    if (invoice)
      return [
        {
          id,
          reference: invoice.reference ?? id,
          customer: invoice.customerName ?? invoice.customerId,
          date: invoice.date ?? '',
          amount: money(invoice.amountCents, invoice.currency),
          balance: money(invoice.outstandingCents, invoice.currency),
        },
      ];
    const payment = snapshot.payments.find((p) => p.id === id);
    if (payment)
      return [
        {
          id,
          reference: payment.reference ?? id,
          customer: payment.customerName ?? payment.customerId,
          date: payment.date ?? '',
          amount: money(payment.amountCents, payment.currency),
          balance: money(payment.unappliedCents, payment.currency),
        },
      ];
    return [];
  });
  const missing = recordIds.length - rows.length;
  return (
    <section className="assistant-table">
      <h4>{title}</h4>
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.reference}</td>
              <td>{row.customer}</td>
              <td>{row.date}</td>
              <td>{row.amount}</td>
              <td>{row.balance}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {missing > 0 && (
        <p role="status">
          {missing} record{missing === 1 ? '' : 's'} could not be shown.
        </p>
      )}
    </section>
  );
}

export function TrendChart({
  currency,
  customerId,
  months,
}: {
  currency: string;
  customerId: string | null;
  months: number;
}) {
  const snapshot = useSnapshot();
  if (!snapshot) return null;
  const own = <T extends { currency: string; customerId: string; date?: string }>(
    records: readonly T[],
  ) =>
    records.filter(
      (r) => r.currency === currency && (!customerId || r.customerId === customerId),
    );
  const invoices = own(snapshot.invoices);
  const payments = own(snapshot.payments);
  const all = [
    ...new Set(
      [...invoices, ...payments].flatMap((r) => (r.date ? [r.date.slice(0, 7)] : [])),
    ),
  ].sort();
  const rows = all.slice(-Math.max(1, months)).map((month) => ({
    month,
    invoiced: invoices
      .filter((i) => i.date?.startsWith(month))
      .reduce((sum, i) => sum + i.amountCents, 0),
    received: payments
      .filter((p) => p.date?.startsWith(month))
      .reduce((sum, p) => sum + p.amountCents, 0),
  }));
  return (
    <section className="assistant-trend">
      <h4>
        Invoiced vs received · {currency}
        {customerId ? ` · ${customerId}` : ''}
      </h4>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Invoiced</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month}>
              <td>{monthLabel(row.month)}</td>
              <td>{money(row.invoiced, currency)}</td>
              <td>{money(row.received, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function AgingSummary({
  currency,
  customerId,
}: {
  currency: string;
  customerId: string | null;
}) {
  const snapshot = useSnapshot();
  if (!snapshot) return null;
  const totals: Record<keyof AgingBuckets, number> = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  };
  for (const invoice of snapshot.invoices) {
    if (
      invoice.currency !== currency ||
      invoice.outstandingCents <= 0 ||
      (customerId && invoice.customerId !== customerId)
    )
      continue;
    const bucket = invoice.date ? agingBucket(invoice.date, AS_OF) : 'current';
    totals[bucket] += invoice.outstandingCents;
  }
  return (
    <section className="assistant-aging">
      <h4>
        Aging · {currency}
        {customerId ? ` · ${customerId}` : ''}
      </h4>
      <dl>
        {AGING_BUCKETS.map((bucket) => (
          <div key={bucket}>
            <dt>{BUCKET_LABELS[bucket]}</dt>
            <dd>{money(totals[bucket], currency)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CustomerCard({ customerId }: { customerId: string }) {
  const snapshot = useSnapshot();
  const customer = snapshot?.customers.find((c) => c.id === customerId);
  if (!snapshot || !customer) return null;
  const open = snapshot.invoices
    .filter((i) => i.customerId === customerId)
    .reduce((sum, i) => sum + i.outstandingCents, 0);
  const unapplied = snapshot.payments
    .filter((p) => p.customerId === customerId)
    .reduce((sum, p) => sum + p.unappliedCents, 0);
  return (
    <section className="assistant-customer">
      <h4>{customer.name}</h4>
      <p>
        {customer.currency} · pays {customer.profile}
      </p>
      <dl>
        <div>
          <dt>Open</dt>
          <dd>{money(open, customer.currency)}</dd>
        </div>
        <div>
          <dt>Unapplied</dt>
          <dd>{money(unapplied, customer.currency)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Build the kit over concrete renderers; `ReviewPayment` is supplied by the workspace, which owns the review action. */
export function assistantKit(ReviewPayment: (props: { paymentId: string }) => ReactNode) {
  return createAssistantKit({
    AssistantText,
    LedgerTable,
    TrendChart,
    AgingSummary,
    CustomerCard,
    ReviewPayment,
  });
}
```

- [ ] **Step 5: Wire the workspace**

In `examples/invoicing/react/src/assistant-workspace.tsx`:

- Remove the local `AssistantText` component and the `components` constant, and the `assistantTextConfig`/`reviewPaymentConfig` imports; keep `ReviewPayment` (it reads `ActionContext`).
- Import `{ assistantKit } from './assistant-kit'` and `{ SnapshotContext } from './snapshot-context'`.
- Add `const components = assistantKit(ReviewPayment);` after the `ReviewPayment` component definition (module scope, so the kit is built once).
- In `AssistantWorkspace`'s JSX, wrap the existing `ActionContext.Provider` children with `<SnapshotContext.Provider value={snapshot}>…</SnapshotContext.Provider>` so kit components can resolve IDs.

If `useUiChat`'s `components` typing rejects the kit's element type, cast at the single `assistantKit` return with the type React's `exposeComponent` returns (`ExposedComponent<any>[]` from `@hashbrownai/react`), and report it.

- [ ] **Step 6: Run React tests, the schema parity check, and lint**

```bash
npx nx run-many -t build,test,lint -p invoicing-react invoicing-contracts
```

Expected: all pass, including the existing `assistant-workspace.test.tsx` (its scripted transport still emits `AssistantText` nodes; if it emits a node without `children`, that is fine, Hashbrown treats missing children as none). Then prove parity the way the middleware will see it: add to `assistant-kit.test.tsx`:

```tsx
import { s, ɵcreateUiKit } from '@hashbrownai/core';
import { assistantResponseSchema } from '@invoicing/contracts';
import { assistantKit } from './assistant-kit';

test('the React kit produces the exact schema the server expects', () => {
  const kit = assistantKit(() => null);

  expect(s.toJsonSchema(ɵcreateUiKit({ components: kit }).schema)).toEqual(
    assistantResponseSchema,
  );
});
```

Run the kit test file again; expected: 6 passed.

- [ ] **Step 7: Commit**

```bash
npx prettier --write examples/invoicing/react/src
git add examples/invoicing/react/src
git commit -m "feat(invoicing): expose the assistant kit in React with minimal renderers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end verification, README, and PR

**Files:**
- Modify: `examples/invoicing/README.md`

- [ ] **Step 1: Run everything**

```bash
npx nx run-many -t build,test,lint -p invoicing-contracts invoicing-server invoicing-react invoicing-e2e
npx nx run invoicing-e2e:example-e2e
npx nx run invoicing:e2e
```

Expected: all pass (the deterministic e2e never exercises the assistant, so it is unaffected; the artifact test builds the deployable tree, which now must compile the new tools).

- [ ] **Step 2: Exercise the assistant locally against the real model**

Start the server and the client as the README describes (`INVOICING_ENV_FILE=/Users/blove/repos/hashbrown/.env npx nx serve invoicing-server` and `npx vite --config examples/invoicing/react/vite.config.mts --port 4327`), open the app in the built-in browser, and ask, one at a time:

1. "How many incoming payments still need matching, and what is the unapplied total?" Expect prose containing $13,900.00 and a LedgerTable or the five payments named.
2. "Which GBP client is furthest behind?" Expect Thistle Retail with a CustomerCard or AgingSummary.
3. "How did EUR invoicing trend this year?" Expect a TrendChart for EUR.
4. "Match the Atlas payment." Expect no allocation claim, a mention of two candidate invoices, and a ReviewPayment button.

Record, for each: which tools were called (the B4 dev runtime logs tool calls; if it does not, add a temporary `console.log` in `assistant-tools.ts` and remove it before committing), whether render succeeded first time, and the total tool-result size if visible. If the model emits UI in its final message instead of calling render, or calls render more than once, tighten the system prompt wording and re-run; report what changed. If any question fails twice, stop and report BLOCKED with the transcript.

- [ ] **Step 3: Update the README**

In `examples/invoicing/README.md`, after the paragraph beginning `The assistant accepts questions immediately`, add:

```markdown
The assistant answers through six read-only tools (`ledgerSummary`,
`monthlyTotals`, `aging`, `customerStatement`, `findRecords`,
`unappliedPayments`) that each return a small, shaped result, then composes
its answer from a component kit and hands the tree to `render`. The server
validates every component against the kit and every ID against the session's
snapshot before the UI reaches the browser; components carry IDs, never
amounts, and the React side resolves them against the application's own
snapshot. The kit is built by one shared helper so the server and the client
always agree on its schema.
```

Also change the sentence `Both the root agent and nested structured UI generation use \`gpt-5-mini\`.` if it no longer holds (it still does).

- [ ] **Step 4: Commit and open the PR**

```bash
npx prettier --write examples/invoicing/README.md
git add examples/invoicing/README.md
git commit -m "docs(invoicing): describe the assistant's query tools and validated render

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin blove/invoicing-query-tools
gh pr create --base blove/invoicing-vercel-example-dcc083 --title "feat(invoicing): query-shaped assistant tools and a validated render kit" --body "$(cat <<'EOF'
## Summary

PR 2 of 4 from docs/superpowers/specs/2026-09-19-invoicing-generative-ui-design.md, stacked on #558.

- Six query-shaped tools replace `readLedger`: `ledgerSummary`, `monthlyTotals`, `aging`, `customerStatement`, `findRecords`, `unappliedPayments`. Each result is capped near 3K tokens and carries formatted amounts alongside cents.
- A six-component kit (`AssistantText` with children, `LedgerTable`, `TrendChart`, `AgingSummary`, `CustomerCard`, `ReviewPayment`) is defined once in the shared contracts and built by `createAssistantKit` on both the server and in React, so the two schemas are byte-equal.
- The model composes the tree and calls `render`; the server validates every component against the kit and every ID against the session snapshot, then streams the canonical tree through the existing structured-output echo. `respond` is gone.
- React gets minimal, truthful renderers for the four new components so this PR ships on its own; PR 3 replaces their bodies with Pretable and charts.
- The aging rule (`agingBucket`, net-30 terms) moves to the shared contracts so server facts and client rendering agree.

## Test plan

- [ ] `npx nx run-many -t build,test,lint -p invoicing-contracts invoicing-server invoicing-react invoicing-e2e`
- [ ] `npx nx run invoicing-e2e:example-e2e` and `npx nx run invoicing:e2e`
- [ ] Local run against the real model: the four questions in the plan's Task 7 answer correctly with the expected components
- [ ] Preview deployment: same four questions

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Retarget the PR to `main` once #558 merges.
