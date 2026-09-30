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
 * first). For `ambiguous` they are the tied candidates found; the tie-out
 * search stops after two sets, so they may be a sample of every tie.
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

/**
 * Every `size`-invoice combination summing to `target`, stopping after two.
 * `invoices` must be sorted by outstanding balance ascending, so the search
 * stops a branch as soon as the next invoice overshoots, or when even the
 * largest balances cannot reach the target.
 */
function combinationsSumming(
  invoices: readonly Invoice[],
  size: number,
  target: number,
): Invoice[][] {
  const found: Invoice[][] = [];
  const largest = invoices.at(-1)?.outstandingCents ?? 0;
  const walk = (start: number, chosen: Invoice[], total: number) => {
    if (found.length > 1) return;
    if (chosen.length === size) {
      if (total === target) found.push(chosen);
      return;
    }
    if (total + largest * (size - chosen.length) < target) return;
    for (let i = start; i < invoices.length; i++) {
      const next = total + invoices[i].outstandingCents;
      if (next > target) break;
      walk(i + 1, [...chosen, invoices[i]], next);
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
  const smaller = candidates
    .filter((i) => i.outstandingCents < target)
    .toSorted((a, b) => a.outstandingCents - b.outstandingCents);
  const inFillOrder = (chosen: readonly Invoice[]) =>
    candidates.filter((i) => chosen.includes(i));
  for (let size = 2; size <= MAX_TIE_OUT_INVOICES; size++) {
    const sets = combinationsSumming(smaller, size, target);
    if (sets.length === 1)
      return { kind: 'ties-out', invoiceIds: ids(inFillOrder(sets[0])) };
    if (sets.length > 1)
      return { kind: 'ambiguous', invoiceIds: ids(inFillOrder(sets.flat())) };
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
