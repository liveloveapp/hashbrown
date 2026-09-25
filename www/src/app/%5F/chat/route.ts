import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';

// App Router treats `_folder` as private; `%5F` is the escape that serves
// this handler at `/_/chat`, the URL the site's demos and search call.

/** Vercel function ceiling, matching the Nitro preset's `maxDuration`. */
export const maxDuration = 300;

const getEnv = (key: string): string | undefined => {
  const value = process.env[key];

  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * POST /_/chat: stream AG-UI events from OpenAI as server-sent events. A port
 * of `www/analog/src/server/routes/_/chat.post.ts` from h3 to the Web
 * `Request`/`Response` API.
 */
export async function POST(request: Request): Promise<Response> {
  const input = (await request.json()) as RunAgentInput;

  const apiKey = getEnv('OPENAI_API_KEY');
  if (!apiKey) {
    return Response.json(
      { error: 'OPENAI_API_KEY environment variable is required' },
      { status: 500 },
    );
  }

  const abortController = new AbortController();
  const abort = () => abortController.abort();
  if (request.signal.aborted) {
    abort();
  } else {
    request.signal.addEventListener('abort', abort, { once: true });
  }
  const cleanup = () => request.signal.removeEventListener('abort', abort);
  const stream = HashbrownOpenAI.stream.text({
    apiKey,
    baseURL: getEnv('OPENAI_BASE_URL'),
    model: getEnv('OPENAI_MODEL') ?? 'gpt-5-nano',
    input,
    signal: abortController.signal,
    transformRequestOptions: (options) => {
      return {
        ...options,
        reasoning_effort: 'low',
      };
    },
  });
  const eventEncoder = new EventEncoder();
  const textEncoder = new TextEncoder();
  const iterator = stream[Symbol.asyncIterator]();

  const readableStream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          cleanup();
          controller.close();
          return;
        }

        controller.enqueue(
          textEncoder.encode(eventEncoder.encodeSSE(next.value)),
        );
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    async cancel() {
      abort();
      cleanup();
      await iterator.return?.();
    },
  });

  // Nothing between the function and the client may buffer or transform.
  return new Response(readableStream, {
    headers: {
      'Content-Type': eventEncoder.getContentType(),
      'Cache-Control': 'no-cache, no-store, must-revalidate, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
