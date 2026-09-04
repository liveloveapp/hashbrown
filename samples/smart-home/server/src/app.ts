import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import cors from 'cors';
import express from 'express';

/** Backend-owned model configuration for the Smart Home API. */
export interface SmartHomeApiOptions {
  apiKey: string;
  baseURL?: string;
  model: string;
}

/** Creates the sample API without opening a port or reading process globals. */
export function createApi(options: SmartHomeApiOptions) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/api/chat', async (req, res) => {
    const abortController = new AbortController();
    req.once('aborted', () => abortController.abort());
    res.once('close', () => abortController.abort());

    const response = HashbrownOpenAI.stream.text({
      ...options,
      input: req.body as RunAgentInput,
      signal: abortController.signal,
    });
    const encoder = new EventEncoder();

    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Content-Type', encoder.getContentType());
    res.header('Connection', 'keep-alive');
    res.flushHeaders();

    for await (const event of response) {
      res.write(encoder.encodeSSE(event));
    }

    if (!res.writableEnded) {
      res.end();
    }
  });

  return app;
}
