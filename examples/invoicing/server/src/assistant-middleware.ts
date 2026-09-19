import { isDeepStrictEqual } from 'node:util';
import { assistantResponseSchema } from '@invoicing/contracts';
import type { SessionStore } from './session-store';
import type { ThreadRepository } from './persistence/types';
import { readSessionCookie } from './session-cookie';
import { assertThreadOwner } from './thread-ownership';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Read-only conversational capabilities scoped to a cookie, thread and generation. */
export function createAssistantMiddleware(
  store: SessionStore,
  threads: ThreadRepository,
) {
  return async (request: {
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
      generation = await store.generation(sessionId);
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
    const owner = (await threads.load(body.threadId))?.value;
    if (owner) {
      // Both a foreign thread and a thread left behind by a reset are the same
      // answer to this caller: stop using it and open a new one.
      try {
        assertThreadOwner(owner, {
          sessionId,
          routeId: '/assistant',
          generation,
        });
      } catch {
        return reject(422);
      }
    }
    const current = async () => {
      if ((await store.generation(sessionId)) !== generation)
        throw new Error('stale_generation');
      return store.snapshot(sessionId);
    };
    const selectedPaymentId = body.state.selectedPaymentId;
    if (
      selectedPaymentId !== undefined &&
      (typeof selectedPaymentId !== 'string' ||
        !(await current()).payments.some((p) => p.id === selectedPaymentId))
    )
      return reject(422);
    return {
      action: 'continue' as const,
      context: Object.freeze({
        responseSchema: assistantResponseSchema,
        readLedger: async (input: { readonly customerId?: string } = {}) => {
          const snapshot = await current();
          const payments = snapshot.payments.filter(
            (p) => !input.customerId || p.customerId === input.customerId,
          );
          const invoices = snapshot.invoices.filter(
            (i) => !input.customerId || i.customerId === input.customerId,
          );
          const currencies = [
            ...new Set([...payments, ...invoices].map((r) => r.currency)),
          ];
          // The raw payment and invoice rows are withheld to keep a turn small:
          // the generated ledger is several hundred KB as JSON. The derived
          // sections below plus the customerId filter cover the questions the
          // assistant answers today; query-shaped tools replace this in a
          // later PR.
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
          };
        },
        validatePayment: async (paymentId: string) => {
          const payment = (await current()).payments.find(
            (p) => p.id === paymentId,
          );
          if (!payment || payment.unappliedCents <= 0)
            throw new Error('payment_not_found');
          return payment;
        },
      }),
    };
  };
}
