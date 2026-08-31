/* eslint-disable @typescript-eslint/no-unused-vars */
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { Chat } from '@hashbrownai/core';
import { HashbrownAzure } from '@hashbrownai/azure';
import { HashbrownGoogle } from '@hashbrownai/google';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { HashbrownOllama } from '@hashbrownai/ollama';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';

const host = process.env.HOST ?? '0.0.0.0';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'] ?? '';
const OPENAI_BASE_URL = process.env['OPENAI_BASE_URL'];
const OPENAI_MODEL = process.env['OPENAI_MODEL'] ?? 'gpt-5-nano';
const AZURE_API_KEY = process.env['AZURE_API_KEY'] ?? '';
const AZURE_ENDPOINT = process.env['AZURE_ENDPOINT'] ?? '';
const GOOGLE_API_KEY = process.env['GOOGLE_API_KEY'] ?? '';
const GOOGLE_MODEL = process.env['GOOGLE_MODEL'] ?? 'gemini-2.5-flash';
const OLLAMA_API_KEY = process.env['OLLAMA_API_KEY'] ?? '';

if (!OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set');
}
if (!AZURE_API_KEY) {
  console.warn('AZURE_API_KEY is not set');
}
if (!GOOGLE_API_KEY) {
  console.warn('GOOGLE_API_KEY is not set');
}
if (!OLLAMA_API_KEY) {
  console.warn('OLLAMA_API_KEY is not set');
}

const app = express();

app.use(express.json());

app.use(cors());

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});

app.post('/chat', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownOpenAI.stream.text({
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

  for await (const event of stream) {
    res.write(encoder.encodeSSE(event));
  }

  if (!res.writableEnded) {
    res.end();
  }
});

app.post('/google/chat', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownGoogle.stream.text({
    apiKey: GOOGLE_API_KEY,
    model: GOOGLE_MODEL,
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
});

app.post('/legacy/chat', async (req, res) => {
  const request = req.body as Chat.Api.CompletionCreateParams;
  const stream = HashbrownOllama.stream.text({
    turbo: { apiKey: OLLAMA_API_KEY },
    request,
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk);
  }

  res.end();
});
