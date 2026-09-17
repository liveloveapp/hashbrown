import type { SessionStore } from './session-store';
import type { ReviewCoordinator } from './review-coordinator';
import { readSessionCookie } from './http';

/** Bind review tools to validated server state; B4 must validate the pending interrupt before invoking apply. */
export function createReviewMiddleware(
  store: SessionStore,
  reviews: ReviewCoordinator,
) {
  return async (request: {
    readonly headers: Readonly<Record<string, string>>;
    readonly method: string;
    readonly routeId: string;
    readonly body?: unknown;
  }) => {
    if (request.method !== 'POST' || request.routeId !== '/review') {
      return {
        action: 'reject' as const,
        status: 404,
        body: { error: 'not_found' },
      };
    }
    const sessionId = readSessionCookie(request.headers.cookie);
    try {
      if (!sessionId) throw new Error('session_required');
      await store.generation(sessionId);
    } catch {
      return {
        action: 'reject' as const,
        status: 401,
        body: { error: 'session_required' },
      };
    }
    try {
      const context = await reviews.authorize(sessionId, request.body);
      const readPayment = async () => {
        if ((await store.generation(sessionId)) !== context.generation)
          throw new Error('stale_generation');
        const snapshot = await store.snapshot(sessionId);
        const payment = snapshot.payments.find(
          (item) => item.id === context.selectedPaymentId,
        );
        if (!payment) throw new Error('payment_not_found');
        return {
          payment,
          selectedInvoiceId: context.selectedInvoiceId,
          invoices: snapshot.invoices.filter(
            (invoice) =>
              invoice.customerId === payment.customerId &&
              invoice.currency === payment.currency,
          ),
        };
      };
      return {
        action: 'continue' as const,
        context: Object.freeze({
          responseSchema: context.responseSchema,
          readPayment,
          prepareAllocation: async (input: { readonly invoiceId: string }) => {
            const { payment, invoices } = await readPayment();
            const invoice = invoices.find(
              (item) => item.id === input.invoiceId,
            );
            if (!invoice) throw new Error('invoice_not_found');
            if (
              !context.selectedInvoiceId &&
              invoices.filter((item) => item.outstandingCents > 0).length > 1
            )
              throw new Error('invoice_choice_required');
            return reviews.prepare(context, {
              paymentId: payment.id,
              invoiceId: invoice.id,
              amountCents: Math.min(
                payment.unappliedCents,
                invoice.outstandingCents,
              ),
            });
          },
          applyAllocation: (input: { readonly proposalId: string }) =>
            reviews.apply(context, input.proposalId),
        }),
      };
    } catch {
      return {
        action: 'reject' as const,
        status: 422,
        body: { error: 'invalid_review' },
      };
    }
  };
}
