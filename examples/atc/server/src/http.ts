import type { IncomingMessage, ServerResponse } from 'node:http';

/** A handler that runs unchanged in Express, node:http and Vercel's Node runtime. */
export type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

/** Thrown by `readJsonBody` when the request body exceeds the byte limit. */
export class BodyTooLargeError extends Error {}

/** The largest request body any route reads. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Reads and parses a JSON request body. Throws `BodyTooLargeError` past
 * `maxBytes` and `SyntaxError` on invalid JSON.
 */
export async function readJsonBody(
  req: IncomingMessage,
  maxBytes = MAX_BODY_BYTES,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer =
      typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buffer.length;
    if (size > maxBytes) {
      throw new BodyTooLargeError('Request too large');
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Sends a JSON response. */
export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

/** Sends a cached payload; a stale one is marked `X-Atc-Stale: 1`. */
export function sendCached(
  res: ServerResponse,
  value: unknown,
  { stale, cacheControl }: { stale: boolean; cacheControl: string },
): void {
  sendJson(res, 200, value, {
    'Cache-Control': cacheControl,
    ...(stale ? { 'X-Atc-Stale': '1' } : {}),
  });
}

/** A query parameter of the request URL, or `''` when absent. */
export function queryParam(req: IncomingMessage, name: string): string {
  return (
    new URL(req.url ?? '/', 'http://localhost').searchParams.get(name) ?? ''
  );
}
