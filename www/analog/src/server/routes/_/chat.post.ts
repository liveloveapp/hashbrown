import 'dotenv/config';
import {
  defineEventHandler,
  readBody,
  sendStream,
  setResponseHeader,
} from 'h3';
import { HashbrownOpenAI } from '@hashbrownai/openai';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  const stream = HashbrownOpenAI.stream.text({
    apiKey,
    request: body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        reasoning_effort: 'low',
      };
    },
  });

  setResponseHeader(event, 'Content-Type', 'application/octet-stream');
  setResponseHeader(event, 'Cache-Control', 'no-cache');

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return sendStream(event, readableStream);
});
