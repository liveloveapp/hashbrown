import { Chat } from '@hashbrownai/core';
// import { HashbrownAzure } from '@hashbrownai/azure';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';

const host = process.env.HOST ?? '0.0.0.0';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'] ?? '';
const AZURE_API_KEY = process.env['AZURE_API_KEY'] ?? '';
const GOOGLE_API_KEY = process.env['GOOGLE_API_KEY'] ?? '';

// const AZURE_ENDPOINT = 'https://ai-hashbrowndev507071463475.openai.azure.com/';
// const AZURE_API_VERSION = '2024-04-01-preview';

if (!OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set');
}
if (!AZURE_API_KEY) {
  console.warn('AZURE_API_KEY is not set');
}
if (!GOOGLE_API_KEY) {
  console.warn('GOOGLE_API_KEY is not set');
}

const app = express();

app.use(express.json());

app.use(cors());

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});

app.post('/chat', async (req, res) => {
  const request = req.body as Chat.CompletionCreateParams;

  // Azure OpenAI Service
  // const stream = HashbrownAzure.stream.text(
  //   AZURE_API_KEY,
  //   AZURE_ENDPOINT,
  //   AZURE_API_VERSION,
  //   request,
  // );

  // Google Gemini
  // const stream = HashbrownGoogle.stream.text(GOOGLE_API_KEY, request);

  // OpenAI
  const stream = HashbrownOpenAI.stream.text(OPENAI_API_KEY, request);

  res.header('Content-Type', 'text/plain');
  for await (const chunk of stream) {
    res.write(JSON.stringify(chunk));
  }
  res.end();
});
