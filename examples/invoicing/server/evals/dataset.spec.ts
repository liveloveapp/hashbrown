import { describe, expect, test } from 'vitest';
import assistantEval from '../src/app/assistant/evals/assistant.eval';
import { AS_OF } from '../src/generator/clients';
import { agingBucket } from '../src/generator/facts';
import { getSnapshot } from '../src/ledger';
import { createSampleLedger } from '../src/sample-ledger';

const cases = assistantEval.dataset;
if (!Array.isArray(cases)) throw new Error('dataset must be inline');
const caseNamed = (name: string) => cases.find((c) => c.name === name);

describe('assistant eval dataset', () => {
  test('has nine uniquely named cases', () => {
    expect(cases).toHaveLength(9);
    expect(new Set(cases.map((c) => c.name)).size).toBe(9);
  });

  test('every scorer is named', () => {
    for (const scorer of assistantEval.scorers) {
      expect(scorer.name).toMatch(/\S/);
    }
    expect(assistantEval.scorers.map((s) => s.name)).toContain('llmJudge');
  });

  test('expectations are computed from the sample ledger', () => {
    // Thistle's open GBP balance is the largest, but its late-drifting
    // invoices are all recent; Kestrel's short-pays are the only GBP money
    // more than 90 days past terms.
    expect(caseNamed('gbp largest open balance')?.expected).toBe('thistle');
    expect(caseNamed('gbp over 90 days')?.expected).toBe('kestrel');
    expect(caseNamed('cedar open invoices')?.expected).toEqual([
      'invoice-cedar-partial',
    ]);
    expect(caseNamed('unapplied total')?.expected).toBe('$13,900.00');
    expect(caseNamed('unapplied total')?.metadata).toEqual({ paymentCount: 5 });
    expect(caseNamed('atlas match')?.expected).toBe('payment-atlas-ambiguous');
  });

  test('the over-90 expectation agrees with an independent computation', () => {
    const snapshot = getSnapshot(createSampleLedger());
    const over90 = new Map<string, number>();
    for (const invoice of snapshot.invoices) {
      if (invoice.currency !== 'GBP' || invoice.outstandingCents <= 0) continue;
      if (!invoice.date || agingBucket(invoice.date, AS_OF) !== 'over90')
        continue;
      over90.set(
        invoice.customerId,
        (over90.get(invoice.customerId) ?? 0) + invoice.outstandingCents,
      );
    }
    const [top] = [...over90.entries()].sort((a, b) => b[1] - a[1]);
    expect(top[1]).toBeGreaterThan(0);
    expect(caseNamed('gbp over 90 days')?.expected).toBe(top[0]);
  });

  test('habit cases carry the profile the ledger assigns', () => {
    expect(caseNamed('habit summit')?.expected).toBe('on-time');
    expect(caseNamed('habit pioneer')?.expected).toBe('late-fixed');
    expect(caseNamed('habit granite')?.expected).toBe('short-payer');
  });
});
