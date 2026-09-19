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
