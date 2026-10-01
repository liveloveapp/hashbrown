import { fillLines } from './ledger';
import type { SessionStore } from './session-store';
import type { ReviewCoordinator } from './review-coordinator';
import { readSessionCookie } from './session-cookie';

/**
 * Bind review tools to validated server state; B4 must validate the pending
 * interrupt before invoking apply. The invoices come from the authorised run
 * state, never from the model: `prepareAllocation` takes no input.
 */
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
          selectedInvoiceIds: context.selectedInvoiceIds,
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
          // The selected invoices, in fill order; without a selection, the
          // payment's only open invoice. Two or more open invoices and no
          // selection is a choice only the user can make.
          prepareAllocation: async () => {
            const { payment, invoices } = await readPayment();
            const open = invoices.filter((item) => item.outstandingCents > 0);
            const ids = context.selectedInvoiceIds ?? [];
            if (ids.length === 0 && open.length !== 1)
              throw new Error('invoice_choice_required');
            const chosen = (ids.length ? ids : [open[0].id]).map((id) => {
              const invoice = invoices.find((item) => item.id === id);
              if (!invoice) throw new Error('invoice_not_found');
              return invoice;
            });
            return reviews.prepare(context, {
              paymentId: payment.id,
              lines: fillLines(payment.unappliedCents, chosen),
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
