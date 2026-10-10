import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import type { ProviderRouteOptions } from './options';

/** Handles a Worker request using injected provider settings and native AG-UI SSE. */
export async function handleWorkerRequest({
  request,
  options,
}: {
  request: Request;
  options: ProviderRouteOptions;
}): Promise<Response> {
  const input = (await request.json()) as RunAgentInput;
  const stream = HashbrownOpenAI.stream.text({
    ...options,
    input,
    signal: request.signal,
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
}
