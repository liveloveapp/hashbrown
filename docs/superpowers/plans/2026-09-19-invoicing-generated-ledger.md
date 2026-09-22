# Invoicing Generated Ledger and Session Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-authored invoicing fixture with a seeded, multi-currency ledger generated from client payment profiles, derive ground-truth facts from it, and make sessions store only an overlay of what the visitor changed instead of a full ledger copy.

**Architecture:** A `generator/` module (PRNG, client table, date helpers, history generator, facts) produces an immutable base `Ledger` once per process. `sample-ledger.ts` appends the five named scenarios to it. `ledger.ts` gains `materialize(base, overlay)` and `overlayOf(base, ledger)` so the existing `createProposal`/`applyProposal` keep operating on a full `Ledger` while the session document holds only allocations, activities, proposals and operations. Old Postgres rows that still carry a `ledger` key are normalized on load and rewritten without it on the next commit.

**Tech Stack:** TypeScript, Vitest, Nx, Drizzle/Postgres (unchanged), Playwright deterministic e2e (unchanged behavior).

This is PR 1 of 4 from [the design spec](../specs/2026-09-19-invoicing-generative-ui-design.md). PRs 2 to 4 (query tools and render tool, React kit, evals) get their own plans once this lands.

**Spec amendment made by this plan.** The spec's client table listed ten clients with the six existing USD clients carrying six distinct profiles. That cannot hold: the deterministic e2e requires Harbor's review to offer exactly the two combined-scenario invoices, the advance scenario requires Summit to have no open invoice at all, and the live e2e reviews Northstar and Cedar without choosing an invoice, which the review agent only allows when the scenario invoice is the sole outstanding candidate. So every scenario client must settle all generated invoices by the as-of date. The table becomes twelve clients: the five scenario clients pay clean (`on-time`, with Atlas as `wrong-reference`, which also pays on time), Juniper drifts late, and six new clients carry the remaining profiles across USD, EUR and GBP. All six profiles are still represented.

---

## File map

| File | Change | Responsibility |
| ---- | ------ | -------------- |
| `examples/invoicing/shared/src/index.ts` | modify | `PaymentProfile`, `Customer`, `LedgerOverlay`; `Ledger.customers` |
| `examples/invoicing/server/src/generator/prng.ts` | create | seeded mulberry32 generator |
| `examples/invoicing/server/src/generator/prng.spec.ts` | create | determinism and bounds |
| `examples/invoicing/server/src/generator/dates.ts` | create | ISO date arithmetic |
| `examples/invoicing/server/src/generator/dates.spec.ts` | create | |
| `examples/invoicing/server/src/generator/clients.ts` | create | client table, as-of date, month range |
| `examples/invoicing/server/src/generator/history.ts` | create | two years of invoices, payments, allocations per profile |
| `examples/invoicing/server/src/generator/history.spec.ts` | create | determinism, conservation, one test per profile |
| `examples/invoicing/server/src/generator/facts.ts` | create | ground truth derived from a ledger |
| `examples/invoicing/server/src/generator/facts.spec.ts` | create | |
| `examples/invoicing/server/src/sample-ledger.ts` | rewrite | scenarios appended to generated history |
| `examples/invoicing/server/src/sample-ledger.spec.ts` | modify | counts, factory test removed |
| `examples/invoicing/server/src/ledger.ts` | modify | `materialize`, `overlayOf`, `customers` on test ledger |
| `examples/invoicing/server/src/ledger.spec.ts` | modify | overlay tests |
| `examples/invoicing/server/src/persistence/types.ts` | modify | `Session` is an overlay |
| `examples/invoicing/server/src/persistence/contract.spec.ts` | modify | empty session shape |
| `examples/invoicing/server/src/session-store.ts` | rewrite | base plus overlay, old-row normalization |
| `examples/invoicing/server/src/session-store.spec.ts` | modify | signature, old-row test, shared-base test |
| `examples/invoicing/server/src/services.ts` | modify | pass the ledger, not a factory |
| `examples/invoicing/server/browser-fixture.ts` | modify | same |
| `examples/invoicing/server/src/middleware.spec.ts` | modify | same |
| `examples/invoicing/server/src/assistant-middleware.spec.ts` | modify | same, plus `customers: []` |
| `examples/invoicing/server/src/review-middleware.spec.ts` | modify | same, plus `customers: []` |
| `examples/invoicing/react/src/App.test.tsx` | modify | `customers: []` |
| `examples/invoicing/react/src/assistant-workspace.test.tsx` | modify | `customers: []` |
| `examples/invoicing/react/src/review-chat.test.tsx` | modify | `customers: []` |
| `examples/invoicing/react/src/allocation-proposal.test.tsx` | modify | `customers: []` |
| `examples/invoicing/e2e/live.spec.ts` | modify | counts relative to baseline |
| `examples/invoicing/README.md` | modify | describe the generated ledger |
| `docs/superpowers/specs/2026-09-19-invoicing-generative-ui-design.md` | modify | client table amendment |

All commands run from the repository root: `/Users/blove/repos/hashbrown/.claude/worktrees/xenodochial-rosalind-9aa111`.

Server unit tests: `npx vitest run --config examples/invoicing/server/vitest.config.mts <file>`.
Formatting: `npx prettier --write <files>` before each commit (the repo has a `.prettierrc`; lint-staged runs it on commit too).

---

### Task 1: Contracts gain customers, profiles, and the overlay type

**Files:**
- Modify: `examples/invoicing/shared/src/index.ts`
- Modify: `examples/invoicing/server/src/ledger.ts:8-23`
- Modify: test fixtures listed in step 3

- [ ] **Step 1: Add the types to the contracts**

In `examples/invoicing/shared/src/index.ts`, insert before `/** A customer-owned money record; ... */`:

```ts
/** How a client habitually settles invoices; drives the generated history. */
export type PaymentProfile =
  | 'on-time'
  | 'late-fixed'
  | 'late-drifting'
  | 'short-payer'
  | 'batch-payer'
  | 'wrong-reference';
/** A billed client. */
export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly profile: PaymentProfile;
}
```

Change the `Ledger` interface to:

```ts
/** Canonical ledger data; remaining balances are derived from allocations. */
export interface Ledger {
  readonly customers: readonly Customer[];
  readonly payments: readonly MoneyRecord[];
  readonly invoices: readonly MoneyRecord[];
  readonly allocations: readonly Allocation[];
  readonly activities: readonly Activity[];
}
/** What one session has changed on top of the shared base ledger. */
export interface LedgerOverlay {
  readonly allocations: readonly Allocation[];
  readonly activities: readonly Activity[];
}
```

- [ ] **Step 2: Give the unit-test ledger a customer**

In `examples/invoicing/server/src/ledger.ts`, change `createLedger` to:

```ts
/** Create the deterministic sample ledger with no allocations. */
export function createLedger(): Ledger {
  const record = {
    customerId: 'customer-001',
    currency: 'USD',
    amountCents: 240000,
    version: 1,
  };
  return {
    customers: [
      {
        id: 'customer-001',
        name: 'Customer 001',
        currency: 'USD',
        profile: 'on-time',
      },
    ],
    payments: [{ ...record, id: 'payment-001' }],
    invoices: [{ ...record, id: 'invoice-001' }],
    allocations: [],
    activities: [],
  };
}
```

- [ ] **Step 3: Add `customers: []` to every snapshot literal in tests**

Add the line `customers: [],` immediately before `allocations: [],` in each of these:

- `examples/invoicing/server/src/assistant-middleware.spec.ts` (the literal ending at line 113)
- `examples/invoicing/server/src/review-middleware.spec.ts` (the literal ending at line 130)
- `examples/invoicing/react/src/App.test.tsx` (line 37)
- `examples/invoicing/react/src/assistant-workspace.test.tsx` (line 40)
- `examples/invoicing/react/src/review-chat.test.tsx` (line 32)
- `examples/invoicing/react/src/allocation-proposal.test.tsx` (line 181)

- [ ] **Step 4: Typecheck and test all four projects**

Run:

```bash
npx nx run-many -t build,test -p invoicing-contracts invoicing-server invoicing-react invoicing-e2e
```

Expected: all four `build` targets pass and all tests pass. If a `LedgerSnapshot` literal was missed, `tsc` names the file; add `customers: []` there.

- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/shared/src/index.ts examples/invoicing/server/src/ledger.ts
git add -A examples/invoicing
git commit -m "feat(invoicing): add customers and payment profiles to the ledger contract

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Seeded PRNG

**Files:**
- Create: `examples/invoicing/server/src/generator/prng.ts`
- Create: `examples/invoicing/server/src/generator/prng.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { createRandom } from './prng';

test('the same seed yields the same sequence', () => {
  const a = createRandom(42);
  const b = createRandom(42);

  const first = [a.next(), a.next(), a.next(), a.int(1, 6), a.int(1, 6)];
  const second = [b.next(), b.next(), b.next(), b.int(1, 6), b.int(1, 6)];

  expect(second).toEqual(first);
});

test('different seeds yield different sequences', () => {
  const a = createRandom(1);
  const b = createRandom(2);

  expect([a.next(), a.next()]).not.toEqual([b.next(), b.next()]);
});

test('floats stay in [0, 1) and ints are inclusive of both bounds', () => {
  const random = createRandom(7);
  const seen = new Set<number>();

  for (let i = 0; i < 2000; i += 1) {
    const value = random.next();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    seen.add(random.int(3, 5));
  }

  expect([...seen].sort()).toEqual([3, 4, 5]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/generator/prng.spec.ts`
Expected: FAIL, cannot find module `./prng`.

- [ ] **Step 3: Implement**

`examples/invoicing/server/src/generator/prng.ts`:

```ts
/** A deterministic random source; the same seed always yields the same sequence. */
export interface Random {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
}

/**
 * mulberry32: a 32-bit generator good enough for fixture data and small enough
 * to inline. Not for anything security-related.
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/generator/prng.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/server/src/generator
git add examples/invoicing/server/src/generator
git commit -m "feat(invoicing): add a seeded random source for the ledger generator

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Date helpers and the client table

**Files:**
- Create: `examples/invoicing/server/src/generator/dates.ts`
- Create: `examples/invoicing/server/src/generator/dates.spec.ts`
- Create: `examples/invoicing/server/src/generator/clients.ts`

- [ ] **Step 1: Write the failing date tests**

`examples/invoicing/server/src/generator/dates.spec.ts`:

```ts
import { expect, test } from 'vitest';
import { addDays, daysBetween, monthAt } from './dates';

test('addDays crosses month and year boundaries', () => {
  expect(addDays('2026-09-01', 14)).toBe('2026-09-15');
  expect(addDays('2024-12-25', 10)).toBe('2025-01-04');
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
});

test('daysBetween is signed and whole', () => {
  expect(daysBetween('2026-09-01', '2026-09-15')).toBe(14);
  expect(daysBetween('2026-09-15', '2026-09-01')).toBe(-14);
  expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0);
});

test('monthAt walks forward from a first month', () => {
  expect(monthAt('2024-10', 0)).toBe('2024-10');
  expect(monthAt('2024-10', 3)).toBe('2025-01');
  expect(monthAt('2024-10', 23)).toBe('2026-09');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/generator/dates.spec.ts`
Expected: FAIL, cannot find module `./dates`.

- [ ] **Step 3: Implement the date helpers**

`examples/invoicing/server/src/generator/dates.ts`:

```ts
const DAY = 86_400_000;

const parse = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** `date` plus `days`, as YYYY-MM-DD. Negative days walk backwards. */
export function addDays(date: string, days: number): string {
  return new Date(parse(date) + days * DAY).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to) - parse(from)) / DAY);
}

/** The month `offset` months after `first`, as YYYY-MM. */
export function monthAt(first: string, offset: number): string {
  const [year, month] = first.split('-').map(Number);
  const index = year * 12 + (month - 1) + offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run the date tests**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/generator/dates.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Write the client table**

`examples/invoicing/server/src/generator/clients.ts`:

```ts
import type { Customer } from '@invoicing/contracts';

/** A billed client plus what the generator needs to invoice it. */
export interface Client extends Customer {
  readonly service: string;
  readonly retainerCents: number;
}

/** The simulated "today". Nothing in the ledger is dated after it. */
export const AS_OF = '2026-09-15';
/** First month of generated history, inclusive. */
export const FIRST_MONTH = '2024-10';
/** Months of history, ending in the as-of month. */
export const MONTHS = 24;

/**
 * The five scenario clients (see sample-ledger.ts) must have settled every
 * generated invoice by the as-of date: the review flows in the e2e suite rely
 * on the scenario invoice being the only outstanding candidate for its payment.
 * That is why they are all `on-time` (Atlas is `wrong-reference`, which also
 * pays on time). The interesting aging lives on the other seven.
 */
export const clients: readonly Client[] = [
  {
    id: 'northstar',
    name: 'Northstar Labs',
    service: 'Platform engineering',
    currency: 'USD',
    profile: 'on-time',
    retainerCents: 960000,
  },
  {
    id: 'cedar',
    name: 'Cedar Health',
    service: 'Patient portal development',
    currency: 'USD',
    profile: 'on-time',
    retainerCents: 720000,
  },
  {
    id: 'harbor',
    name: 'Harbor Commerce',
    service: 'Commerce API integration',
    currency: 'USD',
    profile: 'on-time',
    retainerCents: 840000,
  },
  {
    id: 'atlas',
    name: 'Atlas Analytics',
    service: 'Data platform consulting',
    currency: 'USD',
    profile: 'wrong-reference',
    retainerCents: 600000,
  },
  {
    id: 'summit',
    name: 'Summit Logistics',
    service: 'Dispatch software support',
    currency: 'USD',
    profile: 'on-time',
    retainerCents: 480000,
  },
  {
    id: 'juniper',
    name: 'Juniper Studio',
    service: 'Web application development',
    currency: 'USD',
    profile: 'late-drifting',
    retainerCents: 360000,
  },
  {
    id: 'pioneer',
    name: 'Pioneer Robotics',
    service: 'Fleet telemetry platform',
    currency: 'USD',
    profile: 'late-fixed',
    retainerCents: 540000,
  },
  {
    id: 'granite',
    name: 'Granite Mutual',
    service: 'Claims portal modernization',
    currency: 'USD',
    profile: 'short-payer',
    retainerCents: 660000,
  },
  {
    id: 'lumen',
    name: 'Lumen Fintech',
    service: 'Payments API integration',
    currency: 'EUR',
    profile: 'on-time',
    retainerCents: 780000,
  },
  {
    id: 'orbital',
    name: 'Orbital Media',
    service: 'Streaming backend support',
    currency: 'EUR',
    profile: 'batch-payer',
    retainerCents: 420000,
  },
  {
    id: 'thistle',
    name: 'Thistle Retail',
    service: 'Storefront replatforming',
    currency: 'GBP',
    profile: 'late-drifting',
    retainerCents: 570000,
  },
  {
    id: 'kestrel',
    name: 'Kestrel Energy',
    service: 'Grid analytics dashboards',
    currency: 'GBP',
    profile: 'short-payer',
    retainerCents: 450000,
  },
];
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx nx run invoicing-server:build`
Expected: passes.

```bash
npx prettier --write examples/invoicing/server/src/generator
git add examples/invoicing/server/src/generator
git commit -m "feat(invoicing): add date helpers and the client table for the generator

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: History generator

**Files:**
- Create: `examples/invoicing/server/src/generator/history.ts`
- Create: `examples/invoicing/server/src/generator/history.spec.ts`

- [ ] **Step 1: Write the failing tests**

`examples/invoicing/server/src/generator/history.spec.ts`:

```ts
import { expect, test } from 'vitest';
import { getSnapshot } from '../ledger';
import { AS_OF, clients } from './clients';
import { daysBetween } from './dates';
import { generateHistory } from './history';

const ledger = generateHistory();
const snapshot = getSnapshot(ledger);

const invoice = (id: string) => {
  const found = snapshot.invoices.find((item) => item.id === id);
  if (!found) throw new Error(`missing invoice ${id}`);
  return found;
};
const payment = (id: string) => {
  const found = snapshot.payments.find((item) => item.id === id);
  if (!found) throw new Error(`missing payment ${id}`);
  return found;
};
/** Days from invoice issue to payment receipt, one per allocation. */
const lags = (customerId: string) =>
  ledger.allocations
    .filter((a) => invoice(a.invoiceId).customerId === customerId)
    .map((a) => daysBetween(invoice(a.invoiceId).date!, payment(a.paymentId).date!));
const open = (customerId: string) =>
  snapshot.invoices.filter(
    (item) => item.customerId === customerId && item.outstandingCents > 0,
  );

test('is deterministic per seed and differs across seeds', () => {
  expect(generateHistory(1)).toEqual(generateHistory(1));
  expect(generateHistory(1)).not.toBe(generateHistory(1));
  expect(generateHistory(1)).not.toEqual(generateHistory(2));
});

test('covers twelve clients, three currencies, and twenty-four retainer months', () => {
  expect(ledger.customers).toHaveLength(12);
  expect(new Set(ledger.customers.map((c) => c.currency))).toEqual(
    new Set(['USD', 'EUR', 'GBP']),
  );
  for (const client of clients) {
    const retainers = ledger.invoices.filter(
      (item) =>
        item.customerId === client.id && item.description?.includes('retainer'),
    );
    expect(retainers).toHaveLength(24);
    expect(retainers[0].date).toBe('2024-10-01');
    expect(retainers[23].date).toBe('2026-09-01');
    expect(retainers.every((r) => r.currency === client.currency)).toBe(true);
  }
  for (const record of [...ledger.invoices, ...ledger.payments]) {
    expect(record.date! <= AS_OF).toBe(true);
    expect(record.reference).toBeTruthy();
    expect(record.description).toBeTruthy();
    expect(record.customerName).toBeTruthy();
  }
});

test('conserves cents, keeps ids unique, and versions records once per allocation', () => {
  const ids = [...ledger.invoices, ...ledger.payments].map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(ledger.allocations.map((a) => a.proposalId)).size).toBe(
    ledger.allocations.length,
  );
  expect(ledger.activities).toHaveLength(ledger.allocations.length);
  for (const allocation of ledger.allocations) {
    const p = payment(allocation.paymentId);
    const i = invoice(allocation.invoiceId);
    expect(p.customerId).toBe(i.customerId);
    expect(p.currency).toBe(i.currency);
    expect(allocation.amountCents).toBeGreaterThan(0);
  }
  for (const record of snapshot.payments) {
    expect(record.unappliedCents).toBe(0);
    expect(record.version).toBe(
      1 + ledger.allocations.filter((a) => a.paymentId === record.id).length,
    );
  }
  for (const record of snapshot.invoices) {
    expect(record.outstandingCents).toBeGreaterThanOrEqual(0);
    expect(record.version).toBe(
      1 + ledger.allocations.filter((a) => a.invoiceId === record.id).length,
    );
  }
});

test.each(['northstar', 'cedar', 'harbor', 'summit', 'lumen'])(
  'on-time client %s has settled everything within 12 days',
  (id) => {
    expect(open(id)).toHaveLength(0);
    for (const lag of lags(id)) {
      expect(lag).toBeGreaterThanOrEqual(5);
      expect(lag).toBeLessThanOrEqual(12);
    }
  },
);

test('late-fixed client pays in full 35 to 45 days out and has the latest invoices open', () => {
  for (const lag of lags('pioneer')) {
    expect(lag).toBeGreaterThanOrEqual(35);
    expect(lag).toBeLessThanOrEqual(45);
  }
  expect(open('pioneer').map((i) => i.id)).toContain('invoice-pioneer-2026-09');
});

test.each(['juniper', 'thistle'])(
  'late-drifting client %s pays later over time and has recent invoices open',
  (id) => {
    const all = lags(id);
    const early = all.slice(0, 6).reduce((a, b) => a + b, 0) / 6;
    const late = all.slice(-6).reduce((a, b) => a + b, 0) / 6;
    expect(late).toBeGreaterThan(early + 20);
    expect(open(id).length).toBeGreaterThanOrEqual(1);
  },
);

test.each(['granite', 'kestrel'])(
  'short-payer %s leaves a two percent residual on every settled invoice',
  (id) => {
    const settled = ledger.allocations.filter(
      (a) => invoice(a.invoiceId).customerId === id,
    );
    expect(settled.length).toBeGreaterThanOrEqual(24);
    for (const allocation of settled) {
      const i = invoice(allocation.invoiceId);
      expect(allocation.amountCents).toBe(Math.round(i.amountCents * 0.98));
      expect(i.outstandingCents).toBe(
        i.amountCents - Math.round(i.amountCents * 0.98),
      );
      expect(payment(allocation.paymentId).reference).toContain('LESS 2PCT');
    }
  },
);

test('batch-payer settles several invoices per transfer and leaves the current batch open', () => {
  const byPayment = new Map<string, number>();
  for (const a of ledger.allocations)
    if (payment(a.paymentId).customerId === 'orbital')
      byPayment.set(a.paymentId, (byPayment.get(a.paymentId) ?? 0) + 1);
  // Spans of two or three months over 24 months give 7 to 11 batches before
  // the as-of date; the September batch has not happened yet.
  expect(byPayment.size).toBeGreaterThanOrEqual(6);
  for (const count of byPayment.values()) expect(count).toBeGreaterThanOrEqual(2);
  expect(open('orbital').length).toBeGreaterThanOrEqual(1);
});

test('wrong-reference client cites the previous invoice on every remittance after the first', () => {
  const atlas = ledger.allocations.filter(
    (a) => invoice(a.invoiceId).customerId === 'atlas',
  );
  const mismatched = atlas.filter(
    (a) => !payment(a.paymentId).reference?.includes(invoice(a.invoiceId).reference!),
  );
  expect(mismatched.length).toBe(atlas.length - 1);
  expect(open('atlas')).toHaveLength(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/generator/history.spec.ts`
Expected: FAIL, cannot find module `./history`.

- [ ] **Step 3: Implement the generator**

`examples/invoicing/server/src/generator/history.ts`:

```ts
import type {
  Activity,
  Allocation,
  Ledger,
  MoneyRecord,
  PaymentProfile,
} from '@invoicing/contracts';
import {
  AS_OF,
  type Client,
  clients as defaultClients,
  FIRST_MONTH,
  MONTHS,
} from './clients';
import { addDays, monthAt } from './dates';
import { createRandom, type Random } from './prng';

/** The seed behind the ledger every visitor sees. Change it and the history changes. */
export const DEFAULT_SEED = 20260915;

/** A generated invoice always has a date and a reference. */
type Dated = MoneyRecord & { readonly date: string; readonly reference: string };

interface Issued {
  readonly invoice: Dated;
  /** 0-based month of history the invoice belongs to. */
  readonly monthIndex: number;
}

interface Settlement {
  readonly payment: Dated;
  readonly allocations: readonly Allocation[];
}

const shortPaid = (amountCents: number) => Math.round(amountCents * 0.98);

/**
 * One retainer on the first of every month, plus one to three project
 * invoices per quarter on the fifteenth. The as-of month has not had its
 * project billing run yet, so it never carries a project invoice.
 */
function invoicesFor(client: Client, random: Random): Issued[] {
  const issued: Issued[] = [];
  const base = {
    customerId: client.id,
    customerName: client.name,
    currency: client.currency,
    version: 1,
  };
  for (let index = 0; index < MONTHS; index += 1) {
    const month = monthAt(FIRST_MONTH, index);
    const reference = `INV-${month.replace('-', '')}-${client.id.toUpperCase()}`;
    issued.push({
      monthIndex: index,
      invoice: {
        ...base,
        id: `invoice-${client.id}-${month}`,
        date: `${month}-01`,
        reference,
        amountCents: client.retainerCents + Math.floor(index / 12) * 30000,
        description: `${client.service} — ${month} monthly retainer`,
      },
    });
    if (index % 3 !== 0) continue;
    const count = random.int(1, 3);
    for (let offset = 0; offset < count; offset += 1) {
      const projectIndex = index + offset;
      const projectMonth = monthAt(FIRST_MONTH, projectIndex);
      const amountCents = random.int(4, 24) * 25000;
      if (projectIndex >= MONTHS || `${projectMonth}-15` >= AS_OF) continue;
      issued.push({
        monthIndex: projectIndex,
        invoice: {
          ...base,
          id: `invoice-${client.id}-${projectMonth}-p${offset + 1}`,
          date: `${projectMonth}-15`,
          reference: `INV-${projectMonth.replace('-', '')}-${client.id.toUpperCase()}-P${offset + 1}`,
          amountCents,
          description: `${client.service} — project milestone ${offset + 1}`,
        },
      });
    }
  }
  return issued.sort((a, b) =>
    a.invoice.date === b.invoice.date
      ? a.invoice.id.localeCompare(b.invoice.id)
      : a.invoice.date.localeCompare(b.invoice.date),
  );
}

/** Days from issue to payment for a single-invoice settlement. */
function lagFor(profile: PaymentProfile, monthIndex: number, random: Random) {
  switch (profile) {
    case 'on-time':
    case 'wrong-reference':
      return random.int(5, 12);
    case 'late-fixed':
      return random.int(35, 45);
    case 'late-drifting':
      return 20 + Math.round((monthIndex * 55) / (MONTHS - 1)) + random.int(0, 4);
    case 'short-payer':
      return random.int(3, 10);
    case 'batch-payer':
      throw new Error('batch payers are settled in batches');
  }
}

/** The invoice issued just before this one for the same client, if any. */
function previousReference(item: Issued, issued: readonly Issued[]) {
  const index = issued.indexOf(item);
  return index > 0 ? issued[index - 1].invoice.reference : item.invoice.reference;
}

function settleOne(
  client: Client,
  item: Issued,
  issued: readonly Issued[],
  random: Random,
): Settlement | undefined {
  const lag = lagFor(client.profile, item.monthIndex, random);
  const date = addDays(item.invoice.date, lag);
  if (date > AS_OF) return undefined;
  const short = client.profile === 'short-payer';
  const amountCents = short
    ? shortPaid(item.invoice.amountCents)
    : item.invoice.amountCents;
  const cited =
    client.profile === 'wrong-reference'
      ? previousReference(item, issued)
      : item.invoice.reference;
  const paymentId = item.invoice.id.replace(/^invoice-/, 'payment-');
  return {
    payment: {
      id: paymentId,
      customerId: client.id,
      customerName: client.name,
      currency: client.currency,
      amountCents,
      version: 1,
      date,
      reference: `ACH ${cited}${short ? ' LESS 2PCT' : ''}`,
      description: short
        ? `${client.name} payment net of early-payment discount`
        : `${client.name} payment received by ACH`,
    },
    allocations: [
      {
        paymentId,
        invoiceId: item.invoice.id,
        amountCents,
        proposalId: `historical-proposal-${paymentId}-${item.invoice.id}`,
      },
    ],
  };
}

/**
 * Every two or three months, one transfer on the twentieth settles everything
 * issued since the last one. A batch whose transfer date is past the as-of
 * date has not happened yet, so its invoices stay open.
 */
function settleInBatches(
  client: Client,
  issued: readonly Issued[],
  random: Random,
): Settlement[] {
  const settlements: Settlement[] = [];
  let pending: Issued[] = [];
  let waited = 0;
  let span = random.int(2, 3);
  for (let index = 0; index < MONTHS; index += 1) {
    pending.push(...issued.filter((item) => item.monthIndex === index));
    waited += 1;
    if (waited < span) continue;
    const month = monthAt(FIRST_MONTH, index);
    const date = `${month}-20`;
    if (date > AS_OF) break;
    const paymentId = `payment-${client.id}-batch-${month}`;
    settlements.push({
      payment: {
        id: paymentId,
        customerId: client.id,
        customerName: client.name,
        currency: client.currency,
        amountCents: pending.reduce((sum, p) => sum + p.invoice.amountCents, 0),
        version: 1,
        date,
        reference: `ACH ${pending.map((p) => p.invoice.reference).join(' + ')}`,
        description: `${client.name} batch payment for ${pending.length} invoices`,
      },
      allocations: pending.map((p) => ({
        paymentId,
        invoiceId: p.invoice.id,
        amountCents: p.invoice.amountCents,
        proposalId: `historical-proposal-${paymentId}-${p.invoice.id}`,
      })),
    });
    pending = [];
    waited = 0;
    span = random.int(2, 3);
  }
  return settlements;
}

function settle(client: Client, issued: readonly Issued[], random: Random) {
  if (client.profile === 'batch-payer')
    return settleInBatches(client, issued, random);
  return issued.flatMap((item) => {
    const settlement = settleOne(client, item, issued, random);
    return settlement ? [settlement] : [];
  });
}

/**
 * Two years of invoices, payments and allocations for every client, shaped
 * by each client's payment profile. Same seed, same ledger, byte for byte.
 */
export function generateHistory(
  seed = DEFAULT_SEED,
  table: readonly Client[] = defaultClients,
): Ledger {
  const random = createRandom(seed);
  const invoices: Dated[] = [];
  const payments: Dated[] = [];
  const allocations: Allocation[] = [];
  const activities: Activity[] = [];
  for (const client of table) {
    const issued = invoicesFor(client, random);
    invoices.push(...issued.map((item) => item.invoice));
    for (const settlement of settle(client, issued, random)) {
      payments.push(settlement.payment);
      for (const allocation of settlement.allocations) {
        const reference = issued.find(
          (item) => item.invoice.id === allocation.invoiceId,
        )?.invoice.reference;
        allocations.push(allocation);
        activities.push({
          operationId: `historical-operation-${allocation.paymentId}-${allocation.invoiceId}`,
          proposalId: allocation.proposalId,
          description: `${settlement.payment.date}: Applied ${client.name} payment to ${reference}`,
        });
      }
    }
  }
  const version = (id: string, key: 'paymentId' | 'invoiceId') =>
    1 + allocations.filter((a) => a[key] === id).length;
  return {
    customers: table.map(({ id, name, currency, profile }) => ({
      id,
      name,
      currency,
      profile,
    })),
    invoices: invoices.map((i) => ({ ...i, version: version(i.id, 'invoiceId') })),
    payments: payments.map((p) => ({ ...p, version: version(p.id, 'paymentId') })),
    allocations,
    activities,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/generator/history.spec.ts`
Expected: all pass. If the late-drifting assertion fails on the `early + 20` margin, the drift is `20 → 75` days over 23 months so the first six average about 27 and the last six about 71; check `lagFor` before touching the test. If the batch-payer count assertion fails, confirm `waited`/`span` reset after each batch.

- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/server/src/generator
git add examples/invoicing/server/src/generator
git commit -m "feat(invoicing): generate two years of ledger history from client payment profiles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Sample ledger appends the scenarios to generated history

**Files:**
- Rewrite: `examples/invoicing/server/src/sample-ledger.ts`
- Modify: `examples/invoicing/server/src/sample-ledger.spec.ts`

- [ ] **Step 1: Update the first sample-ledger test**

In `examples/invoicing/server/src/sample-ledger.spec.ts`, replace the body of the test `creates deterministic independent records spanning 24 consulting months` with:

```ts
test('creates deterministic independent records spanning 24 consulting months', () => {
  const first = createSampleLedger();

  const second = createSampleLedger();
  const months = new Set(
    first.invoices.map((record) => record.date?.slice(0, 7)),
  );

  expect(second).toEqual(first);
  expect(second.invoices[0]).not.toBe(first.invoices[0]);
  expect(months.size).toBe(24);
  expect([...months].sort()[0]).toBe('2024-10');
  expect([...months].sort().at(-1)).toBe('2026-09');
  expect(first.customers).toHaveLength(12);
  expect(
    new Set(first.invoices.map((record) => record.customerName)).size,
  ).toBe(12);
  expect(new Set(first.customers.map((c) => c.currency))).toEqual(
    new Set(['USD', 'EUR', 'GBP']),
  );
  for (const record of [...first.invoices, ...first.payments]) {
    expect(record.customerName).toBeTruthy();
    expect(record.reference).toBeTruthy();
    expect(record.description).toBeTruthy();
    expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(required(record.date) <= '2026-09-15').toBe(true);
  }
});
```

Also in the test `provides exact, partial, combined, ambiguous, and advance payment scenarios`, add at the end, before the closing `});`:

```ts
  // The scenario invoices are the only open candidates for their payments, so
  // the review flows never have to choose between a scenario and history.
  for (const customerId of ['northstar', 'cedar', 'harbor', 'atlas']) {
    const openIds = snapshot.invoices
      .filter((i) => i.customerId === customerId && i.outstandingCents > 0)
      .map((i) => i.id)
      .sort();
    const expected = {
      northstar: [sampleScenarios.exact.invoiceId],
      cedar: [sampleScenarios.partial.invoiceId],
      harbor: [...sampleScenarios.combined.invoiceIds],
      atlas: [...sampleScenarios.ambiguous.invoiceIds],
    }[customerId];
    expect(openIds).toEqual([...(expected ?? [])].sort());
  }
```

- [ ] **Step 2: Run to verify the customer-count assertion fails**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/sample-ledger.spec.ts`
Expected: FAIL on `first.customers` being undefined (old fixture has no customers).

- [ ] **Step 3: Rewrite `sample-ledger.ts`**

```ts
import type { Ledger, MoneyRecord } from '@invoicing/contracts';
import { clients } from './generator/clients';
import { DEFAULT_SEED, generateHistory } from './generator/history';

/** Stable record identities for the demo's unapplied payment scenarios. */
export const sampleScenarios = {
  exact: {
    paymentId: 'payment-northstar-exact',
    invoiceId: 'invoice-northstar-exact',
  },
  partial: {
    paymentId: 'payment-cedar-partial',
    invoiceId: 'invoice-cedar-partial',
  },
  combined: {
    paymentId: 'payment-harbor-combined',
    invoiceIds: ['invoice-harbor-api', 'invoice-harbor-migration'],
  },
  ambiguous: {
    paymentId: 'payment-atlas-ambiguous',
    invoiceIds: ['invoice-atlas-discovery', 'invoice-atlas-review'],
  },
  advance: { paymentId: 'payment-summit-advance' },
} as const;

const client = (id: string) => {
  const found = clients.find((c) => c.id === id);
  if (!found) throw new Error(`unknown_client:${id}`);
  return found;
};

const record = (
  clientId: string,
  id: string,
  amountCents: number,
  reference: string,
  description: string,
  date: string,
): MoneyRecord => ({
  id,
  customerId: clientId,
  customerName: client(clientId).name,
  currency: client(clientId).currency,
  amountCents,
  version: 1,
  reference,
  description,
  date,
});

/**
 * The ledger every visitor starts from: generated history for twelve clients
 * plus five hand-written September 2026 scenarios that exercise matching.
 * The scenario rows are appended last and never allocated, so the five
 * payments are the only unapplied cash in the base ledger.
 */
export function createSampleLedger(seed = DEFAULT_SEED): Ledger {
  const history = generateHistory(seed);
  return {
    ...history,
    invoices: [
      ...history.invoices,
      record(
        'northstar',
        sampleScenarios.exact.invoiceId,
        240000,
        'INV-202609-NS-101',
        'Authentication migration milestone',
        '2026-09-08',
      ),
      record(
        'cedar',
        sampleScenarios.partial.invoiceId,
        500000,
        'INV-202609-CH-102',
        'Patient portal accessibility sprint',
        '2026-09-08',
      ),
      record(
        'harbor',
        sampleScenarios.combined.invoiceIds[0],
        320000,
        'INV-202609-HC-103',
        'Inventory API integration',
        '2026-09-09',
      ),
      record(
        'harbor',
        sampleScenarios.combined.invoiceIds[1],
        180000,
        'INV-202609-HC-104',
        'Catalog migration',
        '2026-09-10',
      ),
      record(
        'atlas',
        sampleScenarios.ambiguous.invoiceIds[0],
        150000,
        'INV-202609-AA-105',
        'Analytics discovery workshop',
        '2026-09-10',
      ),
      record(
        'atlas',
        sampleScenarios.ambiguous.invoiceIds[1],
        150000,
        'INV-202609-AA-106',
        'Architecture review workshop',
        '2026-09-11',
      ),
    ],
    payments: [
      ...history.payments,
      record(
        'northstar',
        sampleScenarios.exact.paymentId,
        240000,
        'ACH INV-202609-NS-101',
        'Northstar Labs payment for authentication migration',
        '2026-09-12',
      ),
      record(
        'cedar',
        sampleScenarios.partial.paymentId,
        200000,
        'ACH INV-202609-CH-102 PARTIAL',
        'Cedar Health partial payment for accessibility sprint',
        '2026-09-12',
      ),
      record(
        'harbor',
        sampleScenarios.combined.paymentId,
        500000,
        'ACH INV-202609-HC-103 + INV-202609-HC-104',
        'Harbor Commerce combined payment for API integration and migration',
        '2026-09-14',
      ),
      record(
        'atlas',
        sampleScenarios.ambiguous.paymentId,
        150000,
        'ACH ATLAS SEPTEMBER WORKSHOP',
        'Atlas Analytics workshop payment; invoice reference not supplied',
        '2026-09-14',
      ),
      record(
        'summit',
        sampleScenarios.advance.paymentId,
        300000,
        'ACH SUMMIT OCTOBER ADVANCE',
        'Summit Logistics advance for upcoming October work; invoice not yet issued',
        '2026-09-15',
      ),
    ],
  };
}
```

- [ ] **Step 4: Run the whole server suite**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts`
Expected: all pass. The `uses a factory on create and reset` test still passes here because the store signature is unchanged until Task 8.

- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/server/src/sample-ledger.ts examples/invoicing/server/src/sample-ledger.spec.ts
git add examples/invoicing/server/src/sample-ledger.ts examples/invoicing/server/src/sample-ledger.spec.ts
git commit -m "feat(invoicing): build the sample ledger from generated history plus the five scenarios

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Ground-truth facts

**Files:**
- Create: `examples/invoicing/server/src/generator/facts.ts`
- Create: `examples/invoicing/server/src/generator/facts.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from 'vitest';
import { createSampleLedger } from '../sample-ledger';
import { agingBucket, deriveFacts } from './facts';

const facts = deriveFacts(createSampleLedger());
const customer = (id: string) => {
  const found = facts.customers.find((c) => c.customerId === id);
  if (!found) throw new Error(`missing customer ${id}`);
  return found;
};
const currency = (code: string) => {
  const found = facts.currencies.find((c) => c.currency === code);
  if (!found) throw new Error(`missing currency ${code}`);
  return found;
};

test.each([
  ['2026-09-01', 'current'],
  ['2026-08-16', 'current'],
  ['2026-08-15', 'days1to30'],
  ['2026-07-17', 'days1to30'],
  ['2026-07-16', 'days31to60'],
  ['2026-06-16', 'days61to90'],
  ['2026-05-17', 'over90'],
])('an invoice dated %s as of 2026-09-15 ages as %s', (date, bucket) => {
  expect(agingBucket(date, '2026-09-15')).toBe(bucket);
});

test('lists currencies sorted and totals reconcile with customers', () => {
  expect(facts.asOf).toBe('2026-09-15');
  expect(facts.currencies.map((c) => c.currency)).toEqual(['EUR', 'GBP', 'USD']);
  for (const c of facts.currencies) {
    const own = facts.customers.filter((x) => x.currency === c.currency);
    const sum = (key: 'invoicedCents' | 'receivedCents' | 'openCents') =>
      own.reduce((total, x) => total + x[key], 0);
    expect(c.invoicedCents).toBe(sum('invoicedCents'));
    expect(c.receivedCents).toBe(sum('receivedCents'));
    expect(c.openCents).toBe(sum('openCents'));
    const buckets = Object.values(c.aging).reduce((a, b) => a + b, 0);
    expect(buckets).toBe(c.openCents);
  }
});

test('profiles surface as measurable habits', () => {
  expect(customer('summit').openCents).toBe(0);
  expect(customer('summit').latePaymentRate).toBe(0);
  expect(customer('summit').averageDaysToPay).toBeGreaterThanOrEqual(5);
  expect(customer('summit').averageDaysToPay).toBeLessThanOrEqual(12);

  expect(customer('pioneer').averageDaysToPay).toBeGreaterThanOrEqual(35);
  expect(customer('pioneer').averageDaysToPay).toBeLessThanOrEqual(45);
  expect(customer('pioneer').latePaymentRate).toBe(1);

  expect(customer('juniper').latePaymentRate).toBeGreaterThan(0);
  expect(customer('juniper').latePaymentRate).toBeLessThan(1);
  expect(customer('juniper').openInvoiceIds.length).toBeGreaterThanOrEqual(1);

  expect(customer('granite').openInvoiceIds.length).toBeGreaterThanOrEqual(24);
  expect(customer('granite').profile).toBe('short-payer');
});

test('the largest open balance per currency is the customer with the most outstanding', () => {
  for (const c of facts.currencies) {
    const own = facts.customers
      .filter((x) => x.currency === c.currency && x.openCents > 0)
      .sort((a, b) => b.openCents - a.openCents);
    expect(c.largestOpen).toEqual(
      own[0] ? { customerId: own[0].customerId, openCents: own[0].openCents } : undefined,
    );
  }
  expect(currency('GBP').largestOpen).toBeDefined();
});

test('only payments with several candidate invoices are ambiguous', () => {
  expect(facts.ambiguousPaymentIds).toContain('payment-atlas-ambiguous');
  expect(facts.ambiguousPaymentIds).toContain('payment-harbor-combined');
  expect(facts.ambiguousPaymentIds).not.toContain('payment-northstar-exact');
  expect(facts.ambiguousPaymentIds).not.toContain('payment-summit-advance');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/generator/facts.spec.ts`
Expected: FAIL, cannot find module `./facts`.

- [ ] **Step 3: Implement**

`examples/invoicing/server/src/generator/facts.ts`:

```ts
import type { Ledger, PaymentProfile } from '@invoicing/contracts';
import { getSnapshot } from '../ledger';
import { AS_OF } from './clients';
import { daysBetween } from './dates';

/** Net terms every invoice is issued on. Overdue starts the day after. */
export const TERMS_DAYS = 30;

export interface AgingBuckets {
  readonly current: number;
  readonly days1to30: number;
  readonly days31to60: number;
  readonly days61to90: number;
  readonly over90: number;
}

export interface CustomerFacts {
  readonly customerId: string;
  readonly name: string;
  readonly currency: string;
  readonly profile: PaymentProfile;
  readonly invoicedCents: number;
  readonly receivedCents: number;
  readonly openCents: number;
  readonly unappliedCents: number;
  readonly openInvoiceIds: readonly string[];
  /** Mean days from invoice date to payment date over allocations; undefined with none. */
  readonly averageDaysToPay: number | undefined;
  /** Share of allocations paid after the terms elapsed, 0 to 1. */
  readonly latePaymentRate: number;
}

export interface CurrencyFacts {
  readonly currency: string;
  readonly invoicedCents: number;
  readonly receivedCents: number;
  readonly openCents: number;
  readonly unappliedCents: number;
  readonly largestOpen:
    | { readonly customerId: string; readonly openCents: number }
    | undefined;
  readonly aging: AgingBuckets;
}

/** Everything an eval or a customer card needs, computed, never typed. */
export interface LedgerFacts {
  readonly asOf: string;
  readonly customers: readonly CustomerFacts[];
  readonly currencies: readonly CurrencyFacts[];
  /** Unapplied payments with more than one open invoice to choose from. */
  readonly ambiguousPaymentIds: readonly string[];
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

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

/** Derive ground truth from a ledger. Pure; the same ledger gives the same facts. */
export function deriveFacts(ledger: Ledger, asOf = AS_OF): LedgerFacts {
  const snapshot = getSnapshot(ledger);
  const paymentsById = new Map(snapshot.payments.map((p) => [p.id, p]));
  const invoicesById = new Map(snapshot.invoices.map((i) => [i.id, i]));
  const lagsByCustomer = new Map<string, number[]>();
  for (const allocation of ledger.allocations) {
    const payment = paymentsById.get(allocation.paymentId);
    const invoice = invoicesById.get(allocation.invoiceId);
    if (!payment?.date || !invoice?.date) continue;
    const lags = lagsByCustomer.get(invoice.customerId) ?? [];
    lags.push(daysBetween(invoice.date, payment.date));
    lagsByCustomer.set(invoice.customerId, lags);
  }

  const customers: CustomerFacts[] = ledger.customers.map((c) => {
    const invoices = snapshot.invoices.filter((i) => i.customerId === c.id);
    const payments = snapshot.payments.filter((p) => p.customerId === c.id);
    const lags = lagsByCustomer.get(c.id) ?? [];
    return {
      customerId: c.id,
      name: c.name,
      currency: c.currency,
      profile: c.profile,
      invoicedCents: sum(invoices.map((i) => i.amountCents)),
      receivedCents: sum(payments.map((p) => p.amountCents)),
      openCents: sum(invoices.map((i) => i.outstandingCents)),
      unappliedCents: sum(payments.map((p) => p.unappliedCents)),
      openInvoiceIds: invoices
        .filter((i) => i.outstandingCents > 0)
        .map((i) => i.id),
      averageDaysToPay: lags.length
        ? Math.round(sum(lags) / lags.length)
        : undefined,
      latePaymentRate: lags.length
        ? lags.filter((lag) => lag > TERMS_DAYS).length / lags.length
        : 0,
    };
  });

  const currencies: CurrencyFacts[] = [
    ...new Set(ledger.customers.map((c) => c.currency)),
  ]
    .sort()
    .map((currency) => {
      const own = customers.filter((c) => c.currency === currency);
      const aging = {
        current: 0,
        days1to30: 0,
        days31to60: 0,
        days61to90: 0,
        over90: 0,
      };
      for (const invoice of snapshot.invoices) {
        if (invoice.currency !== currency || invoice.outstandingCents <= 0)
          continue;
        if (invoice.date)
          aging[agingBucket(invoice.date, asOf)] += invoice.outstandingCents;
        else aging.current += invoice.outstandingCents;
      }
      const largest = [...own]
        .filter((c) => c.openCents > 0)
        .sort((a, b) => b.openCents - a.openCents)[0];
      return {
        currency,
        invoicedCents: sum(own.map((c) => c.invoicedCents)),
        receivedCents: sum(own.map((c) => c.receivedCents)),
        openCents: sum(own.map((c) => c.openCents)),
        unappliedCents: sum(own.map((c) => c.unappliedCents)),
        largestOpen: largest
          ? { customerId: largest.customerId, openCents: largest.openCents }
          : undefined,
        aging,
      };
    });

  const ambiguousPaymentIds = snapshot.payments
    .filter(
      (p) =>
        p.unappliedCents > 0 &&
        snapshot.invoices.filter(
          (i) =>
            i.customerId === p.customerId &&
            i.currency === p.currency &&
            i.outstandingCents > 0,
        ).length > 1,
    )
    .map((p) => p.id);

  return { asOf, customers, currencies, ambiguousPaymentIds };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/generator/facts.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/server/src/generator
git add examples/invoicing/server/src/generator
git commit -m "feat(invoicing): derive ground-truth facts from the generated ledger

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Overlay primitives on the ledger

**Files:**
- Modify: `examples/invoicing/server/src/ledger.ts`
- Modify: `examples/invoicing/server/src/ledger.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `examples/invoicing/server/src/ledger.spec.ts`:

```ts
import { materialize, overlayOf } from './ledger';

const empty = { allocations: [], activities: [] };

test('an empty overlay materializes to the base ledger itself', () => {
  const base = createLedger();

  expect(materialize(base, empty)).toEqual(base);
});

test('applying a proposal to a materialized ledger yields an overlay that reproduces it', () => {
  const base = createLedger();
  const before = structuredClone(base);
  const proposal = createProposal(materialize(base, empty), request, ids);

  const next = applyProposal(materialize(base, empty), proposal);
  const overlay = overlayOf(base, next);

  expect(overlay.allocations).toHaveLength(1);
  expect(overlay.activities).toHaveLength(1);
  expect(materialize(base, overlay)).toEqual(next);
  expect(materialize(base, overlay).payments[0].version).toBe(2);
  expect(materialize(base, overlay).invoices[0].version).toBe(2);
  expect(base).toEqual(before);
});

test('a second allocation on the same records advances versions again', () => {
  const base = createLedger();
  const first = createProposal(materialize(base, empty), { ...request, amountCents: 100000 }, ids);
  const afterFirst = applyProposal(materialize(base, empty), first);
  const overlay = overlayOf(base, afterFirst);
  const second = createProposal(
    materialize(base, overlay),
    { ...request, amountCents: 140000 },
    { ...ids, proposalId: 'proposal-002', operationId: 'operation-002' },
  );

  const afterSecond = applyProposal(materialize(base, overlay), second);

  expect(overlayOf(base, afterSecond).allocations).toHaveLength(2);
  expect(materialize(base, overlayOf(base, afterSecond)).payments[0].version).toBe(3);
  expect(getSnapshot(materialize(base, overlayOf(base, afterSecond))).payments[0].unappliedCents).toBe(0);
});
```

Move the `import { materialize, overlayOf } from './ledger';` line up into the existing import from `./ledger` at the top of the file, so there is one import statement.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/ledger.spec.ts`
Expected: FAIL, `materialize` is not exported.

- [ ] **Step 3: Implement**

In `examples/invoicing/server/src/ledger.ts`, extend the import and add the two functions after `getSnapshot`:

```ts
import type {
  Ledger,
  LedgerOverlay,
  LedgerSnapshot,
  MoneyRecord,
  Proposal,
  ProposalRequest,
} from '@invoicing/contracts';
```

```ts
/**
 * The ledger one session sees: the shared base plus that session's own
 * allocations. Record versions advance once per overlay allocation touching
 * them, which is exactly how `applyProposal` advances them, so a ledger
 * produced by applying proposals and the same ledger rebuilt from its overlay
 * are equal.
 */
export function materialize(base: Ledger, overlay: LedgerOverlay): Ledger {
  const advance = <T extends MoneyRecord>(
    record: T,
    key: 'paymentId' | 'invoiceId',
  ): T => {
    const bumps = overlay.allocations.filter((a) => a[key] === record.id).length;
    return bumps === 0 ? record : { ...record, version: record.version + bumps };
  };
  return {
    customers: base.customers,
    payments: base.payments.map((p) => advance(p, 'paymentId')),
    invoices: base.invoices.map((i) => advance(i, 'invoiceId')),
    allocations: [...base.allocations, ...overlay.allocations],
    activities: [...base.activities, ...overlay.activities],
  };
}

/**
 * The overlay that materializes over `base` into `ledger`. Only meaningful
 * for a ledger produced by applying proposals to `materialize(base, …)`,
 * which appends and never reorders.
 */
export function overlayOf(base: Ledger, ledger: Ledger): LedgerOverlay {
  return {
    allocations: ledger.allocations.slice(base.allocations.length),
    activities: ledger.activities.slice(base.activities.length),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/ledger.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
npx prettier --write examples/invoicing/server/src/ledger.ts examples/invoicing/server/src/ledger.spec.ts
git add examples/invoicing/server/src/ledger.ts examples/invoicing/server/src/ledger.spec.ts
git commit -m "feat(invoicing): materialize a session ledger from a shared base and an overlay

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Sessions store an overlay, not a ledger

**Files:**
- Modify: `examples/invoicing/server/src/persistence/types.ts:8-18`
- Modify: `examples/invoicing/server/src/persistence/contract.spec.ts:1-13`
- Rewrite: `examples/invoicing/server/src/session-store.ts`
- Modify: `examples/invoicing/server/src/session-store.spec.ts`
- Modify: `examples/invoicing/server/src/sample-ledger.spec.ts`
- Modify: `examples/invoicing/server/src/services.ts:20`
- Modify: `examples/invoicing/server/browser-fixture.ts:15`
- Modify: `examples/invoicing/server/src/middleware.spec.ts:29`
- Modify: `examples/invoicing/server/src/assistant-middleware.spec.ts:92`
- Modify: `examples/invoicing/server/src/review-middleware.spec.ts:113`

- [ ] **Step 1: Change the session shape**

In `examples/invoicing/server/src/persistence/types.ts`, replace the `Session` interface and its import:

```ts
import type {
  DecisionRequest,
  DecisionResult,
  LedgerOverlay,
  Proposal,
} from '@invoicing/contracts';

/**
 * One session's authoritative state; plain records so it serialises to JSONB.
 * It is an overlay on the process-wide base ledger: only what this visitor
 * changed is stored. Rows written before this shape carry a `ledger` key and
 * no `allocations`; the session store normalizes them on load.
 */
export interface Session extends LedgerOverlay {
  readonly generation: number;
  readonly proposals: Readonly<Record<string, Proposal>>;
  readonly operations: Readonly<
    Record<
      string,
      { readonly request: DecisionRequest; readonly result: DecisionResult }
    >
  >;
}
```

In `examples/invoicing/server/src/persistence/contract.spec.ts`, remove `import { createLedger } from '../ledger';` and change `emptySession` to:

```ts
const emptySession = (): Session => ({
  generation: 1,
  allocations: [],
  activities: [],
  proposals: {},
  operations: {},
});
```

- [ ] **Step 2: Write the failing session-store tests**

In `examples/invoicing/server/src/session-store.spec.ts`, change the import line `import { createSampleLedger } from './sample-ledger';` to also import the ledger helpers:

```ts
import { createLedger } from './ledger';
import { createSampleLedger, sampleScenarios } from './sample-ledger';
import { ConflictError, type Session, type SessionRepository } from './persistence/types';
```

(remove the older `ConflictError, type SessionRepository` import so there is one.)

Change line 225 from `createSessionStore(repos.sessions, createSampleLedger)` to `createSessionStore(repos.sessions, createSampleLedger())`.

Append:

```ts
test('a session written before the overlay shape is read as an empty overlay and rewritten without its ledger', async () => {
  const repos = createMemoryRepositories();
  const legacy = {
    generation: 1,
    ledger: createLedger(),
    proposals: {},
    operations: {},
  } as unknown as Session;
  const id = await repos.sessions.create(legacy);
  const store = createSessionStore(repos.sessions);

  const before = await store.snapshot(id);
  const proposal = await store.propose(id, request);
  await store.decide(id, { ...proposal, decision: 'approve' });
  const stored = (await repos.sessions.load(id))!.value;

  expect(before.allocations).toHaveLength(0);
  expect(before.payments[0].unappliedCents).toBe(240000);
  expect(stored.allocations).toHaveLength(1);
  expect('ledger' in stored).toBe(false);
});

test('sessions share one base ledger, never mutate it, and store only their own changes', async () => {
  const repos = createMemoryRepositories();
  const base = createSampleLedger();
  const frozen = structuredClone(base);
  const store = createSessionStore(repos.sessions, base);
  const first = await store.createSession();
  const second = await store.createSession();
  const proposal = await store.propose(first, {
    ...sampleScenarios.partial,
    amountCents: 200000,
  });

  await store.decide(first, { ...proposal, decision: 'approve' });

  expect(base).toEqual(frozen);
  expect((await repos.sessions.load(first))!.value.allocations).toHaveLength(1);
  expect((await repos.sessions.load(second))!.value.allocations).toHaveLength(0);
  expect(
    (await store.snapshot(second)).invoices.find(
      (i) => i.id === sampleScenarios.partial.invoiceId,
    )?.outstandingCents,
  ).toBe(500000);
  expect(
    (await store.snapshot(first)).invoices.find(
      (i) => i.id === sampleScenarios.partial.invoiceId,
    )?.outstandingCents,
  ).toBe(300000);
  expect((await store.snapshot(first)).allocations).toHaveLength(
    base.allocations.length + 1,
  );
});
```

In `examples/invoicing/server/src/sample-ledger.spec.ts`, delete the whole test `uses a factory on create and reset and isolates shared seed objects`, and in `reset restores sample allocations after approval without affecting another session` change `createSampleLedger,` (the second argument) to `createSampleLedger(),`. Remove the now-unused `createMemoryRepositories` import only if it is no longer referenced (it still is, by the reset test; keep it).

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/session-store.spec.ts`
Expected: FAIL with type errors or `session.ledger` undefined.

- [ ] **Step 4: Rewrite the session store**

`examples/invoicing/server/src/session-store.ts`:

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
  materialize,
  overlayOf,
} from './ledger';
import {
  ConflictError,
  type Session,
  type SessionRepository,
} from './persistence/types';

/** Session-scoped API; callers never receive references to stored objects. */
export interface SessionStore {
  /** Allocate a new opaque session identity. */
  createSession(): Promise<string>;
  /** Read the current server-owned reset generation. */
  generation(sessionId: string): Promise<number>;
  /** Read the current financial snapshot. */
  snapshot(sessionId: string): Promise<LedgerSnapshot>;
  /** Prepare and store the authoritative allocation proposal. */
  propose(sessionId: string, request: ProposalRequest): Promise<Proposal>;
  /** Read a proposal belonging to this session. */
  proposal(sessionId: string, proposalId: string): Promise<Proposal>;
  /** Apply a user decision exactly once, retrying once on a concurrent write. */
  decide(sessionId: string, request: DecisionRequest): Promise<DecisionResult>;
  /** Read a recorded operation result within its owning session. */
  operationResult(
    sessionId: string,
    operationId: string,
  ): Promise<DecisionResult | undefined>;
  /** Drop this session's changes and invalidate earlier proposal generations. */
  reset(sessionId: string): Promise<LedgerSnapshot>;
}

type Transition<R> = (session: Session) => {
  readonly session: Session;
  readonly result: R;
};

const empty = (generation: number): Session => ({
  generation,
  allocations: [],
  activities: [],
  proposals: {},
  operations: {},
});

/**
 * Rows written before sessions became overlays hold a full `ledger` and no
 * `allocations`. Rebuilding the document from named fields drops the old key
 * on the next commit and reads the row as a fresh overlay on today's base.
 */
const normalize = (
  value: Partial<Session> & Pick<Session, 'generation'>,
): Session => ({
  generation: value.generation,
  allocations: value.allocations ?? [],
  activities: value.activities ?? [],
  proposals: value.proposals ?? {},
  operations: value.operations ?? {},
});

/**
 * Every mutation is one compare-and-swap of the session document. The base
 * ledger is shared by every session and never written; a session sees
 * `materialize(base, session)`.
 */
export function createSessionStore(
  repository: SessionRepository,
  base: Ledger = createLedger(),
): SessionStore {
  const load = async (id: string) => {
    const doc = await repository.load(id);
    if (!doc) throw new Error('session_not_found');
    return { version: doc.version, value: normalize(doc.value) };
  };
  const view = (session: Session) => materialize(base, session);
  const mutate = async <R>(
    id: string,
    transition: Transition<R>,
  ): Promise<R> => {
    for (let attempt = 0; ; attempt += 1) {
      const doc = await load(id);
      const { session, result } = transition(doc.value);
      if (session === doc.value) return result;
      try {
        await repository.commit(id, doc.version, session);
        return result;
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt === 1) throw error;
      }
    }
  };

  return {
    createSession() {
      return repository.create(empty(1));
    },
    async generation(id) {
      return (await load(id)).value.generation;
    },
    async snapshot(id) {
      return getSnapshot(view((await load(id)).value));
    },
    propose: (id, request) =>
      mutate(id, (session) => {
        const proposal = createProposal(view(session), request, {
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
            ? applyProposal(view(session), proposal)
            : view(session);
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
            ...overlayOf(base, ledger),
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
        const next = empty(session.generation + 1);
        return { session: next, result: getSnapshot(view(next)) };
      }),
  };
}
```

- [ ] **Step 5: Update the callers**

- `examples/invoicing/server/src/services.ts` line 20: `createSessionStore(repositories.sessions, createSampleLedger())`.
- `examples/invoicing/server/browser-fixture.ts` line 15: `createSessionStore(repositories.sessions, createSampleLedger())`.
- `examples/invoicing/server/src/middleware.spec.ts` line 29: `createSessionStore(repositories.sessions, createSampleLedger())`.
- `examples/invoicing/server/src/assistant-middleware.spec.ts` line 92: change `createSessionStore(repositories.sessions, () => ({` to `createSessionStore(repositories.sessions, {` and the matching `}));` that closes that literal (line 115 after Task 1's insertion) to `});`.
- `examples/invoicing/server/src/review-middleware.spec.ts` line 113: same edit as the previous bullet.

- [ ] **Step 6: Run the whole server suite and typecheck**

Run:

```bash
npx nx run-many -t build,test,lint -p invoicing-server
```

Expected: build passes, every spec passes, lint clean. If `tsc` reports a `Session` literal somewhere still carrying `ledger`, it is a caller missed in step 5.

- [ ] **Step 7: Commit**

```bash
npx prettier --write examples/invoicing/server
git add -A examples/invoicing/server
git commit -m "refactor(invoicing): store a session as an overlay on a shared base ledger

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Postgres lane, e2e counts, README, spec amendment

**Files:**
- Modify: `examples/invoicing/e2e/live.spec.ts:12-14` and the two later `toHaveLength` on allocations
- Modify: `examples/invoicing/README.md:1-25`
- Modify: `docs/superpowers/specs/2026-09-19-invoicing-generative-ui-design.md` (client table)

- [ ] **Step 1: Run the repository contract against Postgres**

```bash
docker start hashbrown-pg
TEST_DATABASE_URL=postgres://postgres:hashbrown@127.0.0.1:5439/hashbrown npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/persistence
```

Expected: 10 passed (5 memory, 5 postgres). The container is the throwaway one from the previous session; if `docker start` fails because it no longer exists, recreate it:

```bash
docker run -d --name hashbrown-pg -e POSTGRES_PASSWORD=hashbrown -e POSTGRES_DB=hashbrown -p 5439:5432 postgres:16
```

- [ ] **Step 2: Make the live e2e counts relative**

In `examples/invoicing/e2e/live.spec.ts`, replace lines 12 to 14:

```ts
  expect(baseline.payments.length).toBeGreaterThan(100);
  expect(baseline.invoices.length).toBeGreaterThan(100);
  expect(baseline.allocations.length).toBeGreaterThan(100);
```

Replace `expect(applied.allocations).toHaveLength(145);` with:

```ts
  expect(applied.allocations).toHaveLength(baseline.allocations.length + 1);
```

Find the later assertion on `final.allocations` (after the Cedar partial approval) and replace its fixed count with `baseline.allocations.length + 2`. Run `grep -n "toHaveLength" examples/invoicing/e2e/live.spec.ts` to confirm no fixed allocation count remains.

Run: `npx nx run invoicing-e2e:build`
Expected: passes.

- [ ] **Step 3: Update the README opening**

Replace the first two paragraphs of `examples/invoicing/README.md` (from `The React / Hashbrown / Pretable / B4 example includes` through `- Summit Logistics: an advance with no outstanding invoice.`) with:

```markdown
The React / Hashbrown / Pretable / B4 example includes a deterministic ledger
for a software consulting firm: two years of invoices and payments for twelve
fictional clients billed in USD, EUR and GBP, generated from a fixed seed by
`server/src/generator`. Each client has a payment profile that shapes its
history: on time, late by a fixed lag, drifting later every month, short-paying
by an early-payment discount, batching several invoices into one transfer, or
citing the previous invoice on every remittance. The fixed simulated as-of date
is **September 15, 2026**. `server/src/generator/facts.ts` derives ground truth
from the ledger (aging, days to pay, late-payment rates), which the evals and
customer views read from.

The base ledger is built once per process and shared by every visitor. A
session stores only what its visitor changed: allocations, proposals and
operation results. Reset drops those and returns the visitor to the base.

Five incoming payments initially have unapplied cash totaling **$13,900**:

- Northstar Labs: exact invoice match ($2,400).
- Cedar Health: partial payment against a larger invoice.
- Harbor Commerce: one payment covering two invoices.
- Atlas Analytics: an ambiguous choice between two invoices.
- Summit Logistics: an advance with no outstanding invoice.
```

- [ ] **Step 4: Amend the spec's client table**

In `docs/superpowers/specs/2026-09-19-invoicing-generative-ui-design.md`, replace the table and the two sentences after it (from `Inputs are a client table and a seed. Ten clients` through `Four new clients are added\nfor EUR and GBP coverage.`) with:

```markdown
Inputs are a client table and a seed. Twelve clients across three currencies:

| Currency | Clients | Profiles represented |
| -------- | ------- | -------------------- |
| USD      | 8       | on-time ×4, wrong-reference, late-drifting, late-fixed, short-payer |
| EUR      | 2       | on-time, batch-payer |
| GBP      | 2       | late-drifting, short-payer |

The six existing USD clients keep their IDs and names. The five scenario
clients settle every generated invoice by the as-of date (four `on-time`,
Atlas `wrong-reference`, which also pays on time): the review flows in the e2e
suite depend on a scenario invoice being the only outstanding candidate for
its payment. Juniper is `late-drifting`. Six new clients carry the remaining
profiles: two USD, two EUR, two GBP.
```

Also replace `server/src/ledger/generate.ts` with `server/src/generator/history.ts`
and `server/src/ledger/facts.ts` with `server/src/generator/facts.ts` wherever the
spec names them (the "Base ledger", "Ground truth" and "Delivery" sections): a
`ledger/` directory beside the existing `ledger.ts` would make `./ledger`
imports ambiguous to a reader.

- [ ] **Step 5: Run everything**

```bash
npx nx run-many -t build,test,lint -p invoicing-contracts invoicing-server invoicing-react invoicing-e2e
npx nx run invoicing-e2e:example-e2e
```

Expected: all targets pass; the deterministic Playwright suite passes (it drives Atlas, Harbor, Summit, Northstar and Cedar reviews against the browser fixture, which now serves the generated ledger).

- [ ] **Step 6: Commit**

```bash
npx prettier --write examples/invoicing/README.md examples/invoicing/e2e/live.spec.ts docs/superpowers/specs/2026-09-19-invoicing-generative-ui-design.md
git add examples/invoicing/README.md examples/invoicing/e2e/live.spec.ts docs/superpowers/specs/2026-09-19-invoicing-generative-ui-design.md docs/superpowers/plans/2026-09-19-invoicing-generated-ledger.md
git commit -m "docs(invoicing): describe the generated ledger and make live e2e counts relative

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Pull request

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin blove/invoicing-vercel-example-dcc083
gh pr create --title "feat(invoicing): generate the ledger from client payment profiles; sessions store an overlay" --body "$(cat <<'EOF'
## Summary

PR 1 of 4 from docs/superpowers/specs/2026-09-19-invoicing-generative-ui-design.md.

- The sample ledger is generated from a fixed seed: twelve clients across USD, EUR and GBP, each with a payment profile (on-time, late-fixed, late-drifting, short-payer, batch-payer, wrong-reference). The five named scenarios keep their IDs.
- `generator/facts.ts` derives ground truth (aging, days to pay, late-payment rate, ambiguous payments) for later evals and customer views.
- A session no longer stores a full ledger copy. It stores an overlay (allocations, activities, proposals, operations) over a process-wide base. Old Postgres rows with a `ledger` key are normalized on load and rewritten without it.
- `Ledger` gains `customers`; `LedgerOverlay` is a new contract type.

Spec amendment: the scenario clients must settle all generated invoices by the as-of date so the existing review flows keep exactly one candidate invoice. The interesting profiles live on six new clients.

## Test plan

- [ ] `npx nx run-many -t build,test,lint -p invoicing-contracts invoicing-server invoicing-react invoicing-e2e`
- [ ] `npx nx run invoicing-e2e:example-e2e`
- [ ] Postgres repository contract against the local container
- [ ] Preview deployment: `/api/snapshot` returns customers and unapplied total of $13,900; a review approves and resets cleanly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Verify the preview deployment, not only local**

When the deploy workflow publishes a preview, fetch `/api/snapshot` from it and check the response has a `customers` array of 12 and the five scenario payments unapplied. Drive one review to approval and one reset in the browser. Record the preview URL and the outcome in the PR as a comment.
