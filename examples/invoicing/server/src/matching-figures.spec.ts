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
