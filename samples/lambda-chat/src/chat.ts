import { Chat } from '@hashbrownai/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set');
}

export const handler = awslambda.streamifyResponse(
  async (event, responseStream) => {
    console.log({ event: JSON.stringify(event) });

    responseStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: {
        // Prevent intermediaries from buffering.  Given the small size of each chunk,
        // this should make streaming smoother at the network level.
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
      },
    });

    const completionParams = JSON.parse(
      event.body,
    ) as Chat.Api.CompletionCreateParams;

    const response = HashbrownOpenAI.stream.text({
      apiKey: OPENAI_API_KEY,
      request: completionParams,
    });

    for await (const chunk of response) {
      responseStream.write(chunk);
    }

    responseStream.end(); // Always end the stream
  },
);
