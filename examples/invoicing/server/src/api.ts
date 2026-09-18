import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from 'node:http';
import { createInvoicingListener } from './http';
import { getServices } from './services';

let listener: Promise<RequestListener> | undefined;

function getListener(): Promise<RequestListener> {
  listener ??= getServices()
    .then(({ store, reviews }) => createInvoicingListener(store, reviews))
    .catch((error: unknown) => {
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
