import 'dotenv/config';
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import {
  defineEventHandler,
  readBody,
  sendStream,
  setResponseHeader,
} from 'h3';

const getEnv = (key: string): string | undefined => {
  const value = process.env[key];

  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export default defineEventHandler(async (event) => {
  const input = await readBody<RunAgentInput>(event);

  const apiKey = getEnv('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  const abortController = new AbortController();
  const abort = () => abortController.abort();
  if (event.req.signal.aborted) {
    abort();
  } else {
    event.req.signal.addEventListener('abort', abort, { once: true });
  }
  const cleanup = () => event.req.signal.removeEventListener('abort', abort);
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

  // Streaming on Vercel's Node runtime is chunk-by-chunk as long as nothing
  // between the function and the client is allowed to buffer or transform.
  setResponseHeader(event, 'Content-Type', eventEncoder.getContentType());
  setResponseHeader(
    event,
    'Cache-Control',
    'no-cache, no-store, must-revalidate, no-transform',
  );
  setResponseHeader(event, 'X-Accel-Buffering', 'no');

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

  return sendStream(event, readableStream);
});
