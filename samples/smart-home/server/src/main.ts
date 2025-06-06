/* eslint-disable @typescript-eslint/no-unused-vars */
import { Chat } from '@hashbrownai/core';
import { HashbrownAzure } from '@hashbrownai/azure';
import { HashbrownGenkit } from '@hashbrownai/genkit';
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

  // console.log(JSON.stringify(request, null, 4));

  // Azure OpenAI Service
  // const stream = HashbrownAzure.stream.text({
  //   apiKey: AZURE_API_KEY,
  //   endpoint: AZURE_ENDPOINT,
  //   request,
  // });

  // Google Gemini
  // const stream = HashbrownGoogle.stream.text({
  //   apiKey: GOOGLE_API_KEY,
  //   request,
  // });

  // OpenAI
  // const stream = HashbrownOpenAI.stream.text({
  //   apiKey: OPENAI_API_KEY,
  //   request,
  // });

  // Writer
  // const stream = HashbrownWriter.stream.text({
  //   apiKey: WRITER_API_KEY,
  //   request,
  // });

  // Genkit (supports multiple vendors/models)

  // TODO: how to handle selecting a model?  For now, assume OPEN_AI
  // Is it passed per request like the hooks already do?
  const stream = HashbrownGenkit.stream.text({
    apiKey: OPENAI_API_KEY,
    request,
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    // console.log(chunk);
    res.write(chunk);
  }

  res.end();
});
