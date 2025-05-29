import { Chat } from '@hashbrownai/core';
import { HashbrownAzure } from '@hashbrownai/azure';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { HashbrownGoogle } from '@hashbrownai/google';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';

const host = process.env.HOST ?? '0.0.0.0';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'] ?? '';
const AZURE_API_KEY = process.env['AZURE_API_KEY'] ?? '';
// const AZURE_ENDPOINT = process.env['AZURE_ENDPOINT'] ?? '';
// const AZURE_API_VERSION = process.env['AZURE_API_VERSION'] ?? '';
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

app.post('/chat', async (req, res, next) => {
  const request = req.body as Chat.Api.CompletionCreateParams;

  // console.log(JSON.stringify(request, null, 4));

  // Azure OpenAI Service
  // const stream = HashbrownAzure.stream.text(
  //   AZURE_API_KEY,
  //   AZURE_ENDPOINT,
  //   AZURE_API_VERSION,
  //   request,
  // );

  // Google Gemini
  // const stream = HashbrownGoogle.stream.text({
  //   apiKey: GOOGLE_API_KEY,
  //   request,
  // });

  // OpenAI
  const stream = HashbrownOpenAI.stream.text({
    apiKey: OPENAI_API_KEY,
    request,
  });

  res.header('Content-Type', 'application/octet-stream');

  try {
    for await (const chunk of stream) {
      res.write(chunk);
    }
  } catch (error) {
    console.error(error);
    // Pass errors to Express error middleware so server doesn't crash
    next(error);
  }
  res.end();
});
