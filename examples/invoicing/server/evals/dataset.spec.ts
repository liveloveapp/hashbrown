import { describe, expect, test } from 'vitest';
import assistantEval, {
  closingIsSilent,
} from '../src/app/assistant/evals/assistant.eval';
import { AS_OF } from '../src/generator/clients';
import { agingBucket, deriveFacts } from '../src/generator/facts';
import { getSnapshot } from '../src/ledger';
import { createSampleLedger } from '../src/sample-ledger';

const cases = assistantEval.dataset;
if (!Array.isArray(cases)) throw new Error('dataset must be inline');
const caseNamed = (name: string) => cases.find((c) => c.name === name);
const ledger = createSampleLedger();
const facts = deriveFacts(ledger);

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
    expect(caseNamed('gbp over 90 days')?.expected).not.toBe(
      caseNamed('gbp largest open balance')?.expected,
    );
    expect(caseNamed('cedar open invoices')?.expected).toEqual([
      'invoice-cedar-partial',
    ]);
    expect(caseNamed('unapplied total')?.expected).toBe('$13,900.00');
    expect(caseNamed('unapplied total')?.metadata).toEqual({
      paymentIds: [
        'payment-northstar-exact',
        'payment-cedar-partial',
        'payment-harbor-combined',
        'payment-atlas-ambiguous',
        'payment-summit-advance',
      ],
    });
    expect(caseNamed('atlas match')?.expected).toBe('payment-atlas-ambiguous');
  });

  test('the over-90 expectation agrees with an independent computation', () => {
    const snapshot = getSnapshot(ledger);
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

  test('habit cases name the customer and carry the profile the ledger assigns', () => {
    const profiles = {
      summit: 'on-time',
      pioneer: 'late-fixed',
      granite: 'short-payer',
    };
    for (const [customerId, profile] of Object.entries(profiles)) {
      const c = caseNamed(`habit ${customerId}`);
      const customer = facts.customers.find((f) => f.customerId === customerId);
      expect(c?.expected).toBe(profile);
      expect(c?.metadata).toEqual({ customerId });
      expect(String(c?.input)).toContain(customer?.name);
    }
  });
});

describe('closingIsSilent', () => {
  test('accepts the three closings the client renders nothing for', () => {
    expect(closingIsSilent('{"ui":[]}')).toBe(true);
    expect(closingIsSilent(' {} \n')).toBe(true);
    expect(closingIsSilent('')).toBe(true);
  });

  test('rejects prose, because the client shows an error alert for it', () => {
    expect(closingIsSilent('Done, let me know if you need more.')).toMatch(
      /prose .* error alert/,
    );
  });

  test('rejects UI outside render', () => {
    expect(
      closingIsSilent('{"ui":[{"AssistantText":{"props":{"text":"hi"}}}]}'),
    ).toMatch(/UI outside render/);
  });

  test('rejects any other JSON, because the client prints it as text', () => {
    for (const text of [
      '[]',
      'null',
      '{"ui":null}',
      '{"text":"hi"}',
      '{"ui":[],"x":1}',
    ]) {
      expect(closingIsSilent(text), text).toMatch(/prints it as text/);
    }
  });
});
