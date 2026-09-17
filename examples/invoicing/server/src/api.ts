import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from 'node:http';
import { invoicingUiResponseSchema } from '@invoicing/contracts';
import { createInvoicingListener } from './http';
import { repositoriesFromEnv } from './persistence/from-env';
import { createReviewCoordinator } from './review-coordinator';
import { createSampleLedger } from './sample-ledger';
import { createSessionStore } from './session-store';

async function build(): Promise<RequestListener> {
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
}

let listener: Promise<RequestListener> | undefined;

/** Build once per process, but let a failed cold start be retried by the next request. */
function getListener(): Promise<RequestListener> {
  listener ??= build().catch((error: unknown) => {
    listener = undefined;
    throw error;
  });
  return listener;
}

/** Vercel Node function entry: session-owned reads under /api. */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  try {
    (await getListener())(request, response);
  } catch {
    if (!response.headersSent) {
      response.writeHead(500, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
    }
    if (!response.writableEnded)
      response.end(JSON.stringify({ error: 'internal_error' }));
  }
}
