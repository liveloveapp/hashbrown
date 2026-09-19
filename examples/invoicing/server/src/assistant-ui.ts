import { isDeepStrictEqual } from 'node:util';
import type {
  AssistantRenderInput,
  LedgerSnapshot,
} from '@invoicing/contracts';

const MAX_COMPONENTS = 20;
const MAX_TABLE_ROWS = 50;

/** A Hashbrown UI node: one component key holding `props` and, for text, `children`. */
export type CanonicalNode = Readonly<Record<string, unknown>>;

/** The canonical tree: what the echo must reproduce byte for byte. */
export interface CanonicalUi {
  readonly ui: readonly CanonicalNode[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (detail: string): never => {
  throw new Error(`invalid_ui: ${detail}`);
};

/**
 * Check a composed answer against the kit and this session's snapshot and
 * return the Hashbrown-shaped tree the client renders: one AssistantText
 * whose children are the validated leaves. Every ID must resolve; an omitted
 * customer becomes an explicit null because the kit schema requires the key.
 * Throws `invalid_ui: <detail>` naming the offending value so the model can
 * fix it.
 */
export function validateUi(
  snapshot: LedgerSnapshot,
  input: AssistantRenderInput,
): CanonicalUi {
  if (!record(input)) fail('input must be an object');
  const text = input.text;
  if (typeof text !== 'string' || !text.trim()) fail('text is empty');
  const components = input.components ?? [];
  if (!Array.isArray(components)) fail('components must be an array');
  if (components.length > MAX_COMPONENTS) fail('too many components');

  const customers = new Map(snapshot.customers.map((c) => [c.id, c]));
  const currencies = new Set(snapshot.customers.map((c) => c.currency));
  const invoices = new Set(snapshot.invoices.map((i) => i.id));
  const payments = new Map(snapshot.payments.map((p) => [p.id, p]));
  const requireCurrency = (currency: unknown): string => {
    if (typeof currency !== 'string' || !currencies.has(currency))
      fail(`unknown currency ${String(currency)}`);
    return currency as string;
  };
  const requireCustomer = (customerId: unknown, currency?: string): string => {
    if (typeof customerId !== 'string' || !customers.has(customerId))
      fail(`unknown customer ${String(customerId)}`);
    const customer = customers.get(customerId as string);
    if (currency && customer && customer.currency !== currency)
      fail(`customer ${customerId} is not billed in ${currency}`);
    return customerId as string;
  };
  const optionalCustomer = (customerId: unknown, currency: string) =>
    customerId === undefined || customerId === null
      ? null
      : requireCustomer(customerId, currency);

  const leaf = (node: unknown): CanonicalNode => {
    if (!record(node) || Object.keys(node).length !== 1)
      fail('each component must have exactly one component key');
    const [name] = Object.keys(node as object);
    const props = (node as Record<string, unknown>)[name];
    if (!record(props)) fail(`${name} has no props`);
    const p = props as Record<string, unknown>;
    switch (name) {
      case 'LedgerTable': {
        const ids = p.recordIds;
        if (
          !Array.isArray(ids) ||
          ids.length < 1 ||
          ids.length > MAX_TABLE_ROWS
        )
          fail(`LedgerTable.recordIds must have 1 to ${MAX_TABLE_ROWS} ids`);
        const seen = new Set<string>();
        for (const id of ids as unknown[]) {
          if (
            typeof id !== 'string' ||
            (!invoices.has(id) && !payments.has(id))
          )
            fail(`unknown record ${String(id)}`);
          if (seen.has(id)) fail(`duplicate record ${id}`);
          seen.add(id);
        }
        if (typeof p.title !== 'string' || !p.title.trim())
          fail('LedgerTable.title is empty');
        return {
          LedgerTable: { props: { title: p.title, recordIds: [...seen] } },
        };
      }
      case 'TrendChart': {
        const currency = requireCurrency(p.currency);
        const months = p.months;
        if (
          typeof months !== 'number' ||
          !Number.isInteger(months) ||
          months < 3 ||
          months > 24
        )
          fail('TrendChart.months must be 3 to 24');
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
        if (typeof id !== 'string' || !payments.has(id))
          fail(`unknown payment ${String(id)}`);
        if ((payments.get(id as string)?.unappliedCents ?? 0) <= 0)
          fail(`payment ${id} has no unapplied balance`);
        return { ReviewPayment: { props: { paymentId: id as string } } };
      }
      default:
        return fail(`unknown component ${name}`);
    }
  };

  return {
    ui: [
      {
        AssistantText: {
          props: { text },
          children: (components as unknown[]).map(leaf),
        },
      },
    ],
  };
}

/**
 * Push a canonical tree to the client through the nested structured-output
 * echo. The echo must reproduce the tree exactly; one retry covers a
 * transient drift, a second miss is an error.
 */
export async function renderUi(
  tree: CanonicalUi,
  schema: unknown,
  echo: (schema: unknown, tree: CanonicalUi) => Promise<unknown>,
): Promise<{ rendered: true }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const output = await echo(schema, tree);
    if (isDeepStrictEqual(output, tree)) return { rendered: true };
  }
  throw new Error('invalid_assistant_ui');
}
