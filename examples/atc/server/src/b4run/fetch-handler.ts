import { MAX_BODY_BYTES } from '../http';
import { isRunInput, isTooLarge } from '../run-policy';
import { AGENT_URL } from './handler';
import { normalizeAgentRequest } from './request';
import type { VisitorIdentity } from './visitor';

function json(status: number, error: string): Response {
  return Response.json(
    { error },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

/**
 * Web-standard ingress for the generated Vercel runtime. It bounds and pins a
 * fresh request before the runtime reads it and passes SSE through unchanged.
 */
export function createAgentFetchHandler(options: {
  readonly runtime: { readonly fetch: (request: Request) => Promise<Response> };
  readonly visitors: {
    readonly read: (cookies: string | undefined) => VisitorIdentity;
  };
}): { readonly fetch: (request: Request) => Promise<Response> } {
  return {
    async fetch(request) {
      if (new URL(request.url).pathname !== '/api/run')
        return json(404, 'Not found');
      if (request.method !== 'POST') return json(405, 'Use POST');
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (reader) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BODY_BYTES) {
            await reader.cancel();
            return json(413, 'Request too large');
          }
          chunks.push(value);
        }
      } catch {
        return json(400, 'Invalid JSON');
      } finally {
        reader?.releaseLock();
      }
      let input: unknown;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return json(400, 'Invalid JSON');
      }
      if (!isRunInput(input)) return json(400, 'Invalid run input');
      if (isTooLarge(input)) return json(413, 'Request too large');
      let normalized;
      try {
        normalized = normalizeAgentRequest(input);
      } catch {
        return json(400, 'Invalid run input');
      }
      const visitor = options.visitors.read(
        request.headers.get('cookie') ?? undefined,
      );
      try {
        const response = await options.runtime.fetch(
          new Request(AGENT_URL, {
            method: 'POST',
            body: JSON.stringify(normalized),
            signal: request.signal,
            headers: {
              'content-type': 'application/json',
              accept: 'text/event-stream',
              'x-atc-visitor': visitor.id,
            },
          }),
        );
        const headers = new Headers(response.headers);
        headers.set(
          'cache-control',
          'no-cache, no-store, must-revalidate, no-transform',
        );
        headers.set('x-accel-buffering', 'no');
        if (visitor.cookie) headers.set('set-cookie', visitor.cookie);
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      } catch (error) {
        if (!request.signal.aborted)
          console.error('[atc] hosted agent run failed', error);
        return json(500, 'Run failed');
      }
    },
  };
}
