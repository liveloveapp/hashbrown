import type { IncomingMessage, ServerResponse } from 'node:http';
import { vi } from 'vitest';
import type { NodeHandler } from './http';

/** What a handler sent: status, headers and the parsed JSON body. */
export interface Sent<B> {
  status: number;
  headers: Record<string, string>;
  body: B & { error?: string };
}

/** Calls a handler with a fake request and collects the JSON response. */
export async function callHandler<B = unknown>(
  handler: NodeHandler,
  request: { method?: string; url: string },
): Promise<Sent<B>> {
  const sent: Partial<Sent<B>> = {};
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      sent.status = status;
      sent.headers = headers;
    },
    end(body: string) {
      sent.body = JSON.parse(body);
    },
  } as unknown as ServerResponse;
  const req = { method: 'GET', ...request } as IncomingMessage;

  await handler(req, res);

  return sent as Sent<B>;
}

/** Silences console.error; call `mockRestore()` on the result at the end of the test. */
export const silenceErrors = () =>
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
