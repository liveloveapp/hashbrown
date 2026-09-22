import type { RequestListener, ServerResponse } from 'node:http';
import { readSessionCookie, sessionCookie } from './session-cookie';
import type { SessionStore } from './session-store';
import type { ReviewCoordinator } from './review-coordinator';

function respond(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
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
    void (async () => {
      let path: string;
      try {
        path = decodeURIComponent(
          new URL(request.url ?? '/', 'http://localhost').pathname,
        );
      } catch {
        respond(response, 400, { error: 'invalid_path' });
        return;
      }
      if (
        (path === '/agui//review#agent' || path === '/agui//assistant#agent') &&
        runReview
      ) {
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
      if (
        path !== '/api/snapshot' &&
        !operationId &&
        !proposalId &&
        !threadId
      ) {
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
          await store.snapshot(sessionId);
        } catch {
          sessionId = undefined;
        }
      }
      if (!sessionId) {
        sessionId = await store.createSession();
        const secure =
          request.headers['x-forwarded-proto'] === 'https' ||
          (request.socket as { encrypted?: boolean }).encrypted === true;
        response.setHeader('set-cookie', sessionCookie(sessionId, secure));
      }
      if (threadId) {
        try {
          if (!reviews) throw new Error('review_not_found');
          respond(
            response,
            200,
            await reviews.getProposal(sessionId, threadId),
          );
        } catch {
          respond(response, 404, { error: 'review_not_found' });
        }
        return;
      }
      if (proposalId) {
        try {
          respond(response, 200, await store.proposal(sessionId, proposalId));
        } catch {
          respond(response, 404, { error: 'proposal_not_found' });
        }
        return;
      }
      if (operationId) {
        const result = await store.operationResult(sessionId, operationId);
        respond(
          response,
          result ? 200 : 404,
          result ?? { error: 'operation_not_found' },
        );
        return;
      }
      respond(response, 200, await store.snapshot(sessionId));
    })().catch(() => {
      if (!response.headersSent)
        respond(response, 500, { error: 'internal_error' });
      else response.end();
    });
  };
}
