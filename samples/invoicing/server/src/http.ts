import type { RequestListener, ServerResponse } from 'node:http';
import type { SessionStore } from './session-store';

const cookieName = 'invoicing_session';

function respond(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function findSession(cookie: string | undefined): string | undefined {
  const matches = (cookie ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0].slice(cookieName.length + 1);
  return /^[0-9a-f-]{36}$/.test(value) ? value : undefined;
}

/**
 * Serve session-owned read models for the local demo.
 * Financial mutations must go through the separately integrated approval path.
 */
export function createInvoicingListener(store: SessionStore): RequestListener {
  return (request, response) => {
    let path: string;
    try {
      path = decodeURIComponent(
        new URL(request.url ?? '/', 'http://localhost').pathname,
      );
    } catch {
      respond(response, 400, { error: 'invalid_path' });
      return;
    }
    const operationId = /^\/api\/operations\/([^/]+)$/.exec(path)?.[1];
    if (path !== '/api/snapshot' && !operationId) {
      respond(response, 404, { error: 'not_found' });
      return;
    }
    if (request.method !== 'GET') {
      response.setHeader('allow', 'GET');
      respond(response, 405, { error: 'method_not_allowed' });
      return;
    }

    let sessionId = findSession(request.headers.cookie);
    if (sessionId) {
      try {
        store.snapshot(sessionId);
      } catch {
        sessionId = undefined;
      }
    }
    if (!sessionId) {
      sessionId = store.createSession();
      response.setHeader(
        'set-cookie',
        `${cookieName}=${sessionId}; Path=/; HttpOnly; SameSite=Lax`,
      );
    }
    if (operationId) {
      const result = store.operationResult(sessionId, operationId);
      respond(
        response,
        result ? 200 : 404,
        result ?? { error: 'operation_not_found' },
      );
      return;
    }
    respond(response, 200, store.snapshot(sessionId));
  };
}
