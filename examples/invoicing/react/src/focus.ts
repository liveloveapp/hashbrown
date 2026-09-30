import type { LedgerSnapshot } from '@invoicing/contracts';

/** The dashboard's tabs, in the order keys 1–4 select them. */
export const DASHBOARD_TABS = [
  'clients',
  'invoices',
  'payments',
  'unapplied',
] as const;
/** One of {@link DASHBOARD_TABS}. */
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

/** The currencies the switcher offers, in its order. */
export const SWITCHER_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;

/** A single invoice or payment the focus marks inside its client's band. */
export interface FocusRecord {
  readonly kind: 'invoice' | 'payment';
  readonly id: string;
}

/**
 * The page's one shared selection. Every selection resolves to a client; a
 * record, when present, belongs to that client. `currency` is the switcher's
 * value and only applies while no client is focused.
 */
export interface Focus {
  readonly tab: DashboardTab;
  readonly currency: string;
  readonly clientId?: string;
  readonly record?: FocusRecord;
  /**
   * True when the client was picked on the Clients tab: the other tabs then
   * list only that client's rows. Picking an invoice or payment from a full
   * list focuses its client without narrowing the list under the pointer.
   */
  readonly scoped?: true;
}

/** Everything that can change the focus. */
export type FocusAction =
  | { readonly type: 'select-client'; readonly clientId: string }
  | {
      readonly type: 'select-invoice';
      readonly invoiceId: string;
      readonly clientId: string;
    }
  | {
      readonly type: 'select-payment';
      readonly paymentId: string;
      readonly clientId: string;
    }
  | { readonly type: 'clear' }
  | { readonly type: 'set-tab'; readonly tab: DashboardTab }
  | { readonly type: 'set-currency'; readonly currency: string };

/** Nothing focused, Clients tab, USD. */
export const DEFAULT_FOCUS: Focus = { tab: 'clients', currency: 'USD' };

function selectRecord(
  focus: Focus,
  kind: FocusRecord['kind'],
  id: string,
  clientId: string,
): Focus {
  if (
    focus.record?.kind === kind &&
    focus.record.id === id &&
    focus.clientId === clientId
  )
    return focus;
  // A list narrowed to this client stays narrowed; a full list stays full.
  const scoped = focus.scoped && focus.clientId === clientId;
  return {
    tab: focus.tab,
    currency: focus.currency,
    clientId,
    record: { kind, id },
    ...(scoped ? { scoped: true as const } : {}),
  };
}

/** Apply one action; pure, so the page and tests share it. */
export function focusReducer(focus: Focus, action: FocusAction): Focus {
  switch (action.type) {
    case 'select-client':
      // Pretable reports one click several times; keep the same object so React bails out.
      return focus.clientId === action.clientId && !focus.record && focus.scoped
        ? focus
        : {
            tab: focus.tab,
            currency: focus.currency,
            clientId: action.clientId,
            scoped: true,
          };
    case 'select-invoice':
      return selectRecord(focus, 'invoice', action.invoiceId, action.clientId);
    case 'select-payment':
      return selectRecord(focus, 'payment', action.paymentId, action.clientId);
    case 'clear':
      return !focus.clientId && !focus.record
        ? focus
        : { tab: focus.tab, currency: focus.currency };
    case 'set-tab':
      // A record belongs to the tab it was picked on; the client and its scope carry over.
      return focus.clientId
        ? {
            tab: action.tab,
            currency: focus.currency,
            clientId: focus.clientId,
            ...(focus.scoped ? { scoped: true as const } : {}),
          }
        : { tab: action.tab, currency: focus.currency };
    case 'set-currency':
      // The switcher is locked to the focused client's currency.
      return focus.clientId ? focus : { ...focus, currency: action.currency };
  }
}

const isTab = (value: string | null): value is DashboardTab =>
  (DASHBOARD_TABS as readonly (string | null)[]).includes(value);
const isCurrency = (value: string | null): value is string =>
  (SWITCHER_CURRENCIES as readonly (string | null)[]).includes(value);

/** Read a focus from a query string; unknown values fall back to the defaults. */
export function focusFromSearch(search: string): Focus {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  const currency = params.get('currency');
  const clientId = params.get('client') ?? undefined;
  const invoiceId = params.get('invoice') ?? undefined;
  const paymentId = params.get('payment') ?? undefined;
  const record: FocusRecord | undefined = invoiceId
    ? { kind: 'invoice', id: invoiceId }
    : paymentId
      ? { kind: 'payment', id: paymentId }
      : undefined;
  return {
    tab: isTab(tab) ? tab : DEFAULT_FOCUS.tab,
    currency: isCurrency(currency) ? currency : DEFAULT_FOCUS.currency,
    ...(clientId ? { clientId } : {}),
    ...(clientId && record ? { record } : {}),
    // A shared link to a client alone narrows the lists; one to a record does not.
    ...(clientId && !record ? { scoped: true as const } : {}),
  };
}

/** Write a focus as a query string, leaving out default values; '' when all default. */
export function focusToSearch(focus: Focus): string {
  const params = new URLSearchParams();
  if (focus.tab !== DEFAULT_FOCUS.tab) params.set('tab', focus.tab);
  if (focus.currency !== DEFAULT_FOCUS.currency)
    params.set('currency', focus.currency);
  if (focus.clientId) params.set('client', focus.clientId);
  if (focus.clientId && focus.record)
    params.set(focus.record.kind, focus.record.id);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Drop anything the ledger does not recognise: an unknown client clears the
 * focus, and a record that is missing or belongs to another client is dropped.
 * Returns the same object when nothing is dropped, so React can bail out.
 */
export function sanitizeFocus(focus: Focus, snapshot: LedgerSnapshot): Focus {
  const base = { tab: focus.tab, currency: focus.currency };
  if (!focus.clientId) return focus.record ? base : focus;
  if (!snapshot.customers.some((c) => c.id === focus.clientId)) return base;
  const record = focus.record;
  if (!record) return focus;
  const records =
    record.kind === 'invoice' ? snapshot.invoices : snapshot.payments;
  const owned = records.some(
    (r) => r.id === record.id && r.customerId === focus.clientId,
  );
  return owned
    ? focus
    : {
        ...base,
        clientId: focus.clientId,
        ...(focus.scoped ? { scoped: true as const } : {}),
      };
}

/** What the page tells the assistant it is looking at. */
export interface AssistantSelection {
  readonly selectedPaymentId?: string;
  readonly focusedClientId?: string;
  readonly focusedInvoiceId?: string;
}

/**
 * The assistant run state for a selection, with unset keys left out: the
 * server validates every key it receives against the session's ledger.
 */
export function assistantRunState(
  selection: AssistantSelection,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(selection).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

/** What the focus tells the assistant: its client, and the invoice or payment inside it. */
export function focusSelection(focus: Focus): AssistantSelection {
  return {
    focusedClientId: focus.clientId,
    focusedInvoiceId:
      focus.record?.kind === 'invoice' ? focus.record.id : undefined,
    selectedPaymentId:
      focus.record?.kind === 'payment' ? focus.record.id : undefined,
  };
}
