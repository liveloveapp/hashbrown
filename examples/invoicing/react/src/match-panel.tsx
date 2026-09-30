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
   * Hands the checked invoices that receive money, in fill order, to the
   * assistant's approval flow. Absent while the assistant is unavailable.
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
  const paid = plan.lines
    .filter((l) => l.amountCents > 0)
    .map((l) => l.invoiceId);
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
                <span className="visually-hidden">Select</span>
              </th>
              <th scope="col">Invoice</th>
              <th scope="col">Issued</th>
              <th scope="col">Balance</th>
              <th scope="col">Amount applied</th>
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
          <p
            className="match-total"
            data-ties-out={tiesOut || undefined}
            aria-live="polite"
          >
            {money(plan.appliedCents, payment.currency)} of{' '}
            {money(payment.unappliedCents, payment.currency)}
            {tiesOut ? ' ✓' : ''}
          </p>
          <button
            type="button"
            disabled={!onReview || paid.length === 0}
            onClick={() => onReview?.(payment.id, paid)}
          >
            Review match
          </button>
        </div>
      )}
      {!onReview && payment.unappliedCents > 0 && candidates.length > 0 && (
        <p className="muted">Matching opens once the assistant is connected.</p>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
