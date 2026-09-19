import type { Ledger, MoneyRecord } from '@invoicing/contracts';

const clients = [
  {
    id: 'northstar',
    name: 'Northstar Labs',
    service: 'Platform engineering',
    fee: 960000,
  },
  {
    id: 'cedar',
    name: 'Cedar Health',
    service: 'Patient portal development',
    fee: 720000,
  },
  {
    id: 'harbor',
    name: 'Harbor Commerce',
    service: 'Commerce API integration',
    fee: 840000,
  },
  {
    id: 'atlas',
    name: 'Atlas Analytics',
    service: 'Data platform consulting',
    fee: 600000,
  },
  {
    id: 'summit',
    name: 'Summit Logistics',
    service: 'Dispatch software support',
    fee: 480000,
  },
  {
    id: 'juniper',
    name: 'Juniper Studio',
    service: 'Web application development',
    fee: 360000,
  },
] as const;

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

/** Build two years of deterministic consulting history as of September 15, 2026. */
export function createSampleLedger(): Ledger {
  const history = Array.from({ length: 24 }, (_, index) => {
    const year = 2024 + Math.floor((9 + index) / 12);
    const month = `${year}-${String(((9 + index) % 12) + 1).padStart(2, '0')}`;
    return clients.map((client) => {
      const key = `${client.id}-${month}`;
      const reference = `INV-${month.replace('-', '')}-${client.id.toUpperCase()}`;
      const common = {
        customerId: client.id,
        customerName: client.name,
        currency: 'USD',
        amountCents: client.fee + Math.floor(index / 12) * 30000,
        version: 2,
      };
      return {
        invoice: {
          ...common,
          id: `invoice-${key}`,
          date: `${month}-01`,
          reference,
          description: `${client.service} — ${month} monthly retainer`,
        },
        payment: {
          ...common,
          id: `payment-${key}`,
          date: `${month}-10`,
          reference: `ACH ${reference}`,
          description: `${client.name} monthly consulting payment`,
        },
        allocation: {
          paymentId: `payment-${key}`,
          invoiceId: `invoice-${key}`,
          amountCents: common.amountCents,
          proposalId: `historical-proposal-${key}`,
        },
        activity: {
          operationId: `historical-operation-${key}`,
          proposalId: `historical-proposal-${key}`,
          description: `${month}-10: Applied ${client.name} payment to ${reference}`,
        },
      };
    });
  }).flat();
  const record = (
    clientIndex: number,
    id: string,
    amountCents: number,
    reference: string,
    description: string,
    date: string,
  ): MoneyRecord => ({
    id,
    customerId: clients[clientIndex].id,
    customerName: clients[clientIndex].name,
    currency: 'USD',
    amountCents,
    version: 1,
    reference,
    description,
    date,
  });
  return {
    customers: [],
    invoices: [
      ...history.map((item) => item.invoice),
      record(
        0,
        sampleScenarios.exact.invoiceId,
        240000,
        'INV-202609-NS-101',
        'Authentication migration milestone',
        '2026-09-08',
      ),
      record(
        1,
        sampleScenarios.partial.invoiceId,
        500000,
        'INV-202609-CH-102',
        'Patient portal accessibility sprint',
        '2026-09-08',
      ),
      record(
        2,
        sampleScenarios.combined.invoiceIds[0],
        320000,
        'INV-202609-HC-103',
        'Inventory API integration',
        '2026-09-09',
      ),
      record(
        2,
        sampleScenarios.combined.invoiceIds[1],
        180000,
        'INV-202609-HC-104',
        'Catalog migration',
        '2026-09-10',
      ),
      record(
        3,
        sampleScenarios.ambiguous.invoiceIds[0],
        150000,
        'INV-202609-AA-105',
        'Analytics discovery workshop',
        '2026-09-10',
      ),
      record(
        3,
        sampleScenarios.ambiguous.invoiceIds[1],
        150000,
        'INV-202609-AA-106',
        'Architecture review workshop',
        '2026-09-11',
      ),
    ],
    payments: [
      ...history.map((item) => item.payment),
      record(
        0,
        sampleScenarios.exact.paymentId,
        240000,
        'ACH INV-202609-NS-101',
        'Northstar Labs payment for authentication migration',
        '2026-09-12',
      ),
      record(
        1,
        sampleScenarios.partial.paymentId,
        200000,
        'ACH INV-202609-CH-102 PARTIAL',
        'Cedar Health partial payment for accessibility sprint',
        '2026-09-12',
      ),
      record(
        2,
        sampleScenarios.combined.paymentId,
        500000,
        'ACH INV-202609-HC-103 + INV-202609-HC-104',
        'Harbor Commerce combined payment for API integration and migration',
        '2026-09-14',
      ),
      record(
        3,
        sampleScenarios.ambiguous.paymentId,
        150000,
        'ACH ATLAS SEPTEMBER WORKSHOP',
        'Atlas Analytics workshop payment; invoice reference not supplied',
        '2026-09-14',
      ),
      record(
        4,
        sampleScenarios.advance.paymentId,
        300000,
        'ACH SUMMIT OCTOBER ADVANCE',
        'Summit Logistics advance for upcoming October work; invoice not yet issued',
        '2026-09-15',
      ),
    ],
    allocations: history.map((item) => item.allocation),
    activities: history.map((item) => item.activity),
  };
}
