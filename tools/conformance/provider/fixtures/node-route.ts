import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import cors from 'cors';
import express from 'express';
import type { ProviderRouteOptions } from './options';

/** Creates an injectable Node route using the native OpenAI provider and AG-UI SSE. */
export function createApi(options: ProviderRouteOptions) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/api/chat', async (req, res, next) => {
    const abortController = new AbortController();
    req.once('aborted', () => abortController.abort());
    res.once('close', () => abortController.abort());

    try {
      const stream = HashbrownOpenAI.stream.text({
        ...options,
        input: req.body as RunAgentInput,
        signal: abortController.signal,
      });
      const encoder = new EventEncoder();
      res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.header('Content-Type', encoder.getContentType());
      res.header('Connection', 'keep-alive');
      res.flushHeaders();

      for await (const event of stream) {
        res.write(encoder.encodeSSE(event));
      }

      if (!res.writableEnded) {
        res.end();
      }
    } catch (error) {
      next(error);
    }
  });

  return app;
}
