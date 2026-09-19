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
