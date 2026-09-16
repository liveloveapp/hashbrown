import type { IncomingMessage, ServerResponse } from 'node:http';
import { invoicingUiResponseSchema } from '@invoicing/contracts';
import { createInvoicingListener } from './http';
import { repositoriesFromEnv } from './persistence/from-env';
import { createReviewCoordinator } from './review-coordinator';
import { createSampleLedger } from './sample-ledger';
import { createSessionStore } from './session-store';

const listener = (async () => {
  const repositories = await repositoriesFromEnv();
  const store = createSessionStore(repositories.sessions, createSampleLedger);
  return createInvoicingListener(
    store,
    createReviewCoordinator(
      store,
      repositories.threads,
      invoicingUiResponseSchema,
    ),
  );
})();

/** Vercel Node function entry: session-owned reads under /api. */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  (await listener)(request, response);
}
