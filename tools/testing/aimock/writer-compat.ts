import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AimockHandle } from './aimock-runner';

/**
 * Local compatibility server that maps Writer SDK chat requests to aimock's
 * OpenAI-compatible chat completions endpoint.
 */
export interface WriterCompatHandle {
  /** Base URL passed to the Writer SDK. */
  readonly baseUrl: string;
  /** Stop the compatibility server. Safe to call more than once. */
  stop(): Promise<void>;
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    request.on('error', reject);
  });
}

function writeJsonError(
  response: ServerResponse,
  status: number,
  message: string,
): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: { message } }));
}

function normalizeWriterRequest(rawBody: string): string {
  const body = JSON.parse(rawBody) as Record<string, unknown>;
  const toolChoice = body['tool_choice'];

  return JSON.stringify({
    ...body,
    tool_choice:
      toolChoice &&
      typeof toolChoice === 'object' &&
      !Array.isArray(toolChoice) &&
      'value' in toolChoice
        ? (toolChoice as { value: unknown }).value
        : toolChoice,
  });
}

/**
 * Start a compatibility server for Writer SDK e2e tests backed by aimock.
 */
export async function startWriterCompatServer(
  aimock: AimockHandle,
): Promise<WriterCompatHandle> {
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat') {
      writeJsonError(response, 404, 'Not found');
      return;
    }

    try {
      const rawBody = await readRequestBody(request);
      const upstream = await fetch(`${aimock.openAiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: request.headers.authorization ?? '',
          'content-type': 'application/json',
        },
        body: normalizeWriterRequest(rawBody),
      });

      response.writeHead(upstream.status, {
        'content-type':
          upstream.headers.get('content-type') ?? 'application/json',
      });

      if (!upstream.body) {
        response.end();
        return;
      }

      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        response.write(value);
      }

      response.end();
    } catch (error: unknown) {
      writeJsonError(
        response,
        500,
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  let stopped = false;
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async stop() {
      if (stopped) {
        return;
      }
      stopped = true;

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
