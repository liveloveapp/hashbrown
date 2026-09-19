import { isDeepStrictEqual } from 'node:util';
import type {
  AssistantRenderInput,
  LedgerSnapshot,
} from '@invoicing/contracts';

const MAX_COMPONENTS = 20;
const MAX_TABLE_ROWS = 50;
const MAX_TEXT = 4000;
const MAX_TITLE = 120;
const MIN_MONTHS = 3;
const MAX_MONTHS = 24;
/** How many times the echo may try to reproduce the tree before rendering fails. */
const ECHO_ATTEMPTS = 2;

/** A Hashbrown UI node: one component key holding `props` and, for text, `children`. */
export type CanonicalNode = Readonly<Record<string, unknown>>;

/** The canonical tree: what the echo must reproduce byte for byte. */
export interface CanonicalUi {
  readonly ui: readonly CanonicalNode[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function fail(detail: string): never {
  throw new Error(`invalid_ui: ${detail}`);
}

/**
 * Check a composed answer against the kit and this session's snapshot and
 * return the Hashbrown-shaped tree the client renders: one AssistantText
 * whose children are the validated leaves. Every ID must resolve; an omitted
 * customer becomes an explicit null because the kit schema requires the key.
 * Extra keys inside a leaf are dropped. Throws `invalid_ui: <detail>` naming
 * the offending component and value so the model can fix it.
 */
export function validateUi(
  snapshot: LedgerSnapshot,
  input: AssistantRenderInput,
): CanonicalUi {
  if (!record(input)) fail('input must be an object');
  const text = input.text;
  if (typeof text !== 'string' || !text.trim()) fail('text is empty');
  if (text.length > MAX_TEXT)
    fail(`text is longer than ${MAX_TEXT} characters`);
  const components: unknown = input.components ?? [];
  if (!Array.isArray(components)) fail('components must be an array');
  if (components.length > MAX_COMPONENTS) fail('too many components');

  const customers = new Map(snapshot.customers.map((c) => [c.id, c]));
  const currencies = new Set(snapshot.customers.map((c) => c.currency));
  const invoices = new Set(snapshot.invoices.map((i) => i.id));
  const payments = new Map(snapshot.payments.map((p) => [p.id, p]));

  const leaf = (node: unknown, index: number): CanonicalNode => {
    const at = `components[${index}]`;
    if (!record(node) || Object.keys(node).length !== 1)
      fail(`${at}: each component must have exactly one component key`);
    const [name] = Object.keys(node);
    const props = node[name];
    if (!record(props)) fail(`${at}.${name} has no props`);
    const p = props;

    const requireCurrency = (currency: unknown): string => {
      if (typeof currency !== 'string' || !currencies.has(currency))
        fail(`${at}.${name}.currency: unknown currency ${String(currency)}`);
      return currency;
    };
    const requireCustomer = (customerId: unknown, currency?: string) => {
      const customer =
        typeof customerId === 'string' ? customers.get(customerId) : undefined;
      if (!customer)
        fail(
          `${at}.${name}.customerId: unknown customer ${String(customerId)}`,
        );
      if (currency && customer.currency !== currency)
        fail(
          `${at}.${name}.customerId: customer ${customer.id} is billed in ${customer.currency}, not ${currency}`,
        );
      return customer.id;
    };
    const optionalCustomer = (customerId: unknown, currency: string) =>
      customerId === undefined || customerId === null
        ? null
        : requireCustomer(customerId, currency);

    switch (name) {
      case 'LedgerTable': {
        const ids: unknown = p.recordIds;
        if (
          !Array.isArray(ids) ||
          ids.length < 1 ||
          ids.length > MAX_TABLE_ROWS
        )
          fail(
            `${at}.LedgerTable.recordIds must have 1 to ${MAX_TABLE_ROWS} ids`,
          );
        const recordIds: string[] = [];
        for (const id of ids as unknown[]) {
          if (typeof id !== 'string')
            fail(`${at}.LedgerTable.recordIds: unknown record ${String(id)}`);
          if (!invoices.has(id) && !payments.has(id))
            fail(`${at}.LedgerTable.recordIds: unknown record ${id}`);
          if (recordIds.includes(id))
            fail(`${at}.LedgerTable.recordIds: duplicate record ${id}`);
          recordIds.push(id);
        }
        const title = p.title;
        if (typeof title !== 'string' || !title.trim())
          fail(`${at}.LedgerTable.title is empty`);
        if (title.length > MAX_TITLE)
          fail(
            `${at}.LedgerTable.title is longer than ${MAX_TITLE} characters`,
          );
        return { LedgerTable: { props: { title, recordIds } } };
      }
      case 'TrendChart': {
        const currency = requireCurrency(p.currency);
        const months = p.months;
        if (
          typeof months !== 'number' ||
          !Number.isInteger(months) ||
          months < MIN_MONTHS ||
          months > MAX_MONTHS
        )
          fail(
            `${at}.TrendChart.months must be a whole number from ${MIN_MONTHS} to ${MAX_MONTHS}`,
          );
        return {
          TrendChart: {
            props: {
              currency,
              customerId: optionalCustomer(p.customerId, currency),
              months,
            },
          },
        };
      }
      case 'AgingSummary': {
        const currency = requireCurrency(p.currency);
        return {
          AgingSummary: {
            props: {
              currency,
              customerId: optionalCustomer(p.customerId, currency),
            },
          },
        };
      }
      case 'CustomerCard':
        return {
          CustomerCard: {
            props: { customerId: requireCustomer(p.customerId) },
          },
        };
      case 'ReviewPayment': {
        const id = p.paymentId;
        const payment = typeof id === 'string' ? payments.get(id) : undefined;
        if (!payment)
          fail(`${at}.ReviewPayment.paymentId: unknown payment ${String(id)}`);
        if (payment.unappliedCents <= 0)
          fail(
            `${at}.ReviewPayment.paymentId: payment ${payment.id} has no unapplied balance`,
          );
        return { ReviewPayment: { props: { paymentId: payment.id } } };
      }
      default:
        return fail(`${at}.${name}: unknown component ${name}`);
    }
  };

  return {
    ui: [
      {
        AssistantText: {
          props: { text },
          children: components.map(leaf),
        },
      },
    ],
  };
}

/**
 * Push a canonical tree to the client through the nested structured-output
 * echo. The echo must reproduce the tree exactly; one retry covers a
 * transient drift, a second miss is an error. That error is `render_failed`,
 * not `invalid_ui`: the tree was already validated, so the model's input is
 * not at fault.
 */
export async function renderUi(
  tree: CanonicalUi,
  schema: unknown,
  echo: (
    schema: unknown,
    tree: CanonicalUi,
    attempt: number,
  ) => Promise<unknown>,
): Promise<{ rendered: true }> {
  for (let attempt = 0; attempt < ECHO_ATTEMPTS; attempt += 1) {
    const output = await echo(schema, tree, attempt);
    if (isDeepStrictEqual(output, tree)) return { rendered: true };
  }
  throw new Error('render_failed');
}
