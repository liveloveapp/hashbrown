import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import express from 'express';
import cors from 'cors';
import { HashbrownOpenAI } from '@hashbrownai/openai';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-nano';
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set');
}

const app = express();

app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());

  const response = HashbrownOpenAI.stream.text({
    apiKey: OPENAI_API_KEY,
    baseURL: OPENAI_BASE_URL,
    model: OPENAI_MODEL,
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

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
