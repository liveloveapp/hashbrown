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

/** A generated invoice or payment always has a date and a reference. */
type Dated = MoneyRecord & {
  readonly date: string;
  readonly reference: string;
};

interface Issued {
  readonly invoice: Dated;
  /** 0-based month of history the invoice belongs to. */
  readonly monthIndex: number;
}

interface Settlement {
  readonly payment: Dated;
  readonly allocations: readonly Allocation[];
}

/**
 * Ninety-eight percent of the amount. Every generated amount is a multiple
 * of 100 cents, so the result is exact.
 */
const shortPaid = (amountCents: number) => Math.round((amountCents * 98) / 100);

/**
 * One retainer on the first of every month, plus one to three project
 * invoices per quarter on the fifteenth. Retainers rise by 30,000 cents in
 * the second year. The as-of month has not had its project billing run yet,
 * so it never carries a project invoice.
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
  // Retainers fall on the 1st and project invoices on the 15th of distinct
  // months, so no client issues two invoices on one date: no tie-break needed.
  return issued.sort((a, b) =>
    a.invoice.date < b.invoice.date
      ? -1
      : a.invoice.date > b.invoice.date
        ? 1
        : 0,
  );
}

/** Days from issue to payment for a single-invoice settlement. */
function lagFor(
  profile: PaymentProfile,
  monthIndex: number,
  random: Random,
): number {
  switch (profile) {
    case 'on-time':
    case 'wrong-reference':
      return random.int(5, 12);
    case 'late-fixed':
      return random.int(35, 45);
    case 'late-drifting':
      return (
        20 + Math.round((monthIndex * 55) / (MONTHS - 1)) + random.int(0, 4)
      );
    case 'short-payer':
      return random.int(3, 10);
    case 'batch-payer':
      throw new Error('batch payers are settled in batches');
  }
}

/** The invoice issued just before this one for the same client, if any. */
function previousReference(item: Issued, issued: readonly Issued[]) {
  const index = issued.indexOf(item);
  return index > 0
    ? issued[index - 1].invoice.reference
    : item.invoice.reference;
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
    if (date > AS_OF) break; // later batches are also in the future
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
    invoices: invoices.map((i) => ({
      ...i,
      version: version(i.id, 'invoiceId'),
    })),
    payments: payments.map((p) => ({
      ...p,
      version: version(p.id, 'paymentId'),
    })),
    allocations,
    activities,
  };
}
