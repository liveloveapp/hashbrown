# Invoicing React Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four minimal kit renderers from PR 2 with the real showcase components: a Pretable grid for `LedgerTable`, inline-SVG charts for `TrendChart` and `AgingSummary` built to the dataviz method, and a `CustomerCard` with a Pretable badge and computed habit figures, without changing any contract.

**Architecture:** Chart and card math moves into one pure module, `react/src/ledger-views.ts`, tested on its own. Each renderer becomes thin: it calls a pure function over the snapshot from `SnapshotContext` and draws. Charts are hand-written SVG (no charting dependency), read the app's light-only palette, carry a legend where there are two series, a per-mark hover tooltip, and a `<details>` table view for accessibility. Contracts, the server, and the kit builder are untouched; the schema-parity test keeps guarding that.

**Tech Stack:** React 19, `@pretable/react` 0.20.2 (`PretableSurface`, `PretableBadge`), inline SVG, Vitest with Testing Library, the `dataviz` skill and its `validate_palette.js`.

This is PR 3 of 4 from [the design spec](../specs/2026-09-19-invoicing-generative-ui-design.md), stacked on PR 2 ([#559](https://github.com/liveloveapp/hashbrown/pull/559), branch `blove/invoicing-query-tools`). Work on branch `blove/invoicing-react-kit`. The repo's PR workflow only runs against `main`; verify locally and retarget when #559 merges.

**Design decisions taken here** (from the dataviz skill, loaded during planning):

- `TrendChart` compares two series over time, so it is a grouped column chart with categorical colors in fixed slot order: invoiced = slot 1 blue `#2a78d6`, received = slot 2 orange `#eb6834`. Legend always present, direct labels only on the last month's pair, per-column hover tooltip, table view in `<details>`.
- `AgingSummary` is one measure across five ordered buckets, so it is a single-hue horizontal bar chart in slot 1 blue with a direct label on every bar (five bars is few enough) and a `<details>` table view.
- The app is light-only (`styles.css` has no dark mode), so charts declare light values only. Text uses the app's ink tokens (`#202327` primary, `#73777c` muted), grid and axes `#e4e6e5`, surface `#fff`.
- Marks: 2px gap between adjacent columns, 4px rounded top corners anchored to the baseline, thin bars, recessive grid.

---

## File map

| File | Change | Responsibility |
| ---- | ------ | -------------- |
| `examples/invoicing/react/src/ledger-views.ts` | create | pure math: `resolveRecords`, `monthlySeries`, `agingTotals`, `customerSummary`, `money`, `monthLabel` |
| `examples/invoicing/react/src/ledger-views.test.ts` | create | |
| `examples/invoicing/react/src/assistant-kit.tsx` | rewrite the four renderers | thin components over `ledger-views` |
| `examples/invoicing/react/src/assistant-kit.test.tsx` | extend | |
| `examples/invoicing/react/src/styles.css` | append | `.assistant-kit-*` styles |
| `examples/invoicing/react/src/App.tsx` | modify | reuse `money` from `ledger-views` |

Commands run from the repository root `/Users/blove/repos/hashbrown/.claude/worktrees/xenodochial-rosalind-9aa111`. React tests: `npx vitest run --config examples/invoicing/react/vite.config.mts <file>`. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Prettier and eslint on changed files before every commit. Stage only the files you changed.

---

### Task 1: Pure view math

**Files:**
- Create: `examples/invoicing/react/src/ledger-views.ts`
- Create: `examples/invoicing/react/src/ledger-views.test.ts`
- Modify: `examples/invoicing/react/src/App.tsx` (replace its local `money` with the import)

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import {
  agingTotals,
  customerSummary,
  money,
  monthLabel,
  monthlySeries,
  resolveRecords,
} from './ledger-views';

const snapshot: LedgerSnapshot = {
  customers: [
    { id: 'c', name: 'Cedar Health', currency: 'USD', profile: 'late-fixed' },
    { id: 'e', name: 'Lumen Fintech', currency: 'EUR', profile: 'on-time' },
  ],
  invoices: [
    { id: 'i1', customerId: 'c', customerName: 'Cedar Health', currency: 'USD', amountCents: 25000, outstandingCents: 25000, reference: 'INV-1', date: '2026-07-01', version: 1 },
    { id: 'i2', customerId: 'c', customerName: 'Cedar Health', currency: 'USD', amountCents: 5000, outstandingCents: 0, reference: 'INV-2', date: '2026-08-01', version: 2 },
    { id: 'i3', customerId: 'e', customerName: 'Lumen Fintech', currency: 'EUR', amountCents: 7000, outstandingCents: 7000, reference: 'INV-3', date: '2026-04-01', version: 1 },
  ],
  payments: [
    { id: 'p1', customerId: 'c', customerName: 'Cedar Health', currency: 'USD', amountCents: 5000, unappliedCents: 0, reference: 'ACH 2', date: '2026-09-10', version: 2 },
    { id: 'p2', customerId: 'c', customerName: 'Cedar Health', currency: 'USD', amountCents: 10000, unappliedCents: 10000, reference: 'ACH 3', date: '2026-09-12', version: 1 },
  ],
  allocations: [{ paymentId: 'p1', invoiceId: 'i2', amountCents: 5000, proposalId: 'x' }],
  activities: [],
};
const AS_OF = '2026-09-15';

test('money and monthLabel format for display', () => {
  expect(money(123456, 'USD')).toBe('$1,234.56');
  expect(money(0, 'GBP')).toBe('£0.00');
  expect(monthLabel('2026-07')).toBe('Jul 2026');
});

test('resolveRecords maps ids to display rows and counts misses', () => {
  const { rows, missing } = resolveRecords(snapshot, ['i1', 'p2', 'nope', 'i1']);

  expect(rows.map((r) => r.id)).toEqual(['i1', 'p2']);
  expect(rows[0]).toMatchObject({ kind: 'invoice', reference: 'INV-1', customer: 'Cedar Health', balanceCents: 25000, currency: 'USD' });
  expect(rows[1]).toMatchObject({ kind: 'payment', reference: 'ACH 3', balanceCents: 10000 });
  expect(missing).toBe(1);
});

test('monthlySeries zero-fills calendar months back from the as-of month', () => {
  const rows = monthlySeries(snapshot, { currency: 'USD', customerId: null, months: 3, asOf: AS_OF });

  expect(rows.map((r) => r.month)).toEqual(['2026-07', '2026-08', '2026-09']);
  expect(rows.map((r) => r.invoicedCents)).toEqual([25000, 5000, 0]);
  expect(rows.map((r) => r.receivedCents)).toEqual([0, 0, 15000]);
  expect(monthlySeries(snapshot, { currency: 'EUR', customerId: 'e', months: 2, asOf: AS_OF }).map((r) => r.invoicedCents)).toEqual([0, 0]);
  expect(monthlySeries(snapshot, { currency: 'USD', customerId: null, months: 500, asOf: AS_OF })).toHaveLength(24);
});

test('agingTotals buckets open invoices with counts', () => {
  const usd = agingTotals(snapshot, { currency: 'USD', customerId: null, asOf: AS_OF });
  const eur = agingTotals(snapshot, { currency: 'EUR', customerId: 'e', asOf: AS_OF });

  expect(usd.map((b) => b.bucket)).toEqual(['current', 'days1to30', 'days31to60', 'days61to90', 'over90']);
  expect(usd.find((b) => b.bucket === 'days31to60')).toMatchObject({ cents: 25000, count: 1, label: '31-60 days' });
  expect(usd.reduce((s, b) => s + b.cents, 0)).toBe(25000);
  expect(eur.find((b) => b.bucket === 'over90')).toMatchObject({ cents: 7000, count: 1 });
});

test('customerSummary computes balances and habit from the snapshot', () => {
  const cedar = customerSummary(snapshot, 'c', AS_OF);

  expect(cedar).toMatchObject({
    id: 'c',
    name: 'Cedar Health',
    currency: 'USD',
    profile: 'late-fixed',
    invoicedCents: 30000,
    receivedCents: 15000,
    openCents: 25000,
    unappliedCents: 10000,
    openInvoiceCount: 1,
    averageDaysToPay: 40,
    latePaymentRate: 1,
    lastPaymentDate: '2026-09-12',
  });
  expect(customerSummary(snapshot, 'e', AS_OF)).toMatchObject({ averageDaysToPay: null, latePaymentRate: null });
  expect(customerSummary(snapshot, 'nobody', AS_OF)).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config examples/invoicing/react/vite.config.mts examples/invoicing/react/src/ledger-views.test.ts`
Expected: FAIL, cannot find module `./ledger-views`.

- [ ] **Step 3: Implement** `examples/invoicing/react/src/ledger-views.ts`

```ts
import {
  AGING_BUCKETS,
  agingBucket,
  daysBetween,
  TERMS_DAYS,
  type AgingBuckets,
  type LedgerSnapshot,
  type PaymentProfile,
} from '@invoicing/contracts';

/** The ledger's fixed as-of date; the server's snapshot is dated the same. */
export const AS_OF = '2026-09-15';

export const BUCKET_LABELS: Record<keyof AgingBuckets, string> = {
  current: 'Current',
  days1to30: '1-30 days',
  days31to60: '31-60 days',
  days61to90: '61-90 days',
  over90: 'Over 90 days',
};

export function money(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amountCents / 100,
  );
}

export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export interface LedgerRow {
  readonly id: string;
  readonly kind: 'invoice' | 'payment';
  readonly reference: string;
  readonly customer: string;
  readonly date: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly balanceCents: number;
}

/** Resolve model-chosen ids against the snapshot; duplicates collapse, unknown ids are counted. */
export function resolveRecords(
  snapshot: LedgerSnapshot,
  recordIds: readonly string[],
): { rows: LedgerRow[]; missing: number } {
  const ids = [...new Set(recordIds)];
  const rows = ids.flatMap((id): LedgerRow[] => {
    const invoice = snapshot.invoices.find((i) => i.id === id);
    if (invoice)
      return [
        {
          id,
          kind: 'invoice',
          reference: invoice.reference ?? id,
          customer: invoice.customerName ?? invoice.customerId,
          date: invoice.date ?? '',
          currency: invoice.currency,
          amountCents: invoice.amountCents,
          balanceCents: invoice.outstandingCents,
        },
      ];
    const payment = snapshot.payments.find((p) => p.id === id);
    if (payment)
      return [
        {
          id,
          kind: 'payment',
          reference: payment.reference ?? id,
          customer: payment.customerName ?? payment.customerId,
          date: payment.date ?? '',
          currency: payment.currency,
          amountCents: payment.amountCents,
          balanceCents: payment.unappliedCents,
        },
      ];
    return [];
  });
  return { rows, missing: ids.length - rows.length };
}

export interface MonthRow {
  readonly month: string;
  readonly invoicedCents: number;
  readonly receivedCents: number;
}

/** N calendar months ending at the as-of month, zero-filled; capped at 24. */
export function monthlySeries(
  snapshot: LedgerSnapshot,
  input: { currency: string; customerId: string | null; months: number; asOf: string },
): MonthRow[] {
  const own = <T extends { currency: string; customerId: string; date?: string }>(
    records: readonly T[],
  ) =>
    records.filter(
      (r) =>
        r.currency === input.currency &&
        (!input.customerId || r.customerId === input.customerId),
    );
  const invoices = own(snapshot.invoices);
  const payments = own(snapshot.payments);
  const [year, month] = input.asOf.split('-').map(Number);
  const count = Math.min(24, Math.max(1, Math.floor(input.months) || 1));
  return Array.from({ length: count }, (_, offset) => {
    const index = year * 12 + (month - 1) - (count - 1 - offset);
    const key = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
    return {
      month: key,
      invoicedCents: invoices
        .filter((i) => i.date?.startsWith(key))
        .reduce((sum, i) => sum + i.amountCents, 0),
      receivedCents: payments
        .filter((p) => p.date?.startsWith(key))
        .reduce((sum, p) => sum + p.amountCents, 0),
    };
  });
}

export interface AgingRow {
  readonly bucket: keyof AgingBuckets;
  readonly label: string;
  readonly cents: number;
  readonly count: number;
}

/** Open invoices grouped into the five aging buckets, in order. */
export function agingTotals(
  snapshot: LedgerSnapshot,
  input: { currency: string; customerId: string | null; asOf: string },
): AgingRow[] {
  const totals = Object.fromEntries(
    AGING_BUCKETS.map((b) => [b, { cents: 0, count: 0 }]),
  ) as Record<keyof AgingBuckets, { cents: number; count: number }>;
  for (const invoice of snapshot.invoices) {
    if (
      invoice.currency !== input.currency ||
      invoice.outstandingCents <= 0 ||
      (input.customerId && invoice.customerId !== input.customerId)
    )
      continue;
    const bucket = invoice.date ? agingBucket(invoice.date, input.asOf) : 'current';
    totals[bucket].cents += invoice.outstandingCents;
    totals[bucket].count += 1;
  }
  return AGING_BUCKETS.map((bucket) => ({
    bucket,
    label: BUCKET_LABELS[bucket],
    ...totals[bucket],
  }));
}

export interface CustomerSummary {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly profile: PaymentProfile;
  readonly invoicedCents: number;
  readonly receivedCents: number;
  readonly openCents: number;
  readonly unappliedCents: number;
  readonly openInvoiceCount: number;
  readonly averageDaysToPay: number | null;
  readonly latePaymentRate: number | null;
  readonly lastPaymentDate: string | null;
}

/** One client's balances and habit, computed from the snapshot's own allocations. */
export function customerSummary(
  snapshot: LedgerSnapshot,
  customerId: string,
  asOf: string,
): CustomerSummary | undefined {
  void asOf;
  const customer = snapshot.customers.find((c) => c.id === customerId);
  if (!customer) return undefined;
  const invoices = snapshot.invoices.filter((i) => i.customerId === customerId);
  const payments = snapshot.payments.filter((p) => p.customerId === customerId);
  const byId = <T extends { id: string }>(records: readonly T[]) =>
    new Map(records.map((r) => [r.id, r]));
  const invoiceById = byId(invoices);
  const paymentById = byId(payments);
  const lags = snapshot.allocations.flatMap((a) => {
    const invoice = invoiceById.get(a.invoiceId);
    const payment = paymentById.get(a.paymentId);
    return invoice?.date && payment?.date
      ? [daysBetween(invoice.date, payment.date)]
      : [];
  });
  const sum = (values: readonly number[]) => values.reduce((s, v) => s + v, 0);
  const lastPayment = [...payments].sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? ''),
  )[0];
  return {
    id: customer.id,
    name: customer.name,
    currency: customer.currency,
    profile: customer.profile,
    invoicedCents: sum(invoices.map((i) => i.amountCents)),
    receivedCents: sum(payments.map((p) => p.amountCents)),
    openCents: sum(invoices.map((i) => i.outstandingCents)),
    unappliedCents: sum(payments.map((p) => p.unappliedCents)),
    openInvoiceCount: invoices.filter((i) => i.outstandingCents > 0).length,
    averageDaysToPay: lags.length ? Math.round(sum(lags) / lags.length) : null,
    latePaymentRate: lags.length
      ? lags.filter((lag) => lag > TERMS_DAYS).length / lags.length
      : null,
    lastPaymentDate: lastPayment?.date ?? null,
  };
}
```

(`asOf` is accepted on `customerSummary` for signature symmetry with the server's facts; it is unused today, hence the `void`. If eslint rejects the `void`, drop the parameter and update the test calls.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --config examples/invoicing/react/vite.config.mts examples/invoicing/react/src/ledger-views.test.ts`
Expected: 5 passed. The average-days test expects 40: invoice `i2` dated 2026-08-01 paid 2026-09-10.

- [ ] **Step 5: Reuse `money` in `App.tsx`**

Delete the local `money` function in `App.tsx` and import it: `import { money } from './ledger-views';`. Run `npx nx run-many -t build,test,lint -p invoicing-react`; expected all pass.

- [ ] **Step 6: Commit**

```bash
npx prettier --write examples/invoicing/react/src/ledger-views.ts examples/invoicing/react/src/ledger-views.test.ts examples/invoicing/react/src/App.tsx
git add examples/invoicing/react/src/ledger-views.ts examples/invoicing/react/src/ledger-views.test.ts examples/invoicing/react/src/App.tsx
git commit -m "feat(invoicing): add pure view math for the assistant kit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: LedgerTable on Pretable and CustomerCard with a badge

**Files:**
- Modify: `examples/invoicing/react/src/assistant-kit.tsx`
- Modify: `examples/invoicing/react/src/assistant-kit.test.tsx`
- Modify: `examples/invoicing/react/src/styles.css`

- [ ] **Step 1: Update the tests**

In `assistant-kit.test.tsx`, replace the `LedgerTable` tests with:

```tsx
test('LedgerTable renders a Pretable grid of resolved rows and reports missing ones', () => {
  withSnapshot(<LedgerTable title="Rows" recordIds={['i', 'p', 'nope']} />);

  expect(screen.getByRole('heading', { name: 'Rows' })).toBeVisible();
  expect(screen.getByRole('grid', { name: 'Rows' })).toBeVisible();
  expect(screen.getByText('INV-1')).toBeVisible();
  expect(screen.getByText('ACH 1')).toBeVisible();
  expect(screen.getByText('$250.00')).toBeVisible();
  expect(screen.getByText('1 record could not be shown.')).toBeVisible();
});

test('LedgerTable dedupes repeated ids and renders nothing without a snapshot', () => {
  withSnapshot(<LedgerTable title="Dup" recordIds={['i', 'i', 'nope', 'nope']} />);
  expect(screen.getAllByText('INV-1')).toHaveLength(1);
  expect(screen.getByText('1 record could not be shown.')).toBeVisible();
  cleanup();
  render(<LedgerTable title="None" recordIds={['i']} />);
  expect(screen.queryByRole('heading', { name: 'None' })).toBeNull();
});
```

If Pretable's grid does not expose `role="grid"` with the accessible name from `ariaLabel`, run one render and inspect `screen.debug()` to find the role it does use (the app's `App.test.tsx` may already query it), then adjust the role query and report it.

Replace the `CustomerCard` test with:

```tsx
test('CustomerCard shows habit badge, balances and payment figures', () => {
  withSnapshot(<CustomerCard customerId="c" />);

  expect(screen.getByRole('heading', { name: 'Cedar Health' })).toBeVisible();
  expect(screen.getByText('on-time')).toBeVisible();
  expect(screen.getByText('USD')).toBeVisible();
  expect(screen.getByText('$250.00')).toBeVisible();
  expect(screen.getAllByText('$100.00')).toHaveLength(2);
  expect(screen.getByText('$300.00')).toBeVisible();
  expect(screen.getByText('No payments yet')).toBeVisible();
});
```

(The test snapshot has no allocations, so days to pay is unknown and the card says "No payments yet" for the habit figures.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config examples/invoicing/react/vite.config.mts examples/invoicing/react/src/assistant-kit.test.tsx`
Expected: the grid-role and badge assertions fail.

- [ ] **Step 3: Rewrite `LedgerTable` and `CustomerCard`** in `assistant-kit.tsx`

Replace the file's imports and the two components (leave `AssistantText`, `TrendChart`, `AgingSummary`, `assistantKit` for now; Task 3 replaces the charts):

```tsx
import { type ReactNode, useContext, useMemo } from 'react';
import {
  PretableBadge,
  type PretableBadgeTone,
  type PretableColumn,
  PretableSurface,
} from '@pretable/react';
import { createAssistantKit, type PaymentProfile } from '@invoicing/contracts';
import {
  AS_OF,
  customerSummary,
  type LedgerRow,
  money,
  resolveRecords,
} from './ledger-views';
import { SnapshotContext } from './snapshot-context';

const PROFILE_TONE: Record<PaymentProfile, PretableBadgeTone | undefined> = {
  'on-time': 'positive',
  'late-fixed': 'warning',
  'late-drifting': 'negative',
  'short-payer': 'warning',
  'batch-payer': 'info',
  'wrong-reference': 'info',
};

const columns: PretableColumn<LedgerRow>[] = [
  { id: 'reference', header: 'Reference', widthPx: 200, type: 'text', value: (r) => r.reference },
  { id: 'customer', header: 'Customer', widthPx: 140, type: 'text', value: (r) => r.customer },
  { id: 'date', header: 'Date', widthPx: 100, type: 'text', value: (r) => r.date || '—' },
  { id: 'amount', header: 'Amount', widthPx: 110, type: 'number', value: (r) => r.amountCents, format: ({ row }) => money(row.amountCents, row.currency) },
  { id: 'balance', header: 'Balance', widthPx: 110, type: 'number', value: (r) => r.balanceCents, format: ({ row }) => money(row.balanceCents, row.currency) },
  { id: 'kind', header: 'Kind', widthPx: 90, type: 'text', value: (r) => (r.kind === 'invoice' ? 'Invoice' : 'Payment') },
];

export function LedgerTable({ title, recordIds }: { title: string; recordIds: string[] }) {
  const snapshot = useContext(SnapshotContext);
  const resolved = useMemo(
    () => (snapshot ? resolveRecords(snapshot, recordIds) : undefined),
    [snapshot, recordIds],
  );
  if (!resolved) return null;
  const { rows, missing } = resolved;
  return (
    <section className="assistant-kit assistant-kit-table">
      <h4>{title}</h4>
      <PretableSurface
        rows={rows}
        columns={columns}
        getRowId={(row: LedgerRow) => row.id}
        ariaLabel={title}
        viewportHeight={Math.min(320, 44 + rows.length * 32)}
        toolPanel={false}
      />
      {missing > 0 && (
        <p role="status" className="muted">
          {missing} record{missing === 1 ? '' : 's'} could not be shown.
        </p>
      )}
    </section>
  );
}

export function CustomerCard({ customerId }: { customerId: string }) {
  const snapshot = useContext(SnapshotContext);
  const summary = snapshot ? customerSummary(snapshot, customerId, AS_OF) : undefined;
  if (!summary) return null;
  const habit =
    summary.averageDaysToPay === null || summary.latePaymentRate === null
      ? null
      : {
          days: `${summary.averageDaysToPay} days`,
          late: `${Math.round(summary.latePaymentRate * 100)}% late`,
        };
  return (
    <section className="assistant-kit assistant-kit-customer">
      <header>
        <h4>{summary.name}</h4>
        <span className="muted">{summary.currency}</span>
        <PretableBadge tone={PROFILE_TONE[summary.profile]}>{summary.profile}</PretableBadge>
      </header>
      <dl className="assistant-kit-stats">
        <div><dt>Open</dt><dd>{money(summary.openCents, summary.currency)}</dd></div>
        <div><dt>Unapplied</dt><dd>{money(summary.unappliedCents, summary.currency)}</dd></div>
        <div><dt>Invoiced</dt><dd>{money(summary.invoicedCents, summary.currency)}</dd></div>
        <div><dt>Received</dt><dd>{money(summary.receivedCents, summary.currency)}</dd></div>
        <div><dt>Avg. days to pay</dt><dd>{habit ? habit.days : 'No payments yet'}</dd></div>
        <div><dt>Paid late</dt><dd>{habit ? habit.late : '—'}</dd></div>
      </dl>
      <p className="muted">
        {summary.openInvoiceCount} open invoice{summary.openInvoiceCount === 1 ? '' : 's'}
        {summary.lastPaymentDate ? ` · last payment ${summary.lastPaymentDate}` : ''}
      </p>
    </section>
  );
}
```

Check `PretableSurface`'s required props in `node_modules/@pretable/react/dist/index.d.mts` (`PretableSurfaceProps`); `App.tsx` passes `rows`, `columns`, `getRowId`, `ariaLabel`, `viewportHeight`, `toolPanel`, `rowSelectionColumn`, `state`. If `state` or another prop is required, pass the minimal value `App.tsx` uses and report it. If Pretable needs a `PretableOverlayProvider` ancestor for the surface, check whether `App.tsx`/`main.tsx` already provides one at the root (it must, for the payments grid) and, in the test, wrap `withSnapshot` renders in it too.

- [ ] **Step 4: Styles.** Append to `styles.css`:

```css
.assistant-kit {
  margin-top: 12px;
}
.assistant-kit h4 {
  margin: 0 0 8px;
  font-size: 13px;
}
.assistant-kit-customer header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.assistant-kit-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin: 8px 0;
}
.assistant-kit-stats dt {
  color: #73777c;
  font-size: 12px;
}
.assistant-kit-stats dd {
  margin: 2px 0 0;
  font-weight: 600;
}
```

- [ ] **Step 5: Run tests and lint**

Run: `npx nx run-many -t build,test,lint -p invoicing-react`. Expected: all pass, including the schema-parity test (contracts untouched) and the existing workspace tests.

- [ ] **Step 6: Commit**

```bash
npx prettier --write examples/invoicing/react/src
git add examples/invoicing/react/src/assistant-kit.tsx examples/invoicing/react/src/assistant-kit.test.tsx examples/invoicing/react/src/styles.css
git commit -m "feat(invoicing): render LedgerTable on Pretable and a CustomerCard with habit figures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: TrendChart and AgingSummary as SVG charts

Load the `dataviz` skill before writing chart code and read `references/marks-and-anatomy.md`, `references/interaction.md`, and `references/anti-patterns.md`. Validate the palette:

```bash
node <dataviz skill base>/scripts/validate_palette.js "#2a78d6,#eb6834" --mode light
```

Expected: pass on the light surface (`#fff`; the app is light-only). Paste the report summary into your commit body.

**Files:**
- Modify: `examples/invoicing/react/src/assistant-kit.tsx`
- Modify: `examples/invoicing/react/src/assistant-kit.test.tsx`
- Modify: `examples/invoicing/react/src/styles.css`

- [ ] **Step 1: Update the tests**

Replace the `TrendChart` and `AgingSummary` tests with:

```tsx
test('TrendChart draws grouped columns with a legend, direct labels, and a table view', () => {
  withSnapshot(<TrendChart currency="USD" customerId={null} months={3} />);

  const figure = screen.getByRole('figure', { name: /Invoiced vs received · USD/ });
  expect(figure).toBeVisible();
  expect(screen.getByText('Invoiced')).toBeVisible();
  expect(screen.getByText('Received')).toBeVisible();
  expect(figure.querySelectorAll('rect[data-series="invoiced"]')).toHaveLength(3);
  expect(figure.querySelectorAll('rect[data-series="received"]')).toHaveLength(3);
  expect(screen.getByText('Show data')).toBeVisible();
  expect(screen.getByRole('table', { name: /Invoiced vs received/ })).toBeInTheDocument();
  expect(screen.getAllByText('Jul 2026').length).toBeGreaterThan(0);
});

test('TrendChart clamps months and shows a tooltip on hover', () => {
  withSnapshot(<TrendChart currency="USD" customerId={null} months={5000} />);
  const figure = screen.getByRole('figure', { name: /Invoiced vs received/ });
  expect(figure.querySelectorAll('rect[data-series="invoiced"]')).toHaveLength(24);
  const last = figure.querySelectorAll('[data-month]');
  fireEvent.mouseEnter(last[last.length - 1]);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Sep 2026');
});

test('AgingSummary draws one bar per bucket with direct labels and a table view', () => {
  withSnapshot(<AgingSummary currency="USD" customerId="c" />);

  const figure = screen.getByRole('figure', { name: /Aging · USD/ });
  expect(figure.querySelectorAll('rect[data-bucket]')).toHaveLength(5);
  expect(screen.getAllByText('31-60 days').length).toBeGreaterThan(0);
  expect(screen.getAllByText('$250.00').length).toBeGreaterThan(0);
  expect(screen.getByRole('table', { name: /Aging/ })).toBeInTheDocument();
});
```

Add `fireEvent` to the Testing Library import.

- [ ] **Step 2: Run to verify failure.** Expected: figure-role assertions fail.

- [ ] **Step 3: Implement the charts** in `assistant-kit.tsx`

Requirements, in place of full code (write it to the dataviz specs):

- Both charts are `<figure className="assistant-kit assistant-kit-chart" aria-label={title}>` with an `<h4>` title, an inline `<svg viewBox="0 0 560 220" role="img" aria-label={title}>`, and a `<details><summary>Show data</summary><table aria-label={title}>…</table></details>` fallback carrying the same rows.
- Colors as CSS custom properties on the figure: `--series-1: #2a78d6; --series-2: #eb6834; --ink: #202327; --ink-muted: #73777c; --grid: #e4e6e5;`. Text uses ink tokens, never series colors.
- `TrendChart`: data from `monthlySeries(snapshot, { currency, customerId, months, asOf: AS_OF })`. Grouped columns per month (invoiced then received), 2px gap between the two columns and between groups, 4px rounded top corners via a `<path>` or `rx` on a clipped rect anchored at the baseline (a plain `<rect rx=4>` rounds the bottom too; acceptable only if you clip it at the baseline), three horizontal gridlines at nice values computed from the max, y-axis labels in `money` short form (use `Intl.NumberFormat` with `notation: 'compact'` and the currency), x-axis labels every month when `months <= 12`, else every third month. Legend above the plot: two swatches with text. Direct labels only on the last month's two columns. Each month group is a `<g data-month={month}>` with an invisible full-height `<rect>` hit target; `onMouseEnter`/`onFocus` sets hovered month state, `onMouseLeave`/`onBlur` clears it; when set, render an HTML `<div role="tooltip">` positioned near the group showing month label, invoiced, received. Columns carry `data-series="invoiced" | "received"`.
- `AgingSummary`: data from `agingTotals(...)`. Horizontal bars, one per bucket in order, single hue `--series-1`, label on the left (bucket), amount label right of the bar end (`money`), count in the tooltip. Bars 16px tall, 8px apart, `data-bucket`. Zero buckets still draw a 0-width bar and their label. Add a top-line total: "Open: {money(total)}" as an `<p className="muted">`.
- No number is ever taken from props; everything is computed from the snapshot.

- [ ] **Step 4: Styles.** Append:

```css
.assistant-kit-chart svg {
  width: 100%;
  height: auto;
  display: block;
}
.assistant-kit-chart .legend {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #73777c;
  margin-bottom: 6px;
}
.assistant-kit-chart .legend i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 6px;
  vertical-align: -1px;
}
.assistant-kit-chart .tooltip {
  position: absolute;
  background: #202327;
  color: #fff;
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 6px;
  pointer-events: none;
}
.assistant-kit-chart {
  position: relative;
}
.assistant-kit-chart details {
  margin-top: 6px;
  font-size: 12px;
}
.assistant-kit-chart table {
  border-collapse: collapse;
  width: 100%;
}
.assistant-kit-chart th,
.assistant-kit-chart td {
  text-align: left;
  padding: 4px 6px;
  border-bottom: 1px solid #e4e6e5;
}
```

- [ ] **Step 5: Run tests, lint, and look at it**

Run `npx nx run-many -t build,test,lint -p invoicing-react`. Then render visually: start the client (`npx vite --config examples/invoicing/react/vite.config.mts --port 4327`) with the agent server (`INVOICING_ENV_FILE=/Users/blove/repos/hashbrown/.env npx tsx --tsconfig examples/invoicing/server/tsconfig.json examples/invoicing/server/src/main.ts`), ask "How did EUR invoicing trend this year?" and "Which GBP invoices are overdue?", and screenshot both charts. Check against `references/anti-patterns.md`: label collisions, bars touching, missing legend, colored text. Fix and re-screenshot. Save screenshots in the scratchpad and mention them in the report.

- [ ] **Step 6: Commit**

```bash
npx prettier --write examples/invoicing/react/src
git add examples/invoicing/react/src/assistant-kit.tsx examples/invoicing/react/src/assistant-kit.test.tsx examples/invoicing/react/src/styles.css
git commit -m "feat(invoicing): draw TrendChart and AgingSummary as accessible SVG charts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Verification and PR

- [ ] **Step 1: Full run**

```bash
npx nx run-many -t build,test,lint -p invoicing-contracts invoicing-server invoicing-react invoicing-e2e
npx nx run invoicing-e2e:example-e2e
npx nx run invoicing:e2e
```

All pass.

- [ ] **Step 2: Live check.** With the server and client running as in Task 3, ask the four PR 2 questions and confirm: the unapplied-total answer shows a Pretable grid; the GBP question shows the aging chart; the EUR question shows the trend chart; the Atlas question shows the card, a grid, and the Review button. Screenshot each.

- [ ] **Step 3: Push and open the PR** against `blove/invoicing-query-tools`, title `feat(invoicing): Pretable grid, SVG charts, and a customer card for the assistant kit`, body summarizing the four renderers, the palette validation result, the screenshots (attach via the PR description), and "no contract changes; schema-parity test unchanged". Note that CI runs only after retargeting to `main`.
