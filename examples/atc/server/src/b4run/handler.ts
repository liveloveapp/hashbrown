import { once } from 'node:events';
import { type NodeHandler, sendJson } from '../http';
import { readRunInput } from '../run-input';
import { normalizeAgentRequest } from './request';
import type { VisitorIdentity } from './visitor';

/** The only internal runtime endpoint reachable through the public chat adapter. */
export const AGENT_URL = 'http://atc.internal/agui/%2Fatc%23agent';

/**
 * Adapts the existing Node chat endpoint to b4.run's public fetch interface.
 * The runtime never receives the original request, identity headers, or URL.
 */
export function createAgentRunHandler(options: {
  readonly runtime: { readonly fetch: (request: Request) => Promise<Response> };
  readonly visitors: {
    readonly read: (cookies: string | undefined) => VisitorIdentity;
  };
}): NodeHandler {
  return async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST' });
    const input = await readRunInput(req, res);
    if (input === null) return;
    let normalized;
    try {
      normalized = normalizeAgentRequest(input);
    } catch {
      return sendJson(res, 400, { error: 'Invalid run input' });
    }
    const visitor = options.visitors.read(req.headers.cookie);
    if (visitor.cookie) res.setHeader('Set-Cookie', visitor.cookie);
    const abort = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const onClose = () => {
      abort.abort();
      void reader?.cancel().catch(() => undefined);
    };
    res.once('close', onClose);
    try {
      const response = await options.runtime.fetch(
        new Request(AGENT_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'text/event-stream',
            'x-atc-visitor': visitor.id,
          },
          body: JSON.stringify(normalized),
          signal: abort.signal,
        }),
      );
      if (abort.signal.aborted) {
        await response.body?.cancel();
        return;
      }
      res.statusCode = response.status;
      res.setHeader(
        'Cache-Control',
        'no-cache, no-store, must-revalidate, no-transform',
      );
      res.setHeader('X-Accel-Buffering', 'no');
      response.headers.forEach((value, key) => {
        if (
          ![
            'connection',
            'transfer-encoding',
            'content-length',
            'set-cookie',
          ].includes(key)
        ) {
          res.setHeader(key, value);
        }
      });
      reader = response.body?.getReader();
      res.flushHeaders();
      while (reader && !abort.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!res.write(value))
          await once(res, 'drain', { signal: abort.signal });
      }
      if (!res.writableEnded && !res.destroyed) res.end();
    } catch (error) {
      if (abort.signal.aborted) return;
      console.error('[atc] agent run failed', error);
      if (!res.headersSent) sendJson(res, 500, { error: 'Run failed' });
      else res.destroy();
    } finally {
      res.off('close', onClose);
      await reader?.cancel().catch(() => undefined);
    }
  };
}
