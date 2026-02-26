import type { Chat } from '@hashbrownai/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: 'OPENAI_API_KEY is not set',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const body = (await request.json()) as Chat.Api.CompletionCreateParams;
  const stream = HashbrownOpenAI.stream.text({
    apiKey,
    request: body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        model: 'gpt-5.1',
        reasoning_effort: 'none',
      };
    },
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
}
