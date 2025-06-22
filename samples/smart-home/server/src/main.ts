/* eslint-disable @typescript-eslint/no-unused-vars */
import { Chat } from '@hashbrownai/core';
import { HashbrownAzure } from '@hashbrownai/azure';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { HashbrownGoogle } from '@hashbrownai/google';
import { HashbrownWriter } from '@hashbrownai/writer';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';

const host = process.env.HOST ?? '0.0.0.0';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'] ?? '';
const AZURE_API_KEY = process.env['AZURE_API_KEY'] ?? '';
const AZURE_ENDPOINT = process.env['AZURE_ENDPOINT'] ?? '';
const GOOGLE_API_KEY = process.env['GOOGLE_API_KEY'] ?? '';
const WRITER_API_KEY = process.env['WRITER_API_KEY'] ?? '';

// Known model names by provider
const KNOWN_AZURE_MODEL_NAMES = [
  'gpt-35-turbo',
  'gpt-4',
  'gpt-4o', // add other Azure deployment/model names here
];

const KNOWN_GOOGLE_MODEL_NAMES = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
];

const KNOWN_OPENAI_MODEL_NAMES = [
  'gpt-3.5',
  'gpt-4',
  'gpt-4o',
  'gpt-4o-mini',
  'o1-preview',
  'o1-mini',
  'o1',
  'o1-pro',
  'o3-mini',
  'o3-mini-high',
  'o3',
  'o3-pro',
  'o4-mini',
  'o4-mini-high',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4.5',
];

const KNOWN_WRITER_MODEL_NAMES = [
  'palmyra-x5',
  'palmyra-x4',
  'palmyra-x-003-instruct',
  'palmyra-vision',
  'palmyra-med',
  'palmyra-fin',
  'palmyra-creative',
];

if (!OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set');
}
if (!AZURE_API_KEY) {
  console.warn('AZURE_API_KEY is not set');
}
if (!GOOGLE_API_KEY) {
  console.warn('GOOGLE_API_KEY is not set');
}
if (!WRITER_API_KEY) {
  console.warn('WRITER_API_KEY is not set');
}

const app = express();

app.use(express.json());

app.use(cors());

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});

app.post('/chat', async (req, res, next) => {
  const request = req.body as Chat.Api.CompletionCreateParams;

  const modelName = request.model;
  let stream: AsyncIterable<Uint8Array>;

  if (KNOWN_AZURE_MODEL_NAMES.includes(modelName)) {
    stream = HashbrownAzure.stream.text({
      apiKey: AZURE_API_KEY,
      endpoint: AZURE_ENDPOINT,
      request,
    });
  } else if (KNOWN_GOOGLE_MODEL_NAMES.includes(modelName)) {
    stream = HashbrownGoogle.stream.text({
      apiKey: GOOGLE_API_KEY,
      request,
    });
  } else if (KNOWN_OPENAI_MODEL_NAMES.includes(modelName)) {
    stream = HashbrownOpenAI.stream.text({
      apiKey: OPENAI_API_KEY,
      request,
    });
  } else if (KNOWN_WRITER_MODEL_NAMES.includes(modelName)) {
    stream = HashbrownWriter.stream.text({
      apiKey: WRITER_API_KEY,
      request,
    });
  } else {
    throw new Error(
      `Unknown model: ${modelName}. Edit /samples/smart-home/server/src/main.ts to add support for this model.`,
    );
  }

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk);
  }

  res.end();
});
