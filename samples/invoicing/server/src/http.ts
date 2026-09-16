import type { RequestListener, ServerResponse } from 'node:http';
import type { SessionStore } from './session-store';
import type { ReviewCoordinator } from './review-coordinator';

const cookieName = 'invoicing_session';

function respond(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

/** Read one unambiguous opaque session identity from the local cookie. */
export function readSessionCookie(cookie: string | undefined): string | undefined {
  const matches = (cookie ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0].slice(cookieName.length + 1);
  return /^[0-9a-f-]{36}$/.test(value) ? value : undefined;
}

/**
 * Serve session-owned reads and optionally the canonical B4 review POST route.
 * The injected review listener must enforce session middleware and B4 approval;
 * other runtime routes, including thread management, are never forwarded.
 */
export function createInvoicingListener(
  store: SessionStore,
  reviews?: Pick<ReviewCoordinator, 'getProposal'>,
  runReview?: RequestListener,
): RequestListener {
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
    if ((path === '/agui//review#agent' || path === '/agui//assistant#agent') && runReview) {
      if (request.method !== 'POST') {
        response.setHeader('allow', 'POST');
        respond(response, 405, { error: 'method_not_allowed' });
        return;
      }
      runReview(request, response);
      return;
    }
    const operationId = /^\/api\/operations\/([^/]+)$/.exec(path)?.[1];
    const proposalId = /^\/api\/proposals\/([^/]+)$/.exec(path)?.[1];
    const threadId = /^\/api\/reviews\/([^/]+)$/.exec(path)?.[1];
    if (path !== '/api/snapshot' && !operationId && !proposalId && !threadId) {
      respond(response, 404, { error: 'not_found' });
      return;
    }
    if (request.method !== 'GET') {
      response.setHeader('allow', 'GET');
      respond(response, 405, { error: 'method_not_allowed' });
      return;
    }

    let sessionId = readSessionCookie(request.headers.cookie);
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
    if (threadId) {
      try {
        if (!reviews) throw new Error('review_not_found');
        respond(response, 200, reviews.getProposal(sessionId, threadId));
      } catch {
        respond(response, 404, { error: 'review_not_found' });
      }
      return;
    }
    if (proposalId) {
      try {
        respond(response, 200, store.proposal(sessionId, proposalId));
      } catch {
        respond(response, 404, { error: 'proposal_not_found' });
      }
      return;
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
