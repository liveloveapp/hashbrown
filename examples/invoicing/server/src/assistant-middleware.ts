import { isDeepStrictEqual } from 'node:util';
import { assistantResponseSchema } from '@invoicing/contracts';
import type { SessionStore } from './session-store';
import { readSessionCookie } from './http';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Read-only conversational capabilities scoped to a cookie, thread and generation. */
export function createAssistantMiddleware(store: SessionStore) {
  const owners = new Map<string, { sessionId: string; generation: number }>();
  return (request: {
    readonly method: string;
    readonly routeId: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: unknown;
  }) => {
    const reject = (status: number) => ({
      action: 'reject' as const,
      status,
      body: { error: 'invalid_conversation' },
    });
    if (request.method !== 'POST' || request.routeId !== '/assistant')
      return reject(404);
    const sessionId = readSessionCookie(request.headers.cookie);
    let generation: number;
    try {
      if (!sessionId) return reject(401);
      generation = store.generation(sessionId);
    } catch {
      return reject(401);
    }
    const body = request.body;
    if (
      !record(body) ||
      typeof body.threadId !== 'string' ||
      !body.threadId.trim() ||
      body.threadId.length > 256 ||
      typeof body.runId !== 'string' ||
      !body.runId.trim() ||
      !record(body.state) ||
      !record(body.hashbrown) ||
      body.hashbrown.ui !== true ||
      !isDeepStrictEqual(
        body.hashbrown.responseSchema,
        assistantResponseSchema,
      ) ||
      (body.resume !== undefined &&
        (!Array.isArray(body.resume) || body.resume.length > 0)) ||
      (body.tools !== undefined &&
        (!Array.isArray(body.tools) || body.tools.length > 0)) ||
      (body.forwardedProps !== undefined &&
        (!record(body.forwardedProps) ||
          Object.keys(body.forwardedProps).length > 0))
    )
      return reject(422);
    const owner = owners.get(body.threadId);
    if (
      owner &&
      (owner.sessionId !== sessionId || owner.generation !== generation)
    )
      return reject(422);
    const current = () => {
      if (store.generation(sessionId) !== generation)
        throw new Error('stale_generation');
      return store.snapshot(sessionId);
    };
    const selectedPaymentId = body.state.selectedPaymentId;
    if (
      selectedPaymentId !== undefined &&
      (typeof selectedPaymentId !== 'string' ||
        !current().payments.some((p) => p.id === selectedPaymentId))
    )
      return reject(422);
    owners.set(body.threadId, { sessionId, generation });
    return {
      action: 'continue' as const,
      context: Object.freeze({
        responseSchema: assistantResponseSchema,
        readLedger: (input: { readonly customerId?: string } = {}) => {
          const snapshot = current();
          const payments = snapshot.payments.filter(
            (p) => !input.customerId || p.customerId === input.customerId,
          );
          const invoices = snapshot.invoices.filter(
            (i) => !input.customerId || i.customerId === input.customerId,
          );
          const currencies = [
            ...new Set([...payments, ...invoices].map((r) => r.currency)),
          ];
          return {
            monthlyTotals: [
              ...new Set(
                [...payments, ...invoices].flatMap((r) =>
                  r.date ? [r.date.slice(0, 7)] : [],
                ),
              ),
            ]
              .sort()
              .flatMap((month) =>
                currencies.map((currency) => ({
                  month,
                  currency,
                  receivedCents: payments
                    .filter(
                      (p) =>
                        p.currency === currency && p.date?.startsWith(month),
                    )
                    .reduce((sum, p) => sum + p.amountCents, 0),
                  invoicedCents: invoices
                    .filter(
                      (i) =>
                        i.currency === currency && i.date?.startsWith(month),
                    )
                    .reduce((sum, i) => sum + i.amountCents, 0),
                })),
              ),
            selectedPayment: payments.find((p) => p.id === selectedPaymentId),
            totals: currencies.map((currency) => ({
              currency,
              receivedCents: payments
                .filter((p) => p.currency === currency)
                .reduce((s, p) => s + p.amountCents, 0),
              invoicedCents: invoices
                .filter((i) => i.currency === currency)
                .reduce((s, i) => s + i.amountCents, 0),
              unappliedCents: payments
                .filter((p) => p.currency === currency)
                .reduce((s, p) => s + p.unappliedCents, 0),
              outstandingCents: invoices
                .filter((i) => i.currency === currency)
                .reduce((s, i) => s + i.outstandingCents, 0),
            })),
            unappliedPayments: payments.filter((p) => p.unappliedCents > 0),
            outstandingInvoices: invoices.filter((i) => i.outstandingCents > 0),
            payments,
            invoices,
          };
        },
        validatePayment: (paymentId: string) => {
          const payment = current().payments.find((p) => p.id === paymentId);
          if (!payment || payment.unappliedCents <= 0)
            throw new Error('payment_not_found');
          return payment;
        },
      }),
    };
  };
}
