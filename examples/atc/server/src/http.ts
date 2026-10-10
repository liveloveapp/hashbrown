import type { IncomingMessage, ServerResponse } from 'node:http';

/** A handler that runs unchanged in Express, node:http and Vercel's Node runtime. */
export type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

/** Thrown by `readJsonBody` when the request body exceeds the byte limit. */
export class BodyTooLargeError extends Error {}

/** Reads and parses a JSON request body. Throws `BodyTooLargeError` past `maxBytes`, and on invalid JSON. */
export async function readJsonBody(
  req: IncomingMessage,
  maxBytes = 256 * 1024,
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
