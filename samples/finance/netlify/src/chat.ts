import type { Chat } from '@hashbrownai/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function getEnv(
  context: { env?: Record<string, string | undefined> } | undefined,
  key: string,
): string | undefined {
  const fromContext = context?.env?.[key];
  if (typeof fromContext === 'string' && fromContext.length > 0)
    return fromContext;
  // Deno global in Netlify Edge runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromDeno = (globalThis as any).Deno?.env?.get?.(key) as
    | string
    | undefined;
  return fromDeno;
}

export default async function handler(
  request: Request,
  context: { env?: Record<string, string | undefined> },
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const apiKey = getEnv(context, 'OPENAI_API_KEY');
  if (!apiKey) {
    return json(
      { error: 'Internal server error', message: 'OPENAI_API_KEY is not set' },
      { status: 500 },
    );
  }

  const req = (await request.json()) as Chat.Api.CompletionCreateParams;
  const stream = HashbrownOpenAI.stream.text({ apiKey, request: req });

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
}
