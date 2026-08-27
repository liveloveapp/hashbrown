import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-nano';

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set');
}

export const handler = awslambda.streamifyResponse(
  async (event, responseStream) => {
    console.log({ event: JSON.stringify(event) });

    const encoder = new EventEncoder();
    responseStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: {
        // Prevent intermediaries from buffering.  Given the small size of each chunk,
        // this should make streaming smoother at the network level.
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': encoder.getContentType(),
        Connection: 'keep-alive',
      },
    });
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    responseStream.once('close', abort);

    try {
      const input = JSON.parse(event.body) as RunAgentInput;
      const response = HashbrownOpenAI.stream.text({
        apiKey: OPENAI_API_KEY,
        baseURL: OPENAI_BASE_URL,
        model: OPENAI_MODEL,
        input,
        signal: abortController.signal,
      });

      for await (const event of response) {
        responseStream.write(encoder.encodeSSE(event));
      }
    } finally {
      responseStream.off('close', abort);

      if (!responseStream.destroyed && !responseStream.writableEnded) {
        responseStream.end();
      }
    }
  },
);
