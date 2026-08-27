import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';

type Env = Record<string, string | undefined>;

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

const getEnv = (env: Env | undefined, key: string): string | undefined => {
  const value =
    env?.[key] ??
    (globalThis as { process?: { env?: Env } }).process?.env?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const handlePost = async ({
  request,
  env,
}: {
  request: Request;
  env?: Env;
}) => {
  const apiKey = getEnv(env, 'OPENAI_API_KEY');
  if (!apiKey) {
    return json(
      { error: 'Internal server error', message: 'OPENAI_API_KEY is not set' },
      { status: 500 },
    );
  }

  const input = (await request.json()) as RunAgentInput;
  const stream = HashbrownOpenAI.stream.text({
    apiKey,
    baseURL: getEnv(env, 'OPENAI_BASE_URL'),
    model: getEnv(env, 'OPENAI_MODEL') ?? 'gpt-5-nano',
    input,
    signal: request.signal,
    transformRequestOptions: (options) => ({
      ...options,
      reasoning_effort: 'low',
    }),
  });
  const eventEncoder = new EventEncoder();
  const textEncoder = new TextEncoder();
  const iterator = stream[Symbol.asyncIterator]();

  const readable = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }

        controller.enqueue(
          textEncoder.encode(eventEncoder.encodeSSE(next.value)),
        );
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });

  return new Response(readable, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': eventEncoder.getContentType(),
    },
  });
};

export const onRequest = async (context: { request: Request; env?: Env }) => {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, { status: 405 });
  }
  return handlePost(context);
};
