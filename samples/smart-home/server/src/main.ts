import { Chat } from '@hashbrownai/core';
import { HashbrownAzure } from '@hashbrownai/azure';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import cors from 'cors';
import express from 'express';

const host = process.env.HOST ?? '0.0.0.0';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();

app.use(express.json());

app.use(cors());

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});

app.post('/chat', async (req, res) => {
  const request = req.body as Chat.CompletionCreateParams;

  // Azure OpenAI Service
  // const stream = HashbrownAzure.stream.text(request);

  // Google Gemini
  // const stream = HashbrownGoogle.stream.text(request);

  // OpenAI
  const stream = HashbrownOpenAI.stream.text(request);

  res.header('Content-Type', 'text/plain');
  for await (const chunk of stream) {
    res.write(JSON.stringify(chunk));
  }
  res.end();
});
