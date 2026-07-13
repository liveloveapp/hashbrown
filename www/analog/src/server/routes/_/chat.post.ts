import 'dotenv/config';
import {
  defineEventHandler,
  type H3Event,
  readBody,
  sendStream,
  setResponseHeader,
} from 'h3';
import { HashbrownOpenAI } from '@hashbrownai/openai';

type Env = Record<string, string | undefined>;

type CloudflareContext = {
  _platform?: {
    cloudflare?: {
      env?: Env;
    };
  };
};

const getApiKey = (event: H3Event): string | undefined => {
  const context = event.context as CloudflareContext;
  const value =
    context._platform?.cloudflare?.env?.['OPENAI_API_KEY'] ??
    process.env.OPENAI_API_KEY;

  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const apiKey = getApiKey(event);
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
