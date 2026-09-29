# Invoicing dashboard, PR 1: row drives charts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the invoicing example's Dashboard with a grid-centred page: a KPI strip with a currency switcher, a fixed-height focus band of charts, and Clients and Invoices tabs, where selecting a row focuses the charts on that row's client.

**Architecture:** Pure per-currency and per-client figures live in the shared contracts package (`examples/invoicing/shared`), unit-tested there and pinned against the real seeded ledger in a server spec. The React page holds one `Focus` value in a pure reducer, mirrored to the URL; the KPI strip, focus band and grids all read it. The existing `TrendChart` and `AgingSummary` render the band. The focus also reaches the assistant: the middleware validates it, and a new `focusedClient` tool exposes it, mirroring the existing `selectedPayment` path. The old Payments page is untouched in this PR, so matching keeps working.

**Tech Stack:** React 19, Pretable 0.20.2 (`@pretable/react`), hand-rolled SVG charts, Vitest + Testing Library, Playwright, B4 0.12.0 server, Nx.

**Spec:** `docs/superpowers/specs/2026-09-28-invoicing-dashboard-grid-design.md`. This plan covers the spec's PR 1 only.

**Dry run (2026-09-28):** every task's code was applied to this branch and checked before the plan was committed, then reverted. Results: `build`, `test` and `lint` pass for invoicing-contracts, invoicing-server (255 tests), invoicing-react (116 tests) and invoicing-e2e. The deterministic browser suite passes (6 tests), and so does eval replay. A live check with the seeded ledger showed Thistle at £14,000 / £8,000 / 47 days, `?client=thistle` in the URL, and the "Client context" sidebar with its starter. The trial found and fixed a comparator that returned −1 for equal currencies, which made Pretable drop every grouped row.

## Conventions every task follows

- AGENTS.md: write the failing test first; tests are top-level `test(...)` only (no `describe`/`it`/`beforeEach`), with arrange / act / assert separated by blank lines; every new exported function or type gets a TSDoc block; no new dependencies.
- ESLint `sort-imports` sorts import members case-insensitively, ignoring `type`: `AGING_BUCKETS, agingBucket, type AgingBuckets, daysBetween`. Run `npx eslint --fix <file>` if it complains.
- Run `npx prettier --write <files>` on every file you touch before committing; the repo's formatting is Prettier's.
- `npx nx test <project>` does **not** type-check. Run `npx nx build <project>` before committing any task that touches TypeScript.
- Before trusting any failure, confirm the installed B4 matches the pin: `node -p "require('./node_modules/@b4run/cli/package.json').version"` must print `0.12.0`. If not, run `npm ci --no-audit --no-fund`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Responsibility | Task |
|---|---|---|
| `examples/invoicing/shared/src/dashboard.ts` (new) | Pure figures: currency totals, client rows, invoice rows, invoice type and status | 1 |
| `examples/invoicing/shared/src/dashboard.spec.ts` (new) | Unit tests on a small hand-built snapshot | 1 |
| `examples/invoicing/shared/src/index.ts` | Re-export the dashboard module | 1 |
| `examples/invoicing/server/src/dashboard-figures.spec.ts` (new) | Pins the figures against the real seeded ledger | 2 |
| `examples/invoicing/react/src/focus.ts` (new) | `Focus` state, reducer, URL round-trip, sanitising | 3 |
| `examples/invoicing/react/src/focus.test.ts` (new) | Reducer and URL tests | 3 |
| `examples/invoicing/react/src/chart-primitives.tsx` | `AGE_RAMP` | 4 |
| `examples/invoicing/react/src/assistant-charts.tsx` | Aging bars use the age ramp | 4 |
| `examples/invoicing/react/src/ledger-views.ts` | `wholeMoney`, `HABITS`, `invoiceStatusLabel` presentation helpers | 5 |
| `examples/invoicing/react/src/kpi-strip.tsx` (new) | KPI tiles and currency switcher | 6 |
| `examples/invoicing/react/src/status-dot.tsx` (new) | A status as a dot plus a word | 7 |
| `examples/invoicing/react/src/focus-band.tsx` (new) | Band header, trend and aging charts | 7 |
| `examples/invoicing/react/src/grid-columns.tsx` (new) | Currency grouping column and summed money columns shared by both grids | 8 |
| `examples/invoicing/react/src/clients-grid.tsx` (new) | Clients tab (Pretable, grouped by currency) | 8 |
| `examples/invoicing/react/src/invoices-grid.tsx` (new) | Invoices tab with filter chips | 9 |
| `examples/invoicing/react/src/dashboard-view.tsx` (new) | Composes strip, band, tabs, grids; keyboard | 10 |
| `examples/invoicing/react/src/App.tsx` | Dashboard renders the new view; payments UI moves to the Payments page only | 11 |
| `examples/invoicing/react/src/assistant-workspace.tsx`, `focus.ts` | Sends the focus as run state (`assistantRunState`); starters follow it | 12 |
| `examples/invoicing/server/src/assistant-middleware.ts`, `assistant-queries.ts`, `assistant-tools.ts`, `app/assistant/tools/focusedClient.ts` (new), `app/assistant/index.ts` | Validate the focus; expose it through a `focusedClient` tool | 13 |
| `examples/invoicing/react/src/styles.css` | Tokens, strip, band, tabs, motion | 14 |
| `examples/invoicing/e2e/workflow.spec.ts`, `live.spec.ts`, `walkthrough/scenes.ts` | Follow the payments UI to the Payments page; new focus test | 15 |

---

### Task 1: Pure dashboard figures in the shared package

**Files:**
- Create: `examples/invoicing/shared/src/dashboard.ts`
- Create: `examples/invoicing/shared/src/dashboard.spec.ts`
- Modify: `examples/invoicing/shared/src/index.ts` (add an export block after the `./aging` block)

The ledger's `AgingBuckets` keys are `current`, `days1to30`, `days31to60`, `days61to90`, `over90`; `daysBetween(from, to)` returns `to - from` in days; `agingBucket(invoiceDate, asOf)` buckets by days past `TERMS_DAYS` (30). All three are exported from `./aging`.

- [ ] **Step 1: Write the failing tests**

Create `examples/invoicing/shared/src/dashboard.spec.ts`:

```ts
import { expect, test } from 'vitest';
import {
  clientRows,
  currencyTotals,
  invoiceRows,
  invoiceStatus,
  invoiceType,
} from './dashboard';
import type { LedgerSnapshot } from './index';

const AS_OF = '2026-09-15';

const snapshot: LedgerSnapshot = {
  customers: [
    { id: 'acme', name: 'Acme', currency: 'USD', profile: 'on-time' },
    { id: 'birch', name: 'Birch', currency: 'USD', profile: 'late-fixed' },
    { id: 'crane', name: 'Crane', currency: 'GBP', profile: 'short-payer' },
  ],
  invoices: [
    // Acme: one current, one 15 days overdue, one paid.
    { id: 'a1', customerId: 'acme', date: '2026-09-01', reference: 'INV-A1', description: 'Build — 2026-09 monthly retainer', currency: 'USD', amountCents: 100000, version: 1, outstandingCents: 100000 },
    { id: 'a2', customerId: 'acme', date: '2026-08-01', reference: 'INV-A2', description: 'Build — project milestone 1', currency: 'USD', amountCents: 50000, version: 1, outstandingCents: 50000 },
    { id: 'a3', customerId: 'acme', date: '2026-07-01', reference: 'INV-A3', description: 'Build — 2026-07 monthly retainer', currency: 'USD', amountCents: 100000, version: 1, outstandingCents: 0 },
    // Birch: partly paid and 95 days overdue.
    { id: 'b1', customerId: 'birch', date: '2026-05-13', reference: 'INV-B1', description: 'Accessibility sprint', currency: 'USD', amountCents: 80000, version: 1, outstandingCents: 20000 },
    // Crane: current.
    { id: 'c1', customerId: 'crane', date: '2026-09-10', reference: 'INV-C1', description: 'Audit — 2026-09 monthly retainer', currency: 'GBP', amountCents: 70000, version: 1, outstandingCents: 70000 },
  ],
  payments: [
    { id: 'pa', customerId: 'acme', date: '2026-07-11', currency: 'USD', amountCents: 100000, version: 1, unappliedCents: 0 },
    { id: 'pb', customerId: 'birch', date: '2026-06-12', currency: 'USD', amountCents: 60000, version: 1, unappliedCents: 0 },
    { id: 'pu', customerId: 'acme', date: '2026-09-14', currency: 'USD', amountCents: 30000, version: 1, unappliedCents: 30000 },
  ],
  allocations: [
    // Acme paid a3 10 days after issue; Birch paid b1 30 days after issue.
    { paymentId: 'pa', invoiceId: 'a3', amountCents: 100000, proposalId: 'x' },
    { paymentId: 'pb', invoiceId: 'b1', amountCents: 60000, proposalId: 'y' },
  ],
  activities: [],
};

test('invoiceType reads retainers and milestones from the description, anything else is one-off', () => {
  const descriptions = [
    'Build — 2026-09 monthly retainer',
    'Build — project milestone 2',
    'Accessibility sprint',
    undefined,
  ];

  const types = descriptions.map(invoiceType);

  expect(types).toEqual(['Retainer', 'Milestone', 'One-off', 'One-off']);
});

test('invoiceStatus distinguishes paid, current, overdue and partly paid', () => {
  const statuses = snapshot.invoices.map((invoice) =>
    invoiceStatus(invoice, AS_OF),
  );

  expect(statuses).toEqual([
    { kind: 'current' },
    { kind: 'overdue', days: 15 },
    { kind: 'paid' },
    { kind: 'partly-paid', days: 95 },
    { kind: 'current' },
  ]);
});

test('currencyTotals sums open, overdue and unapplied per currency and averages days to pay', () => {
  const totals = currencyTotals(snapshot, AS_OF);

  expect(totals).toEqual([
    {
      currency: 'USD',
      clientCount: 2,
      openCents: 170000,
      overdueCents: 70000,
      unappliedCents: 30000,
      unappliedPaymentCount: 1,
      averageDaysToPay: 20,
    },
    {
      currency: 'GBP',
      clientCount: 1,
      openCents: 70000,
      overdueCents: 0,
      unappliedCents: 0,
      unappliedPaymentCount: 0,
      averageDaysToPay: null,
    },
  ]);
});

test('clientRows gives each client its balances, aging, open count and payment habit', () => {
  const rows = clientRows(snapshot, AS_OF);

  expect(rows.find((row) => row.id === 'acme')).toEqual({
    id: 'acme',
    name: 'Acme',
    currency: 'USD',
    profile: 'on-time',
    openCents: 150000,
    overdueCents: 50000,
    aging: {
      current: 100000,
      days1to30: 50000,
      days31to60: 0,
      days61to90: 0,
      over90: 0,
    },
    openInvoiceCount: 2,
    averageDaysToPay: 10,
    unappliedCents: 30000,
  });
  expect(rows.find((row) => row.id === 'crane')?.averageDaysToPay).toBeNull();
});

test('invoiceRows carries type, status, age bucket and client name for every invoice', () => {
  const rows = invoiceRows(snapshot, AS_OF);

  expect(rows).toHaveLength(5);
  expect(rows.find((row) => row.id === 'b1')).toEqual({
    id: 'b1',
    reference: 'INV-B1',
    clientId: 'birch',
    clientName: 'Birch',
    currency: 'USD',
    type: 'One-off',
    issued: '2026-05-13',
    amountCents: 80000,
    balanceCents: 20000,
    daysOverdue: 95,
    bucket: 'over90',
    status: { kind: 'partly-paid', days: 95 },
  });
  expect(rows.find((row) => row.id === 'a3')?.bucket).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx nx test invoicing-contracts -- dashboard`
Expected: FAIL with `Failed to resolve import "./dashboard"`.

- [ ] **Step 3: Write the implementation**

Create `examples/invoicing/shared/src/dashboard.ts`:

```ts
import {
  AGING_BUCKETS,
  agingBucket,
  type AgingBuckets,
  daysBetween,
  TERMS_DAYS,
} from './aging';
import type { LedgerSnapshot, PaymentProfile } from './index';

type Invoice = LedgerSnapshot['invoices'][number];

/** How an invoice was billed, read from its description. */
export type InvoiceType = 'Retainer' | 'Milestone' | 'One-off';

/** Where an invoice stands on an as-of date; `days` counts days past its terms. */
export type InvoiceStatus =
  | { readonly kind: 'paid' }
  | { readonly kind: 'current' }
  | { readonly kind: 'overdue'; readonly days: number }
  | { readonly kind: 'partly-paid'; readonly days: number };

/** One currency's receivables, for the KPI strip and the band's portfolio state. */
export interface CurrencyTotals {
  readonly currency: string;
  readonly clientCount: number;
  readonly openCents: number;
  readonly overdueCents: number;
  readonly unappliedCents: number;
  /** Payments in this currency with cash still to match. */
  readonly unappliedPaymentCount: number;
  /** Mean days from invoice to payment over this currency's allocations, rounded; null with none. */
  readonly averageDaysToPay: number | null;
}

/** One row of the Clients grid. */
export interface ClientRow {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly profile: PaymentProfile;
  readonly openCents: number;
  readonly overdueCents: number;
  readonly aging: AgingBuckets;
  readonly openInvoiceCount: number;
  readonly averageDaysToPay: number | null;
  readonly unappliedCents: number;
}

/** One row of the Invoices grid. */
export interface InvoiceRow {
  readonly id: string;
  readonly reference: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly currency: string;
  readonly type: InvoiceType;
  readonly issued: string;
  readonly amountCents: number;
  readonly balanceCents: number;
  readonly daysOverdue: number;
  /** The open balance's age bucket; null once paid. */
  readonly bucket: keyof AgingBuckets | null;
  readonly status: InvoiceStatus;
}

/**
 * Classify an invoice by its description: "monthly retainer" and "project
 * milestone" are the generator's two recurring kinds; anything else, such as
 * Cedar Health's accessibility sprint, is a one-off.
 */
export function invoiceType(description: string | undefined): InvoiceType {
  if (description && /monthly retainer/i.test(description)) return 'Retainer';
  if (description && /project milestone/i.test(description))
    return 'Milestone';
  return 'One-off';
}

/** Days past the invoice's terms on `asOf`; zero while current or undated. */
export function daysOverdue(invoice: Invoice, asOf: string): number {
  return invoice.date
    ? Math.max(0, daysBetween(invoice.date, asOf) - TERMS_DAYS)
    : 0;
}

/** Paid, current, overdue by n days, or partly paid and n days past terms. */
export function invoiceStatus(invoice: Invoice, asOf: string): InvoiceStatus {
  if (invoice.outstandingCents === 0) return { kind: 'paid' };
  const days = daysOverdue(invoice, asOf);
  if (invoice.outstandingCents < invoice.amountCents)
    return { kind: 'partly-paid', days };
  return days > 0 ? { kind: 'overdue', days } : { kind: 'current' };
}

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

const emptyAging = (): Record<keyof AgingBuckets, number> =>
  Object.fromEntries(AGING_BUCKETS.map((bucket) => [bucket, 0])) as Record<
    keyof AgingBuckets,
    number
  >;

/** Days from each invoice's issue to the payment allocated to it, for invoices matching `include`. */
function paymentLags(
  snapshot: LedgerSnapshot,
  include: (invoice: Invoice) => boolean,
): number[] {
  const invoices = new Map(snapshot.invoices.map((i) => [i.id, i]));
  const payments = new Map(snapshot.payments.map((p) => [p.id, p]));
  return snapshot.allocations.flatMap((allocation) => {
    const invoice = invoices.get(allocation.invoiceId);
    const payment = payments.get(allocation.paymentId);
    return invoice?.date && payment?.date && include(invoice)
      ? [daysBetween(invoice.date, payment.date)]
      : [];
  });
}

const average = (values: readonly number[]) =>
  values.length ? Math.round(sum(values) / values.length) : null;

/**
 * Per-currency receivables, in the order currencies first appear among
 * customers, then invoices, then payments (records can name a currency no
 * customer bills in, as in small test ledgers).
 */
export function currencyTotals(
  snapshot: LedgerSnapshot,
  asOf: string,
): CurrencyTotals[] {
  const currencies = [
    ...new Set(
      [...snapshot.customers, ...snapshot.invoices, ...snapshot.payments].map(
        (record) => record.currency,
      ),
    ),
  ];
  return currencies.map((currency) => {
    const open = snapshot.invoices.filter(
      (i) => i.currency === currency && i.outstandingCents > 0,
    );
    return {
      currency,
      clientCount: snapshot.customers.filter((c) => c.currency === currency)
        .length,
      openCents: sum(open.map((i) => i.outstandingCents)),
      overdueCents: sum(
        open
          .filter((i) => daysOverdue(i, asOf) > 0)
          .map((i) => i.outstandingCents),
      ),
      unappliedCents: sum(
        snapshot.payments
          .filter((p) => p.currency === currency)
          .map((p) => p.unappliedCents),
      ),
      unappliedPaymentCount: snapshot.payments.filter(
        (p) => p.currency === currency && p.unappliedCents > 0,
      ).length,
      averageDaysToPay: average(
        paymentLags(snapshot, (i) => i.currency === currency),
      ),
    };
  });
}

/** Every client's balances, aging, open-invoice count and payment habit. */
export function clientRows(snapshot: LedgerSnapshot, asOf: string): ClientRow[] {
  return snapshot.customers.map((customer) => {
    const open = snapshot.invoices.filter(
      (i) => i.customerId === customer.id && i.outstandingCents > 0,
    );
    const aging = emptyAging();
    for (const invoice of open) {
      const bucket = invoice.date ? agingBucket(invoice.date, asOf) : 'current';
      aging[bucket] += invoice.outstandingCents;
    }
    return {
      id: customer.id,
      name: customer.name,
      currency: customer.currency,
      profile: customer.profile,
      openCents: sum(open.map((i) => i.outstandingCents)),
      overdueCents: sum(
        open
          .filter((i) => daysOverdue(i, asOf) > 0)
          .map((i) => i.outstandingCents),
      ),
      aging,
      openInvoiceCount: open.length,
      averageDaysToPay: average(
        paymentLags(snapshot, (i) => i.customerId === customer.id),
      ),
      unappliedCents: sum(
        snapshot.payments
          .filter((p) => p.customerId === customer.id)
          .map((p) => p.unappliedCents),
      ),
    };
  });
}

/** Every invoice with its type, status and age bucket, for the Invoices grid. */
export function invoiceRows(
  snapshot: LedgerSnapshot,
  asOf: string,
): InvoiceRow[] {
  const names = new Map(snapshot.customers.map((c) => [c.id, c.name]));
  return snapshot.invoices.map((invoice) => ({
    id: invoice.id,
    reference: invoice.reference ?? invoice.id,
    clientId: invoice.customerId,
    clientName:
      invoice.customerName ?? names.get(invoice.customerId) ?? invoice.customerId,
    currency: invoice.currency,
    type: invoiceType(invoice.description),
    issued: invoice.date ?? '',
    amountCents: invoice.amountCents,
    balanceCents: invoice.outstandingCents,
    daysOverdue: daysOverdue(invoice, asOf),
    bucket:
      invoice.outstandingCents === 0
        ? null
        : invoice.date
          ? agingBucket(invoice.date, asOf)
          : 'current',
    status: invoiceStatus(invoice, asOf),
  }));
}
```

Why these numbers in the fixture: Acme's average is its one allocation, 10 days (issued 07-01, paid 07-11); USD's average is (10 + 30) / 2 = 20; Birch's invoice issued 05-13 is 125 days old on 09-15, so 95 days past 30-day terms, bucket `over90`.

- [ ] **Step 4: Export it from the package root**

In `examples/invoicing/shared/src/index.ts`, after the `export { AGING_BUCKETS, … } from './aging';` block, add:

```ts
export {
  clientRows,
  currencyTotals,
  daysOverdue,
  invoiceRows,
  invoiceStatus,
  invoiceType,
  type ClientRow,
  type CurrencyTotals,
  type InvoiceRow,
  type InvoiceStatus,
  type InvoiceType,
} from './dashboard';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx nx test invoicing-contracts`
Expected: PASS, including the 5 new tests.

- [ ] **Step 6: Build, lint, commit**

```bash
npx nx run-many -t build,lint -p invoicing-contracts
git add examples/invoicing/shared/src/dashboard.ts examples/invoicing/shared/src/dashboard.spec.ts examples/invoicing/shared/src/index.ts
git commit -m "feat(invoicing): derive per-currency and per-client dashboard figures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pin the figures against the real seeded ledger

**Files:**
- Create: `examples/invoicing/server/src/dashboard-figures.spec.ts`

Server specs already load the seeded ledger this way (see `assistant-queries.spec.ts`). These values were computed from the seed on 2026-09-28 and are the ones the spec and mockups use.

- [ ] **Step 1: Write the test**

```ts
import { expect, test } from 'vitest';
import {
  clientRows,
  currencyTotals,
  invoiceRows,
} from '@invoicing/contracts';
import { getSnapshot } from './ledger';
import { createSampleLedger } from './sample-ledger';

const AS_OF = '2026-09-15';
const snapshot = getSnapshot(createSampleLedger());

test('the seeded ledger totals each currency the way the dashboard shows it', () => {
  const totals = currencyTotals(snapshot, AS_OF);

  expect(totals).toEqual(
    expect.arrayContaining([
      {
        currency: 'USD',
        clientCount: 8,
        openCents: 4230500,
        overdueCents: 1716700,
        unappliedCents: 1390000,
        unappliedPaymentCount: 5,
        averageDaysToPay: 17,
      },
      {
        currency: 'GBP',
        clientCount: 2,
        openCents: 1753200,
        overdueCents: 1143600,
        unappliedCents: 0,
        unappliedPaymentCount: 0,
        averageDaysToPay: 26,
      },
      {
        currency: 'EUR',
        clientCount: 2,
        openCents: 450000,
        overdueCents: 0,
        unappliedCents: 0,
        unappliedPaymentCount: 0,
        averageDaysToPay: 24,
      },
    ]),
  );
});

test('Thistle Retail carries £14,000 open, £8,000 overdue, aged across three buckets', () => {
  const thistle = clientRows(snapshot, AS_OF).find((row) => row.id === 'thistle');

  expect(thistle).toMatchObject({
    currency: 'GBP',
    openCents: 1400000,
    overdueCents: 800000,
    openInvoiceCount: 3,
    averageDaysToPay: 47,
    aging: {
      current: 600000,
      days1to30: 600000,
      days31to60: 200000,
      days61to90: 0,
      over90: 0,
    },
  });
});

test('each client row sums back to its currency total', () => {
  const rows = clientRows(snapshot, AS_OF);
  const totals = currencyTotals(snapshot, AS_OF);

  for (const total of totals) {
    const own = rows.filter((row) => row.currency === total.currency);
    expect(own.reduce((sum, row) => sum + row.openCents, 0)).toBe(
      total.openCents,
    );
    expect(own.reduce((sum, row) => sum + row.overdueCents, 0)).toBe(
      total.overdueCents,
    );
  }
});

test('invoice rows cover all 489 invoices with 98 open, and classify one-offs and residuals', () => {
  const rows = invoiceRows(snapshot, AS_OF);

  expect(rows).toHaveLength(489);
  expect(rows.filter((row) => row.balanceCents > 0)).toHaveLength(98);
  expect(rows.find((row) => row.reference === 'INV-202609-CH-102')?.type).toBe(
    'One-off',
  );
  expect(
    rows.find((row) => row.reference === 'INV-202510-KESTREL-P1'),
  ).toMatchObject({
    type: 'Milestone',
    amountCents: 550000,
    balanceCents: 11000,
    status: { kind: 'partly-paid', days: 305 },
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx nx test invoicing-server -- dashboard-figures`
Expected: PASS. If a value differs, the generator's seed changed: do not edit the expectation to match without checking `server/src/generator/` history, because the spec and mockups quote these figures.

- [ ] **Step 3: Commit**

```bash
git add examples/invoicing/server/src/dashboard-figures.spec.ts
git commit -m "test(invoicing): pin the dashboard figures against the seeded ledger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The focus model

**Files:**
- Create: `examples/invoicing/react/src/focus.ts`
- Create: `examples/invoicing/react/src/focus.test.ts`

PR 1 has two tabs. PR 2 widens `DashboardTab` and `FocusRecord`.

- [ ] **Step 1: Write the failing tests**

Create `examples/invoicing/react/src/focus.test.ts`:

```ts
import { expect, test } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import {
  DEFAULT_FOCUS,
  focusFromSearch,
  focusReducer,
  focusToSearch,
  sanitizeFocus,
} from './focus';

const snapshot = {
  customers: [
    { id: 'thistle', name: 'Thistle Retail', currency: 'GBP', profile: 'late-drifting' },
    { id: 'harbor', name: 'Harbor Commerce', currency: 'USD', profile: 'on-time' },
  ],
  invoices: [
    { id: 'inv-t', customerId: 'thistle', currency: 'GBP', amountCents: 1, version: 1, outstandingCents: 1 },
  ],
  payments: [],
  allocations: [],
  activities: [],
} as LedgerSnapshot;

test('selecting a client focuses it; selecting an invoice focuses its client and marks the invoice', () => {
  const client = focusReducer(DEFAULT_FOCUS, {
    type: 'select-client',
    clientId: 'thistle',
  });

  const invoice = focusReducer(client, {
    type: 'select-invoice',
    invoiceId: 'inv-t',
    clientId: 'thistle',
  });

  expect(client).toEqual({ ...DEFAULT_FOCUS, clientId: 'thistle' });
  expect(focusReducer(client, { type: 'select-client', clientId: 'thistle' })).toBe(client);
  expect(invoice).toEqual({
    ...DEFAULT_FOCUS,
    clientId: 'thistle',
    record: { kind: 'invoice', id: 'inv-t' },
  });
});

test('switching tabs keeps the focused client but drops a record from the other tab', () => {
  const focused = {
    ...DEFAULT_FOCUS,
    tab: 'invoices' as const,
    clientId: 'thistle',
    record: { kind: 'invoice' as const, id: 'inv-t' },
  };

  const next = focusReducer(focused, { type: 'set-tab', tab: 'clients' });

  expect(next).toEqual({ ...DEFAULT_FOCUS, tab: 'clients', clientId: 'thistle' });
});

test('clear drops the client and record; the currency switcher is ignored while a client is focused', () => {
  const focused = { ...DEFAULT_FOCUS, clientId: 'thistle' };

  const locked = focusReducer(focused, { type: 'set-currency', currency: 'EUR' });
  const cleared = focusReducer(focused, { type: 'clear' });
  const switched = focusReducer(cleared, { type: 'set-currency', currency: 'EUR' });

  expect(locked).toBe(focused);
  expect(cleared).toEqual(DEFAULT_FOCUS);
  expect(switched.currency).toBe('EUR');
});

test('the focus round-trips through the query string, omitting defaults', () => {
  const focus = {
    tab: 'invoices' as const,
    currency: 'GBP',
    clientId: 'thistle',
    record: { kind: 'invoice' as const, id: 'inv-t' },
  };

  const search = focusToSearch(focus);

  expect(search).toBe('?tab=invoices&currency=GBP&client=thistle&invoice=inv-t');
  expect(focusFromSearch(search)).toEqual(focus);
  expect(focusToSearch(DEFAULT_FOCUS)).toBe('');
  expect(focusFromSearch('?tab=unknown&currency=XYZ')).toEqual(DEFAULT_FOCUS);
});

test('sanitizeFocus drops ids the ledger does not know, and records that belong to another client', () => {
  const unknown = sanitizeFocus({ ...DEFAULT_FOCUS, clientId: 'nobody' }, snapshot);
  const mismatched = sanitizeFocus(
    {
      ...DEFAULT_FOCUS,
      clientId: 'harbor',
      record: { kind: 'invoice', id: 'inv-t' },
    },
    snapshot,
  );

  expect(unknown).toEqual(DEFAULT_FOCUS);
  expect(mismatched).toEqual({ ...DEFAULT_FOCUS, clientId: 'harbor' });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- focus`
Expected: FAIL with `Failed to resolve import "./focus"`.

- [ ] **Step 3: Write the implementation**

Create `examples/invoicing/react/src/focus.ts`:

```ts
import type { LedgerSnapshot } from '@invoicing/contracts';

/** The dashboard's tabs. PR 2 adds Payments and Unapplied. */
export const DASHBOARD_TABS = ['clients', 'invoices'] as const;
/** One of {@link DASHBOARD_TABS}. */
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

/** The currencies the switcher offers, in its order. */
export const SWITCHER_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;

/** A single record the focus marks inside its client's charts. */
export interface FocusRecord {
  readonly kind: 'invoice';
  readonly id: string;
}

/**
 * The page's one shared selection. Every selection resolves to a client; a
 * record, when present, belongs to that client. `currency` is the switcher's
 * value and only applies while no client is focused.
 */
export interface Focus {
  readonly tab: DashboardTab;
  readonly currency: string;
  readonly clientId?: string;
  readonly record?: FocusRecord;
}

/** Everything that can change the focus. */
export type FocusAction =
  | { readonly type: 'select-client'; readonly clientId: string }
  | {
      readonly type: 'select-invoice';
      readonly invoiceId: string;
      readonly clientId: string;
    }
  | { readonly type: 'clear' }
  | { readonly type: 'set-tab'; readonly tab: DashboardTab }
  | { readonly type: 'set-currency'; readonly currency: string };

/** Nothing focused, Clients tab, USD. */
export const DEFAULT_FOCUS: Focus = { tab: 'clients', currency: 'USD' };

/** Apply one action; pure, so the page and tests share it. */
export function focusReducer(focus: Focus, action: FocusAction): Focus {
  switch (action.type) {
    case 'select-client':
      // Pretable reports one click several times; keep the same object so React bails out.
      return focus.clientId === action.clientId && !focus.record
        ? focus
        : { tab: focus.tab, currency: focus.currency, clientId: action.clientId };
    case 'select-invoice':
      if (focus.record?.id === action.invoiceId) return focus;
      return {
        tab: focus.tab,
        currency: focus.currency,
        clientId: action.clientId,
        record: { kind: 'invoice', id: action.invoiceId },
      };
    case 'clear':
      return { tab: focus.tab, currency: focus.currency };
    case 'set-tab':
      // A record belongs to the tab it was picked on; the client carries over.
      return focus.clientId
        ? { tab: action.tab, currency: focus.currency, clientId: focus.clientId }
        : { tab: action.tab, currency: focus.currency };
    case 'set-currency':
      // The switcher is locked to the focused client's currency.
      return focus.clientId ? focus : { ...focus, currency: action.currency };
  }
}

const isTab = (value: string | null): value is DashboardTab =>
  (DASHBOARD_TABS as readonly (string | null)[]).includes(value);
const isCurrency = (value: string | null): value is string =>
  (SWITCHER_CURRENCIES as readonly (string | null)[]).includes(value);

/** Read a focus from a query string; unknown values fall back to the defaults. */
export function focusFromSearch(search: string): Focus {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  const currency = params.get('currency');
  const clientId = params.get('client') ?? undefined;
  const invoiceId = params.get('invoice') ?? undefined;
  return {
    tab: isTab(tab) ? tab : DEFAULT_FOCUS.tab,
    currency: isCurrency(currency) ? currency : DEFAULT_FOCUS.currency,
    ...(clientId ? { clientId } : {}),
    ...(clientId && invoiceId
      ? { record: { kind: 'invoice' as const, id: invoiceId } }
      : {}),
  };
}

/** Write a focus as a query string, leaving out default values; '' when all default. */
export function focusToSearch(focus: Focus): string {
  const params = new URLSearchParams();
  if (focus.tab !== DEFAULT_FOCUS.tab) params.set('tab', focus.tab);
  if (focus.currency !== DEFAULT_FOCUS.currency)
    params.set('currency', focus.currency);
  if (focus.clientId) params.set('client', focus.clientId);
  if (focus.record) params.set('invoice', focus.record.id);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Drop anything the ledger does not recognise: an unknown client clears the
 * focus, and a record that is missing or belongs to another client is dropped.
 */
export function sanitizeFocus(focus: Focus, snapshot: LedgerSnapshot): Focus {
  const base = { tab: focus.tab, currency: focus.currency };
  if (!focus.clientId) return base;
  if (!snapshot.customers.some((c) => c.id === focus.clientId)) return base;
  const record = focus.record;
  const owned =
    record &&
    snapshot.invoices.some(
      (i) => i.id === record.id && i.customerId === focus.clientId,
    );
  return owned
    ? { ...base, clientId: focus.clientId, record }
    : { ...base, clientId: focus.clientId };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx nx test invoicing-react -- focus`
Expected: PASS (5 tests).

- [ ] **Step 5: Build, lint, commit**

```bash
npx nx run-many -t build,lint -p invoicing-react
git add examples/invoicing/react/src/focus.ts examples/invoicing/react/src/focus.test.ts
git commit -m "feat(invoicing): one shared focus for the dashboard, mirrored to the URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Age bars use the neutral ordinal ramp

**Files:**
- Modify: `examples/invoicing/react/src/chart-primitives.tsx` (add `AGE_RAMP` after `CHART_TOKENS`)
- Modify: `examples/invoicing/react/src/assistant-charts.tsx` (the aging bar `<rect data-bucket …>` inside `bars.map`)
- Modify: `examples/invoicing/react/src/assistant-charts.test.tsx`

Blue is series 1, "invoiced". The spec gives age its own ramp, darker for older, validated with the dataviz skill (`validate_palette.js … --mode light --ordinal`: monotone, adjacent ΔL ≥ 0.06, light end 2.50:1 on the surface, single hue). `data-bucket` attributes stay: `e2e/workflow.spec.ts` selects on them.

- [ ] **Step 1: Write the failing test**

Append to `examples/invoicing/react/src/assistant-charts.test.tsx`:

```ts
test('AgingSummary shades buckets from light to dark as invoices get older', () => {
  withSnapshot(<AgingSummary currency="USD" customerId="c" />);

  const fills = [
    ...document.querySelectorAll<SVGRectElement>('rect[data-bucket]'),
  ].map((rect) => rect.getAttribute('fill'));

  expect(fills).toEqual([
    '#94a3b8',
    '#7b8aa0',
    '#5f6f86',
    '#465569',
    '#1e293b',
  ]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx nx test invoicing-react -- assistant-charts`
Expected: FAIL: fills are `var(--series-1)` five times.

- [ ] **Step 3: Implement**

In `chart-primitives.tsx`, after `CHART_TOKENS`:

```ts
/**
 * Ordinal ramp for aging buckets, lighter to darker as invoices get older.
 * Neutral so it never competes with series 1 ("invoiced"). Validated with the
 * dataviz palette validator (light, ordinal): all checks pass.
 */
export const AGE_RAMP = [
  '#94a3b8',
  '#7b8aa0',
  '#5f6f86',
  '#465569',
  '#1e293b',
] as const;
```

In `assistant-charts.tsx`, add `AGE_RAMP` to the `./chart-primitives` import (first member, before `ChartFigure`). Inside `AgingSummary`, change `{bars.map((b) => (` to `{bars.map((b, index) => (`, and change the `fill="var(--series-1)"` on the `<rect data-bucket={b.row.bucket} …>` to the line below. The file has a second `fill="var(--series-1)"` in `TrendChart`; leave that one alone.

```tsx
                  fill={AGE_RAMP[index]}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx nx test invoicing-react -- assistant-charts`
Expected: PASS, and the existing AgingSummary tests still pass.

- [ ] **Step 5: Build, lint, commit**

```bash
npx nx run-many -t build,lint -p invoicing-react
git add examples/invoicing/react/src/chart-primitives.tsx examples/invoicing/react/src/assistant-charts.tsx examples/invoicing/react/src/assistant-charts.test.tsx
git commit -m "feat(invoicing): shade aging bars with a neutral ramp, darker for older

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Presentation helpers

**Files:**
- Modify: `examples/invoicing/react/src/ledger-views.ts`
- Modify: `examples/invoicing/react/src/ledger-views.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `examples/invoicing/react/src/ledger-views.test.ts` (add `HABITS`, `invoiceStatusLabel`, `wholeMoney` to its import from `./ledger-views`):

```ts
test('wholeMoney drops the cents for tiles and grid cells', () => {
  const values = [
    wholeMoney(4230500, 'USD'),
    wholeMoney(1400000, 'GBP'),
    wholeMoney(450000, 'EUR'),
  ];

  expect(values).toEqual(['$42,305', '£14,000', '€4,500']);
});

test('every payment profile has a habit label and a status tone', () => {
  const profiles = Object.keys(HABITS);

  expect(profiles.sort()).toEqual([
    'batch-payer',
    'late-drifting',
    'late-fixed',
    'on-time',
    'short-payer',
    'wrong-reference',
  ]);
  expect(HABITS['late-drifting']).toEqual({ label: 'Late, drifting', tone: 'serious' });
  expect(HABITS['on-time']).toEqual({ label: 'On time', tone: 'good' });
});

test('invoiceStatusLabel words each status with a tone by how late it is', () => {
  const labels = [
    invoiceStatusLabel({ kind: 'paid' }),
    invoiceStatusLabel({ kind: 'current' }),
    invoiceStatusLabel({ kind: 'overdue', days: 1 }),
    invoiceStatusLabel({ kind: 'overdue', days: 32 }),
    invoiceStatusLabel({ kind: 'partly-paid', days: 305 }),
  ];

  expect(labels).toEqual([
    { label: 'Paid', tone: 'good' },
    { label: 'Current', tone: 'neutral' },
    { label: '1 day overdue', tone: 'warning' },
    { label: '32 days overdue', tone: 'serious' },
    { label: 'Partly paid · 305 days', tone: 'critical' },
  ]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- ledger-views`
Expected: FAIL: `wholeMoney` is not exported.

- [ ] **Step 3: Implement**

Add to `ledger-views.ts` (extend the `@invoicing/contracts` import with `type InvoiceStatus`, keeping member order):

```ts
/** `$42,305`: whole units, for KPI tiles and grid cells where cents are noise. */
export function wholeMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

/** Status tones, reserved for state; each always ships with a text label. */
export type StatusTone = 'good' | 'neutral' | 'warning' | 'serious' | 'critical';

/** How each payment profile reads in the grid and band. */
export const HABITS: Record<
  PaymentProfile,
  { readonly label: string; readonly tone: StatusTone }
> = {
  'on-time': { label: 'On time', tone: 'good' },
  'late-fixed': { label: 'Late, fixed', tone: 'warning' },
  'late-drifting': { label: 'Late, drifting', tone: 'serious' },
  'short-payer': { label: 'Short-pays', tone: 'warning' },
  'batch-payer': { label: 'Batches payments', tone: 'neutral' },
  'wrong-reference': { label: 'Wrong references', tone: 'neutral' },
};

const lateTone = (days: number): StatusTone =>
  days > 90 ? 'critical' : days > 30 ? 'serious' : 'warning';

/** Words and tone for an invoice status: up to 30 days late is a warning, up to 90 serious, beyond critical. */
export function invoiceStatusLabel(status: InvoiceStatus): {
  readonly label: string;
  readonly tone: StatusTone;
} {
  switch (status.kind) {
    case 'paid':
      return { label: 'Paid', tone: 'good' };
    case 'current':
      return { label: 'Current', tone: 'neutral' };
    case 'overdue':
      return {
        label: `${status.days} day${status.days === 1 ? '' : 's'} overdue`,
        tone: lateTone(status.days),
      };
    case 'partly-paid':
      return {
        label: `Partly paid · ${status.days} days`,
        tone: status.days > 0 ? lateTone(status.days) : 'neutral',
      };
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-react -- ledger-views`
Expected: PASS.

- [ ] **Step 5: Build, lint, commit**

```bash
npx nx run-many -t build,lint -p invoicing-react
git add examples/invoicing/react/src/ledger-views.ts examples/invoicing/react/src/ledger-views.test.ts
git commit -m "feat(invoicing): whole-unit money, habit labels and status words for the dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: KPI strip with the currency switcher

**Files:**
- Create: `examples/invoicing/react/src/kpi-strip.tsx`
- Create: `examples/invoicing/react/src/kpi-strip.test.tsx`

The strip keeps `aria-label="Ledger totals"` so existing tests and e2e can still find it. Figures are the switcher currency's portfolio, or the focused client's, in which case the other currencies are disabled ("locked").

- [ ] **Step 1: Write the failing tests**

```tsx
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { ClientRow, CurrencyTotals } from '@invoicing/contracts';
import { KpiStrip } from './kpi-strip';

const totals: CurrencyTotals[] = [
  {
    currency: 'USD',
    clientCount: 8,
    openCents: 4230500,
    overdueCents: 1716700,
    unappliedCents: 1390000,
    unappliedPaymentCount: 5,
    averageDaysToPay: 17,
  },
  {
    currency: 'GBP',
    clientCount: 2,
    openCents: 1753200,
    overdueCents: 1143600,
    unappliedCents: 0,
    unappliedPaymentCount: 0,
    averageDaysToPay: 26,
  },
];

const thistle: ClientRow = {
  id: 'thistle',
  name: 'Thistle Retail',
  currency: 'GBP',
  profile: 'late-drifting',
  openCents: 1400000,
  overdueCents: 800000,
  aging: {
    current: 600000,
    days1to30: 600000,
    days31to60: 200000,
    days61to90: 0,
    over90: 0,
  },
  openInvoiceCount: 3,
  averageDaysToPay: 47,
  unappliedCents: 0,
};

test('the strip shows the switcher currency portfolio in whole units', () => {
  cleanup();

  render(
    <KpiStrip totals={totals} currency="USD" onCurrencyChange={vi.fn()} />,
  );

  const strip = screen.getByRole('region', { name: 'Ledger totals' });
  expect(within(strip).getByText('$42,305')).toBeVisible();
  expect(within(strip).getByText('8 clients')).toBeVisible();
  expect(within(strip).getByText('$17,167')).toBeVisible();
  expect(within(strip).getByText('41% of open')).toBeVisible();
  expect(within(strip).getByText('$13,900')).toBeVisible();
  expect(within(strip).getByText('5 payments to match')).toBeVisible();
  expect(within(strip).getByText('17')).toBeVisible();
  expect(screen.getByRole('button', { name: 'USD' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the switcher asks for another currency', () => {
  cleanup();
  const onCurrencyChange = vi.fn();
  render(
    <KpiStrip
      totals={totals}
      currency="USD"
      onCurrencyChange={onCurrencyChange}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'GBP' }));

  expect(onCurrencyChange).toHaveBeenCalledWith('GBP');
});

test('a focused client replaces the figures and locks the switcher to its currency', () => {
  cleanup();

  render(
    <KpiStrip
      totals={totals}
      currency="GBP"
      client={thistle}
      onCurrencyChange={vi.fn()}
    />,
  );

  const strip = screen.getByRole('region', { name: 'Ledger totals' });
  expect(within(strip).getByText('£14,000')).toBeVisible();
  expect(within(strip).getByText('3 open invoices')).toBeVisible();
  expect(within(strip).getByText('£8,000')).toBeVisible();
  expect(within(strip).getByText('47')).toBeVisible();
  expect(screen.getByRole('button', { name: 'USD' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'GBP' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- kpi-strip`
Expected: FAIL with `Failed to resolve import "./kpi-strip"`.

- [ ] **Step 3: Implement**

```tsx
import type { ClientRow, CurrencyTotals } from '@invoicing/contracts';
import { SWITCHER_CURRENCIES } from './focus';
import { wholeMoney } from './ledger-views';

/** Inputs for {@link KpiStrip}. */
export interface KpiStripProps {
  readonly totals: readonly CurrencyTotals[];
  /** The currency on show: the focused client's, else the switcher's. */
  readonly currency: string;
  /** The focused client; its figures replace the portfolio's and lock the switcher. */
  readonly client?: ClientRow;
  readonly onCurrencyChange: (currency: string) => void;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/** Four receivables tiles and the USD/EUR/GBP switcher above the focus band. */
export function KpiStrip({
  totals,
  currency,
  client,
  onCurrencyChange,
}: KpiStripProps) {
  const total = totals.find((t) => t.currency === currency);
  const open = client?.openCents ?? total?.openCents ?? 0;
  const overdue = client?.overdueCents ?? total?.overdueCents ?? 0;
  const unapplied = client?.unappliedCents ?? total?.unappliedCents ?? 0;
  const days = client
    ? client.averageDaysToPay
    : (total?.averageDaysToPay ?? null);
  const tiles = [
    {
      label: 'Open',
      value: wholeMoney(open, currency),
      note: client
        ? plural(client.openInvoiceCount, 'open invoice')
        : plural(total?.clientCount ?? 0, 'client'),
    },
    {
      label: 'Overdue',
      value: wholeMoney(overdue, currency),
      note: open ? `${Math.round((overdue / open) * 100)}% of open` : 'Nothing open',
    },
    {
      label: 'Unapplied',
      value: wholeMoney(unapplied, currency),
      note: client
        ? 'Cash to match'
        : `${plural(total?.unappliedPaymentCount ?? 0, 'payment')} to match`,
    },
    {
      label: 'Days to pay',
      value: days === null ? '—' : String(days),
      note: 'Average, invoice to payment',
    },
  ];
  return (
    <section className="kpi-strip" aria-label="Ledger totals">
      <div className="currency-switcher" role="group" aria-label="Currency">
        {SWITCHER_CURRENCIES.map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={code === currency}
            disabled={Boolean(client) && code !== currency}
            title={client ? `Locked to ${client.name}’s currency` : undefined}
            onClick={() => onCurrencyChange(code)}
          >
            {code}
          </button>
        ))}
      </div>
      {tiles.map((tile) => (
        <article key={tile.label}>
          <span>{tile.label}</span>
          <strong>{tile.value}</strong>
          <small>{tile.note}</small>
        </article>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-react -- kpi-strip`
Expected: PASS (3 tests).

- [ ] **Step 5: Build, lint, format, commit**

```bash
npx prettier --write examples/invoicing/react/src/kpi-strip.tsx examples/invoicing/react/src/kpi-strip.test.tsx
npx nx run-many -t build,lint -p invoicing-react
git add examples/invoicing/react/src/kpi-strip.tsx examples/invoicing/react/src/kpi-strip.test.tsx
git commit -m "feat(invoicing): KPI strip with a currency switcher that locks to the focused client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Status dot and focus band

**Files:**
- Create: `examples/invoicing/react/src/status-dot.tsx`
- Create: `examples/invoicing/react/src/focus-band.tsx`
- Create: `examples/invoicing/react/src/focus-band.test.tsx`

The band reuses the assistant's `TrendChart` and `AgingSummary`, which read the ledger from `SnapshotContext` and already carry the hover layer and "Show data" table views. An invoice focus outlines its age bar through a `data-outline-bucket` attribute that CSS (Task 14) targets, so the chart components stay untouched. Keying the chart wrapper by client restarts the 120 ms crossfade on every focus change.

- [ ] **Step 1: Write the status dot**

`examples/invoicing/react/src/status-dot.tsx`:

```tsx
import type { StatusTone } from './ledger-views';

/** A state as a coloured dot plus a word, so colour never carries meaning alone. */
export function StatusDot({
  tone,
  label,
}: {
  readonly tone: StatusTone;
  readonly label: string;
}) {
  return (
    <span className="status-dot" data-tone={tone}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Write the failing band tests**

`examples/invoicing/react/src/focus-band.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import type {
  ClientRow,
  InvoiceRow,
  LedgerSnapshot,
} from '@invoicing/contracts';
import { FocusBand } from './focus-band';
import { SnapshotContext } from './snapshot-context';

const snapshot: LedgerSnapshot = {
  customers: [
    {
      id: 'thistle',
      name: 'Thistle Retail',
      currency: 'GBP',
      profile: 'late-drifting',
    },
  ],
  invoices: [
    {
      id: 't1',
      customerId: 'thistle',
      reference: 'INV-T1',
      date: '2026-07-20',
      currency: 'GBP',
      amountCents: 200000,
      outstandingCents: 200000,
      version: 1,
    },
  ],
  payments: [],
  allocations: [],
  activities: [],
};

const thistle: ClientRow = {
  id: 'thistle',
  name: 'Thistle Retail',
  currency: 'GBP',
  profile: 'late-drifting',
  openCents: 200000,
  overdueCents: 200000,
  aging: {
    current: 0,
    days1to30: 200000,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  },
  openInvoiceCount: 1,
  averageDaysToPay: null,
  unappliedCents: 0,
};

const invoice: InvoiceRow = {
  id: 't1',
  reference: 'INV-T1',
  clientId: 'thistle',
  clientName: 'Thistle Retail',
  currency: 'GBP',
  type: 'One-off',
  issued: '2026-07-20',
  amountCents: 200000,
  balanceCents: 200000,
  daysOverdue: 27,
  bucket: 'days1to30',
  status: { kind: 'overdue', days: 27 },
};

const withSnapshot = (ui: ReactNode) =>
  render(
    <SnapshotContext.Provider value={snapshot}>{ui}</SnapshotContext.Provider>,
  );

test('with nothing focused the band charts the whole currency', () => {
  cleanup();

  withSnapshot(<FocusBand currency="USD" onClear={vi.fn()} />);

  expect(
    screen.getByRole('heading', { name: 'All USD clients' }),
  ).toBeVisible();
  expect(
    screen.getByRole('figure', { name: /Invoiced vs received · USD$/ }),
  ).toBeVisible();
  expect(screen.getByRole('figure', { name: /Aging · USD$/ })).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Clear focus' }),
  ).not.toBeInTheDocument();
});

test('a focused client names its habit, charts only that client, and can be cleared', () => {
  cleanup();
  const onClear = vi.fn();
  withSnapshot(
    <FocusBand currency="GBP" client={thistle} onClear={onClear} />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Clear focus' }));

  expect(
    screen.getByRole('heading', { name: 'Thistle Retail' }),
  ).toBeVisible();
  expect(screen.getByText('Late, drifting')).toBeVisible();
  expect(
    screen.getByRole('figure', { name: 'Aging · GBP · thistle' }),
  ).toBeVisible();
  expect(onClear).toHaveBeenCalledOnce();
});

test('a focused invoice is named and its age bucket is outlined', () => {
  cleanup();

  const { container } = withSnapshot(
    <FocusBand
      currency="GBP"
      client={thistle}
      invoice={invoice}
      onClear={vi.fn()}
    />,
  );

  expect(screen.getByText('INV-T1 · £2,000 open')).toBeVisible();
  expect(container.querySelector('.band-charts')).toHaveAttribute(
    'data-outline-bucket',
    'days1to30',
  );
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx nx test invoicing-react -- focus-band`
Expected: FAIL with `Failed to resolve import "./focus-band"`.

- [ ] **Step 4: Implement**

`examples/invoicing/react/src/focus-band.tsx`:

```tsx
import type { ClientRow, InvoiceRow } from '@invoicing/contracts';
import { AgingSummary, TrendChart } from './assistant-charts';
import { HABITS, wholeMoney } from './ledger-views';
import { StatusDot } from './status-dot';

/** Inputs for {@link FocusBand}. */
export interface FocusBandProps {
  readonly currency: string;
  readonly client?: ClientRow;
  readonly invoice?: InvoiceRow;
  readonly onClear: () => void;
}

/**
 * The fixed-height band of charts under the KPI strip: every client in one
 * currency, or the focused client. Reads the ledger from `SnapshotContext`.
 */
export function FocusBand({
  currency,
  client,
  invoice,
  onClear,
}: FocusBandProps) {
  const customerId = client?.id ?? null;
  return (
    <section className="focus-band" aria-label="Focus">
      <header className="focus-header">
        <h2>{client ? client.name : `All ${currency} clients`}</h2>
        {client && <StatusDot {...HABITS[client.profile]} />}
        {invoice && (
          <span className="focus-record">
            {invoice.reference} ·{' '}
            {wholeMoney(invoice.balanceCents, invoice.currency)} open
          </span>
        )}
        {client && (
          <button
            type="button"
            className="focus-clear"
            aria-label="Clear focus"
            aria-keyshortcuts="Escape"
            onClick={onClear}
          >
            ✕
          </button>
        )}
      </header>
      <div
        className="band-charts"
        key={customerId ?? currency}
        data-outline-bucket={invoice?.bucket ?? undefined}
      >
        <TrendChart currency={currency} customerId={customerId} months={6} />
        <AgingSummary currency={currency} customerId={customerId} />
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx nx test invoicing-react -- focus-band`
Expected: PASS (3 tests).

- [ ] **Step 6: Build, lint, format, commit**

```bash
npx prettier --write examples/invoicing/react/src/status-dot.tsx examples/invoicing/react/src/focus-band.tsx examples/invoicing/react/src/focus-band.test.tsx
npx nx run-many -t build,lint -p invoicing-react
git add examples/invoicing/react/src/status-dot.tsx examples/invoicing/react/src/focus-band.tsx examples/invoicing/react/src/focus-band.test.tsx
git commit -m "feat(invoicing): focus band charts the currency or the focused client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Shared grid columns and the Clients grid

**Files:**
- Create: `examples/invoicing/react/src/grid-columns.tsx`
- Create: `examples/invoicing/react/src/clients-grid.tsx`
- Create: `examples/invoicing/react/src/clients-grid.test.tsx`

Pretable 0.20.2 facts this task relies on (verified with a throwaway probe on 2026-09-28):

- Grouping is part of the controlled query: `query.rowGroups: [{ columnId: 'currency' }]`, with `query` and `onQueryChange` passed together. There is no `initialQuery`, so the query lives in `useState`. The grouped column is hidden automatically.
- `aggregate: 'sum'` plus `formatAggregate({ value, group })` gives per-group totals; `group.value` is the currency.
- Group order needs a `compare` on the grouping column. Pretable honours it at runtime, but the loose `PretableColumn` type does not declare it, hence the typed spread in `currencyColumn`.
- The app drives selection with `state.rowSelection = { kind: 'explicit', rowIds }` and **no** `rowSelectionColumn`. `onRowActivate` fires on click and Enter/Space; `onFocusChange` fires with `ref.kind === 'data'` on click and ↑/↓. A click fires both, so `onSelect` must be idempotent (the reducer returns the same object).
- Once grouped, the grid's role is `treegrid`. Selected rows carry `aria-selected="true"`; group rows carry `data-pretable-group-row`, with `[data-pretable-group-label]` inside.
- Header clicks re-sort asynchronously; tests must `waitFor`.
- Vitest here has no automatic cleanup: every test calls `cleanup()` first.
- jsdom renders only the rows that fit `viewportHeight` at 44 px each, so tests pass a tall `viewportHeight`.

- [ ] **Step 1: Write the shared columns**

`examples/invoicing/react/src/grid-columns.tsx`:

```tsx
import type { PretableColumn } from '@pretable/react';
import { wholeMoney } from './ledger-views';

/** Sort currency codes with `first` on top, then alphabetically. */
export function currencyGroupOrder(first: string) {
  // Must return 0 for equal codes: Pretable uses compare for group identity too.
  return (a: string, b: string) =>
    a === b ? 0 : a === first ? -1 : b === first ? 1 : a.localeCompare(b);
}

/**
 * The hidden column the dashboard grids group by. Its `compare` puts the
 * switcher's currency group first; Pretable 0.20.2 honours `compare` at
 * runtime but leaves it off the loose `PretableColumn` type.
 */
export function currencyColumn<Row extends { readonly currency: string }>(
  first: string,
): PretableColumn<Row> {
  return {
    id: 'currency',
    header: 'Currency',
    type: 'text',
    value: (row) => row.currency,
    ...({ compare: currencyGroupOrder(first) } as object),
  };
}

/** A right-aligned whole-unit money column, summed per currency group. */
export function moneyColumn<Row extends { readonly currency: string }>(
  id: string,
  header: string,
  cents: (row: Row) => number,
): PretableColumn<Row> {
  return {
    id,
    header,
    widthPx: 110,
    type: 'number',
    value: cents,
    aggregate: 'sum',
    format: ({ row }) => wholeMoney(cents(row), row.currency),
    formatAggregate: ({ value, group }) =>
      wholeMoney(value as number, String(group.value)),
  };
}
```

- [ ] **Step 2: Write the failing grid tests**

`examples/invoicing/react/src/clients-grid.test.tsx`:

```tsx
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { ClientRow, PaymentProfile } from '@invoicing/contracts';
import { ClientsGrid } from './clients-grid';

const client = (
  id: string,
  name: string,
  currency: string,
  openCents: number,
  overdueCents: number,
  profile: PaymentProfile = 'on-time',
): ClientRow => ({
  id,
  name,
  currency,
  profile,
  openCents,
  overdueCents,
  aging: {
    current: openCents - overdueCents,
    days1to30: overdueCents,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  },
  openInvoiceCount: 1,
  averageDaysToPay: 20,
  unappliedCents: 0,
});

const rows = [
  client('acme', 'Acme', 'USD', 100000, 20000),
  client('cobalt', 'Cobalt', 'USD', 300000, 250000, 'late-fixed'),
  client('echo', 'Echo', 'USD', 30000, 0),
  client('birch', 'Birch', 'GBP', 50000, 40000, 'late-drifting'),
  client('delta', 'Delta', 'GBP', 70000, 5000),
];

const dataRowIds = () =>
  [
    ...document.querySelectorAll('[data-pretable-row][data-pretable-row-id]'),
  ].map((row) => row.getAttribute('data-pretable-row-id'));

test('groups clients by currency with the switcher currency first and per-group totals', () => {
  cleanup();

  render(
    <ClientsGrid
      rows={rows}
      currency="GBP"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  const groups = [
    ...document.querySelectorAll<HTMLElement>('[data-pretable-group-row]'),
  ];
  expect(
    groups.map(
      (g) => g.querySelector('[data-pretable-group-label]')?.textContent,
    ),
  ).toEqual(['GBP', 'USD']);
  expect(within(groups[0]).getByText('£1,200')).toBeVisible();
  expect(within(groups[1]).getByText('$4,300')).toBeVisible();
  expect(dataRowIds()).toEqual(['birch', 'delta', 'cobalt', 'acme', 'echo']);
});

test('habit reads as a word and aging as a labelled bar', () => {
  cleanup();

  render(
    <ClientsGrid
      rows={rows}
      currency="USD"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(screen.getByText('Late, drifting')).toBeVisible();
  expect(
    screen.getByRole('img', {
      name: 'Current £100, 1-30 days £400, 31-60 days £0, 61-90 days £0, Over 90 days £0',
    }),
  ).toBeVisible();
});

test('the selected client is marked', () => {
  cleanup();

  render(
    <ClientsGrid
      rows={rows}
      currency="USD"
      selectedId="delta"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(
    document.querySelector('[data-pretable-row-id="delta"]'),
  ).toHaveAttribute('aria-selected', 'true');
  expect(
    document.querySelectorAll('[role="row"][aria-selected="true"]'),
  ).toHaveLength(1);
});

test('clicking a client reports it', () => {
  cleanup();
  const onSelect = vi.fn();
  render(
    <ClientsGrid
      rows={rows}
      currency="USD"
      onSelect={onSelect}
      viewportHeight={600}
    />,
  );

  fireEvent.click(screen.getByText('Birch'));

  expect(onSelect).toHaveBeenCalledWith('birch');
});

test('arrow keys move to the next client', () => {
  cleanup();
  const onSelect = vi.fn();
  render(
    <ClientsGrid
      rows={rows}
      currency="USD"
      onSelect={onSelect}
      viewportHeight={600}
    />,
  );
  fireEvent.click(screen.getByText('Cobalt'));
  onSelect.mockClear();

  fireEvent.keyDown(screen.getByRole('treegrid', { name: 'Clients' }), {
    key: 'ArrowDown',
  });

  expect(onSelect).toHaveBeenLastCalledWith('acme');
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx nx test invoicing-react -- clients-grid`
Expected: FAIL with `Failed to resolve import "./clients-grid"`.

- [ ] **Step 4: Implement**

`examples/invoicing/react/src/clients-grid.tsx`:

```tsx
import {
  type PretableColumn,
  PretableSurface,
  type PretableSurfaceProps,
} from '@pretable/react';
import { AGING_BUCKETS, type ClientRow } from '@invoicing/contracts';
import { useMemo, useState } from 'react';
import { AGE_RAMP } from './chart-primitives';
import { currencyColumn, moneyColumn } from './grid-columns';
import { BUCKET_LABELS, HABITS, wholeMoney } from './ledger-views';
import { StatusDot } from './status-dot';

type Query = NonNullable<PretableSurfaceProps<ClientRow>['query']>;

const INITIAL_QUERY: Query = {
  filters: [],
  sort: [{ columnId: 'overdue', direction: 'desc' }],
  rowGroups: [{ columnId: 'currency' }],
};

/** Inputs for {@link ClientsGrid}. */
export interface ClientsGridProps {
  readonly rows: ClientRow[];
  /** The currency whose group comes first. */
  readonly currency: string;
  readonly selectedId?: string;
  readonly onSelect: (clientId: string) => void;
  readonly viewportHeight?: number;
}

function AgeBar({ row }: { readonly row: ClientRow }) {
  const label = AGING_BUCKETS.map(
    (bucket) =>
      `${BUCKET_LABELS[bucket]} ${wholeMoney(row.aging[bucket], row.currency)}`,
  ).join(', ');
  return (
    <span className="age-bar" role="img" aria-label={label}>
      {AGING_BUCKETS.map(
        (bucket, index) =>
          row.aging[bucket] > 0 && (
            <i
              key={bucket}
              style={{ flexGrow: row.aging[bucket], background: AGE_RAMP[index] }}
            />
          ),
      )}
    </span>
  );
}

/** Every client, grouped by currency and sorted by overdue; a row click focuses the client. */
export function ClientsGrid({
  rows,
  currency,
  selectedId,
  onSelect,
  viewportHeight = 420,
}: ClientsGridProps) {
  const [query, setQuery] = useState<Query>(INITIAL_QUERY);
  const columns = useMemo<PretableColumn<ClientRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Client',
        pinned: 'left',
        flex: 2,
        minWidthPx: 170,
        type: 'text',
        value: (row) => row.name,
      },
      currencyColumn<ClientRow>(currency),
      moneyColumn<ClientRow>('open', 'Open', (row) => row.openCents),
      moneyColumn<ClientRow>('overdue', 'Overdue', (row) => row.overdueCents),
      {
        id: 'aging',
        header: 'Aging',
        widthPx: 120,
        sortable: false,
        type: 'number',
        value: (row) =>
          row.openCents ? 1 - row.aging.current / row.openCents : 0,
        render: ({ row }) => <AgeBar row={row} />,
      },
      {
        id: 'openInvoices',
        header: 'Open invoices',
        widthPx: 110,
        type: 'number',
        value: (row) => row.openInvoiceCount,
      },
      {
        id: 'daysToPay',
        header: 'Days to pay',
        widthPx: 100,
        type: 'number',
        value: (row) => row.averageDaysToPay ?? -1,
        format: ({ row }) =>
          row.averageDaysToPay === null ? '—' : String(row.averageDaysToPay),
      },
      {
        id: 'habit',
        header: 'Habit',
        widthPx: 150,
        type: 'text',
        value: (row) => HABITS[row.profile].label,
        render: ({ row }) => <StatusDot {...HABITS[row.profile]} />,
      },
      moneyColumn<ClientRow>(
        'unapplied',
        'Unapplied',
        (row) => row.unappliedCents,
      ),
    ],
    [currency],
  );
  return (
    <div className="dashboard-grid" data-density="compact">
      <PretableSurface
        rows={rows}
        columns={columns}
        getRowId={(row: ClientRow) => row.id}
        ariaLabel="Clients"
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
        onRowActivate={({ rowId }) => onSelect(rowId)}
        onFocusChange={({ ref }) => {
          if (ref?.kind === 'data') onSelect(ref.rowId);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx nx test invoicing-react -- clients-grid`
Expected: PASS (5 tests). If the group totals text differs, print `groups[0].textContent` before changing anything: `formatAggregate` output is the contract.

- [ ] **Step 6: Build, lint, format, commit**

```bash
npx prettier --write examples/invoicing/react/src/grid-columns.tsx examples/invoicing/react/src/clients-grid.tsx examples/invoicing/react/src/clients-grid.test.tsx
npx nx run-many -t build,lint -p invoicing-react
git add examples/invoicing/react/src/grid-columns.tsx examples/invoicing/react/src/clients-grid.tsx examples/invoicing/react/src/clients-grid.test.tsx
git commit -m "feat(invoicing): Clients grid grouped by currency with per-group totals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Invoices grid with filter chips

**Files:**
- Create: `examples/invoicing/react/src/invoices-grid.tsx`
- Create: `examples/invoicing/react/src/invoices-grid.test.tsx`

Chips are local state (Open by default). With a client focused, the grid shows only that client's invoices, so Clients → Invoices keeps the focus.

- [ ] **Step 1: Write the failing tests**

```tsx
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { InvoiceRow } from '@invoicing/contracts';
import { InvoicesGrid } from './invoices-grid';

const invoice = (
  id: string,
  clientId: string,
  currency: string,
  balanceCents: number,
  daysOverdue: number,
): InvoiceRow => ({
  id,
  reference: `INV-${id}`,
  clientId,
  clientName: clientId.toUpperCase(),
  currency,
  type: 'Retainer',
  issued: '2026-08-01',
  amountCents: 100000,
  balanceCents,
  daysOverdue,
  bucket: balanceCents === 0 ? null : daysOverdue > 0 ? 'days1to30' : 'current',
  status:
    balanceCents === 0
      ? { kind: 'paid' }
      : daysOverdue > 0
        ? { kind: 'overdue', days: daysOverdue }
        : { kind: 'current' },
});

const rows = [
  invoice('a1', 'acme', 'USD', 20000, 0),
  invoice('a2', 'acme', 'USD', 90000, 12),
  invoice('a3', 'acme', 'USD', 0, 0),
  invoice('b1', 'birch', 'USD', 50000, 40),
  invoice('t1', 'thistle', 'GBP', 70000, 0),
];

const dataRowIds = () =>
  [
    ...document.querySelectorAll('[data-pretable-row][data-pretable-row-id]'),
  ].map((row) => row.getAttribute('data-pretable-row-id'));

test('defaults to open invoices, largest balance first, with status words', () => {
  cleanup();

  render(
    <InvoicesGrid
      rows={rows}
      currency="USD"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(dataRowIds()).toEqual(['a2', 'b1', 'a1', 't1']);
  expect(screen.getByRole('button', { name: 'Open 4' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByText('12 days overdue')).toBeVisible();
  expect(screen.getByText('40 days overdue')).toBeVisible();
});

test('chips switch between overdue, paid and all', async () => {
  cleanup();
  render(
    <InvoicesGrid
      rows={rows}
      currency="USD"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Overdue 2' }));
  await waitFor(() => expect(dataRowIds()).toEqual(['a2', 'b1']));
  fireEvent.click(screen.getByRole('button', { name: 'Paid 1' }));
  await waitFor(() => expect(dataRowIds()).toEqual(['a3']));
  fireEvent.click(screen.getByRole('button', { name: 'All 5' }));

  await waitFor(() => expect(dataRowIds()).toHaveLength(5));
});

test('a focused client narrows the grid to its invoices', () => {
  cleanup();

  render(
    <InvoicesGrid
      rows={rows}
      currency="USD"
      clientId="acme"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(dataRowIds()).toEqual(['a2', 'a1']);
  expect(screen.getByRole('button', { name: 'Open 2' })).toBeVisible();
});

test('clicking an invoice reports it with its client', () => {
  cleanup();
  const onSelect = vi.fn();
  render(
    <InvoicesGrid
      rows={rows}
      currency="USD"
      onSelect={onSelect}
      viewportHeight={600}
    />,
  );

  fireEvent.click(screen.getByText('INV-b1'));

  expect(onSelect).toHaveBeenCalledWith('b1', 'birch');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- invoices-grid`
Expected: FAIL with `Failed to resolve import "./invoices-grid"`.

- [ ] **Step 3: Implement**

```tsx
import {
  type PretableColumn,
  PretableSurface,
  type PretableSurfaceProps,
} from '@pretable/react';
import type { InvoiceRow } from '@invoicing/contracts';
import { useMemo, useState } from 'react';
import { currencyColumn, moneyColumn } from './grid-columns';
import { invoiceStatusLabel } from './ledger-views';
import { StatusDot } from './status-dot';

type Query = NonNullable<PretableSurfaceProps<InvoiceRow>['query']>;

const INITIAL_QUERY: Query = {
  filters: [],
  sort: [{ columnId: 'balance', direction: 'desc' }],
  rowGroups: [{ columnId: 'currency' }],
};

/** The Invoices tab's filter chips, in display order. */
export const INVOICE_FILTERS = [
  { id: 'open', label: 'Open', keep: (row: InvoiceRow) => row.balanceCents > 0 },
  {
    id: 'overdue',
    label: 'Overdue',
    keep: (row: InvoiceRow) => row.balanceCents > 0 && row.daysOverdue > 0,
  },
  { id: 'paid', label: 'Paid', keep: (row: InvoiceRow) => row.balanceCents === 0 },
  { id: 'all', label: 'All', keep: () => true },
] as const;

/** One of {@link INVOICE_FILTERS}. */
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number]['id'];

/** Inputs for {@link InvoicesGrid}. */
export interface InvoicesGridProps {
  readonly rows: InvoiceRow[];
  /** The currency whose group comes first. */
  readonly currency: string;
  /** The focused client; when set, only its invoices show. */
  readonly clientId?: string;
  readonly selectedId?: string;
  readonly onSelect: (invoiceId: string, clientId: string) => void;
  readonly viewportHeight?: number;
}

/** Invoices grouped by currency with Open/Overdue/Paid/All chips; a row click focuses the invoice and its client. */
export function InvoicesGrid({
  rows,
  currency,
  clientId,
  selectedId,
  onSelect,
  viewportHeight = 420,
}: InvoicesGridProps) {
  const [filter, setFilter] = useState<InvoiceFilter>('open');
  const [query, setQuery] = useState<Query>(INITIAL_QUERY);
  const scoped = useMemo(
    () => (clientId ? rows.filter((row) => row.clientId === clientId) : rows),
    [rows, clientId],
  );
  const chip =
    INVOICE_FILTERS.find((candidate) => candidate.id === filter) ??
    INVOICE_FILTERS[0];
  const visible = useMemo(() => scoped.filter(chip.keep), [scoped, chip]);
  const clientOf = useMemo(
    () => new Map(rows.map((row) => [row.id, row.clientId])),
    [rows],
  );
  const select = (invoiceId: string) => {
    const owner = clientOf.get(invoiceId);
    if (owner) onSelect(invoiceId, owner);
  };
  const columns = useMemo<PretableColumn<InvoiceRow>[]>(
    () => [
      {
        id: 'reference',
        header: 'Invoice',
        pinned: 'left',
        flex: 2,
        minWidthPx: 190,
        type: 'text',
        value: (row) => row.reference,
      },
      currencyColumn<InvoiceRow>(currency),
      {
        id: 'client',
        header: 'Client',
        flex: 1,
        minWidthPx: 140,
        type: 'text',
        value: (row) => row.clientName,
      },
      {
        id: 'type',
        header: 'Type',
        widthPx: 100,
        type: 'text',
        value: (row) => row.type,
      },
      {
        id: 'issued',
        header: 'Issued',
        widthPx: 100,
        type: 'text',
        value: (row) => row.issued || '—',
      },
      moneyColumn<InvoiceRow>('amount', 'Amount', (row) => row.amountCents),
      moneyColumn<InvoiceRow>('balance', 'Balance', (row) => row.balanceCents),
      {
        id: 'status',
        header: 'Status',
        widthPx: 180,
        type: 'number',
        value: (row) => (row.balanceCents === 0 ? -1 : row.daysOverdue),
        render: ({ row }) => <StatusDot {...invoiceStatusLabel(row.status)} />,
      },
    ],
    [currency],
  );
  return (
    <>
      <div className="filter-chips" role="group" aria-label="Invoice filter">
        {INVOICE_FILTERS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === filter}
            onClick={() => setFilter(candidate.id)}
          >
            {candidate.label}{' '}
            <span className="chip-count">
              {scoped.filter(candidate.keep).length}
            </span>
          </button>
        ))}
      </div>
      <div className="dashboard-grid" data-density="compact">
        <PretableSurface
          rows={visible}
          columns={columns}
          getRowId={(row: InvoiceRow) => row.id}
          ariaLabel="Invoices"
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
    </>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-react -- invoices-grid`
Expected: PASS (4 tests).

- [ ] **Step 5: Build, lint, format, commit**

```bash
npx prettier --write examples/invoicing/react/src/invoices-grid.tsx examples/invoicing/react/src/invoices-grid.test.tsx
npx nx run-many -t build,lint -p invoicing-react
git add examples/invoicing/react/src/invoices-grid.tsx examples/invoicing/react/src/invoices-grid.test.tsx
git commit -m "feat(invoicing): Invoices grid with Open, Overdue, Paid and All chips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Dashboard view: strip, band, tabs and keyboard

**Files:**
- Create: `examples/invoicing/react/src/dashboard-view.tsx`
- Create: `examples/invoicing/react/src/dashboard-view.test.tsx`

The view is controlled: it renders a `Focus` and reports `FocusAction`s. The grids order their currency groups by the switcher's own value (`focus.currency`), not the focused client's currency, so selecting a client never reorders the rows under the pointer. It provides `SnapshotContext` for the band's charts. Keys: `1` and `2` switch tabs, `Esc` clears, and ↑/↓/Home/End come from Pretable.

- [ ] **Step 1: Write the failing tests**

```tsx
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { expect, test } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import { DashboardView } from './dashboard-view';
import { DEFAULT_FOCUS, type Focus, focusReducer } from './focus';

const snapshot: LedgerSnapshot = {
  customers: [
    { id: 'acme', name: 'Acme', currency: 'USD', profile: 'on-time' },
    { id: 'birch', name: 'Birch', currency: 'USD', profile: 'late-fixed' },
    {
      id: 'thistle',
      name: 'Thistle Retail',
      currency: 'GBP',
      profile: 'late-drifting',
    },
  ],
  invoices: [
    { id: 'a1', customerId: 'acme', reference: 'INV-A1', date: '2026-09-01', currency: 'USD', amountCents: 50000, outstandingCents: 50000, version: 1 },
    { id: 'b1', customerId: 'birch', reference: 'INV-B1', date: '2026-06-01', currency: 'USD', amountCents: 90000, outstandingCents: 90000, version: 1 },
    { id: 't1', customerId: 'thistle', reference: 'INV-T1', date: '2026-07-20', currency: 'GBP', amountCents: 200000, outstandingCents: 200000, version: 1 },
    { id: 't2', customerId: 'thistle', reference: 'INV-T2', date: '2026-09-10', currency: 'GBP', amountCents: 100000, outstandingCents: 100000, version: 1 },
  ],
  payments: [],
  allocations: [],
  activities: [],
};

function Harness({ initial = DEFAULT_FOCUS }: { readonly initial?: Focus }) {
  const [focus, setFocus] = useState(initial);
  return (
    <DashboardView
      snapshot={snapshot}
      focus={focus}
      onFocus={(action) => setFocus((current) => focusReducer(current, action))}
      gridHeight={600}
    />
  );
}

const strip = () => screen.getByRole('region', { name: 'Ledger totals' });

test('opens on the Clients tab with the USD portfolio in the band', () => {
  cleanup();

  render(<Harness />);

  expect(screen.getByRole('tab', { name: /Clients/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(
    screen.getByRole('heading', { name: 'All USD clients' }),
  ).toBeVisible();
  expect(within(strip()).getByText('$1,400')).toBeVisible();
});

test('selecting a client row focuses the band and strip and locks the switcher', () => {
  cleanup();
  render(<Harness />);

  fireEvent.click(screen.getByText('Thistle Retail'));

  expect(
    screen.getByRole('heading', { name: 'Thistle Retail' }),
  ).toBeVisible();
  expect(within(strip()).getByText('£3,000')).toBeVisible();
  expect(screen.getByRole('button', { name: 'USD' })).toBeDisabled();
});

test('Escape clears the focus', () => {
  cleanup();
  render(<Harness initial={{ ...DEFAULT_FOCUS, clientId: 'thistle' }} />);

  fireEvent.keyDown(screen.getByRole('treegrid', { name: 'Clients' }), {
    key: 'Escape',
  });

  expect(
    screen.getByRole('heading', { name: 'All USD clients' }),
  ).toBeVisible();
});

test('key 2 opens Invoices, still scoped to the focused client', () => {
  cleanup();
  render(<Harness initial={{ ...DEFAULT_FOCUS, clientId: 'thistle' }} />);

  fireEvent.keyDown(screen.getByRole('treegrid', { name: 'Clients' }), {
    key: '2',
  });

  expect(screen.getByRole('tab', { name: /Invoices/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getByText('INV-T1')).toBeVisible();
  expect(screen.queryByText('INV-A1')).not.toBeInTheDocument();
});

test('selecting an invoice focuses its client and outlines its age bucket', () => {
  cleanup();
  const { container } = render(
    <Harness initial={{ ...DEFAULT_FOCUS, tab: 'invoices' }} />,
  );

  fireEvent.click(screen.getByText('INV-T1'));

  expect(
    screen.getByRole('heading', { name: 'Thistle Retail' }),
  ).toBeVisible();
  expect(container.querySelector('.band-charts')).toHaveAttribute(
    'data-outline-bucket',
    'days1to30',
  );
});
```

Expected figures: USD open is $500 + $900 = $1,400 (overdue is only Birch's $900, since INV-A1 is current); Thistle open is £2,000 + £1,000 = £3,000; INV-T1 is 57 days old on 2026-09-15, so 27 days past terms, bucket `days1to30`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- dashboard-view`
Expected: FAIL with `Failed to resolve import "./dashboard-view"`.

- [ ] **Step 3: Implement**

```tsx
import {
  clientRows,
  currencyTotals,
  invoiceRows,
  type LedgerSnapshot,
} from '@invoicing/contracts';
import { type KeyboardEvent, useMemo } from 'react';
import { ClientsGrid } from './clients-grid';
import {
  DASHBOARD_TABS,
  type DashboardTab,
  type Focus,
  type FocusAction,
} from './focus';
import { FocusBand } from './focus-band';
import { InvoicesGrid } from './invoices-grid';
import { KpiStrip } from './kpi-strip';
import { AS_OF } from './ledger-views';
import { SnapshotContext } from './snapshot-context';

const TAB_LABELS: Record<DashboardTab, string> = {
  clients: 'Clients',
  invoices: 'Invoices',
};

/** Inputs for {@link DashboardView}. */
export interface DashboardViewProps {
  readonly snapshot: LedgerSnapshot;
  readonly focus: Focus;
  readonly onFocus: (action: FocusAction) => void;
  /** Grid viewport height in px; tests raise it because jsdom has no layout. */
  readonly gridHeight?: number;
}

/**
 * The grid-centred dashboard: KPI strip, fixed-height focus band and one
 * tabbed grid, all reading one {@link Focus}. Keys 1–2 switch tabs; Esc clears.
 */
export function DashboardView({
  snapshot,
  focus,
  onFocus,
  gridHeight = 420,
}: DashboardViewProps) {
  const totals = useMemo(() => currencyTotals(snapshot, AS_OF), [snapshot]);
  const clients = useMemo(() => clientRows(snapshot, AS_OF), [snapshot]);
  const invoices = useMemo(() => invoiceRows(snapshot, AS_OF), [snapshot]);
  const client = clients.find((row) => row.id === focus.clientId);
  const invoice = focus.record
    ? invoices.find((row) => row.id === focus.record?.id)
    : undefined;
  const currency = client?.currency ?? focus.currency;
  const counts: Record<DashboardTab, number> = {
    clients: clients.length,
    invoices: invoices.filter((row) => row.balanceCents > 0).length,
  };

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]'))
      return;
    if (event.key === 'Escape') {
      onFocus({ type: 'clear' });
      return;
    }
    const tab = /^[1-9]$/.test(event.key)
      ? DASHBOARD_TABS[Number(event.key) - 1]
      : undefined;
    if (tab) onFocus({ type: 'set-tab', tab });
  }

  return (
    <SnapshotContext.Provider value={snapshot}>
      <div className="dashboard" onKeyDown={onKeyDown}>
        <KpiStrip
          totals={totals}
          currency={currency}
          client={client}
          onCurrencyChange={(code) =>
            onFocus({ type: 'set-currency', currency: code })
          }
        />
        <FocusBand
          currency={currency}
          client={client}
          invoice={invoice}
          onClear={() => onFocus({ type: 'clear' })}
        />
        <div className="dashboard-tabs" role="tablist" aria-label="Ledger views">
          {DASHBOARD_TABS.map((tab, index) => (
            <button
              key={tab}
              id={`dashboard-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={focus.tab === tab}
              aria-controls="dashboard-panel"
              aria-keyshortcuts={String(index + 1)}
              onClick={() => onFocus({ type: 'set-tab', tab })}
            >
              {TAB_LABELS[tab]} <span className="tab-count">{counts[tab]}</span>
            </button>
          ))}
        </div>
        <div
          id="dashboard-panel"
          role="tabpanel"
          aria-labelledby={`dashboard-tab-${focus.tab}`}
        >
          {focus.tab === 'clients' ? (
            <ClientsGrid
              rows={clients}
              currency={focus.currency}
              selectedId={focus.clientId}
              onSelect={(clientId) =>
                onFocus({ type: 'select-client', clientId })
              }
              viewportHeight={gridHeight}
            />
          ) : (
            <InvoicesGrid
              rows={invoices}
              currency={focus.currency}
              clientId={focus.clientId}
              selectedId={focus.record?.id}
              onSelect={(invoiceId, clientId) =>
                onFocus({ type: 'select-invoice', invoiceId, clientId })
              }
              viewportHeight={gridHeight}
            />
          )}
        </div>
      </div>
    </SnapshotContext.Provider>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test invoicing-react -- dashboard-view`
Expected: PASS (5 tests). Escape and the digit keys bubble out of Pretable's treegrid to the wrapper (verified in a trial run).

- [ ] **Step 5: Build, lint, format, commit**

```bash
npx prettier --write examples/invoicing/react/src/dashboard-view.tsx examples/invoicing/react/src/dashboard-view.test.tsx
npx nx run-many -t build,lint -p invoicing-react
git add examples/invoicing/react/src/dashboard-view.tsx examples/invoicing/react/src/dashboard-view.test.tsx
git commit -m "feat(invoicing): dashboard view ties strip, band and tabbed grids to one focus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Put the dashboard in the app

**Files:**
- Modify: `examples/invoicing/react/src/App.tsx`
- Modify: `examples/invoicing/react/src/App.test.tsx`

The Dashboard page renders `DashboardView`. The payments grid, related invoices and match controls render on the Payments page only. The old `.stats` tiles and the 24-row "Monthly activity" table go: the strip replaces the tiles, and the band's trend chart has the table view. The focus lives in App, mirrored to the URL with `history.replaceState` so ↑/↓ never floods the back button.

- [ ] **Step 1: Update the App tests first**

In `examples/invoicing/react/src/App.test.tsx`:

1. Replace the body of `lands on Dashboard with canonical totals and an open Assistant` after `render(...)` with:

```tsx
  expect(
    screen.getByRole('heading', { name: 'Business overview' }),
  ).toBeVisible();
  // Open and Unapplied are both $2,400 in the one-invoice, one-payment fixture.
  expect(
    within(screen.getByRole('region', { name: 'Ledger totals' })).getAllByText(
      '$2,400',
    ),
  ).toHaveLength(2);
  expect(screen.getByRole('tab', { name: /Clients/ })).toBeVisible();
  expect(
    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
  ).toBeVisible();
```

2. In `preserves selected payment context when navigating between pages`, replace the `Related invoices` assertion (which ran on the Dashboard) with a return trip, so the test body after `render` reads:

```tsx
  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

  expect(
    screen.getByRole('heading', { name: 'Business overview' }),
  ).toBeVisible();
  expect(
    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
  ).toHaveTextContent('payment-001');
  expect(
    screen.getByRole('textbox', { name: 'Message assistant' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
  expect(
    screen.getByRole('region', { name: 'Related invoices' }),
  ).toHaveTextContent('invoice-001');
```

3. The payments UI now lives only on the Payments page. Insert `fireEvent.click(screen.getByRole('button', { name: 'Payments' }));` directly after the `render(...)` call in each of these tests:
   - `selects the newly checked payment even when it precedes the old selection`
   - `clears payment and invoice context when the selected row is unchecked`
   - `explicit matching starts one real chat and approval refreshes the ledger without changing selection`
   - `shows client metadata and defaults to unmatched payments`
   - `requires an invoice choice when a payment has multiple outstanding invoices`
   - `the Status column tells partially matched payments apart`

4. In `explicit matching starts one real chat…`, delete the line `fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));` that follows the second `Payments` click (the checkbox assertions after it need the Payments page). Then replace

```tsx
  expect(
    screen.getByRole('region', { name: 'Ledger totals' }),
  ).toHaveTextContent('1 payment to match');
```

with

```tsx
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
  expect(
    screen.getByRole('region', { name: 'Ledger totals' }),
  ).toHaveTextContent('1 payment to match');
```

5. Delete the test `derives monthly invoiced and received totals from record dates`. Its table is gone; `assistant-charts.test.tsx` covers the trend chart's table view.

6. Leave `an assistant review of an ambiguous payment selects it and focuses the invoice picker` unchanged: it starts on the Dashboard, and `chooseInvoice` must now switch to Payments for it to pass.

7. Add two tests at the end of the file:

```tsx
test('the dashboard focus drives the band and is mirrored to the URL', () => {
  cleanup();
  window.history.replaceState(null, '', '/');
  const ledger: LedgerSnapshot = {
    ...snapshot,
    customers: [
      {
        id: 'customer-001',
        name: 'Northstar Labs',
        currency: 'USD',
        profile: 'on-time',
      },
    ],
  };
  render(<App initialSnapshot={ledger} />);

  fireEvent.click(screen.getByText('Northstar Labs'));

  expect(
    screen.getByRole('heading', { name: 'Northstar Labs', level: 2 }),
  ).toBeVisible();
  expect(window.location.search).toBe('?client=customer-001');
  window.history.replaceState(null, '', '/');
});

test('a shared URL opens the dashboard on its focus, dropping ids the ledger does not know', () => {
  cleanup();
  window.history.replaceState(null, '', '/?tab=invoices&client=nobody');

  render(<App initialSnapshot={snapshot} />);

  expect(screen.getByRole('tab', { name: /Invoices/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(window.location.search).toBe('?tab=invoices');
  window.history.replaceState(null, '', '/');
});
```

- [ ] **Step 2: Run to verify the App tests fail**

Run: `npx nx test invoicing-react -- App`
Expected: FAIL. The strip, tabs and URL tests fail because the Dashboard still renders the old stats.

- [ ] **Step 3: Change `App.tsx`**

1. Imports. Replace the React and `./ledger-views` imports and add the new ones:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardView } from './dashboard-view';
import {
  type FocusAction,
  focusFromSearch,
  focusReducer,
  focusToSearch,
  sanitizeFocus,
} from './focus';
import { HABITS, money } from './ledger-views';
```

2. Delete the `totals` function, the `months` constant and the `unappliedPaymentCount` constant. Nothing else uses them once the old sections go, and `tsc` rejects the unused locals.

3. After the `handleBusyChange` declaration, add the focus state:

```tsx
  const [focusState, setFocusState] = useState(() =>
    focusFromSearch(window.location.search),
  );
  // Derived, not stored: ids the ledger does not know drop out as soon as it loads.
  const focus = useMemo(
    () => (snapshot ? sanitizeFocus(focusState, snapshot) : focusState),
    [focusState, snapshot],
  );
  function dispatchFocus(action: FocusAction) {
    setFocusState(focusReducer(focus, action));
  }
  useEffect(() => {
    const search = focusToSearch(focus);
    if (window.location.search === search) return;
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    );
  }, [focus]);
  const focusedClient = snapshot?.customers.find(
    (customer) => customer.id === focus.clientId,
  );
```

4. `chooseInvoice` brings the picker to the user, which now lives on the Payments page. Add `setPage('Payments');` as its first line.

5. Replace everything inside `{snapshot && (<> … </>)}` from `{page === 'Dashboard' && (<section className="stats"` through the closing `</section>` of the Related invoices panel with:

```tsx
              {page === 'Dashboard' && (
                <DashboardView
                  snapshot={snapshot}
                  focus={focus}
                  onFocus={dispatchFocus}
                />
              )}
              {page === 'Payments' && (
                <>
                  {/* The existing block, unchanged, from
                      <div className="section-heading"> through the closing
                      </section> of the Related invoices panel. */}
                </>
              )}
```

Move the existing JSX block, starting at `<div className="section-heading">` and ending at the Related invoices `</section>`, into that fragment unchanged. The comment marks where it goes; do not leave the comment in the file.

6. Change the Dashboard's muted intro to describe the new page. Replace `'Your invoices and incoming payments, in one place.'` with `'Select a client or invoice to focus the charts.'`.

7. In the assistant sidebar, show the focused client when no payment is selected. Replace the `<h2>` line and the `selected ? (…) : (…)` block that follows it with:

```tsx
          <h2>
            {selected
              ? 'Payment context'
              : focusedClient
                ? 'Client context'
                : 'Your business assistant'}
          </h2>
          {selected ? (
            <div className="selection-summary">
              <strong>{selected.reference ?? selected.id}</strong>
              <span>{selected.customerName ?? selected.customerId}</span>
              <span>
                {money(selected.unappliedCents, selected.currency)} unapplied
              </span>
            </div>
          ) : focusedClient ? (
            <div className="selection-summary">
              <strong>{focusedClient.name}</strong>
              <span>
                {focusedClient.currency} ·{' '}
                {HABITS[focusedClient.profile].label}
              </span>
            </div>
          ) : (
            <p className="muted">
              Select an incoming payment to bring its details into the
              conversation.
            </p>
          )}
```

8. Pass the focus to the assistant. On `<AssistantWorkspace`, after `selectedPaymentId={selected?.id}`, add:

```tsx
              focusedClientId={focus.clientId}
              focusedInvoiceId={focus.record?.id}
```

Task 12 adds these props; until then `build` fails on them. Do Task 12 before building, and commit Tasks 11 and 12 together.

- [ ] **Step 4: Run the App tests**

Run: `npx nx test invoicing-react -- App`
Expected: PASS, apart from TypeScript-only errors on the two new `AssistantWorkspace` props, which vitest does not check.

- [ ] **Step 5: Continue straight to Task 12, then commit both.**

---

### Task 12: Send the focus to the assistant

**Files:**
- Modify: `examples/invoicing/react/src/focus.ts`
- Modify: `examples/invoicing/react/src/focus.test.ts`
- Modify: `examples/invoicing/react/src/assistant-workspace.tsx`
- Modify: `examples/invoicing/react/src/assistant-workspace.test.tsx`

The run state grows from `{ selectedPaymentId }` to `{ selectedPaymentId, focusedClientId, focusedInvoiceId }`, each key present only when set. Starters follow the focus: a selected payment still wins; otherwise a focused client leads with a question about that client.

- [ ] **Step 1: Write the failing tests**

Append to `examples/invoicing/react/src/focus.test.ts` (add `assistantRunState` to its `./focus` import):

```ts
test('assistantRunState keeps only the selections that are set', () => {
  const selections = [
    {},
    { selectedPaymentId: 'p' },
    { focusedClientId: 'thistle', focusedInvoiceId: undefined },
    { focusedClientId: 'thistle', focusedInvoiceId: 'inv-t' },
  ];

  const states = selections.map(assistantRunState);

  expect(states).toEqual([
    {},
    { selectedPaymentId: 'p' },
    { focusedClientId: 'thistle' },
    { focusedClientId: 'thistle', focusedInvoiceId: 'inv-t' },
  ]);
});
```

Append to `examples/invoicing/react/src/assistant-workspace.test.tsx`:

```tsx
test('a focused client leads the starters and reaches the run state', async () => {
  cleanup();
  const { requests, transport } = controlled();
  const ledger: LedgerSnapshot = {
    ...snapshot,
    customers: [
      { id: 'c', name: 'Cedar Health', currency: 'USD', profile: 'short-payer' },
    ],
  };
  render(
    <AssistantWorkspace
      snapshot={ledger}
      focusedClientId="c"
      focusedInvoiceId="i"
      onApplied={() => undefined}
      transport={transport}
    />,
  );
  const starters = screen.getByRole('group', { name: 'Suggested questions' });

  fireEvent.click(
    within(starters).getByRole('button', {
      name: 'What does Cedar Health owe, and how late is it?',
    }),
  );

  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].input.state).toEqual({
    focusedClientId: 'c',
    focusedInvoiceId: 'i',
  });
  await screen.findByText('There is one unapplied payment.');
  await settle();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test invoicing-react -- focus assistant-workspace`
Expected: FAIL: `assistantRunState` is not exported, and no starter names Cedar Health.

- [ ] **Step 3: Implement `assistantRunState`**

Append to `examples/invoicing/react/src/focus.ts`:

```ts
/** What the page tells the assistant it is looking at. */
export interface AssistantSelection {
  readonly selectedPaymentId?: string;
  readonly focusedClientId?: string;
  readonly focusedInvoiceId?: string;
}

/**
 * The assistant run state for a selection, with unset keys left out: the
 * server validates every key it receives against the session's ledger.
 */
export function assistantRunState(
  selection: AssistantSelection,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(selection).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
```

- [ ] **Step 4: Thread the focus through the workspace**

In `examples/invoicing/react/src/assistant-workspace.tsx`:

1. Add `import { assistantRunState } from './focus';` with the other local imports.

2. In `AssistantWorkspaceProps`, after `readonly selectedPaymentId?: string;`, add:

```tsx
  /** The client focused on the dashboard; validated server-side like the payment. */
  readonly focusedClientId?: string;
  /** The invoice focused on the dashboard; always one of `focusedClientId`'s. */
  readonly focusedInvoiceId?: string;
```

3. In `Conversation`'s props (destructuring and type), add `focusedClientId`, `focusedInvoiceId` and `focusedClientName`, all `string | undefined`, next to `selectedPaymentId`:

```tsx
function Conversation({
  selectedPaymentId,
  focusedClientId,
  focusedInvoiceId,
  focusedClientName,
  locked,
  onBusy,
  transport,
  children,
}: {
  selectedPaymentId?: string;
  focusedClientId?: string;
  focusedInvoiceId?: string;
  /** Names the focused client in the first starter question. */
  focusedClientName?: string;
  locked: boolean;
  onBusy: (busy: boolean) => void;
  transport?: TransportOrFactory;
  /** Reviews and notices that belong in the thread, after the messages. */
  children?: ReactNode;
}) {
```

4. In `send`, replace `chat.setState(selectedPaymentId ? { selectedPaymentId } : {});` with:

```tsx
    chat.setState(
      assistantRunState({
        selectedPaymentId,
        focusedClientId,
        focusedInvoiceId,
      }),
    );
```

5. Replace the `starters` constant with:

```tsx
  const starters = selectedPaymentId
    ? [SELECTED_STARTER, ...STARTERS.slice(0, 2)]
    : focusedClientName
      ? [
          `What does ${focusedClientName} owe, and how late is it?`,
          ...STARTERS.slice(0, 2),
        ]
      : STARTERS;
```

6. In `AssistantWorkspace`, destructure `focusedClientId` and `focusedInvoiceId` next to `selectedPaymentId`, and pass all three plus the name to `Conversation`:

```tsx
          <Conversation
            selectedPaymentId={selectedPaymentId}
            focusedClientId={focusedClientId}
            focusedInvoiceId={focusedInvoiceId}
            focusedClientName={
              snapshot.customers.find((c) => c.id === focusedClientId)?.name
            }
            locked={Boolean(active)}
            onBusy={setConversationBusy}
            transport={transport}
          >
```

- [ ] **Step 5: Run the react suite**

Run: `npx nx test invoicing-react`
Expected: PASS, the whole suite including Task 11's App tests.

- [ ] **Step 6: Build, lint, format, commit Tasks 11 and 12**

```bash
npx prettier --write examples/invoicing/react/src/App.tsx examples/invoicing/react/src/App.test.tsx examples/invoicing/react/src/focus.ts examples/invoicing/react/src/focus.test.ts examples/invoicing/react/src/assistant-workspace.tsx examples/invoicing/react/src/assistant-workspace.test.tsx
npx nx run-many -t build,lint -p invoicing-react
git add examples/invoicing/react/src/App.tsx examples/invoicing/react/src/App.test.tsx examples/invoicing/react/src/focus.ts examples/invoicing/react/src/focus.test.ts examples/invoicing/react/src/assistant-workspace.tsx examples/invoicing/react/src/assistant-workspace.test.tsx
git commit -m "feat(invoicing): the dashboard replaces the old overview and its focus reaches the assistant

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Validate the focus on the server and expose it as a tool

**Files:**
- Modify: `examples/invoicing/server/src/assistant-queries.ts` (add `focusedClient` after `selectedPayment`)
- Modify: `examples/invoicing/server/src/assistant-queries.spec.ts`
- Modify: `examples/invoicing/server/src/assistant-middleware.ts`
- Modify: `examples/invoicing/server/src/assistant-middleware.spec.ts`
- Modify: `examples/invoicing/server/src/assistant-tools.ts`
- Create: `examples/invoicing/server/src/app/assistant/tools/focusedClient.ts`
- Modify: `examples/invoicing/server/src/app/assistant/index.ts`
- Modify: `examples/invoicing/server/src/assistant-tool-schemas.spec.ts`

Security rule from the spec: the middleware already rejects a `selectedPaymentId` the session's ledger does not hold. The new keys get the same check. A non-string value, an unknown client, an invoice without a client, or an invoice that belongs to another client is a 422. The model never reads run state; it reaches the focus only through the `focusedClient` tool, the same way `selectedPayment` works.

Aimock replays recordings by user message and turn, not by prompt or tool list (`server/evals/fixtures.ts`), so adding a tool and a prompt paragraph does not invalidate recordings.

- [ ] **Step 1: Write the failing query test**

In `assistant-queries.spec.ts`, add `focusedClient` to the `./assistant-queries` import and append:

```ts
test('focusedClient describes the focused client and the focused invoice, or nothing', () => {
  const invoice = snapshot.invoices.find(
    (i) => i.customerId === 'thistle' && i.outstandingCents > 0,
  );
  if (!invoice) throw new Error('the sample ledger has open Thistle invoices');

  const focused = focusedClient(snapshot, 'thistle', invoice.id);
  const clientOnly = focusedClient(snapshot, 'thistle', undefined);
  const none = focusedClient(snapshot, undefined, undefined);

  expect(focused.focused?.customer.name).toBe('Thistle Retail');
  expect(focused.focused?.openCents).toBe(1400000);
  expect(focused.focused?.invoice?.id).toBe(invoice.id);
  expect(clientOnly.focused?.invoice).toBeNull();
  expect(none).toEqual({ focused: null });
  expect(size(focused)).toBeLessThan(BUDGET);
});
```

- [ ] **Step 2: Write the failing middleware tests**

In `assistant-middleware.spec.ts`, add `'focusedClient',` to the sorted key list in `allows questions without selection…` (between `'findRecords',` and `'ledgerSummary',`), and append:

```ts
test('a focused client and invoice reach the tool that answers about them', async () => {
  const { store, session, middleware, request } = await setup();
  const ledger = await store.snapshot(session);
  const invoice = ledger.invoices.find((i) => i.outstandingCents > 0);
  if (!invoice) throw new Error('the session ledger has open invoices');

  const result = await middleware({
    ...request,
    body: {
      ...request.body,
      state: {
        focusedClientId: invoice.customerId,
        focusedInvoiceId: invoice.id,
      },
    },
  });

  if (result.action !== 'continue') throw new Error('expected continue');
  const { focused } = await result.context.focusedClient();
  expect(focused?.customer.id).toBe(invoice.customerId);
  expect(focused?.invoice?.id).toBe(invoice.id);
});

test('rejects focus the ledger does not hold or that crosses clients', async () => {
  // The default session ledger has one client; crossing clients needs the sample ledger.
  const { request } = await setup();
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions, createSampleLedger());
  const session = await store.createSession();
  const middleware = createAssistantMiddleware(store, repositories.threads);
  const ledger = await store.snapshot(session);
  const invoice = ledger.invoices.find((i) => i.customerId === 'thistle');
  const other = ledger.customers.find((c) => c.id !== 'thistle');
  if (!invoice || !other) throw new Error('the sample ledger has Thistle and others');
  const withState = (state: Record<string, unknown>) =>
    middleware({
      ...request,
      headers: { cookie: `invoicing_session=${session}` },
      body: { ...request.body, state },
    });

  const actions = [
    (await withState({ focusedClientId: 'nobody' })).action,
    (
      await withState({
        focusedClientId: other.id,
        focusedInvoiceId: invoice.id,
      })
    ).action,
    (await withState({ focusedInvoiceId: invoice.id })).action,
    (await withState({ focusedClientId: 42 })).action,
    (
      await withState({
        focusedClientId: 'thistle',
        focusedInvoiceId: invoice.id,
      })
    ).action,
  ];

  expect(actions).toEqual([
    'reject',
    'reject',
    'reject',
    'reject',
    'continue',
  ]);
});
```

- [ ] **Step 3: Pin the new tool in the schema spec**

In `assistant-tool-schemas.spec.ts`, rename the test to `'exposes the nine current tools and none of the retired ones'` and add `'focusedClient',` between `'findRecords',` and `'ledgerSummary',`.

- [ ] **Step 4: Run to verify they fail**

Run: `npx nx test invoicing-server -- assistant-queries assistant-middleware assistant-tool-schemas`
Expected: FAIL: `focusedClient` is not exported, the context has no `focusedClient`, the first two rejections come back `continue`, and the schema list lacks the tool.

- [ ] **Step 5: Implement the query**

In `assistant-queries.ts`, after `selectedPayment`, add:

```ts
/**
 * The client the user focused on the dashboard, as its statement, plus the
 * focused invoice when there is one, or `focused: null` when nothing is
 * focused. Both IDs arrive validated in the run state, which the model
 * cannot read directly.
 */
export function focusedClient(
  snapshot: Snapshot,
  clientId: string | undefined,
  invoiceId: string | undefined,
  asOf = AS_OF,
) {
  if (!clientId || !snapshot.customers.some((c) => c.id === clientId))
    return { focused: null };
  const invoice = invoiceId
    ? snapshot.invoices.find(
        (i) => i.id === invoiceId && i.customerId === clientId,
      )
    : undefined;
  return {
    focused: {
      ...customerStatement(snapshot, { customerId: clientId }, asOf),
      invoice: invoice ? invoiceRow(invoice) : null,
    },
  };
}
```

`customerStatement` is a function declaration further down the file, so it is hoisted.

- [ ] **Step 6: Implement the middleware**

In `assistant-middleware.ts`:

1. Add `focusedClient,` to the `./assistant-queries` import (after `findRecords,`).

2. Above `assistantContext`, add:

```ts
/** What the page says it is looking at, each ID already checked against the ledger. */
export interface AssistantSelection {
  readonly selectedPaymentId?: string;
  readonly focusedClientId?: string;
  readonly focusedInvoiceId?: string;
}

const SELECTION_KEYS = [
  'selectedPaymentId',
  'focusedClientId',
  'focusedInvoiceId',
] as const;
```

3. Change the signature to `export function assistantContext(current: () => Promise<LedgerSnapshot>, selection: AssistantSelection = {})`. In its doc block, change "(including the page's selected payment)" to "(including the page's selected payment and focused client)". Replace the `selectedPayment` entry and add `focusedClient` after it:

```ts
    selectedPayment: async () =>
      selectedPayment(await current(), selection.selectedPaymentId),
    focusedClient: async () =>
      focusedClient(
        await current(),
        selection.focusedClientId,
        selection.focusedInvoiceId,
      ),
```

The eval harness (`server/evals/harness.ts`) and `render-tool.spec.ts` call `assistantContext` with one argument and keep working.

4. In `createAssistantMiddleware`, replace the block from `const selectedPaymentId = body.state.selectedPaymentId;` to the end of the returned object with:

```ts
    const state: Record<string, unknown> = body.state;
    if (
      SELECTION_KEYS.some(
        (key) => state[key] !== undefined && typeof state[key] !== 'string',
      )
    )
      return reject(422);
    const selection: AssistantSelection = Object.fromEntries(
      SELECTION_KEYS.flatMap((key) => {
        const value = state[key];
        return typeof value === 'string' ? [[key, value]] : [];
      }),
    );
    if (selection.focusedInvoiceId && !selection.focusedClientId)
      return reject(422);
    if (Object.keys(selection).length > 0) {
      const ledger = await current();
      if (
        (selection.selectedPaymentId !== undefined &&
          !ledger.payments.some((p) => p.id === selection.selectedPaymentId)) ||
        (selection.focusedClientId !== undefined &&
          !ledger.customers.some((c) => c.id === selection.focusedClientId)) ||
        (selection.focusedInvoiceId !== undefined &&
          !ledger.invoices.some(
            (i) =>
              i.id === selection.focusedInvoiceId &&
              i.customerId === selection.focusedClientId,
          ))
      )
        return reject(422);
    }
    return {
      action: 'continue' as const,
      context: assistantContext(current, selection),
    };
```

- [ ] **Step 7: Expose the tool**

In `assistant-tools.ts`, add `'focusedClient',` after `'selectedPayment',` in `FUNCTIONS`.

Create `examples/invoicing/server/src/app/assistant/tools/focusedClient.ts`:

```ts
import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** The client the user focused on the dashboard, as its statement, with the focused invoice when there is one; or focused: null. Call this first when the user says "this client" or "this invoice". */
export default function focusedClient(
  _input: Record<string, never>,
  context: B4ToolContext,
) {
  return assistantTools(context).focusedClient();
}
```

In `app/assistant/index.ts`:

1. Change the tools line `monthlyTotals, aging, customerStatement, findRecords, unappliedPayments, selectedPayment. Amounts come back as` to `monthlyTotals, aging, customerStatement, findRecords, unappliedPayments, selectedPayment, focusedClient. Amounts come back as`.

2. After the paragraph that ends `…matching requires the user's explicit review, which the button you offer starts.`, add a paragraph:

```text
The user may also focus a client, or one of its invoices, on the dashboard. When they say "this client" or
"this invoice", call focusedClient first and answer about that client alone; if it returns focused: null, ask
which client they mean. A focus is context, like a selection.
```

- [ ] **Step 8: Run to verify they pass**

Run: `npx nx test invoicing-server`
Expected: PASS, the whole server suite.

- [ ] **Step 9: Build, lint, format, commit**

```bash
npx prettier --write examples/invoicing/server/src/assistant-queries.ts examples/invoicing/server/src/assistant-queries.spec.ts examples/invoicing/server/src/assistant-middleware.ts examples/invoicing/server/src/assistant-middleware.spec.ts examples/invoicing/server/src/assistant-tools.ts examples/invoicing/server/src/app/assistant/tools/focusedClient.ts examples/invoicing/server/src/app/assistant/index.ts examples/invoicing/server/src/assistant-tool-schemas.spec.ts
npx nx run-many -t build,lint -p invoicing-server
git add examples/invoicing/server/src/assistant-queries.ts examples/invoicing/server/src/assistant-queries.spec.ts examples/invoicing/server/src/assistant-middleware.ts examples/invoicing/server/src/assistant-middleware.spec.ts examples/invoicing/server/src/assistant-tools.ts examples/invoicing/server/src/app/assistant/tools/focusedClient.ts examples/invoicing/server/src/app/assistant/index.ts examples/invoicing/server/src/assistant-tool-schemas.spec.ts
git commit -m "feat(invoicing): validate the dashboard focus and let the assistant read it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Styles: strip, band, tabs, grids and motion

**Files:**
- Modify: `examples/invoicing/react/src/styles.css`

jsdom has no layout, so this task is checked in the browser (Step 4) and by the e2e band-height assertion in Task 15.

- [ ] **Step 1: Turn the old tiles into the strip and drop the monthly table**

1. Rename every `.stats` selector to `.kpi-strip`, including the ones inside the 1100 px and 800 px media queries:

```bash
perl -pi -e 's/\.stats\b/.kpi-strip/g' examples/invoicing/react/src/styles.css
grep -n '\.stats\b' examples/invoicing/react/src/styles.css
grep -c 'assistant-kit-stats' examples/invoicing/react/src/styles.css
```

Expected: the first grep prints nothing; the second prints `3` (`.assistant-kit-stats` has no dot before `stats`, so it is untouched).

2. In the top-level `.kpi-strip` rule, change `grid-template-columns: repeat(3, minmax(0, 1fr));` to `grid-template-columns: auto repeat(4, minmax(0, 1fr));` and `margin: 28px 0 32px;` to `margin: 20px 0 16px;`.

3. Delete the eight rules from `.monthly-report {` through the `.monthly-report thead { … }` block.

- [ ] **Step 2: Append the dashboard styles**

Append to the end of `styles.css`:

```css
/* Dashboard: KPI strip, focus band, tabbed grids. Swiss, dense, tabular. */
.dashboard {
  --status-good: #0ca30c;
  --status-warning: #fab219;
  --status-serious: #ec835a;
  --status-critical: #d03b3b;
  --status-neutral: #94a3b8;
  --age-outline: #1e293b;
  --tint: #eef3f0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.kpi-strip {
  align-items: stretch;
}
.currency-switcher {
  display: flex;
  flex-direction: column;
  gap: 4px;
  justify-content: center;
}
.currency-switcher button {
  border: 1px solid #e4e6e5;
  background: #fff;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  transition:
    background-color 100ms ease-out,
    border-color 100ms ease-out;
}
.currency-switcher button[aria-pressed='true'] {
  background: #253d32;
  border-color: #253d32;
  color: #fff;
}
.currency-switcher button:disabled {
  opacity: 0.4;
}
.focus-band {
  /* Fixed in every state so the grid below never moves. */
  height: 380px;
  border: 1px solid #e4e6e5;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.focus-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 28px;
}
.focus-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.focus-record {
  color: #73777c;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.focus-clear {
  margin-left: auto;
  border: 0;
  background: transparent;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: #73777c;
}
.focus-clear:hover {
  background: #f2f3f3;
}
.band-charts {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 20px;
  animation: band-in 120ms ease-out;
}
.band-charts > * {
  min-height: 0;
  overflow: auto;
}
@keyframes band-in {
  from {
    opacity: 0;
  }
}
.band-charts[data-outline-bucket='current'] rect[data-bucket='current'],
.band-charts[data-outline-bucket='days1to30'] rect[data-bucket='days1to30'],
.band-charts[data-outline-bucket='days31to60'] rect[data-bucket='days31to60'],
.band-charts[data-outline-bucket='days61to90'] rect[data-bucket='days61to90'],
.band-charts[data-outline-bucket='over90'] rect[data-bucket='over90'] {
  stroke: var(--age-outline);
  stroke-width: 2px;
}
.dashboard-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #e4e6e5;
}
.dashboard-tabs [role='tab'] {
  border: 0;
  background: transparent;
  padding: 8px 12px;
  border-bottom: 2px solid transparent;
  color: #73777c;
  font-weight: 500;
  transition:
    color 100ms ease-out,
    border-color 100ms ease-out;
}
.dashboard-tabs [role='tab'][aria-selected='true'] {
  color: #202327;
  border-bottom-color: #253d32;
}
.tab-count,
.chip-count {
  color: #73777c;
  font-variant-numeric: tabular-nums;
  margin-left: 4px;
}
.filter-chips {
  display: flex;
  gap: 6px;
  /* Reserved height so switching chips never shifts the grid. */
  min-height: 30px;
  margin: 8px 0;
}
.filter-chips button {
  border: 1px solid #e4e6e5;
  background: #fff;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
}
.filter-chips button[aria-pressed='true'] {
  background: var(--tint, #eef3f0);
  border-color: #3d745a;
}
.dashboard-grid [data-pretable-selected='true'] {
  background: var(--tint);
}
.dashboard-grid [data-pretable-row] {
  transition: background-color 100ms ease-out;
}
.dashboard-grid [data-pretable-column-id] {
  font-variant-numeric: tabular-nums;
}
.age-bar {
  display: flex;
  gap: 2px;
  height: 8px;
  width: 100%;
  border-radius: 4px;
  overflow: hidden;
}
.age-bar i {
  display: block;
  min-width: 2px;
}
.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.status-dot i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-neutral, #94a3b8);
}
.status-dot[data-tone='good'] i {
  background: var(--status-good, #0ca30c);
}
.status-dot[data-tone='warning'] i {
  background: var(--status-warning, #fab219);
}
.status-dot[data-tone='serious'] i {
  background: var(--status-serious, #ec835a);
}
.status-dot[data-tone='critical'] i {
  background: var(--status-critical, #d03b3b);
}
@media (max-width: 1024px) {
  .focus-band {
    height: 640px;
  }
  .band-charts {
    grid-template-columns: minmax(0, 1fr);
  }
  .kpi-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .currency-switcher {
    grid-column: 1 / -1;
    flex-direction: row;
  }
}
@media (prefers-reduced-motion: reduce) {
  .band-charts,
  .currency-switcher button,
  .dashboard-tabs [role='tab'],
  .dashboard-grid [data-pretable-row] {
    animation: none;
    transition: none;
  }
}
```

The `StatusDot` renders inside the band too, which sits under `.dashboard`, so the tone variables resolve everywhere they are used; the fallbacks cover any use outside it.

- [ ] **Step 3: Format and lint**

```bash
npx prettier --write examples/invoicing/react/src/styles.css
npx nx run-many -t build,test,lint -p invoicing-react
```

Expected: all pass.

- [ ] **Step 4: Look at it**

The worktree's untracked `.claude/launch.json` already defines `invoicing-server` (port 4325, loading `INVOICING_ENV_FILE`) and `invoicing-react` (port 4326). Start both with the preview tool, never Bash, and never print the env file. Check:

- the band's height is the same with nothing focused, with Thistle focused, and after ↓ to the next client (`document.querySelector('.focus-band').getBoundingClientRect().height`);
- Thistle reads £14,000 open, £8,000 overdue and 47 days to pay, and the switcher shows only GBP enabled;
- the Invoices tab with Thistle focused shows three open invoices;
- at 900 px wide the charts stack and nothing scrolls horizontally except the grid.

Take one screenshot of each state for the PR.

- [ ] **Step 5: Commit**

```bash
git add examples/invoicing/react/src/styles.css
git commit -m "style(invoicing): dense dashboard strip, fixed-height band, tabs and status dots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: End-to-end tests and the walkthrough follow the new UI

**Files:**
- Modify: `examples/invoicing/e2e/workflow.spec.ts`
- Modify: `examples/invoicing/e2e/live.spec.ts`
- Modify: `examples/invoicing/e2e/walkthrough/scenes.ts`

The payments grid moved to the Payments page, so every test that clicks `Review payment-…` must open that page first. The `Ledger totals` strip now shows whole units in one currency.

- [ ] **Step 1: Add a helper and navigate first in `workflow.spec.ts`**

After the `snapshot` helper, add:

```ts
async function openPayments(page: Page) {
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
  await page.getByRole('heading', { name: 'Payments', level: 1 }).waitFor();
}
```

Call `await openPayments(page);` right after `await page.goto('/');` (and after `const baseline = await snapshot(page);` where that line follows `goto`) in:

- `ambiguous and combined payments require an explicit invoice choice`
- `advance payment cannot start a review without an outstanding invoice` (then delete its own later `Payments` click, which becomes redundant)
- `failed review releases chat and retries with a fresh thread without changing the ledger`
- `lost approval response holds further work until the committed operation is reconciled`

In `lost approval response…`, the `Ledger totals` assertion runs after the Cedar review on the Payments page. Replace

```ts
  await expect(
    page.getByRole('region', { name: 'Ledger totals', exact: true }),
  ).toContainText('$11,500.00');
```

with

```ts
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Ledger totals', exact: true }),
  ).toContainText('$11,500');
```

Leave `a recorded assistant answer replays as validated generative UI` alone: it only uses the assistant rail.

- [ ] **Step 2: Add the focus test to `workflow.spec.ts`**

```ts
test('selecting a client focuses the band, and arrow keys move the focus', async ({
  page,
}) => {
  await page.goto('/');
  const band = page.getByRole('region', { name: 'Focus', exact: true });
  const portfolioHeight = (await band.boundingBox())?.height;

  await page.getByRole('treegrid', { name: 'Clients' }).getByText('Thistle Retail').click();

  await expect(
    band.getByRole('heading', { name: 'Thistle Retail' }),
  ).toBeVisible();
  const strip = page.getByRole('region', { name: 'Ledger totals', exact: true });
  await expect(strip).toContainText('£14,000');
  await expect(strip).toContainText('£8,000');
  await expect(page.getByRole('button', { name: 'USD', exact: true })).toBeDisabled();
  await expect(page).toHaveURL(/[?&]client=thistle\b/);
  expect((await band.boundingBox())?.height).toBe(portfolioHeight);

  await page.keyboard.press('ArrowDown');

  await expect(
    band.getByRole('heading', { name: 'Thistle Retail' }),
  ).toHaveCount(0);
  expect((await band.boundingBox())?.height).toBe(portfolioHeight);

  await page.keyboard.press('Escape');

  await expect(
    band.getByRole('heading', { name: 'All USD clients' }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/client=/);
});
```

- [ ] **Step 3: `live.spec.ts`**

Immediately before the first `Review payment-northstar-exact` click (it follows the `await expect(message).toBeEnabled();` after the `13,900` answer), insert:

```ts
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
```

The later Cedar review stays on the same page.

- [ ] **Step 4: Walkthrough scenes**

In `walkthrough/scenes.ts`, replace `await glide(page, page.locator('.stats'), false);` with:

```ts
  await glide(page, page.locator('.kpi-strip'), false);
```

The rest of the walkthrough already opens Payments before `Review payment-harbor-combined`, and `.payment-grid` still exists there. PR 3 re-records the video; this PR only keeps the script runnable.

- [ ] **Step 5: Type-check and lint the e2e project**

```bash
npx prettier --write examples/invoicing/e2e/workflow.spec.ts examples/invoicing/e2e/live.spec.ts examples/invoicing/e2e/walkthrough/scenes.ts
npx nx run-many -t build,lint,test-walkthrough -p invoicing-e2e
```

Expected: PASS.

- [ ] **Step 6: Run the deterministic browser suite**

```bash
npx nx application-e2e invoicing-e2e
```

Expected: PASS, including the new focus test. On failure, read the Playwright trace before changing any assertion.

- [ ] **Step 7: Commit**

```bash
git add examples/invoicing/e2e/workflow.spec.ts examples/invoicing/e2e/live.spec.ts examples/invoicing/e2e/walkthrough/scenes.ts
git commit -m "test(invoicing): e2e follows payments to their page and covers client focus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Final verification

- [ ] **Step 1: Confirm the install matches the pins**

```bash
node -p "require('./node_modules/@b4run/cli/package.json').version"
```

Expected: `0.12.0`. Otherwise run `npm ci --no-audit --no-fund` and start this task again.

- [ ] **Step 2: Build, test and lint every affected project**

```bash
npx nx run-many -t build,test,lint -p invoicing-contracts,invoicing-server,invoicing-react,invoicing-e2e
```

Expected: all pass. Report any warnings in the PR.

- [ ] **Step 3: Browser suites**

```bash
npx nx application-e2e invoicing-e2e
```

Expected: PASS.

- [ ] **Step 4: Eval replay**

```bash
npx nx eval invoicing-server
```

Expected: the recorded evals replay green. The new tool and prompt paragraph do not change how aimock matches recordings (by user message and turn).

- [ ] **Step 5: Check the working tree**

```bash
git status --short
```

Expected: only the untracked `.claude/` and `.superpowers/` directories. Nothing else should be left uncommitted.

- [ ] **Step 6: Hand off**

Use superpowers:finishing-a-development-branch. The PR description lists the three band screenshots from Task 14 and says that the Payments page and matching are unchanged until PR 2.

---

## Known gaps left for later PRs

- The band's chart titles read `Aging · GBP · thistle`, because `chartTitle` takes a customer ID. The band header names the client, so PR 1 leaves the shared chart components alone; PR 3, which turns answer components into focus links, is the natural place to pass a display name.
- Short-payer residuals (Granite Mutual, Kestrel Energy) dominate age-based sorts on the Invoices tab, as the spec's open items note. The Open chip plus the balance sort keeps them below the large balances.
- The Payments page, related-invoices panel and match controls are unchanged; PR 2 moves them into the band.
- The spec's "bars grow with `transform: scaleY`" is not in PR 1: the band reuses the assistant's chart components as they are, and PR 1 animates only the 120 ms crossfade. Adding a grow-in belongs with the PR 3 chart changes.
- The URL is written with `replaceState` only, so Back does not restore an earlier focus.
- The assistant run state carries the focused client and invoice but not the tab.
- The focus reaches the model through a new `focusedClient` tool; the spec only required the server to validate it.
- The URL uses `currency` and `invoice` keys; the spec's `bucket` key arrives with PR 3.
- The Dashboard no longer shows the payments grid; it lives only on the Payments page until PR 2.
- The most recent of payment selection and client focus wins in the assistant rail, so at most one of them is sent as context.
