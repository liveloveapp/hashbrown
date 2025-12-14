import type { Chat } from '@hashbrownai/core';
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

const handlePost = async (context: { request: Request; env?: Env }) => {
  const { request, env } = context;

  const apiKey = getEnv(env, 'OPENAI_API_KEY');
  if (!apiKey) {
    return json(
      { error: 'Internal server error', message: 'OPENAI_API_KEY is not set' },
      { status: 500 },
    );
  }

  const body = (await request.json()) as Chat.Api.CompletionCreateParams;
  const stream = HashbrownOpenAI.stream.text({
    apiKey,
    request: body,
    transformRequestOptions: (options) => ({
      ...options,
      model: 'gpt-5-nano',
      reasoning_effort: 'low',
    }),
  });

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(
            typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk,
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
};

export const onRequest = async (context: { request: Request; env?: Env }) => {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, { status: 405 });
  }
  return handlePost(context);
};
