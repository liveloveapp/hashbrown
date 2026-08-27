import 'dotenv/config';
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import {
  defineEventHandler,
  type H3Event,
  readBody,
  sendStream,
  setResponseHeader,
} from 'h3';

type Env = Record<string, string | undefined>;

type CloudflareContext = {
  _platform?: {
    cloudflare?: {
      env?: Env;
    };
  };
};

const getEnv = (event: H3Event, key: string): string | undefined => {
  const context = event.context as CloudflareContext;
  const value = context._platform?.cloudflare?.env?.[key] ?? process.env[key];

  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export default defineEventHandler(async (event) => {
  const input = await readBody<RunAgentInput>(event);

  const apiKey = getEnv(event, 'OPENAI_API_KEY');
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
    baseURL: getEnv(event, 'OPENAI_BASE_URL'),
    model: getEnv(event, 'OPENAI_MODEL') ?? 'gpt-5-nano',
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

  setResponseHeader(event, 'Content-Type', eventEncoder.getContentType());
  setResponseHeader(
    event,
    'Cache-Control',
    'no-cache, no-store, must-revalidate',
  );

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
