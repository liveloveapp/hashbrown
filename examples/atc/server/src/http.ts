import type { IncomingMessage, ServerResponse } from 'node:http';

/** A handler that runs unchanged in Express, node:http and Vercel's Node runtime. */
export type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

/** Reads and parses a JSON request body. Throws on invalid JSON. */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
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
